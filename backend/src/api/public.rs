use axum::extract::{Path, State};
use axum::response::Response;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{Value, json};

use axum::http::HeaderMap;

use super::{AppState, extension_for, file_response, file_response_cached};
use crate::error::{AppError, AppResult};
use crate::publication::{self, PublicPage};
use crate::{auth, settings};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/public/page", get(page))
        .route("/api/public/receipts/{token}", get(receipt))
        .route("/api/public/memorial-photo", get(memorial_photo))
        .route("/api/public/share-image", get(share_image))
        .route("/api/public/check", axum::routing::post(check))
        .route("/api/public/head", get(super::page::head))
}

async fn health(State(state): State<AppState>) -> AppResult<Json<Value>> {
    sqlx::query("SELECT 1").execute(&state.pool).await?;
    Ok(Json(json!({ "status": "ok" })))
}

async fn page(State(state): State<AppState>) -> AppResult<Json<PublicPage>> {
    let mut conn = state.pool.acquire().await?;
    Ok(Json(publication::page(&mut conn).await?))
}

async fn receipt(State(state): State<AppState>, Path(token): Path<String>) -> AppResult<Response> {
    let mut conn = state.pool.acquire().await?;
    let (storage_name, content_type) = publication::receipt_by_token(&mut conn, &token).await?;
    drop(conn);
    let bytes = state.storage.read(&storage_name).await.map_err(|e| {
        tracing::error!(error = %e, "published receipt file is missing");
        AppError::not_found("That receipt")
    })?;
    Ok(file_response(bytes, &content_type, &format!("receipt.{}", extension_for(&content_type))))
}

/// The memorial photo: public once the page is published, and visible to a
/// signed-in manager before that (so the loading screen and settings show it).
async fn memorial_photo(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Response> {
    let mut conn = state.pool.acquire().await?;
    let photo = settings::memorial_photo(&mut conn).await?.ok_or_else(|| AppError::not_found("The photo"))?;
    drop(conn);
    let (allowed, cache) = if photo.published {
        (true, "public, max-age=600")
    } else {
        let user = match super::session_token(&headers) {
            Some(token) => auth::session_user(&state.pool, &token).await?,
            None => None,
        };
        (user.is_some(), "private, no-store")
    };
    if !allowed {
        return Err(AppError::not_found("The photo"));
    }
    let bytes = state.storage.read(&photo.storage_name).await.map_err(|e| {
        tracing::error!(error = %e, "memorial photo file is missing");
        AppError::not_found("The photo")
    })?;
    let name = format!("memorial.{}", extension_for(&photo.content_type));
    Ok(file_response_cached(bytes, &photo.content_type, &name, cache))
}

/// The link-preview image: public once the page is published, and visible to a
/// signed-in manager before that.
async fn share_image(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Response> {
    let mut conn = state.pool.acquire().await?;
    let (storage_name, published) =
        settings::share_image(&mut conn).await?.ok_or_else(|| AppError::not_found("The preview image"))?;
    drop(conn);
    let cache = if published {
        "public, max-age=600"
    } else {
        let user = match super::session_token(&headers) {
            Some(token) => auth::session_user(&state.pool, &token).await?,
            None => None,
        };
        if user.is_none() {
            return Err(AppError::not_found("The preview image"));
        }
        "private, no-store"
    };
    let bytes = state.storage.read(&storage_name).await.map_err(|_| AppError::not_found("The preview image"))?;
    let content_type = if storage_name.ends_with(".png") { "image/png" } else { "image/jpeg" };
    Ok(file_response_cached(bytes, content_type, &format!("preview.{}", extension_for(content_type)), cache))
}

// ---------------------------------------------------------------------------
// "Check my contribution"

const CHECK_WINDOW: std::time::Duration = std::time::Duration::from_secs(10 * 60);
const CHECKS_PER_VISITOR: u32 = 12;
const CHECKS_OVERALL: u32 = 600;

/// Limits how many codes can be tried, per visitor and overall, so nobody can
/// work through codes in bulk.
pub struct CheckLimiter {
    state: std::sync::Mutex<LimiterState>,
}

struct LimiterState {
    window_start: std::time::Instant,
    overall: u32,
    visitors: std::collections::HashMap<String, u32>,
}

impl Default for CheckLimiter {
    fn default() -> Self {
        CheckLimiter {
            state: std::sync::Mutex::new(LimiterState {
                window_start: std::time::Instant::now(),
                overall: 0,
                visitors: std::collections::HashMap::new(),
            }),
        }
    }
}

impl CheckLimiter {
    fn allow(&self, visitor: &str) -> bool {
        let mut s = self.state.lock().expect("check limiter");
        if s.window_start.elapsed() > CHECK_WINDOW {
            s.window_start = std::time::Instant::now();
            s.overall = 0;
            s.visitors.clear();
        }
        if s.overall >= CHECKS_OVERALL {
            return false;
        }
        let count = s.visitors.entry(visitor.to_string()).or_insert(0);
        if *count >= CHECKS_PER_VISITOR {
            return false;
        }
        *count += 1;
        s.overall += 1;
        true
    }
}

/// The visitor's address: from the proxy's X-Forwarded-For when the request
/// came through a local or private proxy (Caddy), otherwise the peer address.
fn visitor(headers: &HeaderMap, peer: Option<std::net::SocketAddr>, client_ip_header: Option<&str>) -> String {
    // A proxy that names the visitor (Netlify) wins; the value must be an address.
    if let Some(ip) = client_ip_header
        .and_then(|name| headers.get(name))
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .and_then(|v| v.trim().parse::<std::net::IpAddr>().ok())
    {
        return ip.to_string();
    }
    let via_proxy = peer.is_none_or(|p| match p.ip() {
        std::net::IpAddr::V4(v4) => v4.is_loopback() || v4.is_private(),
        std::net::IpAddr::V6(v6) => v6.is_loopback() || (v6.segments()[0] & 0xfe00) == 0xfc00,
    });
    if via_proxy
        && let Some(last) = headers
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.rsplit(',').next())
            .map(str::trim)
            .filter(|v| !v.is_empty())
    {
        return last.to_string();
    }
    peer.map(|p| p.ip().to_string()).unwrap_or_else(|| "unknown".into())
}

#[derive(serde::Deserialize)]
struct CheckRequest {
    code: String,
}

/// The code travels in the request body, so it never appears in addresses or logs.
async fn check(
    State(state): State<AppState>,
    connect: Option<axum::Extension<axum::extract::ConnectInfo<std::net::SocketAddr>>>,
    headers: HeaderMap,
    Json(request): Json<CheckRequest>,
) -> AppResult<Json<publication::CheckResult>> {
    if request.code.len() > 2000 {
        return Err(AppError::field("code", "Paste only the M-Pesa code or the confirmation message."));
    }
    let peer = connect.map(|axum::Extension(axum::extract::ConnectInfo(addr))| addr);
    if !state.check_limiter.allow(&visitor(&headers, peer, state.config.client_ip_header.as_deref())) {
        return Err(AppError::TooManyAttempts(
            "You have checked several codes in a short time. Please wait a few minutes and try again.".into(),
        ));
    }
    let mut conn = state.pool.acquire().await?;
    Ok(Json(publication::check_contribution(&mut conn, &request.code).await?))
}

#[cfg(test)]
mod tests {
    use super::visitor;
    use axum::http::HeaderMap;

    #[test]
    fn the_named_header_identifies_the_visitor_behind_a_proxy() {
        let netlify: std::net::SocketAddr = "54.84.1.1:443".parse().unwrap();
        let mut headers = HeaderMap::new();
        headers.insert("x-nf-client-connection-ip", "102.68.1.20".parse().unwrap());
        assert_eq!(visitor(&headers, Some(netlify), Some("x-nf-client-connection-ip")), "102.68.1.20");
        // Without the setting, or with a value that is not an address, the proxy's address is used.
        assert_eq!(visitor(&headers, Some(netlify), None), "54.84.1.1");
        headers.insert("x-nf-client-connection-ip", "not-an-ip".parse().unwrap());
        assert_eq!(visitor(&headers, Some(netlify), Some("x-nf-client-connection-ip")), "54.84.1.1");
    }
}
