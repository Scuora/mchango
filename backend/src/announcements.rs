//! Announcements: funeral arrangements and updates from family meetings,
//! published on the public page.

use serde::{Deserialize, Serialize};
use sqlx::SqliteConnection;

use crate::clock;
use crate::error::{AppError, AppResult};
use crate::history::{self, Entity};

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Announcement {
    pub id: i64,
    pub title: String,
    pub body: String,
    pub pinned: bool,
    pub published: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct AnnouncementInput {
    pub title: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default = "published_by_default")]
    pub published: bool,
}

fn published_by_default() -> bool {
    true
}

impl AnnouncementInput {
    fn clean(self) -> AppResult<AnnouncementInput> {
        let title = self.title.split_whitespace().collect::<Vec<_>>().join(" ");
        if title.is_empty() || title.chars().count() > 120 {
            return Err(AppError::field("title", "Give the announcement a title of up to 120 characters."));
        }
        // Keep the line breaks people typed; trim trailing spaces on each line.
        let body = self.body.lines().map(str::trim_end).collect::<Vec<_>>().join("\n").trim().to_string();
        if body.chars().count() > 4000 {
            return Err(AppError::field("body", "Keep the message under 4,000 characters."));
        }
        Ok(AnnouncementInput { title, body, ..self })
    }
}

/// Newest first, pinned ones on top.
pub async fn list(conn: &mut SqliteConnection, published_only: bool) -> AppResult<Vec<Announcement>> {
    let rows = sqlx::query_as(
        "SELECT id, title, body, pinned, published, created_at, updated_at FROM announcements
         WHERE published = 1 OR ?1 = 0
         ORDER BY pinned DESC, created_at DESC, id DESC LIMIT 100",
    )
    .bind(published_only)
    .fetch_all(conn)
    .await?;
    Ok(rows)
}

async fn get(conn: &mut SqliteConnection, id: i64) -> AppResult<Announcement> {
    sqlx::query_as("SELECT id, title, body, pinned, published, created_at, updated_at FROM announcements WHERE id = ?")
        .bind(id)
        .fetch_optional(conn)
        .await?
        .ok_or_else(|| AppError::not_found("That announcement"))
}

pub async fn create(conn: &mut SqliteConnection, input: AnnouncementInput) -> AppResult<Announcement> {
    let input = input.clean()?;
    let now = clock::now_string();
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO announcements (title, body, pinned, published, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(&input.title)
    .bind(&input.body)
    .bind(input.pinned)
    .bind(input.published)
    .bind(&now)
    .bind(&now)
    .fetch_one(&mut *conn)
    .await?;
    let verb = if input.published { "published" } else { "drafted" };
    history::record(
        conn,
        Entity::Announcement,
        Some(id),
        verb,
        &format!("Announcement “{}” {verb}", input.title),
        None,
        None,
    )
    .await?;
    get(conn, id).await
}

pub async fn update(conn: &mut SqliteConnection, id: i64, input: AnnouncementInput) -> AppResult<Announcement> {
    let input = input.clean()?;
    get(conn, id).await?;
    sqlx::query("UPDATE announcements SET title = ?, body = ?, pinned = ?, published = ?, updated_at = ? WHERE id = ?")
        .bind(&input.title)
        .bind(&input.body)
        .bind(input.pinned)
        .bind(input.published)
        .bind(clock::now_string())
        .bind(id)
        .execute(&mut *conn)
        .await?;
    history::record(
        conn,
        Entity::Announcement,
        Some(id),
        "updated",
        &format!("Announcement “{}” updated", input.title),
        None,
        None,
    )
    .await?;
    get(conn, id).await
}

pub async fn delete(conn: &mut SqliteConnection, id: i64) -> AppResult<()> {
    let existing = get(conn, id).await?;
    sqlx::query("DELETE FROM announcements WHERE id = ?").bind(id).execute(&mut *conn).await?;
    history::record(
        conn,
        Entity::Announcement,
        Some(id),
        "deleted",
        &format!("Announcement “{}” deleted", existing.title),
        None,
        None,
    )
    .await?;
    Ok(())
}
