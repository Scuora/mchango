//! Change history. Every write records what changed and, for corrections, why.

use serde::Serialize;
use sqlx::SqliteConnection;

use crate::clock;

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
}

pub async fn for_entity(
    conn: &mut SqliteConnection,
    entity: Entity,
    entity_id: i64,
) -> Result<Vec<ChangeEntry>, sqlx::Error> {
    sqlx::query_as(
        "SELECT id, at, action, summary, reason, actor FROM change_log
         WHERE entity = ? AND entity_id = ? ORDER BY id DESC",
    )
    .bind(entity.as_str())
    .bind(entity_id)
    .fetch_all(conn)
    .await
}
