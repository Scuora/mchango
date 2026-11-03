//! The public page.
//!
//! Every public response is built here from an explicit allowlist of fields.
//! Private data (original messages, statements, phone numbers, counterparty
//! names, full references, personal activity and account balances) is never
//! loaded into these structures, so it cannot reach the browser.

use serde::Serialize;
use sqlx::SqliteConnection;
use std::collections::HashMap;

use crate::announcements;
use crate::challenges::{self, ChallengeStatus};
use crate::clock;
use crate::error::{AppError, AppResult};
use crate::reconciliation;
use crate::settings::{self, GivingMethod, Organiser};
use crate::transactions::totals::{
    FundraiserRecord, PledgeStatus, PledgeTotals, Totals, challenge_totals, fundraiser_records, kitty, pledge_progress,
    pledge_totals,
};
use crate::transactions::{Direction, Kind, PledgedBy};

#[derive(Debug, Serialize)]
pub struct PublicPage {
    pub fundraiser: PublicFundraiser,
    pub is_demo: bool,
    pub totals: PublicTotals,
    pub opening_funds: Option<PublicOpeningFunds>,
    pub contributions: Vec<PublicEntry>,
    pub spending: Vec<PublicEntry>,
    pub charges: Vec<PublicEntry>,
    pub refunds_and_reversals: Vec<PublicEntry>,
    pub promises: Option<PublicPromises>,
    pub statement_checks: PublicStatementChecks,
    pub announcements: Vec<PublicAnnouncement>,
    /// Published challenges, active first. Their money is part of `totals` already.
    pub challenges: Vec<PublicChallenge>,
    pub last_updated: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PublicChallenge {
    pub id: i64,
    pub name: String,
    pub name_sw: Option<String>,
    pub description: String,
    pub description_sw: Option<String>,
    pub target_minor: Option<i64>,
    pub starts_on: Option<String>,
    pub ends_on: Option<String>,
    pub status: ChallengeStatus,
    /// Money received through the challenge (always shown, like the main totals).
    pub raised_minor: i64,
    pub contributions_count: i64,
    pub pledged_outstanding_minor: i64,
    /// When it keeps its own money: what it still holds, and what it has handed over.
    pub held_minor: Option<i64>,
    pub handed_over_minor: Option<i64>,
    /// Where to send money for it, when that is not the fundraiser's own number.
    pub giving: Option<PublicGiving>,
}

#[derive(Debug, Serialize)]
pub struct PublicAnnouncement {
    pub id: i64,
    pub title: String,
    pub body: String,
    /// Kiswahili versions, when the family has added them.
    pub title_sw: Option<String>,
    pub body_sw: Option<String>,
    pub pinned: bool,
    pub published_at: String,
}

#[derive(Debug, Serialize)]
pub struct PublicGiving {
    pub method: GivingMethod,
    pub number: String,
    pub account: Option<String>,
    /// The name M-Pesa shows before the PIN.
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct PublicFuneral {
    pub when: Option<String>,
    pub place: Option<String>,
    pub map_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PublicFundraiser {
    pub name: String,
    pub description: String,
    pub description_sw: Option<String>,
    pub memorial_name: Option<String>,
    pub memorial_dates: Option<String>,
    pub memorial_tribute: Option<String>,
    /// Versioned so a replaced photo is fetched again.
    pub photo_url: Option<String>,
    pub target_minor: Option<i64>,
    pub start_date: Option<String>,
    pub anonymous_label: String,
    pub giving: Option<PublicGiving>,
    pub funeral: PublicFuneral,
    pub organisers: Vec<Organiser>,
    /// When false, individual contribution amounts are not published (totals still are).
    pub show_contribution_amounts: bool,
    /// Pledges added up: the family's are its share of the target, and friends
    /// and well-wishers are asked for the rest. Always shown, as totals only.
    pub pledges: PledgeTotals,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct PublicTotals {
    pub contributions_minor: i64,
    pub contributions_count: i64,
    pub expenses_minor: i64,
    pub charges_minor: i64,
    pub refunds_paid_minor: i64,
    pub refunds_received_minor: i64,
    pub reversals_in_minor: i64,
    pub reversals_out_minor: i64,
    pub opening_funds_minor: i64,
    pub remaining_minor: i64,
    /// Part of the remaining funds still held by challenges in their own
    /// accounts, to be handed over to the main account.
    pub held_by_challenges_minor: i64,
}

#[derive(Debug, Serialize)]
pub struct PublicOpeningFunds {
    pub amount_minor: i64,
    pub date: Option<String>,
    pub explanation: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct PublicEntry {
    /// Nairobi calendar date.
    pub date: String,
    pub kind: Kind,
    pub direction: Option<Direction>,
    /// `None` for contributions when the family has chosen not to show amounts.
    pub amount_minor: Option<i64>,
    /// UTC instant of the transaction.
    pub at: String,
    pub label: String,
    /// The last characters of the reference, so contributors can find their entry.
    pub reference_hint: Option<String>,
    pub matched_to_statement: bool,
    pub receipts: Vec<PublicReceipt>,
    /// The published challenge this came in through.
    pub challenge_id: Option<i64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct PublicReceipt {
    pub url: String,
    pub content_type: String,
}

#[derive(Debug, Serialize)]
pub struct PublicPromises {
    pub pledged_outstanding_minor: i64,
    pub unpaid_bills_minor: i64,
    pub unpaid_bills: Vec<PublicEntry>,
    /// Every pledge, newest first, with where it stands.
    pub pledges: Vec<PublicPledge>,
}

#[derive(Debug, Serialize)]
pub struct PublicPledge {
    /// Nairobi date the pledge was made.
    pub date: String,
    pub label: String,
    pub pledged_by: PledgedBy,
    /// Both `None` when the family chose not to show individual amounts.
    pub amount_minor: Option<i64>,
    pub received_minor: Option<i64>,
    pub status: PledgeStatus,
}

#[derive(Debug, Serialize)]
pub struct PublicStatementChecks {
    /// Periods fully matched to uploaded statements, latest first.
    pub reconciled_periods: Vec<PublicPeriod>,
    /// Money movements on statement accounts matched / not yet matched.
    pub matched_count: i64,
    pub not_matched_count: i64,
}

#[derive(Debug, Serialize)]
pub struct PublicPeriod {
    pub start: String,
    pub end: String,
}

/// The published page. Refused until the page is switched on in settings.
pub async fn page(conn: &mut SqliteConnection) -> AppResult<PublicPage> {
    if !settings::fundraiser(conn).await?.public_page_enabled {
        return Err(AppError::NotFound("This fundraiser page has not been published yet.".into()));
    }
    build(conn).await
}

/// Builds the public view whether or not it is published. Management uses it
/// to preview the page and to write WhatsApp updates from public fields only.
pub async fn build(conn: &mut SqliteConnection) -> AppResult<PublicPage> {
    let fundraiser = settings::fundraiser(conn).await?;
    let records = fundraiser_records(conn).await?;
    let totals = Totals::from_records(&records, fundraiser.opening_funds_minor);

    let receipts = published_receipts(conn).await?;
    let statement_accounts: Vec<i64> =
        sqlx::query_scalar("SELECT id FROM accounts WHERE kind <> 'cash'").fetch_all(&mut *conn).await?;

    let all_challenges = challenges::list(conn).await?;
    let published_challenges: Vec<i64> = all_challenges.iter().filter(|c| c.published).map(|c| c.id).collect();

    let anonymous = fundraiser.anonymous_label.clone();
    let entry = |r: &FundraiserRecord| -> PublicEntry {
        let described = |fallback: &str| {
            if r.description.is_empty() { fallback.to_string() } else { r.description.clone() }
        };
        let label = match (r.kind, r.direction) {
            (Kind::Contribution | Kind::Pledge, _) => r.public_name.clone().unwrap_or_else(|| anonymous.clone()),
            (Kind::Expense, _) => described("Purpose to be confirmed"),
            (Kind::Charge, _) => described("Transaction charge"),
            (Kind::Refund, Some(Direction::In)) => described("Refund received"),
            (Kind::Refund, _) => described("Refund paid"),
            (Kind::Reversal, _) => described("Reversal"),
            (Kind::Commitment, _) => described("Bill to be described"),
            (Kind::Transfer | Kind::Personal, _) => String::new(),
        };
        let reference_hint = match (&r.reference, fundraiser.show_reference_hint) {
            (Some(reference), true) if reference.len() > 4 => Some(format!("…{}", &reference[reference.len() - 4..])),
            _ => None,
        };
        PublicEntry {
            date: clock::parse_instant(&r.occurred_at)
                .map(|at| clock::format_date(clock::nairobi_date(at)))
                .unwrap_or_default(),
            kind: r.kind,
            direction: r.direction,
            amount_minor: (r.kind != Kind::Contribution || fundraiser.show_contribution_amounts)
                .then_some(r.amount_minor),
            at: r.occurred_at.clone(),
            label,
            reference_hint,
            matched_to_statement: r.matched,
            receipts: receipts.get(&r.id).cloned().unwrap_or_default(),
            challenge_id: r.challenge_id.filter(|c| published_challenges.contains(c)),
        }
    };

    let newest_first = |mut v: Vec<PublicEntry>| {
        v.reverse();
        v
    };
    let pick = |kinds: &[Kind]| -> Vec<PublicEntry> {
        newest_first(records.iter().filter(|r| kinds.contains(&r.kind)).map(entry).collect())
    };
    // A payment from several people is listed once per person, with their part.
    let contributions = newest_first(
        records
            .iter()
            .filter(|r| r.kind == Kind::Contribution)
            .flat_map(|r| {
                let whole = entry(r);
                if r.shares.is_empty() {
                    return vec![whole];
                }
                // Reversed here, so each payment's people read in order once the list is turned newest first.
                r.shares
                    .iter()
                    .rev()
                    .map(|s| PublicEntry {
                        label: s.public_name.clone().unwrap_or_else(|| anonymous.clone()),
                        amount_minor: fundraiser.show_contribution_amounts.then_some(s.amount_minor),
                        ..whole.clone()
                    })
                    .collect()
            })
            .collect(),
    );
    let spending = pick(&[Kind::Expense]);
    let charges = pick(&[Kind::Charge]);
    let refunds_and_reversals = pick(&[Kind::Refund, Kind::Reversal]);
    let unpaid_bills = pick(&[Kind::Commitment]);

    let progress = pledge_progress(&records);
    let show_amounts = fundraiser.show_contribution_amounts;
    let public_pledges: Vec<PublicPledge> = progress
        .iter()
        .rev()
        .filter_map(|p| {
            let r = records.iter().find(|r| r.id == p.id)?;
            let e = entry(r);
            Some(PublicPledge {
                date: e.date,
                label: e.label,
                pledged_by: p.pledged_by,
                amount_minor: show_amounts.then_some(p.amount_minor),
                received_minor: show_amounts.then_some(p.received_minor),
                status: p.status,
            })
        })
        .collect();

    let on_statement_accounts = |r: &&FundraiserRecord| {
        r.kind.moves_money()
            && (r.account_id.is_some_and(|a| statement_accounts.contains(&a))
                || r.to_account_id.is_some_and(|a| statement_accounts.contains(&a)))
    };
    let matched_count = records.iter().filter(on_statement_accounts).filter(|r| r.matched).count() as i64;
    let not_matched_count = records.iter().filter(on_statement_accounts).filter(|r| !r.matched).count() as i64;

    let reconciled_periods = reconciliation::reconciled_periods(conn)
        .await?
        .into_iter()
        .map(|p| PublicPeriod { start: p.period_start, end: p.period_end })
        .collect();

    let held_by_challenges_minor = challenges::held_by_challenges(&all_challenges, &records);
    let mut kitties = challenge_totals(&records);
    let public_challenges = all_challenges
        .into_iter()
        .filter(|c| c.published)
        .map(|c| {
            let t = kitties.remove(&c.id).unwrap_or_default();
            let (held, handed_over) = match c.account_id {
                Some(account) => {
                    let (held, handed_over) = kitty(&records, account);
                    (Some(held), Some(handed_over))
                }
                None => (None, None),
            };
            PublicChallenge {
                id: c.id,
                name: c.name,
                name_sw: Some(c.name_sw).filter(|s| !s.is_empty()),
                description: c.description,
                description_sw: Some(c.description_sw).filter(|s| !s.is_empty()),
                target_minor: c.target_minor,
                starts_on: c.starts_on,
                ends_on: c.ends_on,
                status: c.status,
                raised_minor: t.raised_minor,
                contributions_count: t.contributions_count,
                pledged_outstanding_minor: t.pledged_outstanding_minor,
                held_minor: held,
                handed_over_minor: handed_over,
                giving: c.giving_method.map(|method| PublicGiving {
                    method,
                    number: c.giving_number,
                    account: Some(c.giving_account).filter(|a| !a.is_empty()),
                    name: c.giving_name,
                }),
            }
        })
        .collect();

    let last_updated: Option<String> =
        sqlx::query_scalar("SELECT max(at) FROM change_log").fetch_one(&mut *conn).await?;

    Ok(PublicPage {
        fundraiser: PublicFundraiser {
            name: fundraiser.name.clone(),
            description: fundraiser.description.clone(),
            description_sw: Some(fundraiser.description_sw.clone()).filter(|s| !s.is_empty()),
            memorial_name: Some(fundraiser.memorial_name.clone()).filter(|s| !s.is_empty()),
            memorial_dates: Some(fundraiser.memorial_dates.clone()).filter(|s| !s.is_empty()),
            memorial_tribute: Some(fundraiser.memorial_tribute.clone()).filter(|s| !s.is_empty()),
            photo_url: fundraiser
                .memorial_photo_updated_at
                .as_deref()
                .map(|v| format!("/api/public/memorial-photo?v={}", &crate::storage::sha256_hex(v.as_bytes())[..12])),
            target_minor: fundraiser.target_minor,
            start_date: fundraiser.start_date.clone(),
            anonymous_label: fundraiser.anonymous_label.clone(),
            giving: fundraiser.giving_method.map(|method| PublicGiving {
                method,
                number: fundraiser.giving_number.clone(),
                account: Some(fundraiser.giving_account.clone()).filter(|a| !a.is_empty()),
                name: fundraiser.giving_name.clone(),
            }),
            funeral: PublicFuneral {
                when: Some(fundraiser.funeral_when.clone()).filter(|s| !s.is_empty()),
                place: Some(fundraiser.funeral_where.clone()).filter(|s| !s.is_empty()),
                map_url: Some(fundraiser.funeral_map_url.clone()).filter(|s| !s.is_empty()),
            },
            organisers: fundraiser.organisers.clone(),
            show_contribution_amounts: fundraiser.show_contribution_amounts,
            pledges: pledge_totals(&progress),
        },
        is_demo: fundraiser.is_demo,
        totals: PublicTotals {
            contributions_minor: totals.contributions_minor,
            contributions_count: totals.contributions_count,
            expenses_minor: totals.expenses_minor,
            charges_minor: totals.charges_minor,
            refunds_paid_minor: totals.refunds_paid_minor,
            refunds_received_minor: totals.refunds_received_minor,
            reversals_in_minor: totals.reversals_in_minor,
            reversals_out_minor: totals.reversals_out_minor,
            opening_funds_minor: totals.opening_funds_minor,
            remaining_minor: totals.remaining_minor,
            held_by_challenges_minor,
        },
        opening_funds: (fundraiser.opening_funds_minor > 0).then(|| PublicOpeningFunds {
            amount_minor: fundraiser.opening_funds_minor,
            date: fundraiser.opening_funds_date.clone(),
            explanation: fundraiser.opening_funds_note.clone(),
        }),
        contributions,
        spending,
        charges,
        refunds_and_reversals,
        promises: fundraiser.show_promises.then_some(PublicPromises {
            pledged_outstanding_minor: totals.pledged_outstanding_minor,
            unpaid_bills_minor: totals.unpaid_bills_minor,
            unpaid_bills,
            pledges: public_pledges,
        }),
        statement_checks: PublicStatementChecks { reconciled_periods, matched_count, not_matched_count },
        announcements: announcements::list(conn, true)
            .await?
            .into_iter()
            .map(|a| PublicAnnouncement {
                id: a.id,
                title: a.title,
                body: a.body,
                title_sw: Some(a.title_sw).filter(|s| !s.is_empty()),
                body_sw: Some(a.body_sw).filter(|s| !s.is_empty()),
                pinned: a.pinned,
                published_at: a.created_at,
            })
            .collect(),
        challenges: public_challenges,
        last_updated,
    })
}

async fn published_receipts(conn: &mut SqliteConnection) -> AppResult<HashMap<i64, Vec<PublicReceipt>>> {
    let rows: Vec<(i64, String, String)> = sqlx::query_as(
        "SELECT transaction_id, public_token, content_type FROM documents
         WHERE kind = 'receipt' AND public_token IS NOT NULL AND transaction_id IS NOT NULL ORDER BY id",
    )
    .fetch_all(conn)
    .await?;
    let mut map: HashMap<i64, Vec<PublicReceipt>> = HashMap::new();
    for (transaction_id, token, content_type) in rows {
        map.entry(transaction_id)
            .or_default()
            .push(PublicReceipt { url: format!("/api/public/receipts/{token}"), content_type });
    }
    Ok(map)
}

/// A published receipt, only while its record is a live fundraiser record and
/// the page is published.
pub async fn receipt_by_token(conn: &mut SqliteConnection, token: &str) -> AppResult<(String, String)> {
    if token.len() != 32 || !token.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(AppError::not_found("That receipt"));
    }
    let found: Option<(String, String)> = sqlx::query_as(
        "SELECT d.storage_name, d.content_type FROM documents d
         JOIN transaction_versions v ON v.transaction_id = d.transaction_id AND v.is_current = 1
         JOIN fundraiser f ON f.id = 1
         WHERE d.public_token = ? AND d.kind = 'receipt' AND v.removed = 0 AND v.kind <> 'personal'
           AND f.public_page_enabled = 1",
    )
    .bind(token)
    .fetch_optional(conn)
    .await?;
    found.ok_or_else(|| AppError::not_found("That receipt"))
}

// ---------------------------------------------------------------------------
// "Check my contribution"

#[derive(Debug, Serialize)]
pub struct CheckResult {
    pub found: bool,
    pub contribution: Option<CheckedContribution>,
}

#[derive(Debug, Serialize)]
pub struct CheckedContribution {
    /// UTC instant.
    pub at: String,
    pub amount_minor: i64,
    /// How the contribution is listed: the public name or the anonymous label.
    pub listed_as: String,
    pub matched_to_statement: bool,
}

/// Finds the M-Pesa code in what a contributor typed or pasted (the whole SMS is fine).
pub fn extract_code(input: &str) -> Option<String> {
    input.split(|c: char| !c.is_ascii_alphanumeric()).map(|token| token.to_ascii_uppercase()).find(|token| {
        token.len() == 10 && token.as_bytes()[0].is_ascii_alphabetic() && token.bytes().any(|b| b.is_ascii_digit())
    })
}

/// Confirms whether a contribution with this M-Pesa code was recorded. Only
/// live contributions can be found; anything else answers "not found", so the
/// check reveals nothing about personal activity, payments or statements.
pub async fn check_contribution(conn: &mut SqliteConnection, input: &str) -> AppResult<CheckResult> {
    let fundraiser = settings::fundraiser(conn).await?;
    if !fundraiser.public_page_enabled {
        return Err(AppError::NotFound("This fundraiser page has not been published yet.".into()));
    }
    let code = extract_code(input).ok_or_else(|| {
        AppError::field("code", "Enter the M-Pesa code from your confirmation message, for example TK3AB12CD4.")
    })?;
    let found: Option<(String, i64, Option<String>, bool, i64)> = sqlx::query_as(
        "SELECT v.occurred_at, v.amount_minor, t.public_name,
                EXISTS (SELECT 1 FROM statement_rows r JOIN statement_imports i ON i.id = r.import_id
                        WHERE r.transaction_id = t.id AND i.status = 'ready'),
                t.id
         FROM transaction_versions v JOIN transactions t ON t.id = v.transaction_id
         WHERE v.is_current = 1 AND v.removed = 0 AND v.kind = 'contribution' AND v.reference = ?
         LIMIT 1",
    )
    .bind(&code)
    .fetch_optional(&mut *conn)
    .await?;
    Ok(match found {
        None => CheckResult { found: false, contribution: None },
        Some((at, amount_minor, public_name, matched, id)) => {
            // A shared payment is listed under each person who shared it.
            let shared = crate::transactions::shares(conn, id).await?;
            let listed_as = if shared.is_empty() {
                public_name.unwrap_or(fundraiser.anonymous_label)
            } else {
                shared
                    .iter()
                    .map(|s| s.public_name.clone().unwrap_or_else(|| fundraiser.anonymous_label.clone()))
                    .collect::<Vec<_>>()
                    .join(", ")
            };
            CheckResult {
                found: true,
                contribution: Some(CheckedContribution { at, amount_minor, listed_as, matched_to_statement: matched }),
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::extract_code;

    #[test]
    fn finds_the_code_in_a_pasted_message() {
        assert_eq!(extract_code(" tk3ab12cd4 ").as_deref(), Some("TK3AB12CD4"));
        assert_eq!(
            extract_code("TK3AB12CD4 Confirmed.You have received Ksh10.00 from JOHN KAMAU 0711***444 on 2/11/26")
                .as_deref(),
            Some("TK3AB12CD4")
        );
        assert_eq!(extract_code("0712345678"), None, "a phone number is not a code");
        assert_eq!(extract_code("CONFIRMED."), None);
    }
}
