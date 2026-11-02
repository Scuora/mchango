use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{Sqlite, SqlitePool, Transaction};
use std::path::Path;
use std::time::Duration;

pub type Tx = Transaction<'static, Sqlite>;

/// Opens the database with foreign keys, WAL and a bounded busy timeout, then
/// applies pending migrations.
pub async fn connect(path: &Path) -> Result<SqlitePool, String> {
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("cannot create database directory {}: {e}", parent.display()))?;
    }
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(Duration::from_secs(5));
    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .acquire_timeout(Duration::from_secs(10))
        .connect_with(options)
        .await
        .map_err(|e| format!("cannot open database {}: {e}", path.display()))?;
    sqlx::migrate!("./migrations").run(&pool).await.map_err(|e| format!("database migration failed: {e}"))?;
    Ok(pool)
}

/// Starts a write transaction that takes the write lock immediately.
///
/// `BEGIN IMMEDIATE` avoids the deadlock where two deferred transactions both
/// read and then try to upgrade to writing. Keep these transactions short:
/// do slow work (file parsing, hashing) before calling this.
pub async fn begin_write(pool: &SqlitePool) -> Result<Tx, sqlx::Error> {
    pool.begin_with("BEGIN IMMEDIATE").await
}

/// Writes a consistent copy of the live database using `VACUUM INTO`,
/// which is safe while the server is running.
pub async fn backup(pool: &SqlitePool, destination: &Path) -> Result<(), String> {
    if destination.exists() {
        return Err(format!("{} already exists; choose a new file name", destination.display()));
    }
    if let Some(parent) = destination.parent().filter(|p| !p.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
    }
    let target = destination.to_str().ok_or_else(|| "backup path must be valid UTF-8".to_string())?.to_string();
    sqlx::query("VACUUM INTO ?").bind(target).execute(pool).await.map_err(|e| format!("backup failed: {e}"))?;
    Ok(())
}
