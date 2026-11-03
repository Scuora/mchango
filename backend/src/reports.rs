//! Statements of account for a chosen period, for sending to stakeholders as
//! PDFs. The server works out every figure (balance brought forward, totals,
//! closing balance) from the same records as the rest of the app; the browser
//! only lays them out.
//!
//! A statement covers the whole fundraiser or one account (a kitty, such as a
//! challenge's own M-Pesa line). For one account, money moved in and out of it
//! (a hand-over, a withdrawal) is part of its statement.

use serde::{Deserialize, Serialize};
use sqlx::SqliteConnection;

use crate::challenges;
use crate::clock;
use crate::error::{AppError, AppResult};
use crate::reconciliation;
use crate::settings::{self, AccountKind, GivingMethod, Organiser};
use crate::transactions::totals::{
    Totals, challenge_totals, fundraiser_records, funds_by_account, pledge_progress, pledge_totals,
};
use crate::transactions::{Direction, Kind};

#[derive(Debug, Deserialize)]
pub struct StatementQuery {
    /// Nairobi dates, inclusive. Without `from` the statement starts at the beginning.
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
    /// Only what went through this account. Without it, the whole fundraiser.
    #[serde(default)]
    pub account_id: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct StatementReport {
    pub fundraiser: ReportFundraiser,
    /// The account the statement covers; none for the whole fundraiser.
    pub account: Option<ReportAccount>,
    pub period_from: Option<String>,
    pub period_to: String,
    pub generated_at: String,
    pub generated_by: String,
    /// Funds held at the start of the period (opening funds plus everything before it).
    pub brought_forward_minor: i64,
    pub closing_minor: i64,
    pub totals: PeriodTotals,
    pub entries: Vec<ReportEntry>,
    pub pledged_outstanding_minor: i64,
    pub unpaid_bills_minor: i64,
    pub reconciled_through: Option<String>,
    pub public_url: Option<String>,
    /// Progress to the target as at the end of the period: the fundraiser's goal,
    /// or, on a challenge's own account, the challenge's. None without a target.
    pub goal: Option<ReportGoal>,
    /// Where the money was at the end of the period (whole-fundraiser statements).
    pub balances: Vec<ReportBalance>,
    /// Published challenges and what they had brought in by the end of the period
    /// (whole-fundraiser statements).
    pub challenges: Vec<ReportChallenge>,
}

/// The target as the public page presents it: the family's own share counts as
/// given; everyone else's money counts once received, and their pledges are
/// expected but not yet in.
#[derive(Debug, Serialize)]
pub struct ReportGoal {
    pub target_minor: i64,
    /// The family's own share of the target. Zero for a challenge.
    pub family_share_minor: i64,
    /// Received from family, friends and well-wishers (for a challenge, everything received through it).
    pub received_minor: i64,
    /// Pledged by family, friends and well-wishers, not yet received (never the family's share).
    pub pledged_outstanding_minor: i64,
}

#[derive(Debug, Serialize)]
pub struct ReportBalance {
    pub name: String,
    pub amount_minor: i64,
    /// The challenge whose money the account keeps: owed to the main fund until handed over.
    pub challenge_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ReportChallenge {
    pub name: String,
    pub target_minor: Option<i64>,
    pub raised_minor: i64,
    pub pledged_outstanding_minor: i64,
}

#[derive(Debug, Serialize)]
pub struct ReportFundraiser {
    pub name: String,
    pub memorial_name: String,
    pub memorial_dates: String,
    pub memorial_tribute: String,
    pub giving_method: Option<GivingMethod>,
    pub giving_number: String,
    pub giving_account: String,
    pub giving_name: String,
    pub organisers: Vec<Organiser>,
    pub has_photo: bool,
}

#[derive(Debug, Serialize)]
pub struct ReportAccount {
    pub id: i64,
    pub name: String,
    pub kind: AccountKind,
    /// The challenge whose money the account keeps, if any.
    pub challenge_name: Option<String>,
}

#[derive(Debug, Default, Serialize)]
pub struct PeriodTotals {
    pub received_minor: i64,
    pub received_count: i64,
    pub expenses_minor: i64,
    pub expenses_count: i64,
    pub charges_minor: i64,
    pub refunds_paid_minor: i64,
    pub refunds_received_minor: i64,
    pub reversals_in_minor: i64,
    pub reversals_out_minor: i64,
    /// Moved in from the fundraiser's other accounts (one-account statements only).
    pub transfers_in_minor: i64,
    /// Moved out to the fundraiser's other accounts, such as a hand-over.
    pub transfers_out_minor: i64,
}

#[derive(Debug, Serialize)]
pub struct ReportEntry {
    /// UTC instant.
    pub at: String,
    pub kind: Kind,
    pub direction: Direction,
    pub amount_minor: i64,
    /// What the public page shows: the public name or the expense purpose.
    pub label: String,
    /// The name as M-Pesa wrote it, with phone numbers removed (committee use only).
    pub mpesa_name: Option<String>,
    pub reference: Option<String>,
    pub matched: bool,
    pub has_receipt: bool,
}

#[derive(sqlx::FromRow)]
struct Row {
    kind: Kind,
    direction: Option<Direction>,
    amount_minor: i64,
    occurred_at: String,
    account_id: Option<i64>,
    to_account_id: Option<i64>,
    reference: Option<String>,
    counterparty: Option<String>,
    public_name: Option<String>,
    description: String,
    matched: bool,
    has_receipt: bool,
    /// Who a shared payment is from (JSON); one line per payment, naming them all.
    shares_json: String,
}

/// Keeps a person's or business's name and drops numbers and masked digits.
fn name_only(counterparty: &str) -> Option<String> {
    let mut text = counterparty.to_string();
    while let (Some(open), Some(close)) = (text.find('('), text.find(')')) {
        if close < open {
            break;
        }
        text.replace_range(open..=close, " ");
    }
    let text = text.rsplit(" - ").next().unwrap_or(&text);
    let name = text
        .split_whitespace()
        .filter(|word| !word.chars().any(|c| c.is_ascii_digit() || c == '*'))
        .collect::<Vec<_>>()
        .join(" ");
    let name = name.trim_matches(|c: char| c == '-' || c == '.' || c.is_whitespace()).to_string();
    (!name.is_empty()).then_some(name)
}

/// What a record adds to the funds the statement covers. Transfers count only on
/// a one-account statement, and only when they move money in or out of it.
fn signed(row: &Row, account: Option<i64>) -> Option<i64> {
    if row.kind == Kind::Transfer {
        let account = account?;
        return match (row.account_id == Some(account), row.to_account_id == Some(account)) {
            (true, false) => Some(-row.amount_minor),
            (false, true) => Some(row.amount_minor),
            _ => None,
        };
    }
    if !row.kind.affects_fundraiser_totals() {
        return None;
    }
    Some(if row.direction == Some(Direction::In) { row.amount_minor } else { -row.amount_minor })
}

pub async fn statement(
    conn: &mut SqliteConnection,
    query: StatementQuery,
    generated_by: String,
    public_url: Option<String>,
) -> AppResult<StatementReport> {
    let date = |value: Option<String>, field: &'static str| -> AppResult<Option<time::Date>> {
        match value.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            None => Ok(None),
            Some(v) => {
                clock::parse_date(v).map(Some).ok_or_else(|| AppError::field(field, "Use a date like 2026-11-02."))
            }
        }
    };
    let from = date(query.from, "from")?;
    let to = date(query.to, "to")?.unwrap_or_else(|| clock::nairobi_date(clock::now()));
    if from.is_some_and(|f| f > to) {
        return Err(AppError::field("to", "The end date is before the start date."));
    }
    let start = from.map(clock::day_start);
    let end = clock::day_end_exclusive(to);

    let f = settings::fundraiser(conn).await?;
    let accounts = settings::accounts(conn).await?;
    let account_name =
        |id: Option<i64>| accounts.iter().find(|a| Some(a.id) == id).map(|a| a.name.clone()).unwrap_or_default();
    // A statement for a challenge's own account is that challenge's kitty.
    let mut owner = None;
    let account = match query.account_id {
        None => None,
        Some(id) => {
            let a = accounts
                .iter()
                .find(|a| a.id == id)
                .ok_or_else(|| AppError::field("account_id", "Choose one of the fundraiser's accounts."))?;
            if let Some((challenge, _)) = challenges::owner_of_account(conn, id).await? {
                owner = Some(challenges::summary(conn, challenge).await?);
            }
            let challenge_name = owner.as_ref().map(|c| c.challenge.name.clone());
            Some(ReportAccount { id, name: a.name.clone(), kind: a.kind, challenge_name })
        }
    };
    let only = account.as_ref().map(|a| a.id);

    let rows: Vec<Row> = sqlx::query_as(
        "SELECT v.kind, v.direction, v.amount_minor, v.occurred_at, v.account_id, v.to_account_id,
                v.reference, v.counterparty,
                t.public_name, t.description,
                EXISTS (SELECT 1 FROM statement_rows r JOIN statement_imports i ON i.id = r.import_id
                        WHERE r.transaction_id = t.id AND i.status = 'ready') AS matched,
                EXISTS (SELECT 1 FROM documents d WHERE d.transaction_id = t.id AND d.kind = 'receipt') AS has_receipt,
                (SELECT json_group_array(json_object('public_name', s.public_name, 'amount_minor', s.amount_minor))
                   FROM (SELECT public_name, amount_minor FROM contribution_shares
                          WHERE transaction_id = t.id ORDER BY position) s) AS shares_json
         FROM transactions t
         JOIN transaction_versions v ON v.transaction_id = t.id AND v.is_current = 1
         WHERE v.removed = 0 AND v.kind NOT IN ('personal', 'pledge', 'commitment')
           AND v.occurred_at < ?1
           AND (?2 IS NULL OR v.account_id = ?2 OR v.to_account_id = ?2)
         ORDER BY v.occurred_at, t.id",
    )
    .bind(&end)
    .bind(only)
    .fetch_all(&mut *conn)
    .await?;

    // The opening funds sit in one account; a statement for another starts at nothing.
    let mut brought_forward =
        if only.is_none() || only == f.opening_funds_account_id { f.opening_funds_minor } else { 0 };
    let mut totals = PeriodTotals::default();
    let mut entries = Vec::new();
    for row in rows {
        let Some(amount) = signed(&row, only) else { continue };
        if start.as_deref().is_some_and(|s| row.occurred_at.as_str() < s) {
            brought_forward += amount;
            continue;
        }
        let a = row.amount_minor;
        // A payment from several people is listed person by person, each with their part.
        let shared = if row.kind == Kind::Contribution {
            crate::transactions::parse_shares(&row.shares_json)
        } else {
            Vec::new()
        };
        match (row.kind, row.direction) {
            (Kind::Contribution, _) => {
                totals.received_minor += a;
                totals.received_count += shared.len().max(1) as i64;
            }
            (Kind::Expense, _) => {
                totals.expenses_minor += a;
                totals.expenses_count += 1;
            }
            (Kind::Charge, _) => totals.charges_minor += a,
            (Kind::Refund, Some(Direction::In)) => totals.refunds_received_minor += a,
            (Kind::Refund, _) => totals.refunds_paid_minor += a,
            (Kind::Reversal, Some(Direction::In)) => totals.reversals_in_minor += a,
            (Kind::Reversal, _) => totals.reversals_out_minor += a,
            (Kind::Transfer, _) if amount > 0 => totals.transfers_in_minor += a,
            (Kind::Transfer, _) => totals.transfers_out_minor += a,
            _ => {}
        }
        let into = amount > 0;
        let described =
            |fallback: &str| if row.description.is_empty() { fallback.to_string() } else { row.description.clone() };
        let label = match (row.kind, row.direction) {
            (Kind::Contribution, _) => row.public_name.clone().unwrap_or_else(|| f.anonymous_label.clone()),
            (Kind::Expense, _) => described("Purpose to be confirmed"),
            (Kind::Charge, _) => described("M-Pesa charge"),
            (Kind::Refund, Some(Direction::In)) => described("Refund received"),
            (Kind::Refund, _) => described("Refund paid"),
            (Kind::Transfer, _) => {
                let moved = if into {
                    format!("Moved in from {}", account_name(row.account_id))
                } else {
                    format!("Moved to {}", account_name(row.to_account_id))
                };
                if row.description.is_empty() { moved } else { format!("{moved}: {}", row.description) }
            }
            _ => described("Reversal"),
        };
        let entry = |label: String, amount_minor: i64| ReportEntry {
            at: row.occurred_at.clone(),
            kind: row.kind,
            direction: if into { Direction::In } else { Direction::Out },
            amount_minor,
            label,
            mpesa_name: row.counterparty.as_deref().and_then(name_only),
            reference: row.reference.clone(),
            matched: row.matched,
            has_receipt: row.has_receipt,
        };
        if shared.is_empty() {
            entries.push(entry(label, a));
        } else {
            for s in &shared {
                entries.push(entry(s.public_name.clone().unwrap_or_else(|| f.anonymous_label.clone()), s.amount_minor));
            }
        }
    }
    let period_net =
        totals.received_minor + totals.refunds_received_minor + totals.reversals_in_minor + totals.transfers_in_minor
            - totals.expenses_minor
            - totals.charges_minor
            - totals.refunds_paid_minor
            - totals.reversals_out_minor
            - totals.transfers_out_minor;

    // Everything as it stood at the end of the period.
    let records: Vec<_> =
        fundraiser_records(conn).await?.into_iter().filter(|r| r.occurred_at.as_str() < end.as_str()).collect();
    let by_challenge = challenge_totals(&records);
    let all_challenges = challenges::list(conn).await?;
    let mut goal = None;
    let mut balances = Vec::new();
    let mut challenge_rows = Vec::new();
    // Pledges and bills belong to the whole fundraiser, not to an account; a
    // challenge's account shows what was pledged to that challenge. The family's
    // own share is never listed as a pledge (as on the public page).
    let (pledged_outstanding_minor, unpaid_bills_minor) = match &owner {
        None if only.is_none() => {
            let all = Totals::from_records(&records, f.opening_funds_minor);
            let pledges = pledge_totals(&pledge_progress(&records));
            goal = f.target_minor.filter(|t| *t > 0).map(|target_minor| ReportGoal {
                target_minor,
                family_share_minor: pledges.family.pledged_minor,
                received_minor: (all.contributions_minor - pledges.family.received_minor).max(0),
                pledged_outstanding_minor: pledges.friends.outstanding_minor,
            });
            let opening = f.opening_funds_account_id.map(|a| (a, f.opening_funds_minor));
            let places = funds_by_account(&records, opening);
            balances = accounts
                .iter()
                .map(|a| ReportBalance {
                    name: a.name.clone(),
                    amount_minor: places.get(&a.id).copied().unwrap_or(0),
                    challenge_name: all_challenges.iter().find(|c| c.account_id == Some(a.id)).map(|c| c.name.clone()),
                })
                .filter(|b| b.amount_minor != 0)
                .collect();
            challenge_rows = all_challenges
                .iter()
                .filter(|c| c.published)
                .map(|c| {
                    let t = by_challenge.get(&c.id);
                    ReportChallenge {
                        name: c.name.clone(),
                        target_minor: c.target_minor,
                        raised_minor: t.map_or(0, |t| t.raised_minor),
                        pledged_outstanding_minor: t.map_or(0, |t| t.pledged_outstanding_minor),
                    }
                })
                .collect();
            (pledges.friends.outstanding_minor, all.unpaid_bills_minor)
        }
        None => (0, 0),
        Some(c) => {
            let t = by_challenge.get(&c.challenge.id);
            let raised = t.map_or(0, |t| t.raised_minor);
            let pledged = t.map_or(0, |t| t.pledged_outstanding_minor);
            goal = c.challenge.target_minor.filter(|t| *t > 0).map(|target_minor| ReportGoal {
                target_minor,
                family_share_minor: 0,
                received_minor: raised,
                pledged_outstanding_minor: pledged,
            });
            (pledged, 0)
        }
    };
    // Givers to a challenge with its own number are pointed there.
    let giving = owner.as_ref().map(|c| &c.challenge).filter(|c| c.giving_method.is_some());
    let reconciled_through = reconciliation::reconciled_periods(conn)
        .await?
        .into_iter()
        .filter(|p| only.is_none_or(|id| p.account_id == id))
        .map(|p| p.period_end)
        .max();

    Ok(StatementReport {
        fundraiser: ReportFundraiser {
            name: f.name.clone(),
            memorial_name: f.memorial_name.clone(),
            memorial_dates: f.memorial_dates.clone(),
            memorial_tribute: f.memorial_tribute.clone(),
            giving_method: giving.map_or(f.giving_method, |c| c.giving_method),
            giving_number: giving.map_or_else(|| f.giving_number.clone(), |c| c.giving_number.clone()),
            giving_account: giving.map_or_else(|| f.giving_account.clone(), |c| c.giving_account.clone()),
            giving_name: giving.map_or_else(|| f.giving_name.clone(), |c| c.giving_name.clone()),
            organisers: f.organisers.clone(),
            has_photo: f.memorial_photo_updated_at.is_some(),
        },
        account,
        period_from: from.map(clock::format_date),
        period_to: clock::format_date(to),
        generated_at: clock::now_string(),
        generated_by,
        brought_forward_minor: brought_forward,
        closing_minor: brought_forward + period_net,
        totals,
        entries,
        pledged_outstanding_minor,
        unpaid_bills_minor,
        reconciled_through,
        public_url,
        goal,
        balances,
        challenges: challenge_rows,
    })
}

#[cfg(test)]
mod tests {
    use super::name_only;

    #[test]
    fn names_without_numbers() {
        assert_eq!(name_only("JOHN KAMAU 0711***444").as_deref(), Some("JOHN KAMAU"));
        assert_eq!(name_only("Funds received from - 0711***777 SAMUEL KIPROTICH").as_deref(), Some("SAMUEL KIPROTICH"));
        assert_eq!(name_only("KPLC PREPAID (account 12345678)").as_deref(), Some("KPLC PREPAID"));
        assert_eq!(name_only("0712345678"), None);
    }
}
