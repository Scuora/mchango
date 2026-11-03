use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::{QueryBuilder, Sqlite, SqliteConnection};

use super::{Direction, Kind, Movement, MovementInput, PledgedBy, Presentation};
use crate::clock;
use crate::error::{AppError, AppResult};
use crate::history::{self, ChangeEntry, Entity};
use crate::money::{Amount, format_kes};
use crate::reconciliation;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct VersionRow {
    pub id: i64,
    pub transaction_id: i64,
    pub version: i64,
    pub removed: bool,
    pub kind: Kind,
    pub direction: Option<Direction>,
    pub amount_minor: i64,
    pub occurred_at: String,
    pub account_id: Option<i64>,
    pub to_account_id: Option<i64>,
    pub reference: Option<String>,
    pub is_fee: bool,
    pub related_transaction_id: Option<i64>,
    pub counterparty: Option<String>,
    pub reason: Option<String>,
    pub created_at: String,
}

impl VersionRow {
    pub fn movement(&self) -> Movement {
        Movement {
            kind: self.kind,
            direction: self.direction,
            amount_minor: self.amount_minor,
            occurred_at: self.occurred_at.clone(),
            account_id: self.account_id,
            to_account_id: self.to_account_id,
            reference: self.reference.clone(),
            is_fee: self.is_fee,
            related_transaction_id: self.related_transaction_id,
            counterparty: self.counterparty.clone(),
        }
    }
}

pub async fn current_version(conn: &mut SqliteConnection, transaction_id: i64) -> AppResult<VersionRow> {
    sqlx::query_as(
        "SELECT id, transaction_id, version, removed, kind, direction, amount_minor, occurred_at,
                account_id, to_account_id, reference, is_fee, related_transaction_id, counterparty,
                reason, created_at
         FROM transaction_versions WHERE transaction_id = ? AND is_current = 1",
    )
    .bind(transaction_id)
    .fetch_optional(conn)
    .await?
    .ok_or_else(|| AppError::not_found("That transaction"))
}

// ---------------------------------------------------------------------------
// Creating

#[derive(Debug, Deserialize)]
pub struct CreateRequest {
    pub movement: MovementInput,
    pub presentation: Presentation,
    /// The pasted M-Pesa message. Stored privately as evidence.
    #[serde(default)]
    pub source_message: Option<String>,
    /// A transaction cost stated in the source. Saved as its own charge line so
    /// it is counted exactly once and can match its own statement row.
    #[serde(default)]
    pub charge_minor: Option<Amount>,
    /// Sent once per form; a repeated submission returns the saved record.
    #[serde(default)]
    pub client_key: Option<String>,
    /// Set after the person has seen a possible-duplicate warning and confirmed
    /// that this is a different transaction.
    #[serde(default)]
    pub confirm_possible_duplicate: bool,
    /// The challenge the money or pledge came in through. Money received for a
    /// pledge made in a challenge joins that challenge unless told otherwise.
    #[serde(default)]
    pub challenge_id: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct Created {
    pub id: i64,
    pub charge_id: Option<i64>,
}

/// Creates a transaction (and its charge line, if any) inside the caller's
/// write transaction.
pub async fn create(conn: &mut SqliteConnection, request: CreateRequest, origin: &str) -> AppResult<Created> {
    let client_key = match request.client_key.as_deref().map(str::trim).filter(|k| !k.is_empty()) {
        None => None,
        Some(k) if (8..=64).contains(&k.len()) && k.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') => {
            Some(k.to_string())
        }
        Some(_) => return Err(AppError::invalid("The form key is not valid. Reload the page and try again.")),
    };
    if let Some(key) = &client_key {
        let saved: Option<i64> = sqlx::query_scalar("SELECT id FROM transactions WHERE client_key = ?")
            .bind(key)
            .fetch_optional(&mut *conn)
            .await?;
        if let Some(id) = saved {
            // The same form was submitted again: answer with what was saved.
            let charge_id: Option<i64> = sqlx::query_scalar(
                "SELECT transaction_id FROM transaction_versions
                 WHERE is_current = 1 AND is_fee = 1 AND related_transaction_id = ? LIMIT 1",
            )
            .bind(id)
            .fetch_optional(&mut *conn)
            .await?;
            return Ok(Created { id, charge_id });
        }
    }

    let movement = request.movement.validate()?;
    let mut presentation = request.presentation.validate()?;
    // Pledges always say who made them (friends unless told otherwise); nothing else does.
    presentation.pledged_by =
        (movement.kind == Kind::Pledge).then(|| presentation.pledged_by.unwrap_or(PledgedBy::Friends));
    check_movement_links(conn, &movement, None).await?;

    let message = request.source_message.map(|m| m.trim().to_string()).filter(|m| !m.is_empty());
    if let Some(text) = &message {
        if text.chars().count() > 2000 {
            return Err(AppError::field("source_message", "That message is too long to be an M-Pesa message."));
        }
        if let Some(existing) = sms_already_saved(conn, text).await? {
            return Err(AppError::Conflict(format!("This message was already saved as transaction #{existing}.")));
        }
    }

    if !request.confirm_possible_duplicate {
        let matches = possible_duplicates(conn, &movement).await?;
        if !matches.is_empty() {
            let list = matches.iter().map(|id| format!("#{id}")).collect::<Vec<_>>().join(", ");
            return Err(AppError::PossibleDuplicate {
                message: format!(
                    "This looks like a record that is already saved ({list}): same type and amount within a day, \
                     or the same M-Pesa code. Check it before saving again."
                ),
                matches,
            });
        }
    }

    let charge = match request.charge_minor {
        None => None,
        Some(amount) => Some(charge_line(&movement, amount)?),
    };

    let challenge_id = match request.challenge_id {
        Some(challenge) => Some(challenge),
        None if movement.kind == Kind::Contribution => match movement.related_transaction_id {
            Some(pledge) => sqlx::query_scalar("SELECT challenge_id FROM transactions WHERE id = ?")
                .bind(pledge)
                .fetch_optional(&mut *conn)
                .await?
                .flatten(),
            None => None,
        },
        None => None,
    };
    if challenge_id.is_some() && !crate::challenges::can_belong(movement.kind) {
        return Err(AppError::field(
            "challenge_id",
            "Only money received and pledges can come in through a challenge.",
        ));
    }

    let id = insert_transaction(conn, &presentation, client_key.as_deref()).await?;
    insert_version(conn, id, 1, &movement, false, None).await?;
    history::record(
        conn,
        Entity::Transaction,
        Some(id),
        "created",
        &format!(
            "Recorded {} of {} ({origin})",
            movement.kind.label().to_lowercase(),
            format_kes(movement.amount_minor)
        ),
        None,
        Some(json!({ "origin": origin })),
    )
    .await?;

    if challenge_id.is_some() {
        crate::challenges::set_for_transaction(conn, id, challenge_id).await?;
    }

    if let Some(text) = &message {
        sqlx::query(
            "INSERT INTO documents (kind, transaction_id, text_content, sha256, created_at)
             VALUES ('sms', ?, ?, ?, ?)",
        )
        .bind(id)
        .bind(text)
        .bind(sms_hash(text))
        .bind(clock::now_string())
        .execute(&mut *conn)
        .await?;
    }

    let mut charge_id = None;
    if let Some(mut line) = charge {
        line.related_transaction_id = Some(id);
        let presentation = Presentation {
            public_name: None,
            description: "M-Pesa transaction charge".into(),
            notes: String::new(),
            pledged_by: None,
        };
        let cid = insert_transaction(conn, &presentation, None).await?;
        insert_version(conn, cid, 1, &line, false, None).await?;
        history::record(
            conn,
            Entity::Transaction,
            Some(cid),
            "created",
            &format!("Recorded charge of {} for transaction #{id}", format_kes(line.amount_minor)),
            None,
            None,
        )
        .await?;
        charge_id = Some(cid);
    }

    if let Some(reference) = &movement.reference {
        reconciliation::rematch_reference(conn, reference).await?;
    }
    Ok(Created { id, charge_id })
}

fn charge_line(main: &Movement, amount: Amount) -> AppResult<Movement> {
    if !main.kind.moves_money() {
        return Err(AppError::field("charge_minor", "Pledges and unpaid bills cannot have a charge."));
    }
    if main.kind == Kind::Charge || main.is_fee {
        return Err(AppError::field("charge_minor", "A charge cannot have its own charge."));
    }
    let kind = if main.kind == Kind::Personal { Kind::Personal } else { Kind::Charge };
    Ok(Movement {
        kind,
        direction: Some(Direction::Out),
        amount_minor: amount.minor(),
        occurred_at: main.occurred_at.clone(),
        account_id: main.account_id,
        to_account_id: None,
        reference: main.reference.clone(),
        is_fee: true,
        related_transaction_id: None,
        counterparty: None,
    })
}

/// Live records that look like the same money movement: same type, amount,
/// account and direction within a day (unless both carry different M-Pesa
/// codes), or the same M-Pesa code anywhere.
async fn possible_duplicates(conn: &mut SqliteConnection, m: &Movement) -> AppResult<Vec<i64>> {
    Ok(sqlx::query_scalar(
        "SELECT DISTINCT v.transaction_id FROM transaction_versions v
         WHERE v.is_current = 1 AND v.removed = 0 AND v.is_fee = 0
           AND ((v.kind = ?1 AND v.amount_minor = ?2 AND v.account_id IS ?3 AND v.direction IS ?4
                 AND abs(julianday(v.occurred_at) - julianday(?5)) <= 1.0
                 AND NOT (v.reference IS NOT NULL AND ?6 IS NOT NULL AND v.reference <> ?6))
                OR (?6 IS NOT NULL AND v.reference = ?6))
         ORDER BY v.transaction_id DESC LIMIT 5",
    )
    .bind(m.kind)
    .bind(m.amount_minor)
    .bind(m.account_id)
    .bind(m.direction)
    .bind(&m.occurred_at)
    .bind(&m.reference)
    .fetch_all(conn)
    .await?)
}

async fn insert_transaction(conn: &mut SqliteConnection, p: &Presentation, client_key: Option<&str>) -> AppResult<i64> {
    let now = clock::now_string();
    let id = sqlx::query_scalar(
        "INSERT INTO transactions (public_name, description, notes, pledged_by, created_at, updated_at, client_key)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(&p.public_name)
    .bind(&p.description)
    .bind(&p.notes)
    .bind(p.pledged_by)
    .bind(&now)
    .bind(&now)
    .bind(client_key)
    .fetch_one(conn)
    .await?;
    Ok(id)
}

async fn insert_version(
    conn: &mut SqliteConnection,
    transaction_id: i64,
    version: i64,
    m: &Movement,
    removed: bool,
    reason: Option<&str>,
) -> AppResult<()> {
    if !removed {
        ensure_reference_free(conn, m, transaction_id).await?;
    }
    sqlx::query(
        "INSERT INTO transaction_versions
           (transaction_id, version, is_current, removed, kind, direction, amount_minor, occurred_at,
            account_id, to_account_id, reference, is_fee, related_transaction_id, counterparty,
            reason, created_at)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(transaction_id)
    .bind(version)
    .bind(removed)
    .bind(m.kind)
    .bind(m.direction)
    .bind(m.amount_minor)
    .bind(&m.occurred_at)
    .bind(m.account_id)
    .bind(m.to_account_id)
    .bind(&m.reference)
    .bind(m.is_fee)
    .bind(m.related_transaction_id)
    .bind(&m.counterparty)
    .bind(reason)
    .bind(clock::now_string())
    .execute(conn)
    .await?;
    Ok(())
}

/// Gives a readable error before the unique index would reject a duplicate.
async fn ensure_reference_free(conn: &mut SqliteConnection, m: &Movement, own_id: i64) -> AppResult<()> {
    let Some(reference) = &m.reference else { return Ok(()) };
    let existing: Option<i64> = sqlx::query_scalar(
        "SELECT transaction_id FROM transaction_versions
         WHERE is_current = 1 AND removed = 0 AND account_id = ? AND reference = ?
           AND direction = ? AND is_fee = ? AND transaction_id <> ?",
    )
    .bind(m.account_id)
    .bind(reference)
    .bind(m.direction)
    .bind(m.is_fee)
    .bind(own_id)
    .fetch_optional(conn)
    .await?;
    match existing {
        Some(other) => Err(AppError::Conflict(format!("{reference} is already recorded as transaction #{other}."))),
        None => Ok(()),
    }
}

/// Database-dependent checks: accounts exist and links point at sensible records.
async fn check_movement_links(conn: &mut SqliteConnection, m: &Movement, own_id: Option<i64>) -> AppResult<()> {
    for (field, account) in [("account_id", m.account_id), ("to_account_id", m.to_account_id)] {
        if let Some(account) = account {
            let exists: Option<i64> = sqlx::query_scalar("SELECT id FROM accounts WHERE id = ?")
                .bind(account)
                .fetch_optional(&mut *conn)
                .await?;
            if exists.is_none() {
                return Err(AppError::field(field, "That account does not exist."));
            }
        }
    }
    let Some(related) = m.related_transaction_id else { return Ok(()) };
    if Some(related) == own_id {
        return Err(AppError::field("related_transaction_id", "A record cannot be linked to itself."));
    }
    let target = current_version(conn, related)
        .await
        .map_err(|_| AppError::field("related_transaction_id", "The linked transaction does not exist."))?;
    if target.removed {
        return Err(AppError::field("related_transaction_id", "The linked transaction was removed."));
    }
    let fits = match m.kind {
        Kind::Contribution => target.kind == Kind::Pledge,
        Kind::Expense => target.kind == Kind::Commitment,
        Kind::Refund | Kind::Reversal => target.kind.moves_money(),
        Kind::Charge | Kind::Personal => target.kind.moves_money(),
        _ => false,
    };
    if !fits {
        return Err(AppError::field(
            "related_transaction_id",
            "That link does not fit: money received can fulfil a pledge, money spent can settle an unpaid bill, and refunds or reversals point at the original movement.",
        ));
    }
    Ok(())
}

fn sms_hash(text: &str) -> String {
    let normalised = text.split_whitespace().collect::<Vec<_>>().join(" ");
    hex::encode(Sha256::digest(normalised.as_bytes()))
}

pub async fn sms_already_saved(conn: &mut SqliteConnection, text: &str) -> AppResult<Option<i64>> {
    let id: Option<Option<i64>> = sqlx::query_scalar(
        "SELECT d.transaction_id FROM documents d
         JOIN transaction_versions v ON v.transaction_id = d.transaction_id AND v.is_current = 1
         WHERE d.kind = 'sms' AND d.sha256 = ? AND v.removed = 0 LIMIT 1",
    )
    .bind(sms_hash(text))
    .fetch_optional(conn)
    .await?;
    Ok(id.flatten())
}

// ---------------------------------------------------------------------------
// Correcting

#[derive(Debug, Deserialize)]
pub struct CorrectionRequest {
    pub reason: String,
    /// The corrected values. `None` removes the record (e.g. a duplicate).
    #[serde(default)]
    pub replacement: Option<MovementInput>,
}

/// The single correction mechanism. The current version is kept as history and
/// a new version becomes current, so totals never count both. Removing a record
/// is a correction whose new version is marked removed.
pub async fn correct(conn: &mut SqliteConnection, id: i64, request: CorrectionRequest) -> AppResult<i64> {
    let reason = request.reason.trim().to_string();
    if reason.chars().count() < 3 {
        return Err(AppError::field("reason", "Explain why this record is being corrected."));
    }
    if reason.chars().count() > 500 {
        return Err(AppError::field("reason", "Keep the reason under 500 characters."));
    }
    let replacement = request.replacement.map(MovementInput::validate).transpose()?;
    apply_correction(conn, id, replacement, &reason).await
}

async fn apply_correction(
    conn: &mut SqliteConnection,
    id: i64,
    replacement: Option<Movement>,
    reason: &str,
) -> AppResult<i64> {
    let current = current_version(conn, id).await?;
    if current.removed {
        return Err(AppError::Conflict("This record was already removed.".into()));
    }
    let before = current.movement();
    let (after, removed) = match replacement {
        Some(m) => {
            if m == before {
                return Err(AppError::invalid("Nothing was changed."));
            }
            check_movement_links(conn, &m, Some(id)).await?;
            (m, false)
        }
        None => (before.clone(), true),
    };

    sqlx::query("UPDATE transaction_versions SET is_current = 0 WHERE id = ?")
        .bind(current.id)
        .execute(&mut *conn)
        .await?;
    let version = current.version + 1;
    insert_version(conn, id, version, &after, removed, Some(reason)).await?;
    touch(conn, id).await?;

    let summary = if removed {
        format!("Removed (was {} of {})", before.kind.label().to_lowercase(), format_kes(before.amount_minor))
    } else {
        describe_changes(&before, &after)
    };
    history::record(
        conn,
        Entity::Transaction,
        Some(id),
        if removed { "removed" } else { "corrected" },
        &summary,
        Some(reason),
        Some(json!({ "from_version": current.version, "to_version": version })),
    )
    .await?;

    // Only money received and pledges belong to a challenge.
    if removed || !crate::challenges::can_belong(after.kind) {
        let linked: Option<i64> = sqlx::query_scalar("SELECT challenge_id FROM transactions WHERE id = ?")
            .bind(id)
            .fetch_one(&mut *conn)
            .await?;
        if linked.is_some() {
            crate::challenges::set_for_transaction(conn, id, None).await?;
        }
    }

    reconciliation::recheck_links(conn, id).await?;
    if let Some(reference) = &after.reference {
        reconciliation::rematch_reference(conn, reference).await?;
    }
    if let Some(reference) = &before.reference {
        reconciliation::rematch_reference(conn, reference).await?;
    }

    // Charge lines follow their payment: removed with it, or moved with it
    // when its reference, account or time changes.
    let fee_lines: Vec<i64> = sqlx::query_scalar(
        "SELECT transaction_id FROM transaction_versions
         WHERE is_current = 1 AND removed = 0 AND is_fee = 1 AND related_transaction_id = ?",
    )
    .bind(id)
    .fetch_all(&mut *conn)
    .await?;
    for fee_id in fee_lines {
        let fee = current_version(conn, fee_id).await?.movement();
        let follow_reason = format!("Updated together with transaction #{id}: {reason}");
        if removed {
            Box::pin(apply_correction(conn, fee_id, None, &follow_reason)).await?;
        } else if fee.reference != after.reference
            || fee.account_id != after.account_id
            || fee.occurred_at != after.occurred_at
        {
            let moved = Movement {
                reference: after.reference.clone(),
                account_id: after.account_id,
                occurred_at: after.occurred_at.clone(),
                ..fee
            };
            Box::pin(apply_correction(conn, fee_id, Some(moved), &follow_reason)).await?;
        }
    }
    Ok(version)
}

fn describe_changes(before: &Movement, after: &Movement) -> String {
    let mut parts = Vec::new();
    if before.amount_minor != after.amount_minor {
        parts.push(format!("amount {} → {}", format_kes(before.amount_minor), format_kes(after.amount_minor)));
    }
    if before.kind != after.kind {
        parts.push(format!("type {} → {}", before.kind.label(), after.kind.label()));
    }
    if before.direction != after.direction {
        parts.push("direction changed".into());
    }
    if before.occurred_at != after.occurred_at {
        parts.push("transaction time changed".into());
    }
    if before.account_id != after.account_id || before.to_account_id != after.to_account_id {
        parts.push("account changed".into());
    }
    if before.reference != after.reference {
        parts.push(format!(
            "reference {} → {}",
            before.reference.as_deref().unwrap_or("none"),
            after.reference.as_deref().unwrap_or("none")
        ));
    }
    if before.related_transaction_id != after.related_transaction_id {
        parts.push("link changed".into());
    }
    if before.counterparty != after.counterparty {
        parts.push("counterparty changed".into());
    }
    if parts.is_empty() { "Corrected".into() } else { format!("Corrected: {}", parts.join("; ")) }
}

/// Adds the statement reference to a record that had none, as a correction.
pub async fn add_reference(conn: &mut SqliteConnection, id: i64, reference: &str, reason: &str) -> AppResult<()> {
    let current = current_version(conn, id).await?;
    if current.reference.is_some() {
        return Ok(());
    }
    let mut m = current.movement();
    m.reference = Some(reference.to_string());
    apply_correction(conn, id, Some(m), reason).await?;
    Ok(())
}

async fn touch(conn: &mut SqliteConnection, id: i64) -> AppResult<()> {
    sqlx::query("UPDATE transactions SET updated_at = ? WHERE id = ?")
        .bind(clock::now_string())
        .bind(id)
        .execute(conn)
        .await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Presentation

pub async fn update_presentation(conn: &mut SqliteConnection, id: i64, update: Presentation) -> AppResult<()> {
    let mut update = update.validate()?;
    let current: Option<(Option<String>, String, String, Option<PledgedBy>)> =
        sqlx::query_as("SELECT public_name, description, notes, pledged_by FROM transactions WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *conn)
            .await?;
    let (name, description, notes, pledged_by) = current.ok_or_else(|| AppError::not_found("That transaction"))?;
    let is_pledge = current_version(conn, id).await?.kind == Kind::Pledge;
    update.pledged_by =
        if is_pledge { update.pledged_by.or(pledged_by).or(Some(PledgedBy::Friends)) } else { pledged_by };

    let mut changes = Vec::new();
    if name != update.public_name {
        changes.push(format!(
            "Public name changed from “{}” to “{}”",
            name.as_deref().unwrap_or("anonymous"),
            update.public_name.as_deref().unwrap_or("anonymous")
        ));
    }
    if description != update.description {
        changes.push("Description changed".to_string());
    }
    if notes != update.notes {
        changes.push("Private notes changed".to_string());
    }
    if pledged_by != update.pledged_by {
        changes.push(match update.pledged_by {
            Some(PledgedBy::Family) => "Now a pledge by the family".to_string(),
            _ => "Now a pledge by friends and well-wishers".to_string(),
        });
    }
    if changes.is_empty() {
        return Ok(());
    }

    sqlx::query(
        "UPDATE transactions SET public_name = ?, description = ?, notes = ?, pledged_by = ?, updated_at = ? WHERE id = ?",
    )
    .bind(&update.public_name)
    .bind(&update.description)
    .bind(&update.notes)
    .bind(update.pledged_by)
        .bind(clock::now_string())
        .bind(id)
        .execute(&mut *conn)
        .await?;
    history::record(
        conn,
        Entity::Transaction,
        Some(id),
        "presentation",
        &changes.join(". "),
        None,
        Some(json!({
            "before": { "public_name": name, "description": description },
            "after": { "public_name": update.public_name, "description": update.description },
        })),
    )
    .await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Reading

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ReconciliationStatus {
    /// Linked to a row of an uploaded statement.
    Matched,
    /// A statement row disagrees with this record.
    Conflict,
    /// On an account with statements, not yet matched.
    #[default]
    NotMatched,
    /// Cash, pledges and unpaid bills have no statement.
    NotApplicable,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ListItem {
    pub id: i64,
    pub version: i64,
    pub kind: Kind,
    pub direction: Option<Direction>,
    pub amount_minor: i64,
    pub occurred_at: String,
    pub recorded_at: String,
    pub account_id: Option<i64>,
    pub account_name: Option<String>,
    pub to_account_id: Option<i64>,
    pub to_account_name: Option<String>,
    pub reference: Option<String>,
    pub is_fee: bool,
    pub removed: bool,
    pub counterparty: Option<String>,
    pub related_transaction_id: Option<i64>,
    pub public_name: Option<String>,
    pub description: String,
    pub notes: String,
    pub pledged_by: Option<PledgedBy>,
    pub challenge_id: Option<i64>,
    pub challenge_name: Option<String>,
    pub receipt_count: i64,
    #[serde(skip)]
    pub matched: bool,
    #[serde(skip)]
    pub has_conflict: bool,
    #[serde(skip)]
    pub reconcilable: bool,
    #[sqlx(skip)]
    pub reconciliation: ReconciliationStatus,
    #[sqlx(skip)]
    pub attention: Vec<&'static str>,
}

impl ListItem {
    fn finish(mut self) -> Self {
        self.reconciliation = if !self.reconcilable {
            ReconciliationStatus::NotApplicable
        } else if self.matched {
            ReconciliationStatus::Matched
        } else if self.has_conflict {
            ReconciliationStatus::Conflict
        } else {
            ReconciliationStatus::NotMatched
        };
        if !self.removed {
            if matches!(self.kind, Kind::Expense | Kind::Commitment) && self.description.is_empty() {
                self.attention.push("missing_purpose");
            }
            if self.kind == Kind::Expense && self.receipt_count == 0 {
                self.attention.push("missing_receipt");
            }
            if self.has_conflict {
                self.attention.push("statement_conflict");
            }
        }
        self
    }
}

const ITEMS_CTE: &str = "WITH items AS (
    SELECT t.id, v.version, v.kind, v.direction, v.amount_minor, v.occurred_at,
           t.created_at AS recorded_at,
           v.account_id, a.name AS account_name,
           v.to_account_id, ta.name AS to_account_name,
           v.reference, v.is_fee, v.removed, v.counterparty, v.related_transaction_id,
           t.public_name, t.description, t.notes, t.pledged_by,
           t.challenge_id, c.name AS challenge_name,
           (SELECT COUNT(*) FROM documents d WHERE d.transaction_id = t.id AND d.kind = 'receipt') AS receipt_count,
           EXISTS (SELECT 1 FROM statement_rows r JOIN statement_imports i ON i.id = r.import_id
                   WHERE r.transaction_id = t.id AND i.status = 'ready') AS matched,
           EXISTS (SELECT 1 FROM statement_rows r JOIN statement_imports i ON i.id = r.import_id
                   WHERE r.candidate_transaction_id = t.id AND r.match_status IN ('conflict', 'review')
                     AND i.status = 'ready') AS has_conflict,
           CASE WHEN v.kind IN ('pledge', 'commitment') THEN 0
                WHEN coalesce(a.kind, 'cash') <> 'cash' OR coalesce(ta.kind, 'cash') <> 'cash' THEN 1
                ELSE 0 END AS reconcilable
    FROM transactions t
    JOIN transaction_versions v ON v.transaction_id = t.id AND v.is_current = 1
    LEFT JOIN accounts a ON a.id = v.account_id
    LEFT JOIN accounts ta ON ta.id = v.to_account_id
    LEFT JOIN challenges c ON c.id = t.challenge_id
) ";

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StatusFilter {
    NeedsReview,
    Matched,
    NotMatched,
    MissingReceipt,
    Removed,
}

#[derive(Debug, Default, Deserialize)]
pub struct ListQuery {
    pub q: Option<String>,
    pub kind: Option<Kind>,
    /// Nairobi dates, inclusive.
    pub from: Option<String>,
    pub to: Option<String>,
    pub status: Option<StatusFilter>,
    pub account_id: Option<i64>,
    /// Records that came in through this challenge.
    pub challenge_id: Option<i64>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct ListResponse {
    pub items: Vec<ListItem>,
    pub total: i64,
}

fn push_filters(qb: &mut QueryBuilder<Sqlite>, query: &ListQuery) -> AppResult<()> {
    if query.status == Some(StatusFilter::Removed) {
        qb.push(" AND removed = 1");
    } else {
        qb.push(" AND removed = 0");
    }
    if let Some(kind) = query.kind {
        qb.push(" AND kind = ").push_bind(kind);
    }
    if let Some(account) = query.account_id {
        qb.push(" AND (account_id = ").push_bind(account).push(" OR to_account_id = ").push_bind(account).push(")");
    }
    if let Some(challenge) = query.challenge_id {
        qb.push(" AND challenge_id = ").push_bind(challenge);
    }
    if let Some(from) = query.from.as_deref().filter(|s| !s.is_empty()) {
        let date = clock::parse_date(from).ok_or_else(|| AppError::field("from", "Use a date like 2024-06-30."))?;
        qb.push(" AND occurred_at >= ").push_bind(clock::day_start(date));
    }
    if let Some(to) = query.to.as_deref().filter(|s| !s.is_empty()) {
        let date = clock::parse_date(to).ok_or_else(|| AppError::field("to", "Use a date like 2024-06-30."))?;
        qb.push(" AND occurred_at < ").push_bind(clock::day_end_exclusive(date));
    }
    match query.status {
        Some(StatusFilter::NeedsReview) => {
            qb.push(" AND (has_conflict = 1 OR (kind IN ('expense', 'commitment') AND description = ''))");
        }
        Some(StatusFilter::Matched) => {
            qb.push(" AND matched = 1");
        }
        Some(StatusFilter::NotMatched) => {
            qb.push(" AND matched = 0 AND reconcilable = 1");
        }
        Some(StatusFilter::MissingReceipt) => {
            qb.push(" AND kind = 'expense' AND receipt_count = 0");
        }
        Some(StatusFilter::Removed) | None => {}
    }
    if let Some(q) = query.q.as_deref().map(str::trim).filter(|q| !q.is_empty()) {
        let escaped = q.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
        let pattern = format!("%{escaped}%");
        qb.push(" AND (");
        for (i, column) in ["public_name", "description", "notes", "reference", "counterparty"].iter().enumerate() {
            if i > 0 {
                qb.push(" OR ");
            }
            qb.push(*column).push(" LIKE ").push_bind(pattern.clone()).push(" ESCAPE '\\'");
        }
        qb.push(")");
    }
    Ok(())
}

pub async fn list(conn: &mut SqliteConnection, query: ListQuery) -> AppResult<ListResponse> {
    let limit = query.limit.unwrap_or(50).clamp(1, 500);
    let offset = query.offset.unwrap_or(0).max(0);

    let mut count = QueryBuilder::<Sqlite>::new(ITEMS_CTE);
    count.push("SELECT COUNT(*) FROM items WHERE 1 = 1");
    push_filters(&mut count, &query)?;
    let total: i64 = count.build_query_scalar().fetch_one(&mut *conn).await?;

    let mut select = QueryBuilder::<Sqlite>::new(ITEMS_CTE);
    select.push("SELECT * FROM items WHERE 1 = 1");
    push_filters(&mut select, &query)?;
    select.push(" ORDER BY occurred_at DESC, id DESC LIMIT ").push_bind(limit).push(" OFFSET ").push_bind(offset);
    let items: Vec<ListItem> = select.build_query_as().fetch_all(&mut *conn).await?;

    Ok(ListResponse { items: items.into_iter().map(ListItem::finish).collect(), total })
}

/// Every record's current version, oldest first (for export).
pub async fn all_items(conn: &mut SqliteConnection) -> AppResult<Vec<ListItem>> {
    let mut select = QueryBuilder::<Sqlite>::new(ITEMS_CTE);
    select.push("SELECT * FROM items ORDER BY occurred_at, id");
    let items: Vec<ListItem> = select.build_query_as().fetch_all(conn).await?;
    Ok(items.into_iter().map(ListItem::finish).collect())
}

pub async fn item(conn: &mut SqliteConnection, id: i64) -> AppResult<ListItem> {
    let mut select = QueryBuilder::<Sqlite>::new(ITEMS_CTE);
    select.push("SELECT * FROM items WHERE id = ").push_bind(id);
    let item: Option<ListItem> = select.build_query_as().fetch_optional(conn).await?;
    item.map(ListItem::finish).ok_or_else(|| AppError::not_found("That transaction"))
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct VersionView {
    pub version: i64,
    pub is_current: bool,
    pub removed: bool,
    pub kind: Kind,
    pub direction: Option<Direction>,
    pub amount_minor: i64,
    pub occurred_at: String,
    pub account_name: Option<String>,
    pub to_account_name: Option<String>,
    pub reference: Option<String>,
    pub reason: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DocumentView {
    pub id: i64,
    pub kind: String,
    pub text_content: Option<String>,
    pub original_name: Option<String>,
    pub content_type: Option<String>,
    pub size_bytes: Option<i64>,
    pub created_at: String,
    pub published_at: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct StatementLink {
    pub import_id: i64,
    pub row_id: i64,
    pub position: i64,
    pub period_start: Option<String>,
    pub period_end: Option<String>,
    pub account_name: String,
    pub match_status: String,
    pub match_method: Option<String>,
    pub match_note: Option<String>,
    pub amount_minor: Option<i64>,
    pub completed_at: Option<String>,
    pub details: String,
}

#[derive(Debug, Serialize)]
pub struct Detail {
    pub transaction: ListItem,
    pub versions: Vec<VersionView>,
    pub documents: Vec<DocumentView>,
    pub statement_links: Vec<StatementLink>,
    pub related: Option<ListItem>,
    pub linked: Vec<ListItem>,
    pub history: Vec<ChangeEntry>,
}

pub async fn detail(conn: &mut SqliteConnection, id: i64) -> AppResult<Detail> {
    let transaction = item(conn, id).await?;
    let versions = sqlx::query_as(
        "SELECT v.version, v.is_current, v.removed, v.kind, v.direction, v.amount_minor, v.occurred_at,
                a.name AS account_name, ta.name AS to_account_name, v.reference, v.reason, v.created_at
         FROM transaction_versions v
         LEFT JOIN accounts a ON a.id = v.account_id
         LEFT JOIN accounts ta ON ta.id = v.to_account_id
         WHERE v.transaction_id = ? ORDER BY v.version DESC",
    )
    .bind(id)
    .fetch_all(&mut *conn)
    .await?;
    let documents = sqlx::query_as(
        "SELECT id, kind, text_content, original_name, content_type, size_bytes, created_at, published_at
         FROM documents WHERE transaction_id = ? ORDER BY id",
    )
    .bind(id)
    .fetch_all(&mut *conn)
    .await?;
    let statement_links = sqlx::query_as(
        "SELECT r.import_id, r.id AS row_id, r.position, i.period_start, i.period_end, a.name AS account_name,
                r.match_status, r.match_method, r.match_note, r.amount_minor, r.completed_at, r.details
         FROM statement_rows r
         JOIN statement_imports i ON i.id = r.import_id
         JOIN accounts a ON a.id = i.account_id
         WHERE (r.transaction_id = ? OR r.candidate_transaction_id = ?) AND i.status = 'ready'
         ORDER BY i.id DESC, r.position",
    )
    .bind(id)
    .bind(id)
    .fetch_all(&mut *conn)
    .await?;

    let related = match transaction.related_transaction_id {
        Some(rid) => Some(item(conn, rid).await?),
        None => None,
    };
    let linked_ids: Vec<i64> = sqlx::query_scalar(
        "SELECT transaction_id FROM transaction_versions
         WHERE is_current = 1 AND related_transaction_id = ? ORDER BY transaction_id",
    )
    .bind(id)
    .fetch_all(&mut *conn)
    .await?;
    let mut linked = Vec::with_capacity(linked_ids.len());
    for lid in linked_ids {
        linked.push(item(conn, lid).await?);
    }
    let history = history::for_entity(conn, Entity::Transaction, id).await?;

    Ok(Detail { transaction, versions, documents, statement_links, related, linked, history })
}
