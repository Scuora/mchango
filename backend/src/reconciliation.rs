//! Matching statement rows to canonical transactions, and checking balances.
//!
//! A row is matched by account, reference, direction and line type (payment or
//! charge). Amount and date alone only ever produce a suggestion that a person
//! confirms. Nothing here creates a transaction without an explicit request,
//! and no balancing entry is ever generated.

use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::SqliteConnection;

use crate::clock;
use crate::error::{AppError, AppResult};
use crate::history::{self, Entity};
use crate::money::{Amount, format_kes};
use crate::settings;
use crate::statements::{self, ImportStatus, ImportSummary};
use crate::transactions::{self, Direction, Kind, ListItem, MovementInput, Presentation};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(rename_all = "snake_case")]
pub enum MatchStatus {
    Matched,
    Missing,
    Conflict,
    Review,
    NoEffect,
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct RowFacts {
    id: i64,
    import_id: i64,
    receipt: Option<String>,
    completed_at: Option<String>,
    details: String,
    row_status: Option<String>,
    direction: Option<Direction>,
    amount_minor: Option<i64>,
    is_fee: bool,
    parse_note: Option<String>,
    match_status: MatchStatus,
    transaction_id: Option<i64>,
    account_id: i64,
}

const ROW_FACTS: &str = "SELECT r.id, r.import_id, r.receipt, r.completed_at, r.details, r.row_status, r.direction,
        r.amount_minor, r.is_fee, r.parse_note, r.match_status, r.transaction_id, i.account_id
    FROM statement_rows r JOIN statement_imports i ON i.id = r.import_id";

async fn row_facts(conn: &mut SqliteConnection, row_id: i64) -> AppResult<RowFacts> {
    let sql = sqlx::AssertSqlSafe(format!("{ROW_FACTS} WHERE r.id = ?"));
    sqlx::query_as(sql)
        .bind(row_id)
        .fetch_optional(conn)
        .await?
        .ok_or_else(|| AppError::not_found("That statement row"))
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct Candidate {
    transaction_id: i64,
    amount_minor: i64,
    occurred_at: String,
}

struct Decision {
    status: MatchStatus,
    transaction_id: Option<i64>,
    candidate: Option<i64>,
    method: Option<&'static str>,
    note: Option<String>,
}

impl Decision {
    fn of(status: MatchStatus, note: impl Into<Option<String>>) -> Self {
        Decision { status, transaction_id: None, candidate: None, method: None, note: note.into() }
    }
}

/// Hours of difference tolerated between a record's time and the statement's.
const TIME_TOLERANCE_HOURS: i64 = 36;

fn hours_apart(a: &str, b: &str) -> Option<i64> {
    let (a, b) = (clock::parse_instant(a)?, clock::parse_instant(b)?);
    Some((a - b).whole_hours().abs())
}

/// Current, live records that use this row's reference on this account leg,
/// excluding any already linked to another row of the same import.
async fn reference_candidates(
    conn: &mut SqliteConnection,
    row: &RowFacts,
    reference: &str,
    direction: Direction,
) -> AppResult<Vec<Candidate>> {
    Ok(sqlx::query_as(
        "SELECT v.transaction_id, v.amount_minor, v.occurred_at FROM transaction_versions v
         WHERE v.is_current = 1 AND v.removed = 0 AND v.reference = ? AND v.is_fee = ?
           AND ((v.account_id = ? AND v.direction = ?)
                OR (v.kind = 'transfer' AND v.to_account_id = ? AND ? = 'in'))
           AND v.transaction_id NOT IN (
               SELECT transaction_id FROM statement_rows
               WHERE import_id = ? AND transaction_id IS NOT NULL AND id <> ?)
         ORDER BY v.transaction_id",
    )
    .bind(reference)
    .bind(row.is_fee)
    .bind(row.account_id)
    .bind(direction)
    .bind(row.account_id)
    .bind(direction)
    .bind(row.import_id)
    .bind(row.id)
    .fetch_all(conn)
    .await?)
}

async fn classify(conn: &mut SqliteConnection, row: &RowFacts) -> AppResult<Decision> {
    let (Some(amount), Some(direction)) = (row.amount_minor, row.direction) else {
        let note = row.parse_note.clone().unwrap_or_else(|| "The amount or direction could not be read.".into());
        return Ok(Decision::of(MatchStatus::Review, note));
    };
    if amount == 0 {
        return Ok(Decision::of(MatchStatus::NoEffect, "No money moved on this row.".to_string()));
    }
    if let Some(status) = row.row_status.as_deref().filter(|s| !s.eq_ignore_ascii_case("completed")) {
        return Ok(Decision::of(MatchStatus::Review, format!("The statement shows this row as “{status}”.")));
    }
    let (Some(reference), Some(completed_at)) = (row.receipt.as_deref(), row.completed_at.as_deref()) else {
        return Ok(Decision::of(MatchStatus::Review, "The reference or time could not be read.".to_string()));
    };

    let candidates = reference_candidates(conn, row, reference, direction).await?;
    if candidates.len() > 1 {
        return Ok(Decision {
            candidate: Some(candidates[0].transaction_id),
            ..Decision::of(MatchStatus::Conflict, "More than one record uses this reference.".to_string())
        });
    }
    if let Some(c) = candidates.first() {
        let conflict =
            |note: String| Decision { candidate: Some(c.transaction_id), ..Decision::of(MatchStatus::Conflict, note) };
        if c.amount_minor != amount {
            return Ok(conflict(format!(
                "Amounts differ: the statement shows {}, the record says {}.",
                format_kes(amount),
                format_kes(c.amount_minor)
            )));
        }
        if hours_apart(&c.occurred_at, completed_at).is_none_or(|h| h > TIME_TOLERANCE_HOURS) {
            return Ok(conflict("Same reference and amount, but the record's date is different.".into()));
        }
        return Ok(Decision {
            status: MatchStatus::Matched,
            transaction_id: Some(c.transaction_id),
            candidate: None,
            method: Some("reference"),
            note: None,
        });
    }

    // Same reference recorded under a different account.
    let elsewhere: Option<(i64, String)> = sqlx::query_as(
        "SELECT v.transaction_id, coalesce(a.name, '') FROM transaction_versions v
         LEFT JOIN accounts a ON a.id = v.account_id
         WHERE v.is_current = 1 AND v.removed = 0 AND v.reference = ? AND v.is_fee = ? AND v.direction = ?
           AND v.account_id <> ? AND NOT (v.kind = 'transfer' AND v.to_account_id = ?)
         LIMIT 1",
    )
    .bind(reference)
    .bind(row.is_fee)
    .bind(direction)
    .bind(row.account_id)
    .bind(row.account_id)
    .fetch_optional(&mut *conn)
    .await?;
    if let Some((id, account)) = elsewhere {
        return Ok(Decision {
            candidate: Some(id),
            ..Decision::of(
                MatchStatus::Conflict,
                format!("This reference is recorded under another account ({account})."),
            )
        });
    }

    // A record without a reference that has the same amount and date is only a suggestion.
    let suggestion: Option<i64> = sqlx::query_scalar(
        "SELECT v.transaction_id FROM transaction_versions v
         WHERE v.is_current = 1 AND v.removed = 0 AND v.reference IS NULL AND v.is_fee = ?
           AND v.amount_minor = ?
           AND ((v.account_id = ? AND v.direction = ?)
                OR (v.kind = 'transfer' AND v.to_account_id = ? AND ? = 'in'))
           AND abs(julianday(v.occurred_at) - julianday(?)) <= 1.5
           AND v.transaction_id NOT IN (
               SELECT transaction_id FROM statement_rows WHERE import_id = ? AND transaction_id IS NOT NULL)
         ORDER BY abs(julianday(v.occurred_at) - julianday(?)) LIMIT 1",
    )
    .bind(row.is_fee)
    .bind(amount)
    .bind(row.account_id)
    .bind(direction)
    .bind(row.account_id)
    .bind(direction)
    .bind(completed_at)
    .bind(row.import_id)
    .bind(completed_at)
    .fetch_optional(&mut *conn)
    .await?;
    if let Some(id) = suggestion {
        return Ok(Decision {
            candidate: Some(id),
            ..Decision::of(
                MatchStatus::Review,
                "Possible match: a record with the same amount and date but no reference. Confirm it if it is the same transaction.".to_string(),
            )
        });
    }
    Ok(Decision::of(MatchStatus::Missing, None))
}

async fn apply(conn: &mut SqliteConnection, row_id: i64, d: &Decision) -> AppResult<()> {
    sqlx::query(
        "UPDATE statement_rows SET match_status = ?, transaction_id = ?, candidate_transaction_id = ?,
                match_method = ?, match_note = ?, decided_at = ?
         WHERE id = ?",
    )
    .bind(d.status)
    .bind(d.transaction_id)
    .bind(d.candidate)
    .bind(d.method)
    .bind(&d.note)
    .bind(clock::now_string())
    .bind(row_id)
    .execute(conn)
    .await?;
    Ok(())
}

async fn reclassify(conn: &mut SqliteConnection, row_ids: Vec<i64>) -> AppResult<()> {
    for id in row_ids {
        let facts = row_facts(conn, id).await?;
        let decision = classify(conn, &facts).await?;
        apply(conn, id, &decision).await?;
    }
    Ok(())
}

/// Classifies every row of a freshly processed import.
pub async fn match_import(conn: &mut SqliteConnection, import_id: i64) -> AppResult<()> {
    let ids: Vec<i64> = sqlx::query_scalar("SELECT id FROM statement_rows WHERE import_id = ? ORDER BY position")
        .bind(import_id)
        .fetch_all(&mut *conn)
        .await?;
    reclassify(conn, ids).await
}

/// Re-checks rows that still need a decision (after records were added elsewhere).
pub async fn rematch_unresolved(conn: &mut SqliteConnection, import_id: i64) -> AppResult<()> {
    let ids: Vec<i64> = sqlx::query_scalar(
        "SELECT id FROM statement_rows WHERE import_id = ? AND match_status IN ('missing', 'conflict', 'review')
         ORDER BY position",
    )
    .bind(import_id)
    .fetch_all(&mut *conn)
    .await?;
    reclassify(conn, ids).await
}

/// Re-checks unresolved rows that carry this reference, in every live import.
pub async fn rematch_reference(conn: &mut SqliteConnection, reference: &str) -> AppResult<()> {
    let ids: Vec<i64> = sqlx::query_scalar(
        "SELECT r.id FROM statement_rows r JOIN statement_imports i ON i.id = r.import_id
         WHERE r.receipt = ? AND i.status = 'ready' AND r.match_status IN ('missing', 'conflict', 'review')
         ORDER BY r.import_id, r.position",
    )
    .bind(reference)
    .fetch_all(&mut *conn)
    .await?;
    reclassify(conn, ids).await
}

/// After a record is corrected or removed, rows matched to it are checked
/// again. A link that no longer agrees becomes a conflict for a person to see.
pub async fn recheck_links(conn: &mut SqliteConnection, transaction_id: i64) -> AppResult<()> {
    let sql = sqlx::AssertSqlSafe(format!("{ROW_FACTS} WHERE r.transaction_id = ?"));
    let rows: Vec<RowFacts> = sqlx::query_as(sql).bind(transaction_id).fetch_all(&mut *conn).await?;
    if rows.is_empty() {
        return Ok(());
    }
    let current = transactions::current_version(conn, transaction_id).await?;
    for row in rows {
        let leg_ok = match (row.direction, current.direction) {
            (Some(Direction::In), _) if current.kind == Kind::Transfer => current.to_account_id == Some(row.account_id),
            (Some(d), Some(cd)) => current.account_id == Some(row.account_id) && d == cd,
            _ => false,
        };
        let problem = if current.removed {
            Some("The record matched to this row was removed.".to_string())
        } else if !leg_ok || current.is_fee != row.is_fee {
            Some("The record matched to this row was changed and no longer fits it.".to_string())
        } else if row.amount_minor != Some(current.amount_minor) {
            Some(format!(
                "The record was corrected to {}, but the statement shows {}.",
                format_kes(current.amount_minor),
                row.amount_minor.map(format_kes).unwrap_or_default()
            ))
        } else {
            None
        };
        if let Some(note) = problem {
            let d = Decision { candidate: Some(transaction_id), ..Decision::of(MatchStatus::Conflict, note) };
            apply(conn, row.id, &d).await?;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Decisions made by a person

async fn ensure_open(conn: &mut SqliteConnection, import_id: i64) -> AppResult<ImportSummary> {
    let summary = statements::summary(conn, import_id).await?;
    if summary.status != ImportStatus::Ready {
        return Err(AppError::Conflict("This statement is not ready for reconciliation.".into()));
    }
    Ok(summary)
}

async fn row_in_import(conn: &mut SqliteConnection, import_id: i64, row_id: i64) -> AppResult<RowFacts> {
    let row = row_facts(conn, row_id).await?;
    if row.import_id != import_id {
        return Err(AppError::not_found("That statement row"));
    }
    Ok(row)
}

/// Confirms that a row and an existing record are the same movement.
pub async fn link_row(conn: &mut SqliteConnection, import_id: i64, row_id: i64, transaction_id: i64) -> AppResult<()> {
    ensure_open(conn, import_id).await?;
    let row = row_in_import(conn, import_id, row_id).await?;
    if row.match_status == MatchStatus::Matched {
        return Err(AppError::Conflict("This row is already matched.".into()));
    }
    let (Some(amount), Some(direction), Some(receipt)) = (row.amount_minor, row.direction, row.receipt.clone()) else {
        return Err(AppError::invalid("This row has no readable amount or direction, so it cannot be matched."));
    };
    let current = transactions::current_version(conn, transaction_id).await?;
    if current.removed {
        return Err(AppError::invalid("That record was removed."));
    }
    let leg_ok = (current.account_id == Some(row.account_id) && current.direction == Some(direction))
        || (current.kind == Kind::Transfer
            && current.to_account_id == Some(row.account_id)
            && direction == Direction::In);
    if !leg_ok {
        return Err(AppError::invalid(
            "That record is on a different account or goes the other way. Correct the record first.",
        ));
    }
    if current.amount_minor != amount {
        return Err(AppError::invalid(format!(
            "Amounts differ ({} on the statement, {} on the record). Correct the record first, giving the reason.",
            format_kes(amount),
            format_kes(current.amount_minor)
        )));
    }
    if current.is_fee != row.is_fee {
        return Err(AppError::invalid("One is a charge and the other is not. Choose the matching line."));
    }
    match &current.reference {
        Some(r) if *r != receipt => {
            return Err(AppError::invalid(format!(
                "The record's reference is {r}, but the statement row is {receipt}. Correct the record first."
            )));
        }
        Some(_) => {}
        None => {
            // Keep the statement reference on the record so later imports match it directly.
            let reason = format!("Reference {receipt} added when matched to statement import #{import_id}");
            transactions::add_reference(conn, transaction_id, &receipt, &reason).await?;
        }
    }

    // Adding the reference may already have matched the row by reference.
    let row = row_facts(conn, row_id).await?;
    if row.transaction_id != Some(transaction_id) {
        let taken: Option<i64> =
            sqlx::query_scalar("SELECT id FROM statement_rows WHERE import_id = ? AND transaction_id = ? AND id <> ?")
                .bind(import_id)
                .bind(transaction_id)
                .bind(row_id)
                .fetch_optional(&mut *conn)
                .await?;
        if taken.is_some() {
            return Err(AppError::Conflict("That record is already matched to another row of this statement.".into()));
        }
    }
    let d = Decision {
        status: MatchStatus::Matched,
        transaction_id: Some(transaction_id),
        candidate: None,
        method: Some("confirmed"),
        note: None,
    };
    apply(conn, row_id, &d).await?;
    history::record(
        conn,
        Entity::Transaction,
        Some(transaction_id),
        "matched",
        &format!("Matched to statement import #{import_id}, row {}", row_id),
        None,
        Some(json!({ "import_id": import_id, "row_id": row_id })),
    )
    .await?;
    Ok(())
}

pub async fn unlink_row(conn: &mut SqliteConnection, import_id: i64, row_id: i64) -> AppResult<()> {
    ensure_open(conn, import_id).await?;
    let row = row_in_import(conn, import_id, row_id).await?;
    let Some(transaction_id) = row.transaction_id else {
        return Err(AppError::Conflict("This row is not matched.".into()));
    };
    let d = Decision {
        candidate: Some(transaction_id),
        ..Decision::of(MatchStatus::Review, "Unmatched by hand. Choose the right record or add a new one.".to_string())
    };
    apply(conn, row_id, &d).await?;
    history::record(
        conn,
        Entity::Transaction,
        Some(transaction_id),
        "unmatched",
        &format!("Unmatched from statement import #{import_id}"),
        None,
        None,
    )
    .await?;
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct CreateFromRow {
    pub kind: Kind,
    /// For transfers: the other account (money went to it, or came from it).
    #[serde(default)]
    pub other_account_id: Option<i64>,
    #[serde(default)]
    pub related_transaction_id: Option<i64>,
    pub presentation: Presentation,
}

/// Adds a record for a row missing from the ledger and links it, in the
/// caller's write transaction, so both happen or neither does.
pub async fn create_from_row(
    conn: &mut SqliteConnection,
    import_id: i64,
    row_id: i64,
    input: CreateFromRow,
) -> AppResult<i64> {
    ensure_open(conn, import_id).await?;
    let row = row_in_import(conn, import_id, row_id).await?;
    if row.match_status == MatchStatus::Matched {
        return Err(AppError::Conflict("This row is already matched to a record.".into()));
    }
    let (Some(amount), Some(direction), Some(receipt), Some(at)) =
        (row.amount_minor, row.direction, row.receipt.clone(), row.completed_at.clone())
    else {
        return Err(AppError::invalid(
            "This row could not be read fully, so it cannot be added automatically. Add it by hand instead.",
        ));
    };
    let amount = Amount::try_from(amount).map_err(|_| AppError::invalid("This row has no amount to record."))?;

    let (account_id, to_account_id, movement_direction) = if input.kind == Kind::Transfer {
        let other = input
            .other_account_id
            .ok_or_else(|| AppError::field("other_account_id", "Choose the other account for this transfer."))?;
        match direction {
            Direction::Out => (row.account_id, Some(other), None),
            Direction::In => (other, Some(row.account_id), None),
        }
    } else {
        (row.account_id, None, Some(direction))
    };

    let movement = MovementInput {
        kind: input.kind,
        direction: movement_direction,
        amount_minor: amount,
        occurred_at: at,
        account_id: Some(account_id),
        to_account_id,
        reference: Some(receipt),
        is_fee: row.is_fee,
        related_transaction_id: input.related_transaction_id,
        counterparty: Some(row.details.clone()),
    };
    // The kind must agree with what the statement shows.
    let checked = movement.clone().validate()?;
    if input.kind != Kind::Transfer && checked.direction != Some(direction) {
        return Err(AppError::field("kind", "That type does not fit: the statement shows money going the other way."));
    }
    if checked.is_fee != row.is_fee {
        return Err(AppError::field(
            "kind",
            if row.is_fee {
                "This row is a charge. Record it as Charges, or as Personal if it was on personal activity."
            } else {
                "This row is not a charge. Choose another type."
            },
        ));
    }

    let created = transactions::create(
        conn,
        transactions::CreateRequest {
            movement,
            presentation: input.presentation,
            source_message: None,
            charge_minor: None,
            client_key: None,
            confirm_possible_duplicate: true,
            challenge_id: None,
        },
        &format!("from statement import #{import_id}"),
    )
    .await?;

    let row = row_facts(conn, row_id).await?;
    if row.transaction_id != Some(created.id) {
        let d = Decision {
            status: MatchStatus::Matched,
            transaction_id: Some(created.id),
            candidate: None,
            method: Some("created"),
            note: None,
        };
        apply(conn, row_id, &d).await?;
    } else {
        sqlx::query("UPDATE statement_rows SET match_method = 'created' WHERE id = ?")
            .bind(row_id)
            .execute(&mut *conn)
            .await?;
    }
    Ok(created.id)
}

// ---------------------------------------------------------------------------
// Reading an import

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct RowView {
    pub id: i64,
    pub position: i64,
    pub page: Option<i64>,
    pub receipt: Option<String>,
    pub completed_at: Option<String>,
    pub details: String,
    pub row_status: Option<String>,
    pub direction: Option<Direction>,
    pub amount_minor: Option<i64>,
    pub balance_minor: Option<i64>,
    pub is_fee: bool,
    pub parse_note: Option<String>,
    pub match_status: MatchStatus,
    pub transaction_id: Option<i64>,
    pub candidate_transaction_id: Option<i64>,
    pub match_method: Option<String>,
    pub match_note: Option<String>,
    pub decided_at: Option<String>,
    #[sqlx(skip)]
    pub suggestion: Option<Suggestion>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Suggestion {
    pub kind: Kind,
    pub related_transaction_id: Option<i64>,
}

#[derive(Debug, Default, Serialize)]
pub struct RowCounts {
    pub matched: i64,
    pub missing: i64,
    pub conflict: i64,
    pub review: i64,
    pub no_effect: i64,
}

#[derive(Debug, Serialize)]
pub struct BalanceCheck {
    pub opening_balance_minor: Option<i64>,
    pub closing_balance_minor: Option<i64>,
    pub statement_in_minor: i64,
    pub statement_out_minor: i64,
    /// Rows without a readable amount or direction (not included above).
    pub unreadable_rows: i64,
    pub balance_breaks: i64,
    /// Opening + in − out = closing, using the statement alone.
    pub statement_adds_up: bool,
    pub ledger_in_minor: i64,
    pub ledger_out_minor: i64,
    /// (closing − opening) − (ledger in − ledger out) for this account and period.
    pub unexplained_difference_minor: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct Readiness {
    pub can_complete: bool,
    pub blockers: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ImportDetail {
    pub import: ImportSummary,
    pub rows: Vec<RowView>,
    pub counts: RowCounts,
    pub related: Vec<ListItem>,
    pub ledger_only: Vec<ListItem>,
    pub balance: Option<BalanceCheck>,
    pub readiness: Readiness,
    /// Completed, and nothing has changed since that undoes it.
    pub reconciled: bool,
    pub expenses_missing_receipts: i64,
    pub number_warning: Option<String>,
}

fn suggest(row: &RowView) -> Option<Suggestion> {
    if !matches!(row.match_status, MatchStatus::Missing | MatchStatus::Review | MatchStatus::Conflict) {
        return None;
    }
    let details = row.details.to_ascii_lowercase();
    let kind = if row.is_fee {
        Kind::Charge
    } else if details.contains("reversal") {
        Kind::Reversal
    } else if (details.contains("withdrawal") && row.direction == Some(Direction::Out))
        || (details.contains("deposit") && row.direction == Some(Direction::In))
    {
        // Cash moving between M-Pesa and cash held.
        Kind::Transfer
    } else if row.direction == Some(Direction::In) {
        Kind::Contribution
    } else {
        Kind::Expense
    };
    Some(Suggestion { kind, related_transaction_id: None })
}

struct Period {
    start: String,
    end_exclusive: String,
}

fn period_of(summary: &ImportSummary) -> Option<Period> {
    let start = clock::parse_date(summary.period_start.as_deref()?)?;
    let end = clock::parse_date(summary.period_end.as_deref()?)?;
    Some(Period { start: clock::day_start(start), end_exclusive: clock::day_end_exclusive(end) })
}

async fn ledger_only_ids(conn: &mut SqliteConnection, s: &ImportSummary, p: &Period) -> AppResult<Vec<i64>> {
    Ok(sqlx::query_scalar(
        "SELECT v.transaction_id FROM transaction_versions v
         WHERE v.is_current = 1 AND v.removed = 0 AND v.kind NOT IN ('pledge', 'commitment')
           AND (v.account_id = ? OR v.to_account_id = ?)
           AND v.occurred_at >= ? AND v.occurred_at < ?
           AND v.transaction_id NOT IN (
               SELECT transaction_id FROM statement_rows WHERE import_id = ? AND transaction_id IS NOT NULL)
         ORDER BY v.occurred_at",
    )
    .bind(s.account_id)
    .bind(s.account_id)
    .bind(&p.start)
    .bind(&p.end_exclusive)
    .bind(s.id)
    .fetch_all(conn)
    .await?)
}

async fn balance_check(conn: &mut SqliteConnection, s: &ImportSummary, p: &Period) -> AppResult<BalanceCheck> {
    let (statement_in, statement_out, unreadable): (i64, i64, i64) = sqlx::query_as(
        "SELECT coalesce(sum(CASE WHEN direction = 'in' THEN amount_minor END), 0),
                coalesce(sum(CASE WHEN direction = 'out' THEN amount_minor END), 0),
                coalesce(sum(CASE WHEN direction IS NULL OR amount_minor IS NULL THEN 1 ELSE 0 END), 0)
         FROM statement_rows WHERE import_id = ?",
    )
    .bind(s.id)
    .fetch_one(&mut *conn)
    .await?;
    let (ledger_in, ledger_out): (i64, i64) = sqlx::query_as(
        "SELECT coalesce(sum(CASE WHEN (v.kind = 'transfer' AND v.to_account_id = ?1)
                                   OR (v.account_id = ?1 AND v.direction = 'in') THEN v.amount_minor END), 0),
                coalesce(sum(CASE WHEN v.account_id = ?1 AND v.direction = 'out' THEN v.amount_minor END), 0)
         FROM transaction_versions v
         WHERE v.is_current = 1 AND v.removed = 0 AND v.kind NOT IN ('pledge', 'commitment')
           AND (v.account_id = ?1 OR v.to_account_id = ?1)
           AND v.occurred_at >= ?2 AND v.occurred_at < ?3",
    )
    .bind(s.account_id)
    .bind(&p.start)
    .bind(&p.end_exclusive)
    .fetch_one(&mut *conn)
    .await?;

    let breaks = s.balance_breaks.unwrap_or(0);
    let adds_up = match (s.opening_balance_minor, s.closing_balance_minor) {
        (Some(o), Some(c)) => unreadable == 0 && o + statement_in - statement_out == c,
        _ => false,
    };
    let difference = match (s.opening_balance_minor, s.closing_balance_minor) {
        (Some(o), Some(c)) => Some((c - o) - (ledger_in - ledger_out)),
        _ => None,
    };
    Ok(BalanceCheck {
        opening_balance_minor: s.opening_balance_minor,
        closing_balance_minor: s.closing_balance_minor,
        statement_in_minor: statement_in,
        statement_out_minor: statement_out,
        unreadable_rows: unreadable,
        balance_breaks: breaks,
        statement_adds_up: adds_up,
        ledger_in_minor: ledger_in,
        ledger_out_minor: ledger_out,
        unexplained_difference_minor: difference,
    })
}

fn readiness(s: &ImportSummary, counts: &RowCounts, ledger_only: usize, balance: Option<&BalanceCheck>) -> Readiness {
    let mut blockers = Vec::new();
    if s.status != ImportStatus::Ready {
        blockers.push("The statement has not been processed successfully.".to_string());
    }
    let open = counts.missing + counts.conflict + counts.review;
    if open > 0 {
        blockers.push(format!(
            "{open} statement row{} still need{} a decision.",
            plural(open),
            if open == 1 { "s" } else { "" }
        ));
    }
    if ledger_only > 0 {
        blockers.push(format!(
            "{ledger_only} record{} on this account in this period {} not on the statement.",
            plural(ledger_only as i64),
            if ledger_only == 1 { "is" } else { "are" }
        ));
    }
    if let Some(b) = balance {
        if b.balance_breaks > 0 {
            blockers.push(format!(
                "The running balance breaks on {} row{}; a row may be missing or misread.",
                b.balance_breaks,
                plural(b.balance_breaks)
            ));
        }
        if b.opening_balance_minor.is_none() || b.closing_balance_minor.is_none() {
            blockers.push("The opening or closing balance could not be worked out.".into());
        } else if !b.statement_adds_up {
            blockers.push("Opening balance + money in − money out does not equal the closing balance.".into());
        }
        match b.unexplained_difference_minor {
            Some(0) => {}
            Some(d) => blockers.push(format!("There is an unexplained difference of {}.", format_kes(d))),
            None => {}
        }
    }
    Readiness { can_complete: blockers.is_empty(), blockers }
}

fn plural(n: i64) -> &'static str {
    if n == 1 { "" } else { "s" }
}

/// The checks behind "can this period be completed?", using aggregate queries only.
struct Assessment {
    counts: RowCounts,
    ledger_only: Vec<i64>,
    balance: Option<BalanceCheck>,
    readiness: Readiness,
    reconciled: bool,
}

async fn assess(conn: &mut SqliteConnection, import: &ImportSummary) -> AppResult<Assessment> {
    let mut counts = RowCounts::default();
    let grouped: Vec<(MatchStatus, i64)> =
        sqlx::query_as("SELECT match_status, COUNT(*) FROM statement_rows WHERE import_id = ? GROUP BY match_status")
            .bind(import.id)
            .fetch_all(&mut *conn)
            .await?;
    for (status, n) in grouped {
        match status {
            MatchStatus::Matched => counts.matched = n,
            MatchStatus::Missing => counts.missing = n,
            MatchStatus::Conflict => counts.conflict = n,
            MatchStatus::Review => counts.review = n,
            MatchStatus::NoEffect => counts.no_effect = n,
        }
    }
    let (ledger_only, balance) = match (period_of(import), import.status) {
        (Some(p), ImportStatus::Ready) => {
            (ledger_only_ids(conn, import, &p).await?, Some(balance_check(conn, import, &p).await?))
        }
        _ => (Vec::new(), None),
    };
    let readiness = readiness(import, &counts, ledger_only.len(), balance.as_ref());
    let reconciled = import.completed_at.is_some() && readiness.can_complete;
    Ok(Assessment { counts, ledger_only, balance, readiness, reconciled })
}

pub async fn detail(conn: &mut SqliteConnection, import_id: i64) -> AppResult<ImportDetail> {
    let import = statements::summary(conn, import_id).await?;
    let Assessment { counts, ledger_only, balance, readiness, reconciled } = assess(conn, &import).await?;
    let mut rows: Vec<RowView> = sqlx::query_as(
        "SELECT id, position, page, receipt, completed_at, details, row_status, direction, amount_minor,
                balance_minor, is_fee, parse_note, match_status, transaction_id, candidate_transaction_id,
                match_method, match_note, decided_at
         FROM statement_rows WHERE import_id = ? ORDER BY position",
    )
    .bind(import_id)
    .fetch_all(&mut *conn)
    .await?;

    for row in &mut rows {
        row.suggestion = suggest(row);
        if let (Some(s), Some(receipt)) = (row.suggestion.as_mut(), row.receipt.as_deref())
            && matches!(s.kind, Kind::Charge | Kind::Reversal)
        {
            // A charge belongs to the payment with the same reference.
            s.related_transaction_id = sqlx::query_scalar(
                "SELECT transaction_id FROM transaction_versions
                     WHERE is_current = 1 AND removed = 0 AND reference = ? AND is_fee = 0 LIMIT 1",
            )
            .bind(receipt)
            .fetch_optional(&mut *conn)
            .await?;
        }
    }

    let mut related_ids: Vec<i64> =
        rows.iter().flat_map(|r| [r.transaction_id, r.candidate_transaction_id]).flatten().collect();
    related_ids.sort_unstable();
    related_ids.dedup();
    let mut related = Vec::with_capacity(related_ids.len());
    for id in related_ids {
        related.push(transactions::item(conn, id).await?);
    }

    let mut ledger_items = Vec::with_capacity(ledger_only.len().min(200));
    for id in ledger_only.into_iter().take(200) {
        ledger_items.push(transactions::item(conn, id).await?);
    }
    let period = period_of(&import);

    let expenses_missing_receipts = match &period {
        Some(p) => sqlx::query_scalar(
            "SELECT COUNT(*) FROM transaction_versions v
             WHERE v.is_current = 1 AND v.removed = 0 AND v.kind = 'expense' AND v.account_id = ?
               AND v.occurred_at >= ? AND v.occurred_at < ?
               AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.transaction_id = v.transaction_id AND d.kind = 'receipt')",
        )
        .bind(import.account_id)
        .bind(&p.start)
        .bind(&p.end_exclusive)
        .fetch_one(&mut *conn)
        .await?,
        None => 0,
    };

    let account = settings::account(conn, import.account_id).await?;
    let number_warning = match (&account.number_hint, &import.holder_number) {
        (Some(hint), Some(number)) if !number.ends_with(hint.as_str()) => Some(format!(
            "This statement is for a number ending {}, but the account “{}” is set to a number ending {hint}. Check you chose the right account.",
            &number[number.len().saturating_sub(3)..],
            account.name
        )),
        _ => None,
    };

    Ok(ImportDetail {
        import,
        rows,
        counts,
        related,
        ledger_only: ledger_items,
        balance,
        readiness,
        reconciled,
        expenses_missing_receipts,
        number_warning,
    })
}

pub async fn complete(conn: &mut SqliteConnection, import_id: i64) -> AppResult<()> {
    let import = statements::summary(conn, import_id).await?;
    let check = assess(conn, &import).await?;
    if !check.readiness.can_complete {
        return Err(AppError::Conflict(format!("Not yet: {}", check.readiness.blockers.join(" "))));
    }
    sqlx::query("UPDATE statement_imports SET completed_at = ? WHERE id = ?")
        .bind(clock::now_string())
        .bind(import_id)
        .execute(&mut *conn)
        .await?;
    history::record(
        conn,
        Entity::StatementImport,
        Some(import_id),
        "completed",
        &format!(
            "Reconciliation completed for {} to {}",
            import.period_start.as_deref().unwrap_or("?"),
            import.period_end.as_deref().unwrap_or("?")
        ),
        None,
        None,
    )
    .await?;
    Ok(())
}

/// The latest period, per account, that is completed and still fully accounted for.
#[derive(Debug, Clone, Serialize)]
pub struct ReconciledPeriod {
    pub account_id: i64,
    pub account_name: String,
    pub import_id: i64,
    pub period_start: String,
    pub period_end: String,
    pub completed_at: String,
}

pub async fn reconciled_periods(conn: &mut SqliteConnection) -> AppResult<Vec<ReconciledPeriod>> {
    let candidates: Vec<i64> = sqlx::query_scalar(
        "SELECT id FROM statement_imports WHERE status = 'ready' AND completed_at IS NOT NULL
         ORDER BY period_end DESC, id DESC",
    )
    .fetch_all(&mut *conn)
    .await?;
    let mut latest: Vec<ReconciledPeriod> = Vec::new();
    for id in candidates {
        let import = statements::summary(conn, id).await?;
        if latest.iter().any(|p| p.account_id == import.account_id) || !assess(conn, &import).await?.reconciled {
            continue;
        }
        latest.push(ReconciledPeriod {
            account_id: import.account_id,
            account_name: import.account_name,
            import_id: id,
            period_start: import.period_start.unwrap_or_default(),
            period_end: import.period_end.unwrap_or_default(),
            completed_at: import.completed_at.unwrap_or_default(),
        });
    }
    Ok(latest)
}
