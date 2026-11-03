//! Challenges: fun games and dares that keep the fundraiser going.
//!
//! A challenge is a kitty tracked on its own, like a sub-account. Its money is
//! not kept apart: contributions linked to a challenge are ordinary fundraiser
//! money in the main accounts, counted once in the totals. The challenge only
//! groups them, so the family can see what each challenge has brought in.

use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::SqliteConnection;

use crate::clock;
use crate::error::{AppError, AppResult};
use crate::history::{self, Entity};
use crate::money::{Amount, format_kes};
use crate::transactions::totals::{ChallengeTotals, challenge_totals, fundraiser_records};
use crate::transactions::{Kind, current_version};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(rename_all = "snake_case")]
pub enum ChallengeStatus {
    /// Still taking part: offered when recording money.
    Active,
    /// Over. Its records and total are kept, and late money can still be linked.
    Closed,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Challenge {
    pub id: i64,
    pub name: String,
    /// Kiswahili versions; empty when the family has not added them.
    pub name_sw: String,
    pub description: String,
    pub description_sw: String,
    pub target_minor: Option<i64>,
    /// Nairobi calendar dates.
    pub starts_on: Option<String>,
    pub ends_on: Option<String>,
    pub status: ChallengeStatus,
    pub published: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// A challenge with what it has brought in so far.
#[derive(Debug, Clone, Serialize)]
pub struct ChallengeSummary {
    #[serde(flatten)]
    pub challenge: Challenge,
    pub totals: ChallengeTotals,
}

#[derive(Debug, Deserialize)]
pub struct ChallengeInput {
    pub name: String,
    #[serde(default)]
    pub name_sw: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub description_sw: String,
    #[serde(default)]
    pub target_minor: Option<Amount>,
    #[serde(default)]
    pub starts_on: Option<String>,
    #[serde(default)]
    pub ends_on: Option<String>,
    #[serde(default = "active")]
    pub status: ChallengeStatus,
    #[serde(default = "published_by_default")]
    pub published: bool,
}

fn active() -> ChallengeStatus {
    ChallengeStatus::Active
}

fn published_by_default() -> bool {
    true
}

/// A challenge's fields after checking.
struct Clean {
    name: String,
    name_sw: String,
    description: String,
    description_sw: String,
    target_minor: Option<i64>,
    starts_on: Option<String>,
    ends_on: Option<String>,
    status: ChallengeStatus,
    published: bool,
}

impl ChallengeInput {
    fn clean(self) -> AppResult<Clean> {
        let name = one_line(&self.name);
        if name.is_empty() || name.chars().count() > 80 {
            return Err(AppError::field("name", "Give the challenge a name of up to 80 characters."));
        }
        let name_sw = one_line(&self.name_sw);
        if name_sw.chars().count() > 80 {
            return Err(AppError::field("name_sw", "Keep the Kiswahili name under 80 characters."));
        }
        let description = paragraphs(&self.description);
        if description.chars().count() > 2000 {
            return Err(AppError::field("description", "Keep the description under 2,000 characters."));
        }
        let description_sw = paragraphs(&self.description_sw);
        if description_sw.chars().count() > 2000 {
            return Err(AppError::field("description_sw", "Keep the Kiswahili description under 2,000 characters."));
        }
        let starts_on = optional_date(self.starts_on, "starts_on")?;
        let ends_on = optional_date(self.ends_on, "ends_on")?;
        if let (Some(start), Some(end)) = (&starts_on, &ends_on)
            && end < start
        {
            return Err(AppError::field("ends_on", "The challenge cannot end before it starts."));
        }
        Ok(Clean {
            name,
            name_sw,
            description,
            description_sw,
            target_minor: self.target_minor.map(Amount::minor),
            starts_on,
            ends_on,
            status: self.status,
            published: self.published,
        })
    }
}

fn one_line(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Keep the line breaks people typed; trim trailing spaces on each line.
fn paragraphs(text: &str) -> String {
    text.lines().map(str::trim_end).collect::<Vec<_>>().join("\n").trim().to_string()
}

fn optional_date(value: Option<String>, field: &'static str) -> AppResult<Option<String>> {
    match value.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
        None => Ok(None),
        Some(v) => clock::parse_date(v)
            .map(|d| Some(clock::format_date(d)))
            .ok_or_else(|| AppError::field(field, "Use a date like 2024-06-30.")),
    }
}

/// Active challenges first, then the newest.
pub async fn list(conn: &mut SqliteConnection) -> AppResult<Vec<Challenge>> {
    Ok(sqlx::query_as(
        "SELECT id, name, name_sw, description, description_sw, target_minor, starts_on, ends_on, status, published,
                created_at, updated_at
         FROM challenges ORDER BY status = 'closed', created_at DESC, id DESC",
    )
    .fetch_all(conn)
    .await?)
}

pub async fn get(conn: &mut SqliteConnection, id: i64) -> AppResult<Challenge> {
    sqlx::query_as(
        "SELECT id, name, name_sw, description, description_sw, target_minor, starts_on, ends_on, status, published,
                created_at, updated_at
         FROM challenges WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(conn)
    .await?
    .ok_or_else(|| AppError::not_found("That challenge"))
}

/// Every challenge with its kitty, in the order of [`list`].
pub async fn summaries(conn: &mut SqliteConnection) -> AppResult<Vec<ChallengeSummary>> {
    let records = fundraiser_records(conn).await?;
    let mut totals = challenge_totals(&records);
    Ok(list(conn)
        .await?
        .into_iter()
        .map(|challenge| ChallengeSummary { totals: totals.remove(&challenge.id).unwrap_or_default(), challenge })
        .collect())
}

pub async fn summary(conn: &mut SqliteConnection, id: i64) -> AppResult<ChallengeSummary> {
    let challenge = get(conn, id).await?;
    let records = fundraiser_records(conn).await?;
    let totals = challenge_totals(&records).remove(&id).unwrap_or_default();
    Ok(ChallengeSummary { challenge, totals })
}

pub async fn create(conn: &mut SqliteConnection, input: ChallengeInput) -> AppResult<ChallengeSummary> {
    let c = input.clean()?;
    let now = clock::now_string();
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO challenges (name, name_sw, description, description_sw, target_minor, starts_on, ends_on,
                                 status, published, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(&c.name)
    .bind(&c.name_sw)
    .bind(&c.description)
    .bind(&c.description_sw)
    .bind(c.target_minor)
    .bind(&c.starts_on)
    .bind(&c.ends_on)
    .bind(c.status)
    .bind(c.published)
    .bind(&now)
    .bind(&now)
    .fetch_one(&mut *conn)
    .await
    .map_err(|e| name_taken(e, &c.name))?;
    history::record(
        conn,
        Entity::Challenge,
        Some(id),
        "created",
        &format!("Challenge “{}” created", c.name),
        None,
        None,
    )
    .await?;
    summary(conn, id).await
}

pub async fn update(conn: &mut SqliteConnection, id: i64, input: ChallengeInput) -> AppResult<ChallengeSummary> {
    let c = input.clean()?;
    let before = get(conn, id).await?;
    sqlx::query(
        "UPDATE challenges SET name = ?, name_sw = ?, description = ?, description_sw = ?, target_minor = ?,
                starts_on = ?, ends_on = ?, status = ?, published = ?, updated_at = ?
         WHERE id = ?",
    )
    .bind(&c.name)
    .bind(&c.name_sw)
    .bind(&c.description)
    .bind(&c.description_sw)
    .bind(c.target_minor)
    .bind(&c.starts_on)
    .bind(&c.ends_on)
    .bind(c.status)
    .bind(c.published)
    .bind(clock::now_string())
    .bind(id)
    .execute(&mut *conn)
    .await
    .map_err(|e| name_taken(e, &c.name))?;
    let summary = match (before.status, c.status) {
        (ChallengeStatus::Active, ChallengeStatus::Closed) => format!("Challenge “{}” closed", c.name),
        (ChallengeStatus::Closed, ChallengeStatus::Active) => format!("Challenge “{}” reopened", c.name),
        _ => format!("Challenge “{}” updated", c.name),
    };
    history::record(conn, Entity::Challenge, Some(id), "updated", &summary, None, None).await?;
    self::summary(conn, id).await
}

/// Deletes a challenge created by mistake. One with records linked to it is
/// closed instead, so what it raised stays on record.
pub async fn delete(conn: &mut SqliteConnection, id: i64) -> AppResult<()> {
    let challenge = get(conn, id).await?;
    let linked: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM transactions WHERE challenge_id = ?")
        .bind(id)
        .fetch_one(&mut *conn)
        .await?;
    if linked > 0 {
        return Err(AppError::Conflict(format!(
            "{linked} record{} belong{} to this challenge. Close it instead, or move them out first.",
            if linked == 1 { "" } else { "s" },
            if linked == 1 { "s" } else { "" },
        )));
    }
    sqlx::query("DELETE FROM challenges WHERE id = ?").bind(id).execute(&mut *conn).await?;
    history::record(
        conn,
        Entity::Challenge,
        Some(id),
        "deleted",
        &format!("Challenge “{}” deleted", challenge.name),
        None,
        None,
    )
    .await?;
    Ok(())
}

fn name_taken(error: sqlx::Error, name: &str) -> AppError {
    if crate::error::is_unique_violation(&error) {
        AppError::field("name", format!("There is already a challenge called “{name}”."))
    } else {
        error.into()
    }
}

// ---------------------------------------------------------------------------
// Linking records

/// Only money received and pledges come in through a challenge.
pub fn can_belong(kind: Kind) -> bool {
    matches!(kind, Kind::Contribution | Kind::Pledge)
}

/// Puts a record in a challenge, moves it to another, or (with `None`) takes it
/// out. No money moves: the record stays in the main totals either way.
pub async fn set_for_transaction(
    conn: &mut SqliteConnection,
    transaction_id: i64,
    challenge_id: Option<i64>,
) -> AppResult<()> {
    let current = current_version(conn, transaction_id).await?;
    let before: Option<i64> = sqlx::query_scalar("SELECT challenge_id FROM transactions WHERE id = ?")
        .bind(transaction_id)
        .fetch_one(&mut *conn)
        .await?;
    if before == challenge_id {
        return Ok(());
    }
    let after = match challenge_id {
        Some(id) => {
            if current.removed {
                return Err(AppError::invalid("This record was removed, so it cannot join a challenge."));
            }
            if !can_belong(current.kind) {
                return Err(AppError::field(
                    "challenge_id",
                    "Only money received and pledges can come in through a challenge.",
                ));
            }
            Some(get(conn, id).await.map_err(|_| AppError::field("challenge_id", "That challenge does not exist."))?)
        }
        None => None,
    };
    let before_name = match before {
        Some(id) => Some(get(conn, id).await?.name),
        None => None,
    };

    sqlx::query("UPDATE transactions SET challenge_id = ?, updated_at = ? WHERE id = ?")
        .bind(challenge_id)
        .bind(clock::now_string())
        .bind(transaction_id)
        .execute(&mut *conn)
        .await?;
    let amount = format_kes(current.amount_minor);
    let summary = match (&before_name, &after) {
        (_, Some(c)) => format!("Now part of the challenge “{}”", c.name),
        (Some(name), None) => format!("Taken out of the challenge “{name}”"),
        (None, None) => unreachable!("unchanged links return early"),
    };
    history::record(
        conn,
        Entity::Transaction,
        Some(transaction_id),
        "challenge",
        &summary,
        None,
        Some(json!({ "from": before, "to": challenge_id })),
    )
    .await?;
    if let Some(id) = before {
        let name = before_name.as_deref().unwrap_or_default();
        let line = format!("Transaction #{transaction_id} ({amount}) taken out of “{name}”");
        history::record(conn, Entity::Challenge, Some(id), "unlinked", &line, None, None).await?;
    }
    if let Some(c) = &after {
        let line = format!("Transaction #{transaction_id} ({amount}) added to “{}”", c.name);
        history::record(conn, Entity::Challenge, Some(c.id), "linked", &line, None, None).await?;
    }
    Ok(())
}

/// Adds several records to a challenge at once.
pub async fn link_many(conn: &mut SqliteConnection, challenge_id: i64, transaction_ids: &[i64]) -> AppResult<()> {
    if transaction_ids.is_empty() {
        return Err(AppError::invalid("Choose the records to add."));
    }
    if transaction_ids.len() > 200 {
        return Err(AppError::invalid("Add at most 200 records at a time."));
    }
    get(conn, challenge_id).await?;
    for &id in transaction_ids {
        set_for_transaction(conn, id, Some(challenge_id)).await.map_err(|e| match e {
            AppError::Invalid { message, .. } => AppError::invalid(format!("Transaction #{id}: {message}")),
            AppError::NotFound(_) => AppError::invalid(format!("Transaction #{id} was not found.")),
            other => other,
        })?;
    }
    Ok(())
}
