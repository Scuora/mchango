//! HTTP routes.
//!
//! Two routers are served on two listeners:
//! * the public listener serves the public page, its API and published receipts;
//! * the management listener serves everything, including unauthenticated
//!   management, and must stay private (see `Config::manage_addr`).

mod manage;
mod page;
mod public;

pub use public::CheckLimiter;

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde_json::json;
use sqlx::SqlitePool;
use std::sync::Arc;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::TraceLayer;

use crate::auth::{self, LoginLimiter};
use crate::config::Config;
use crate::error::AppError;
use crate::statements::worker::ImportQueue;
use crate::storage::Storage;

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    pub storage: Storage,
    pub queue: ImportQueue,
    pub config: Arc<Config>,
    pub limiter: Arc<LoginLimiter>,
    pub check_limiter: Arc<CheckLimiter>,
}

pub fn public_router(state: AppState) -> Router {
    let api = public::routes().route("/api/{*rest}", get(api_not_found).post(api_not_found));
    let app = Router::new().merge(api).route("/manage", get(not_here)).route("/manage/{*rest}", get(not_here));
    finish(with_frontend(app, &state.config), state)
}

pub fn manage_router(state: AppState) -> Router {
    let protected = manage::routes(&state.config).layer(middleware::from_fn_with_state(state.clone(), require_session));
    let api = public::routes()
        .merge(manage::auth_routes())
        .merge(protected)
        .route("/api/{*rest}", get(api_not_found).post(api_not_found).put(api_not_found));
    let allowed = Arc::new(allowed_hosts(&state.config));
    let app = with_frontend(Router::new().merge(api), &state.config)
        .layer(middleware::from_fn_with_state(allowed, guard_management));
    finish(app, state)
}

fn with_frontend(app: Router<AppState>, config: &Config) -> Router<AppState> {
    let dir = &config.static_dir;
    if dir.join("index.html").exists() {
        // Fingerprinted build files can be cached for a long time; the page
        // itself is rendered per request with its title and link-preview tags.
        let assets = tower::ServiceBuilder::new()
            .layer(SetResponseHeaderLayer::overriding(
                header::CACHE_CONTROL,
                HeaderValue::from_static("public, max-age=31536000, immutable"),
            ))
            .service(ServeDir::new(dir.join("assets")));
        app.nest_service("/assets", assets)
            .route_service("/favicon.svg", ServeFile::new(dir.join("favicon.svg")))
            .route("/", get(page::index))
            .fallback(get(page::index))
    } else {
        app.fallback(|| async {
            (
                StatusCode::NOT_FOUND,
                "The frontend has not been built. Run `npm run build` in frontend/, or use the Vite dev server.",
            )
        })
    }
}

fn finish(app: Router<AppState>, state: AppState) -> Router {
    let header = |name: &'static str, value: &'static str| {
        SetResponseHeaderLayer::if_not_present(HeaderName::from_static(name), HeaderValue::from_static(value))
    };
    app.with_state(state)
        .layer(header("x-content-type-options", "nosniff"))
        .layer(header("referrer-policy", "same-origin"))
        .layer(header("x-frame-options", "DENY"))
        .layer(header(
            "content-security-policy",
            "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; \
             script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; \
             form-action 'self'; frame-ancestors 'none'",
        ))
        .layer(TraceLayer::new_for_http())
}

async fn api_not_found() -> Response {
    (StatusCode::NOT_FOUND, Json(json!({ "error": { "code": "not_found", "message": "No such API endpoint." } })))
        .into_response()
}

async fn not_here() -> Response {
    (StatusCode::NOT_FOUND, "Not found").into_response()
}

fn allowed_hosts(config: &Config) -> Vec<String> {
    let mut hosts = vec!["localhost".to_string(), "127.0.0.1".to_string(), "[::1]".to_string()];
    let ip = config.manage_addr.ip();
    if !ip.is_unspecified() {
        hosts.push(match ip {
            std::net::IpAddr::V6(v6) => format!("[{v6}]"),
            v4 => v4.to_string(),
        });
    }
    hosts.extend(config.manage_allowed_hosts.iter().cloned());
    hosts
}

fn host_name(value: &str) -> String {
    let value = value.trim().to_ascii_lowercase();
    if value.starts_with('[') {
        return value.split_inclusive(']').next().unwrap_or_default().to_string();
    }
    value.split(':').next().unwrap_or_default().to_string()
}

/// Protects the unauthenticated management listener from browsers on other
/// sites: the Host must be expected (DNS rebinding), and changes need a
/// same-origin request carrying the app's header (cross-site request forgery).
async fn guard_management(State(allowed): State<Arc<Vec<String>>>, request: Request, next: Next) -> Response {
    let headers = request.headers();
    let host = headers.get(header::HOST).and_then(|h| h.to_str().ok()).map(host_name).unwrap_or_default();
    if !allowed.contains(&host) {
        tracing::warn!(%host, "management request with unexpected Host header refused");
        return forbidden(
            "This address is not allowed to manage the fundraiser. Add it to MANAGE_ALLOWED_HOSTS if it is yours.",
        );
    }
    let safe = matches!(*request.method(), Method::GET | Method::HEAD | Method::OPTIONS);
    if !safe && (!same_origin(headers, &host) || headers.get("x-mchango").and_then(|v| v.to_str().ok()) != Some("1")) {
        return forbidden("Changes must come from the management page itself.");
    }
    next.run(request).await
}

/// Management endpoints need a signed-in account. The username is recorded
/// in change history for everything done during the request.
async fn require_session(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let token = session_token(request.headers());
    let user = match token {
        Some(token) => auth::session_user(&state.pool, &token).await,
        None => Ok(None),
    };
    match user {
        Ok(Some(username)) => auth::ACTOR.scope(username, next.run(request)).await,
        Ok(None) => {
            AppError::Unauthorized { code: "unauthenticated", message: "Sign in to continue.".into() }.into_response()
        }
        Err(e) => e.into_response(),
    }
}

pub(crate) fn session_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .find_map(auth::token_from_cookies)
        .map(str::to_string)
}

/// True when a TLS-terminating proxy (Caddy) says the browser used HTTPS.
pub(crate) fn forwarded_https(headers: &HeaderMap) -> bool {
    headers.get("x-forwarded-proto").and_then(|v| v.to_str().ok()).is_some_and(|v| v.eq_ignore_ascii_case("https"))
}

fn same_origin(headers: &HeaderMap, host: &str) -> bool {
    if headers.get("sec-fetch-site").and_then(|v| v.to_str().ok()).is_some_and(|v| v == "cross-site") {
        return false;
    }
    match headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
        None => true,
        Some(origin) => {
            let without_scheme = origin.split("://").nth(1).unwrap_or_default();
            host_name(without_scheme) == host
        }
    }
}

fn forbidden(message: &str) -> Response {
    (StatusCode::FORBIDDEN, Json(json!({ "error": { "code": "forbidden", "message": message } }))).into_response()
}

/// A private or published file. Served with its checked type and never sniffed.
fn file_response(bytes: Vec<u8>, content_type: &str, file_name: &str) -> Response {
    file_response_cached(bytes, content_type, file_name, "private, no-store")
}

fn file_response_cached(bytes: Vec<u8>, content_type: &str, file_name: &str, cache: &'static str) -> Response {
    Response::builder()
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_DISPOSITION, format!("inline; filename=\"{file_name}\""))
        .header(header::CACHE_CONTROL, cache)
        .header(
            "content-security-policy",
            "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'",
        )
        .body(Body::from(bytes))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

fn extension_for(content_type: &str) -> &'static str {
    match content_type {
        "application/pdf" => "pdf",
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        _ => "bin",
    }
}

#[cfg(test)]
mod tests {
    use super::host_name;

    #[test]
    fn host_names() {
        assert_eq!(host_name("localhost:8081"), "localhost");
        assert_eq!(host_name("127.0.0.1"), "127.0.0.1");
        assert_eq!(host_name("[::1]:8081"), "[::1]");
        assert_eq!(host_name("Evil.Example:80"), "evil.example");
    }
}
