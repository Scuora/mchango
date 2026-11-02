//! Statement imports: the uploaded file, its processing status and the rows
//! extracted from it. Rows are kept apart from canonical transactions; the
//! reconciliation module decides how they relate.

pub mod layout;
pub mod pdf;
pub mod worker;

use serde::Serialize;
use serde_json::json;
use sqlx::SqliteConnection;

use crate::clock;
use crate::error::{AppError, AppResult};
use crate::history::{self, Entity};
use crate::settings::{self, AccountKind};
use layout::ParsedStatement;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(rename_all = "snake_case")]
pub enum ImportStatus {
    Queued,
    Processing,
    Ready,
    Failed,
    Discarded,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ImportSummary {
    pub id: i64,
    pub account_id: i64,
    pub account_name: String,
    pub status: ImportStatus,
    pub attempts: i64,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub layout: Option<String>,
    pub holder_name: Option<String>,
    pub holder_number: Option<String>,
    pub period_start: Option<String>,
    pub period_end: Option<String>,
    pub opening_balance_minor: Option<i64>,
    pub closing_balance_minor: Option<i64>,
    pub balance_breaks: Option<i64>,
    pub created_at: String,
    pub processed_at: Option<String>,
    pub completed_at: Option<String>,
    pub discarded_at: Option<String>,
    pub original_name: Option<String>,
    pub file_sha256: String,
    pub row_count: i64,
    pub unresolved_count: i64,
}

const SUMMARY_SELECT: &str = "SELECT i.id, i.account_id, a.name AS account_name, i.status, i.attempts,
        i.error_code, i.error_message, i.layout, i.holder_name, i.holder_number, i.period_start,
        i.period_end, i.opening_balance_minor, i.closing_balance_minor, i.balance_breaks, i.created_at,
        i.processed_at, i.completed_at, i.discarded_at, d.original_name, i.file_sha256,
        (SELECT COUNT(*) FROM statement_rows r WHERE r.import_id = i.id) AS row_count,
        (SELECT COUNT(*) FROM statement_rows r WHERE r.import_id = i.id
           AND r.match_status IN ('missing', 'conflict', 'review')) AS unresolved_count
    FROM statement_imports i
    JOIN accounts a ON a.id = i.account_id
    JOIN documents d ON d.id = i.document_id";

pub async fn list(conn: &mut SqliteConnection) -> AppResult<Vec<ImportSummary>> {
    let sql = sqlx::AssertSqlSafe(format!("{SUMMARY_SELECT} ORDER BY i.id DESC"));
    Ok(sqlx::query_as(sql).fetch_all(conn).await?)
}

pub async fn summary(conn: &mut SqliteConnection, id: i64) -> AppResult<ImportSummary> {
    let sql = sqlx::AssertSqlSafe(format!("{SUMMARY_SELECT} WHERE i.id = ?"));
    sqlx::query_as(sql).bind(id).fetch_optional(conn).await?.ok_or_else(|| AppError::not_found("That statement import"))
}

/// An upload that has been validated and written to private storage.
pub struct StoredUpload {
    pub account_id: i64,
    pub storage_name: String,
    pub original_name: Option<String>,
    pub size_bytes: i64,
    pub sha256: String,
}

pub async fn existing_import_for_hash(conn: &mut SqliteConnection, sha256: &str) -> AppResult<Option<(i64, String)>> {
    Ok(sqlx::query_as("SELECT id, created_at FROM statement_imports WHERE file_sha256 = ? AND status <> 'discarded'")
        .bind(sha256)
        .fetch_optional(conn)
        .await?)
}

pub async fn check_account(conn: &mut SqliteConnection, account_id: i64) -> AppResult<()> {
    let account = settings::account(conn, account_id)
        .await
        .map_err(|_| AppError::field("account_id", "Choose the M-Pesa account this statement belongs to."))?;
    if account.kind != AccountKind::Mpesa {
        return Err(AppError::field("account_id", "Only M-Pesa statements are supported. Choose an M-Pesa account."));
    }
    Ok(())
}

/// Records a queued import inside the caller's write transaction.
pub async fn create(conn: &mut SqliteConnection, upload: &StoredUpload) -> AppResult<i64> {
    let now = clock::now_string();
    let document_id: i64 = sqlx::query_scalar(
        "INSERT INTO documents (kind, storage_name, original_name, content_type, size_bytes, sha256, created_at)
         VALUES ('statement', ?, ?, 'application/pdf', ?, ?, ?) RETURNING id",
    )
    .bind(&upload.storage_name)
    .bind(&upload.original_name)
    .bind(upload.size_bytes)
    .bind(&upload.sha256)
    .bind(&now)
    .fetch_one(&mut *conn)
    .await?;
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO statement_imports (account_id, document_id, file_sha256, status, created_at)
         VALUES (?, ?, ?, 'queued', ?) RETURNING id",
    )
    .bind(upload.account_id)
    .bind(document_id)
    .bind(&upload.sha256)
    .bind(&now)
    .fetch_one(&mut *conn)
    .await?;
    history::record(
        conn,
        Entity::StatementImport,
        Some(id),
        "uploaded",
        &format!("Statement uploaded ({})", upload.original_name.as_deref().unwrap_or("PDF")),
        None,
        Some(json!({ "sha256": upload.sha256, "size_bytes": upload.size_bytes })),
    )
    .await?;
    Ok(id)
}

/// Replaces the import's rows with freshly parsed ones. Safe to repeat.
pub async fn store_parsed(conn: &mut SqliteConnection, id: i64, parsed: &ParsedStatement) -> AppResult<()> {
    sqlx::query("DELETE FROM statement_rows WHERE import_id = ?").bind(id).execute(&mut *conn).await?;
    for row in &parsed.rows {
        sqlx::query(
            "INSERT INTO statement_rows
               (import_id, position, page, receipt, completed_at, details, row_status, direction,
                amount_minor, balance_minor, is_fee, parse_note, match_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'review')",
        )
        .bind(id)
        .bind(row.position)
        .bind(row.page)
        .bind(&row.receipt)
        .bind(&row.completed_at)
        .bind(&row.details)
        .bind(&row.row_status)
        .bind(row.direction)
        .bind(row.amount_minor)
        .bind(row.balance_minor)
        .bind(row.is_fee)
        .bind(&row.note)
        .execute(&mut *conn)
        .await?;
    }
    sqlx::query(
        "UPDATE statement_imports SET status = 'ready', error_code = NULL, error_message = NULL,
                layout = ?, holder_name = ?, holder_number = ?, period_start = ?, period_end = ?,
                opening_balance_minor = ?, closing_balance_minor = ?, balance_breaks = ?, processed_at = ?
         WHERE id = ?",
    )
    .bind(layout::LAYOUT_ID)
    .bind(&parsed.holder_name)
    .bind(&parsed.holder_number)
    .bind(clock::format_date(parsed.period_start))
    .bind(clock::format_date(parsed.period_end))
    .bind(parsed.opening_balance_minor)
    .bind(parsed.closing_balance_minor)
    .bind(parsed.balance_breaks)
    .bind(clock::now_string())
    .bind(id)
    .execute(&mut *conn)
    .await?;
    history::record(
        conn,
        Entity::StatementImport,
        Some(id),
        "processed",
        &format!(
            "Read {} rows covering {} to {}",
            parsed.rows.len(),
            clock::format_date(parsed.period_start),
            clock::format_date(parsed.period_end)
        ),
        None,
        None,
    )
    .await?;
    Ok(())
}

pub async fn mark_failed(conn: &mut SqliteConnection, id: i64, code: &str, message: &str) -> AppResult<()> {
    sqlx::query("UPDATE statement_imports SET status = 'failed', error_code = ?, error_message = ? WHERE id = ?")
        .bind(code)
        .bind(message)
        .bind(id)
        .execute(&mut *conn)
        .await?;
    history::record(conn, Entity::StatementImport, Some(id), "failed", message, None, Some(json!({ "code": code })))
        .await?;
    Ok(())
}

/// Puts a failed import back in the queue.
pub async fn requeue(conn: &mut SqliteConnection, id: i64) -> AppResult<()> {
    let s = summary(conn, id).await?;
    if s.status != ImportStatus::Failed {
        return Err(AppError::Conflict("Only a failed import can be retried.".into()));
    }
    sqlx::query("UPDATE statement_imports SET status = 'queued', attempts = 0, error_code = NULL, error_message = NULL WHERE id = ?")
        .bind(id)
        .execute(&mut *conn)
        .await?;
    history::record(conn, Entity::StatementImport, Some(id), "retried", "Processing retried", None, None).await?;
    Ok(())
}

/// Sets an import aside (e.g. uploaded against the wrong account). Its rows stop
/// counting as statement evidence; transactions created from it are kept.
pub async fn discard(conn: &mut SqliteConnection, id: i64, reason: &str) -> AppResult<()> {
    let reason = reason.trim();
    if reason.chars().count() < 3 {
        return Err(AppError::field("reason", "Explain why this import is being discarded."));
    }
    let s = summary(conn, id).await?;
    if matches!(s.status, ImportStatus::Discarded | ImportStatus::Processing) {
        return Err(AppError::Conflict("This import cannot be discarded right now.".into()));
    }
    sqlx::query("UPDATE statement_imports SET status = 'discarded', discarded_at = ? WHERE id = ?")
        .bind(clock::now_string())
        .bind(id)
        .execute(&mut *conn)
        .await?;
    history::record(conn, Entity::StatementImport, Some(id), "discarded", "Import discarded", Some(reason), None)
        .await?;
    Ok(())
}
