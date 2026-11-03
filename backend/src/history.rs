//! Change history. Every write records what changed and, for corrections, why.

use serde::{Deserialize, Serialize, Serializer};
use sqlx::{QueryBuilder, Sqlite, SqliteConnection};

use crate::clock;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy)]
pub enum Entity {
    Transaction,
    Fundraiser,
    Account,
    StatementImport,
    Document,
    Announcement,
    Challenge,
}

impl Entity {
    fn as_str(self) -> &'static str {
        match self {
            Entity::Transaction => "transaction",
            Entity::Fundraiser => "fundraiser",
            Entity::Account => "account",
            Entity::StatementImport => "statement_import",
            Entity::Document => "document",
            Entity::Announcement => "announcement",
            Entity::Challenge => "challenge",
        }
    }
}

pub async fn record(
    conn: &mut SqliteConnection,
    entity: Entity,
    entity_id: Option<i64>,
    action: &str,
    summary: &str,
    reason: Option<&str>,
    details: Option<serde_json::Value>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO change_log (at, entity, entity_id, action, summary, reason, details, actor)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(clock::now_string())
    .bind(entity.as_str())
    .bind(entity_id)
    .bind(action)
    .bind(summary)
    .bind(reason)
    .bind(details.map(|d| d.to_string()))
    .bind(crate::auth::current_actor())
    .execute(conn)
    .await?;
    Ok(())
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ChangeEntry {
    pub id: i64,
    pub at: String,
    pub action: String,
    pub summary: String,
    pub reason: Option<String>,
    pub actor: Option<String>,
    /// What changed, field by field, when the change kept it (sent as JSON).
    #[serde(serialize_with = "as_json")]
    pub details: Option<String>,
}

/// Sends stored JSON as JSON rather than as a string; unreadable details are left out.
fn as_json<S: Serializer>(details: &Option<String>, serializer: S) -> Result<S::Ok, S::Error> {
    details.as_deref().and_then(|d| serde_json::from_str::<serde_json::Value>(d).ok()).serialize(serializer)
}

pub async fn for_entity(
    conn: &mut SqliteConnection,
    entity: Entity,
    entity_id: i64,
) -> Result<Vec<ChangeEntry>, sqlx::Error> {
    sqlx::query_as(
        "SELECT id, at, action, summary, reason, actor, details FROM change_log
         WHERE entity = ? AND entity_id = ? ORDER BY id DESC",
    )
    .bind(entity.as_str())
    .bind(entity_id)
    .fetch_all(conn)
    .await
}

// ---------------------------------------------------------------------------
// Activity: every change, for accountability

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ActivityEntry {
    pub id: i64,
    pub at: String,
    /// What was changed: transaction, challenge, announcement, account, fundraiser, …
    pub entity: String,
    pub entity_id: Option<i64>,
    pub action: String,
    pub summary: String,
    pub reason: Option<String>,
    /// Who did it; `None` for the system (imports, background work).
    pub actor: Option<String>,
    #[serde(serialize_with = "as_json")]
    pub details: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
pub struct ActivityQuery {
    /// A username, or "system" for changes made by the app itself.
    pub actor: Option<String>,
    pub entity: Option<String>,
    /// Nairobi dates, inclusive.
    pub from: Option<String>,
    pub to: Option<String>,
    pub q: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct ActivityPage {
    pub entries: Vec<ActivityEntry>,
    pub total: i64,
    /// Everyone who has changed something, for the filter.
    pub actors: Vec<String>,
}

fn push_activity_filters(qb: &mut QueryBuilder<Sqlite>, query: &ActivityQuery) -> AppResult<()> {
    match query.actor.as_deref().map(str::trim).filter(|a| !a.is_empty()) {
        Some("system") => {
            qb.push(" AND actor IS NULL");
        }
        Some(actor) => {
            qb.push(" AND actor = ").push_bind(actor.to_string());
        }
        None => {}
    }
    if let Some(entity) = query.entity.as_deref().map(str::trim).filter(|e| !e.is_empty()) {
        qb.push(" AND entity = ").push_bind(entity.to_string());
    }
    if let Some(from) = query.from.as_deref().filter(|s| !s.is_empty()) {
        let date = clock::parse_date(from).ok_or_else(|| AppError::field("from", "Use a date like 2024-06-30."))?;
        qb.push(" AND at >= ").push_bind(clock::day_start(date));
    }
    if let Some(to) = query.to.as_deref().filter(|s| !s.is_empty()) {
        let date = clock::parse_date(to).ok_or_else(|| AppError::field("to", "Use a date like 2024-06-30."))?;
        qb.push(" AND at < ").push_bind(clock::day_end_exclusive(date));
    }
    if let Some(q) = query.q.as_deref().map(str::trim).filter(|q| !q.is_empty()) {
        let escaped = q.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
        let pattern = format!("%{escaped}%");
        qb.push(" AND (summary LIKE ")
            .push_bind(pattern.clone())
            .push(" ESCAPE '\\' OR reason LIKE ")
            .push_bind(pattern)
            .push(" ESCAPE '\\')");
    }
    Ok(())
}

/// Every change, newest first: who did what, when, and why.
pub async fn activity(conn: &mut SqliteConnection, query: ActivityQuery) -> AppResult<ActivityPage> {
    let limit = query.limit.unwrap_or(100).clamp(1, 500);
    let offset = query.offset.unwrap_or(0).max(0);
    let mut count = QueryBuilder::<Sqlite>::new("SELECT COUNT(*) FROM change_log WHERE 1 = 1");
    push_activity_filters(&mut count, &query)?;
    let total: i64 = count.build_query_scalar().fetch_one(&mut *conn).await?;
    let mut select = QueryBuilder::<Sqlite>::new(
        "SELECT id, at, entity, entity_id, action, summary, reason, actor, details FROM change_log WHERE 1 = 1",
    );
    push_activity_filters(&mut select, &query)?;
    select.push(" ORDER BY id DESC LIMIT ").push_bind(limit).push(" OFFSET ").push_bind(offset);
    let entries = select.build_query_as().fetch_all(&mut *conn).await?;
    let actors = sqlx::query_scalar("SELECT DISTINCT actor FROM change_log WHERE actor IS NOT NULL ORDER BY actor")
        .fetch_all(conn)
        .await?;
    Ok(ActivityPage { entries, total, actors })
}
