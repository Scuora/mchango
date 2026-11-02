//! Background processing of statement imports.
//!
//! One worker task handles one import at a time. Status lives in the database,
//! so an import interrupted by a restart is picked up again. The PDF is read
//! with no database transaction open; results are written in one short one.

use sqlx::SqlitePool;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::Notify;

use super::{layout, pdf};
use crate::db;
use crate::error::AppResult;
use crate::reconciliation;
use crate::storage::Storage;

const MAX_ATTEMPTS: i64 = 3;

/// Hands work to the worker. Passwords are held in memory only until used.
#[derive(Clone, Default)]
pub struct ImportQueue {
    notify: Arc<Notify>,
    passwords: Arc<Mutex<HashMap<i64, String>>>,
}

impl ImportQueue {
    pub fn submit(&self, import_id: i64, password: Option<String>) {
        if let Some(password) = password.filter(|p| !p.is_empty()) {
            self.passwords.lock().expect("password map").insert(import_id, password);
        }
        self.notify.notify_one();
    }

    fn take_password(&self, import_id: i64) -> Option<String> {
        self.passwords.lock().expect("password map").remove(&import_id)
    }
}

#[derive(Clone)]
pub struct Worker {
    pub pool: SqlitePool,
    pub storage: Storage,
    pub queue: ImportQueue,
    pub pdftotext: PathBuf,
    pub timeout: Duration,
}

/// Imports left `processing` by a crash or restart go back to the queue.
pub async fn recover(pool: &SqlitePool) -> Result<u64, sqlx::Error> {
    let result =
        sqlx::query("UPDATE statement_imports SET status = 'queued' WHERE status = 'processing'").execute(pool).await?;
    Ok(result.rows_affected())
}

impl Worker {
    pub fn spawn(self) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            loop {
                match self.run_once().await {
                    Ok(true) => continue,
                    Ok(false) => {}
                    Err(e) => tracing::error!(error = ?e, "statement worker error"),
                }
                tokio::select! {
                    _ = self.queue.notify.notified() => {}
                    _ = tokio::time::sleep(Duration::from_secs(60)) => {}
                }
            }
        })
    }

    /// Processes the next queued import. Returns false when the queue is empty.
    pub async fn run_once(&self) -> AppResult<bool> {
        let claimed: Option<(i64, String, i64)> = sqlx::query_as(
            "UPDATE statement_imports SET status = 'processing', attempts = attempts + 1
             WHERE id = (SELECT id FROM statement_imports WHERE status = 'queued' ORDER BY id LIMIT 1)
             RETURNING id,
                       (SELECT storage_name FROM documents d WHERE d.id = statement_imports.document_id),
                       attempts",
        )
        .fetch_optional(&self.pool)
        .await?;
        let Some((id, storage_name, attempts)) = claimed else { return Ok(false) };
        let password = self.queue.take_password(id);
        tracing::info!(import_id = id, attempts, "processing statement");

        if attempts > MAX_ATTEMPTS {
            let mut tx = db::begin_write(&self.pool).await?;
            super::mark_failed(
                &mut tx,
                id,
                "too_many_attempts",
                "Processing stopped after repeated failures. Retry, or upload the statement again.",
            )
            .await?;
            tx.commit().await?;
            return Ok(true);
        }

        let outcome = match self.storage.path(&storage_name) {
            None => Err(("missing_file", "The uploaded file is missing from storage. Upload it again.".to_string())),
            Some(path) => match pdf::extract_text(&self.pdftotext, &path, password.as_deref(), self.timeout).await {
                Err(e) => {
                    if let pdf::PdfError::Failed(detail) = &e {
                        tracing::warn!(import_id = id, %detail, "pdf extraction failed");
                    }
                    Err((e.code(), e.message()))
                }
                Ok(text) => layout::parse(&text).map_err(|e| (e.code(), e.message().to_string())),
            },
        };

        let mut tx = db::begin_write(&self.pool).await?;
        match outcome {
            Ok(parsed) => {
                super::store_parsed(&mut tx, id, &parsed).await?;
                reconciliation::match_import(&mut tx, id).await?;
                tracing::info!(import_id = id, rows = parsed.rows.len(), "statement processed");
            }
            Err((code, message)) => {
                tracing::info!(import_id = id, code, "statement could not be processed");
                super::mark_failed(&mut tx, id, code, &message).await?;
            }
        }
        tx.commit().await?;
        Ok(true)
    }
}
