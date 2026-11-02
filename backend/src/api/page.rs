//! Serves the app's HTML page with a real title and link-preview (Open Graph)
//! tags. WhatsApp and other apps read these without running any script, so
//! they must be in the HTML the server sends.

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};

use super::AppState;
use crate::settings;

pub async fn index(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let path = state.config.static_dir.join("index.html");
    let Ok(html) = tokio::fs::read_to_string(&path).await else {
        return (StatusCode::NOT_FOUND, "The frontend has not been built.").into_response();
    };
    let html = match head_tags(&state, &headers).await {
        Some(tags) => html.replacen("<title>Mchango</title>", &tags, 1),
        None => html,
    };
    ([(header::CONTENT_TYPE, "text/html; charset=utf-8"), (header::CACHE_CONTROL, "no-cache")], html).into_response()
}

async fn head_tags(state: &AppState, headers: &HeaderMap) -> Option<String> {
    let mut conn = state.pool.acquire().await.ok()?;
    let f = settings::fundraiser(&mut conn).await.ok()?;
    if !f.public_page_enabled {
        return None;
    }
    let title = if f.memorial_name.is_empty() {
        f.name.clone()
    } else {
        format!("{} – funeral contributions", f.memorial_name)
    };
    let mut description = Vec::new();
    if !f.memorial_name.is_empty() {
        description.push(format!("In loving memory of {}", f.memorial_name));
    }
    if !f.memorial_dates.is_empty() {
        description.push(f.memorial_dates.clone());
    }
    if !f.memorial_tribute.is_empty() {
        description.push(f.memorial_tribute.clone());
    }
    description.push("Contribute through M-Pesa and see every contribution and expense.".into());
    let description = description.join(" · ");

    let base = base_url(state, headers);
    let large = f.share_image_updated_at.is_some();
    let mut tags = format!(
        "<title>{t}</title>\n    <meta name=\"description\" content=\"{d}\" />\n    \
         <meta property=\"og:type\" content=\"website\" />\n    <meta property=\"og:site_name\" content=\"{t}\" />\n    \
         <meta property=\"og:title\" content=\"{t}\" />\n    <meta property=\"og:description\" content=\"{d}\" />\n    \
         <meta name=\"twitter:card\" content=\"{card}\" />\n    <meta name=\"twitter:title\" content=\"{t}\" />\n    \
         <meta name=\"twitter:description\" content=\"{d}\" />",
        t = escape(&title),
        d = escape(&description),
        card = if large { "summary_large_image" } else { "summary" },
    );
    if let Some(base) = &base {
        tags.push_str(&format!(
            "\n    <meta property=\"og:url\" content=\"{b}/\" />\n    <link rel=\"canonical\" href=\"{b}/\" />",
            b = escape(base)
        ));
        if let Some(version) = &f.share_image_updated_at {
            // The designed 1200 x 630 card: portrait, name, dates and tribute.
            let v = &crate::storage::sha256_hex(version.as_bytes())[..12];
            let url = format!("{}/api/public/share-image?v={v}", escape(base));
            tags.push_str(&format!(
                "\n    <meta property=\"og:image\" content=\"{url}\" />\n    \
                 <meta property=\"og:image:type\" content=\"image/jpeg\" />\n    \
                 <meta property=\"og:image:width\" content=\"1200\" />\n    \
                 <meta property=\"og:image:height\" content=\"630\" />\n    \
                 <meta property=\"og:image:alt\" content=\"In loving memory of {n}\" />\n    \
                 <meta name=\"twitter:image\" content=\"{url}\" />",
                n = escape(&f.memorial_name)
            ));
        } else if let Some(version) = &f.memorial_photo_updated_at {
            let v = &crate::storage::sha256_hex(version.as_bytes())[..12];
            tags.push_str(&format!(
                "\n    <meta property=\"og:image\" content=\"{}/api/public/memorial-photo?v={v}\" />\n    \
                 <meta property=\"og:image:alt\" content=\"Portrait of {}\" />",
                escape(base),
                escape(&f.memorial_name)
            ));
        }
    }
    Some(tags)
}

/// The public address: PUBLIC_URL when set, otherwise what the request says.
fn base_url(state: &AppState, headers: &HeaderMap) -> Option<String> {
    if let Some(url) = &state.config.public_url {
        return Some(url.clone());
    }
    let host = headers.get(header::HOST)?.to_str().ok()?;
    if host.is_empty() || !host.bytes().all(|b| b.is_ascii_alphanumeric() || b".-:[]".contains(&b)) {
        return None;
    }
    let https = headers.get("x-forwarded-proto").and_then(|v| v.to_str().ok()) == Some("https");
    Some(format!("{}://{host}", if https { "https" } else { "http" }))
}

fn escape(value: &str) -> String {
    value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&#39;")
}
