//! Challenges: fun games and dares that keep the fundraiser going.
//!
//! A challenge is a sub-account of the fundraiser. Contributions and pledges
//! that come in through it are the fundraiser's own records, counted once in its
//! totals; the challenge adds up what it brought in.
//!
//! A challenge can also keep its own money in an account used only for it (the
//! organiser's M-Pesa line, a cash box). Money received there belongs to the
//! challenge. Until it is handed over to the main account with a transfer, what
//! that account holds is owed to the main fund: a receivable.

use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::SqliteConnection;

use crate::clock;
use crate::error::{AppError, AppResult};
use crate::history::{self, Entity};
use crate::money::{Amount, format_kes};
use crate::settings::{GivingMethod, clean_giving};
use crate::transactions::totals::{ChallengeTotals, FundraiserRecord, challenge_totals, fundraiser_records, kitty};
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
    /// The account it keeps its own money in, if any.
    pub account_id: Option<i64>,
    pub account_name: Option<String>,
    /// Where givers send money for it, when that is not the fundraiser's own
    /// number (another phone, Paybill or till). `None` uses the fundraiser's details.
    pub giving_method: Option<GivingMethod>,
    pub giving_number: String,
    pub giving_account: String,
    pub giving_name: String,
    /// The family's own WhatsApp messages, with placeholders filled in when
    /// copied. None uses the standard update. Management only.
    #[sqlx(skip)]
    pub messages: Vec<ChallengeMessage>,
    pub created_at: String,
    pub updated_at: String,
}

/// One of a challenge's own WhatsApp messages: a title to tell it apart, and the
/// text with {placeholders}.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChallengeMessage {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub body: String,
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
    #[serde(default)]
    pub account_id: Option<i64>,
    #[serde(default)]
    pub giving_method: Option<GivingMethod>,
    #[serde(default)]
    pub giving_number: String,
    #[serde(default)]
    pub giving_account: String,
    #[serde(default)]
    pub giving_name: String,
    /// The challenge's own messages, in order. Left out, they stay as they are.
    #[serde(default)]
    pub messages: Option<Vec<ChallengeMessage>>,
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
    account_id: Option<i64>,
    giving_method: Option<GivingMethod>,
    giving_number: String,
    giving_account: String,
    giving_name: String,
    messages: Option<Vec<ChallengeMessage>>,
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
        let (giving_number, giving_account, giving_name) =
            clean_giving(self.giving_method, &self.giving_number, &self.giving_account, &self.giving_name)?;
        // Kept as written (emoji, blank lines and spacing matter in WhatsApp), apart
        // from trailing spaces. Messages left empty are dropped.
        let messages = match self.messages {
            None => None,
            Some(list) => {
                let mut kept = Vec::new();
                for message in list {
                    let body = paragraphs(&message.body);
                    if body.is_empty() {
                        continue;
                    }
                    if body.chars().count() > 4000 {
                        return Err(AppError::field("messages", "Keep each message under 4,000 characters."));
                    }
                    let title = one_line(&message.title);
                    if title.chars().count() > 60 {
                        return Err(AppError::field("messages", "Keep each message's title under 60 characters."));
                    }
                    let title = if title.is_empty() { format!("Message {}", kept.len() + 1) } else { title };
                    kept.push(ChallengeMessage { title, body });
                }
                if kept.len() > 10 {
                    return Err(AppError::field("messages", "Keep at most 10 messages for a challenge."));
                }
                Some(kept)
            }
        };
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
            account_id: self.account_id,
            giving_method: self.giving_method,
            giving_number,
            giving_account,
            giving_name,
            messages,
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

const SELECT_CHALLENGES: &str = "SELECT c.id, c.name, c.name_sw, c.description, c.description_sw, c.target_minor,
        c.starts_on, c.ends_on, c.status, c.published, c.account_id, a.name AS account_name, c.giving_method,
        c.giving_number, c.giving_account, c.giving_name, c.created_at, c.updated_at
 FROM challenges c LEFT JOIN accounts a ON a.id = c.account_id";

/// Active challenges first, then the newest.
pub async fn list(conn: &mut SqliteConnection) -> AppResult<Vec<Challenge>> {
    let mut list: Vec<Challenge> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "{SELECT_CHALLENGES} ORDER BY c.status = 'closed', c.created_at DESC, c.id DESC"
    )))
    .fetch_all(&mut *conn)
    .await?;
    let mut messages: Vec<(i64, String, String)> =
        sqlx::query_as("SELECT challenge_id, title, body FROM challenge_messages ORDER BY challenge_id, position")
            .fetch_all(conn)
            .await?;
    for challenge in &mut list {
        challenge.messages = messages
            .extract_if(.., |(id, _, _)| *id == challenge.id)
            .map(|(_, title, body)| ChallengeMessage { title, body })
            .collect();
    }
    Ok(list)
}

pub async fn get(conn: &mut SqliteConnection, id: i64) -> AppResult<Challenge> {
    let mut challenge: Challenge = sqlx::query_as(sqlx::AssertSqlSafe(format!("{SELECT_CHALLENGES} WHERE c.id = ?")))
        .bind(id)
        .fetch_optional(&mut *conn)
        .await?
        .ok_or_else(|| AppError::not_found("That challenge"))?;
    challenge.messages = sqlx::query_as::<_, (String, String)>(
        "SELECT title, body FROM challenge_messages WHERE challenge_id = ? ORDER BY position",
    )
    .bind(id)
    .fetch_all(conn)
    .await?
    .into_iter()
    .map(|(title, body)| ChallengeMessage { title, body })
    .collect();
    Ok(challenge)
}

/// Replaces a challenge's own messages with these, in order.
async fn replace_messages(conn: &mut SqliteConnection, id: i64, messages: &[ChallengeMessage]) -> AppResult<()> {
    sqlx::query("DELETE FROM challenge_messages WHERE challenge_id = ?").bind(id).execute(&mut *conn).await?;
    for (position, m) in messages.iter().enumerate() {
        sqlx::query("INSERT INTO challenge_messages (challenge_id, position, title, body) VALUES (?, ?, ?, ?)")
            .bind(id)
            .bind(position as i64)
            .bind(&m.title)
            .bind(&m.body)
            .execute(&mut *conn)
            .await?;
    }
    Ok(())
}

/// A challenge with its tally and, when it keeps its own money, what it holds and has handed over.
fn summarise(challenge: Challenge, records: &[FundraiserRecord]) -> ChallengeSummary {
    let mut totals = challenge_totals(records).remove(&challenge.id).unwrap_or_default();
    if let Some(account) = challenge.account_id {
        let (held, handed_over) = kitty(records, account);
        totals.held_minor = Some(held);
        totals.handed_over_minor = Some(handed_over);
    }
    ChallengeSummary { challenge, totals }
}

/// Every challenge with its kitty, in the order of [`list`].
pub async fn summaries(conn: &mut SqliteConnection) -> AppResult<Vec<ChallengeSummary>> {
    let records = fundraiser_records(conn).await?;
    Ok(list(conn).await?.into_iter().map(|challenge| summarise(challenge, &records)).collect())
}

pub async fn summary(conn: &mut SqliteConnection, id: i64) -> AppResult<ChallengeSummary> {
    let challenge = get(conn, id).await?;
    let records = fundraiser_records(conn).await?;
    Ok(summarise(challenge, &records))
}

/// Money the challenges still hold in their own accounts: owed to the main fund.
pub fn held_by_challenges(challenges: &[Challenge], records: &[FundraiserRecord]) -> i64 {
    challenges.iter().filter_map(|c| c.account_id).map(|account| kitty(records, account).0).sum()
}

/// The challenge that keeps its own money in this account, if any.
pub async fn owner_of_account(conn: &mut SqliteConnection, account_id: i64) -> AppResult<Option<(i64, String)>> {
    Ok(sqlx::query_as("SELECT id, name FROM challenges WHERE account_id = ?")
        .bind(account_id)
        .fetch_optional(conn)
        .await?)
}

/// An account can become a challenge's own only if it is kept for that challenge:
/// not another challenge's, not where the opening funds are, and holding no
/// money received outside the challenge.
async fn check_account(conn: &mut SqliteConnection, account_id: i64, challenge_id: Option<i64>) -> AppResult<()> {
    let name: Option<String> = sqlx::query_scalar("SELECT name FROM accounts WHERE id = ?")
        .bind(account_id)
        .fetch_optional(&mut *conn)
        .await?;
    let name = name.ok_or_else(|| AppError::field("account_id", "That account does not exist."))?;
    if let Some((owner, owner_name)) = owner_of_account(conn, account_id).await?
        && Some(owner) != challenge_id
    {
        return Err(AppError::field("account_id", format!("“{name}” already keeps the money of “{owner_name}”.")));
    }
    let opening: Option<i64> = sqlx::query_scalar("SELECT opening_funds_account_id FROM fundraiser WHERE id = 1")
        .fetch_one(&mut *conn)
        .await?;
    if opening == Some(account_id) {
        return Err(AppError::field(
            "account_id",
            format!("“{name}” holds the fundraiser's opening funds; choose an account kept for this challenge."),
        ));
    }
    let others: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM transaction_versions v JOIN transactions t ON t.id = v.transaction_id
         WHERE v.is_current = 1 AND v.removed = 0 AND v.kind = 'contribution' AND v.account_id = ?1
           AND (?2 IS NULL OR t.challenge_id IS NOT ?2)",
    )
    .bind(account_id)
    .bind(challenge_id)
    .fetch_one(&mut *conn)
    .await?;
    if others > 0 {
        return Err(AppError::field(
            "account_id",
            format!(
                "“{name}” already holds money received outside this challenge; choose or add an account kept only for it."
            ),
        ));
    }
    Ok(())
}

/// Live records on an account, in or out.
async fn records_on(conn: &mut SqliteConnection, account_id: i64) -> AppResult<i64> {
    Ok(sqlx::query_scalar(
        "SELECT COUNT(*) FROM transaction_versions
         WHERE is_current = 1 AND removed = 0 AND (account_id = ?1 OR to_account_id = ?1)",
    )
    .bind(account_id)
    .fetch_one(conn)
    .await?)
}

pub async fn create(conn: &mut SqliteConnection, input: ChallengeInput) -> AppResult<ChallengeSummary> {
    let c = input.clean()?;
    if let Some(account) = c.account_id {
        check_account(conn, account, None).await?;
    }
    let now = clock::now_string();
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO challenges (name, name_sw, description, description_sw, target_minor, starts_on, ends_on,
                                 status, published, account_id, giving_method, giving_number, giving_account,
                                 giving_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
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
    .bind(c.account_id)
    .bind(c.giving_method)
    .bind(&c.giving_number)
    .bind(&c.giving_account)
    .bind(&c.giving_name)
    .bind(&now)
    .bind(&now)
    .fetch_one(&mut *conn)
    .await
    .map_err(|e| name_taken(e, &c.name))?;
    if let Some(messages) = &c.messages {
        replace_messages(conn, id, messages).await?;
    }
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
    if before.account_id != c.account_id {
        if let Some(old) = before.account_id
            && records_on(conn, old).await? > 0
        {
            return Err(AppError::field(
                "account_id",
                format!(
                    "“{}” already has records, so it stays this challenge's account.",
                    before.account_name.as_deref().unwrap_or("The account")
                ),
            ));
        }
        if let Some(account) = c.account_id {
            check_account(conn, account, Some(id)).await?;
        }
    }
    sqlx::query(
        "UPDATE challenges SET name = ?, name_sw = ?, description = ?, description_sw = ?, target_minor = ?,
                starts_on = ?, ends_on = ?, status = ?, published = ?, account_id = ?, giving_method = ?,
                giving_number = ?, giving_account = ?, giving_name = ?, updated_at = ?
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
    .bind(c.account_id)
    .bind(c.giving_method)
    .bind(&c.giving_number)
    .bind(&c.giving_account)
    .bind(&c.giving_name)
    .bind(clock::now_string())
    .bind(id)
    .execute(&mut *conn)
    .await
    .map_err(|e| name_taken(e, &c.name))?;
    if let Some(messages) = &c.messages
        && *messages != before.messages
    {
        replace_messages(conn, id, messages).await?;
    }
    let summary = match (before.status, c.status) {
        (ChallengeStatus::Active, ChallengeStatus::Closed) => format!("Challenge “{}” closed", c.name),
        (ChallengeStatus::Closed, ChallengeStatus::Active) => format!("Challenge “{}” reopened", c.name),
        _ if before.account_id != c.account_id && c.account_id.is_some() => {
            format!("Challenge “{}” now keeps its own money", c.name)
        }
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
    // Money received into a challenge's own account is that challenge's.
    if current.kind == Kind::Contribution
        && !current.removed
        && let Some(account) = current.account_id
        && let Some((owner, owner_name)) = owner_of_account(conn, account).await?
        && challenge_id != Some(owner)
    {
        return Err(AppError::field(
            "challenge_id",
            format!(
                "This money was received into the account of “{owner_name}”, so it belongs to that challenge. \
                 If it was recorded in the wrong account, correct the record first."
            ),
        ));
    }
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
