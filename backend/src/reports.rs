//! Statements of account for a chosen period, for sending to stakeholders as
//! PDFs. The server works out every figure (balance brought forward, totals,
//! closing balance) from the same records as the rest of the app; the browser
//! only lays them out.

use serde::{Deserialize, Serialize};
use sqlx::SqliteConnection;

use crate::clock;
use crate::error::{AppError, AppResult};
use crate::reconciliation;
use crate::settings::{self, GivingMethod, Organiser};
use crate::transactions::totals::{Totals, fundraiser_records};
use crate::transactions::{Direction, Kind};

#[derive(Debug, Deserialize)]
pub struct StatementQuery {
    /// Nairobi dates, inclusive. Without `from` the statement starts at the beginning.
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct StatementReport {
    pub fundraiser: ReportFundraiser,
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

fn signed(kind: Kind, direction: Option<Direction>, amount: i64) -> Option<i64> {
    if !kind.affects_fundraiser_totals() {
        return None;
    }
    Some(if direction == Some(Direction::In) { amount } else { -amount })
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
    let rows: Vec<Row> = sqlx::query_as(
        "SELECT v.kind, v.direction, v.amount_minor, v.occurred_at, v.reference, v.counterparty,
                t.public_name, t.description,
                EXISTS (SELECT 1 FROM statement_rows r JOIN statement_imports i ON i.id = r.import_id
                        WHERE r.transaction_id = t.id AND i.status = 'ready') AS matched,
                EXISTS (SELECT 1 FROM documents d WHERE d.transaction_id = t.id AND d.kind = 'receipt') AS has_receipt,
                (SELECT json_group_array(json_object('public_name', s.public_name, 'amount_minor', s.amount_minor))
                   FROM (SELECT public_name, amount_minor FROM contribution_shares
                          WHERE transaction_id = t.id ORDER BY position) s) AS shares_json
         FROM transactions t
         JOIN transaction_versions v ON v.transaction_id = t.id AND v.is_current = 1
         WHERE v.removed = 0 AND v.kind NOT IN ('personal', 'transfer', 'pledge', 'commitment')
           AND v.occurred_at < ?
         ORDER BY v.occurred_at, t.id",
    )
    .bind(&end)
    .fetch_all(&mut *conn)
    .await?;

    let mut brought_forward = f.opening_funds_minor;
    let mut totals = PeriodTotals::default();
    let mut entries = Vec::new();
    for row in rows {
        let Some(amount) = signed(row.kind, row.direction, row.amount_minor) else { continue };
        if start.as_deref().is_some_and(|s| row.occurred_at.as_str() < s) {
            brought_forward += amount;
            continue;
        }
        let a = row.amount_minor;
        match (row.kind, row.direction) {
            (Kind::Contribution, _) => {
                totals.received_minor += a;
                totals.received_count += 1;
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
            _ => {}
        }
        let described =
            |fallback: &str| if row.description.is_empty() { fallback.to_string() } else { row.description.clone() };
        let label = match (row.kind, row.direction) {
            (Kind::Contribution, _) => {
                let shared = crate::transactions::parse_shares(&row.shares_json);
                if shared.is_empty() {
                    row.public_name.clone().unwrap_or_else(|| f.anonymous_label.clone())
                } else {
                    shared
                        .iter()
                        .map(|s| s.public_name.clone().unwrap_or_else(|| f.anonymous_label.clone()))
                        .collect::<Vec<_>>()
                        .join(", ")
                }
            }
            (Kind::Expense, _) => described("Purpose to be confirmed"),
            (Kind::Charge, _) => described("M-Pesa charge"),
            (Kind::Refund, Some(Direction::In)) => described("Refund received"),
            (Kind::Refund, _) => described("Refund paid"),
            _ => described("Reversal"),
        };
        entries.push(ReportEntry {
            at: row.occurred_at,
            kind: row.kind,
            direction: row.direction.unwrap_or(Direction::Out),
            amount_minor: a,
            label,
            mpesa_name: row.counterparty.as_deref().and_then(name_only),
            reference: row.reference,
            matched: row.matched,
            has_receipt: row.has_receipt,
        });
    }
    let period_net = totals.received_minor + totals.refunds_received_minor + totals.reversals_in_minor
        - totals.expenses_minor
        - totals.charges_minor
        - totals.refunds_paid_minor
        - totals.reversals_out_minor;

    let all = Totals::from_records(&fundraiser_records(conn).await?, f.opening_funds_minor);
    let reconciled_through = reconciliation::reconciled_periods(conn).await?.into_iter().map(|p| p.period_end).max();

    Ok(StatementReport {
        fundraiser: ReportFundraiser {
            name: f.name.clone(),
            memorial_name: f.memorial_name.clone(),
            memorial_dates: f.memorial_dates.clone(),
            memorial_tribute: f.memorial_tribute.clone(),
            giving_method: f.giving_method,
            giving_number: f.giving_number.clone(),
            giving_account: f.giving_account.clone(),
            giving_name: f.giving_name.clone(),
            organisers: f.organisers.clone(),
            has_photo: f.memorial_photo_updated_at.is_some(),
        },
        period_from: from.map(clock::format_date),
        period_to: clock::format_date(to),
        generated_at: clock::now_string(),
        generated_by,
        brought_forward_minor: brought_forward,
        closing_minor: brought_forward + period_net,
        totals,
        entries,
        pledged_outstanding_minor: all.pledged_outstanding_minor,
        unpaid_bills_minor: all.unpaid_bills_minor,
        reconciled_through,
        public_url,
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
