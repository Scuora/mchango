//! Management sign-in: a few named accounts with passwords, and cookie sessions.
//!
//! Accounts are created on the server with `mchango user add <name>`; there is
//! no registration. Passwords are hashed with Argon2id. The session cookie is a
//! random token; only its SHA-256 hash is stored.

use argon2::Argon2;
use argon2::password_hash::phc::PasswordHash;
use argon2::password_hash::{PasswordHasher, PasswordVerifier};
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use crate::clock;
use crate::error::{AppError, AppResult};
use crate::storage;

pub const COOKIE: &str = "mchango_session";
pub const SESSION_DAYS: i64 = 30;
const MAX_FAILURES: u32 = 5;
const LOCKOUT: Duration = Duration::from_secs(15 * 60);

tokio::task_local! {
    /// The signed-in person for the current request, recorded in change history.
    pub static ACTOR: String;
}

pub fn current_actor() -> String {
    ACTOR.try_with(Clone::clone).unwrap_or_else(|_| "system".to_string())
}

pub fn clean_username(input: &str) -> Result<String, String> {
    let name = input.trim().to_ascii_lowercase();
    let ok = (3..=32).contains(&name.len())
        && name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'.' | b'_' | b'-'));
    if ok { Ok(name) } else { Err("Usernames are 3–32 characters: letters, digits, '.', '_' or '-'.".into()) }
}

fn check_new_password(password: &str) -> Result<(), String> {
    let length = password.chars().count();
    if length < 10 {
        return Err("Use a password of at least 10 characters.".into());
    }
    if length > 200 {
        return Err("That password is too long.".into());
    }
    Ok(())
}

async fn hash_password(password: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        Argon2::default().hash_password(password.as_bytes()).map(|h| h.to_string()).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

async fn verify_password(password: String, hash: String) -> bool {
    tokio::task::spawn_blocking(move || {
        PasswordHash::new(&hash)
            .map(|parsed| Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok())
            .unwrap_or(false)
    })
    .await
    .unwrap_or(false)
}

/// Checked when the username does not exist, so the response takes as long.
static DUMMY_HASH: LazyLock<String> = LazyLock::new(|| {
    Argon2::default().hash_password(storage::random_hex(16).as_bytes()).map(|h| h.to_string()).unwrap_or_default()
});

fn token_hash(token: &str) -> String {
    storage::sha256_hex(token.as_bytes())
}

// ---------------------------------------------------------------------------
// Accounts (command line)

pub async fn add_user(pool: &SqlitePool, username: &str, password: &str) -> Result<String, String> {
    let name = clean_username(username)?;
    check_new_password(password)?;
    let hash = hash_password(password.to_string()).await?;
    let now = clock::now_string();
    sqlx::query("INSERT INTO users (username, password_hash, created_at, password_changed_at) VALUES (?, ?, ?, ?)")
        .bind(&name)
        .bind(hash)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| {
            if crate::error::is_unique_violation(&e) { format!("{name} already exists") } else { e.to_string() }
        })?;
    Ok(name)
}

/// Sets a new password and signs the account out everywhere.
pub async fn set_password(pool: &SqlitePool, username: &str, password: &str) -> Result<(), String> {
    let name = clean_username(username)?;
    check_new_password(password)?;
    let hash = hash_password(password.to_string()).await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let updated = sqlx::query("UPDATE users SET password_hash = ?, password_changed_at = ? WHERE username = ?")
        .bind(hash)
        .bind(clock::now_string())
        .bind(&name)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    if updated.rows_affected() == 0 {
        return Err(format!("no account named {name}"));
    }
    sqlx::query("DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)")
        .bind(&name)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())
}

pub async fn remove_user(pool: &SqlitePool, username: &str) -> Result<(), String> {
    let name = clean_username(username)?;
    let removed = sqlx::query("DELETE FROM users WHERE username = ?")
        .bind(&name)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    if removed.rows_affected() == 0 {
        return Err(format!("no account named {name}"));
    }
    Ok(())
}

pub async fn list_users(pool: &SqlitePool) -> Result<Vec<(String, String)>, String> {
    sqlx::query_as("SELECT username, created_at FROM users ORDER BY username")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Sessions

/// Failed sign-ins per username, to slow down password guessing.
#[derive(Default)]
pub struct LoginLimiter {
    failures: Mutex<HashMap<String, (u32, Instant)>>,
}

impl LoginLimiter {
    fn locked(&self, key: &str) -> bool {
        let mut map = self.failures.lock().expect("limiter");
        match map.get(key) {
            Some((count, since)) if since.elapsed() < LOCKOUT => *count >= MAX_FAILURES,
            Some(_) => {
                map.remove(key);
                false
            }
            None => false,
        }
    }

    fn failed(&self, key: &str) {
        let mut map = self.failures.lock().expect("limiter");
        let entry = map.entry(key.to_string()).or_insert((0, Instant::now()));
        entry.0 += 1;
    }

    fn succeeded(&self, key: &str) {
        self.failures.lock().expect("limiter").remove(key);
    }
}

/// Checks the password and opens a session. Returns (cookie token, username).
pub async fn login(
    pool: &SqlitePool,
    limiter: &LoginLimiter,
    username: &str,
    password: &str,
) -> AppResult<(String, String)> {
    let name = username.trim().to_ascii_lowercase();
    if limiter.locked(&name) {
        return Err(AppError::TooManyAttempts(
            "Too many failed sign-ins for this account. Wait 15 minutes and try again.".into(),
        ));
    }
    let found: Option<(i64, String)> = sqlx::query_as("SELECT id, password_hash FROM users WHERE username = ?")
        .bind(&name)
        .fetch_optional(pool)
        .await?;
    let (user_id, hash) = match found {
        Some(found) => found,
        None => (0, DUMMY_HASH.clone()),
    };
    if !verify_password(password.to_string(), hash).await || user_id == 0 {
        limiter.failed(&name);
        tracing::warn!(username = %name, "failed sign-in");
        return Err(AppError::Unauthorized {
            code: "invalid_credentials",
            message: "That username and password do not match.".into(),
        });
    }
    limiter.succeeded(&name);

    let token = storage::random_hex(32);
    let now = clock::now();
    sqlx::query("DELETE FROM sessions WHERE expires_at < ?").bind(clock::format_instant(now)).execute(pool).await?;
    sqlx::query(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(token_hash(&token))
    .bind(user_id)
    .bind(clock::format_instant(now))
    .bind(clock::format_instant(now + time::Duration::days(SESSION_DAYS)))
    .bind(clock::format_instant(now))
    .execute(pool)
    .await?;
    tracing::info!(username = %name, "signed in");
    Ok((token, name))
}

/// The username for a live session. Sessions slide forward while in use.
pub async fn session_user(pool: &SqlitePool, token: &str) -> AppResult<Option<String>> {
    if token.len() != 64 || !token.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Ok(None);
    }
    let hash = token_hash(token);
    let now = clock::now();
    let found: Option<(String, String)> = sqlx::query_as(
        "SELECT u.username, s.last_seen_at FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?",
    )
    .bind(&hash)
    .bind(clock::format_instant(now))
    .fetch_optional(pool)
    .await?;
    let Some((username, last_seen)) = found else { return Ok(None) };
    // Extend at most once an hour to keep writes rare.
    let stale = clock::parse_instant(&last_seen).is_none_or(|t| now - t > time::Duration::hours(1));
    if stale {
        sqlx::query("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?")
            .bind(clock::format_instant(now))
            .bind(clock::format_instant(now + time::Duration::days(SESSION_DAYS)))
            .bind(&hash)
            .execute(pool)
            .await?;
    }
    Ok(Some(username))
}

pub async fn logout(pool: &SqlitePool, token: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM sessions WHERE token_hash = ?").bind(token_hash(token)).execute(pool).await?;
    Ok(())
}

/// Reads the session token from a Cookie header.
pub fn token_from_cookies(header: &str) -> Option<&str> {
    header.split(';').find_map(|pair| {
        let (name, value) = pair.trim().split_once('=')?;
        (name == COOKIE).then_some(value)
    })
}

pub fn session_cookie(token: &str, secure: bool) -> String {
    let max_age = SESSION_DAYS * 24 * 60 * 60;
    let secure = if secure { "; Secure" } else { "" };
    format!("{COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={max_age}{secure}")
}

pub fn clear_cookie(secure: bool) -> String {
    let secure = if secure { "; Secure" } else { "" };
    format!("{COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0{secure}")
}
