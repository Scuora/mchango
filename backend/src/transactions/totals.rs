//! Fundraiser totals, always derived from the current, non-removed records.
//!
//! The overview and the public page both use [`fundraiser_records`] and
//! [`Totals::from_records`], so the published totals describe exactly the
//! records that are listed.

use serde::Serialize;
use sqlx::SqliteConnection;
use std::collections::BTreeMap;

use super::{Direction, Kind, PledgedBy};
use crate::error::AppResult;

/// A current fundraiser record (everything except personal activity).
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct FundraiserRecord {
    pub id: i64,
    pub kind: Kind,
    pub direction: Option<Direction>,
    pub amount_minor: i64,
    pub occurred_at: String,
    pub account_id: Option<i64>,
    pub to_account_id: Option<i64>,
    pub reference: Option<String>,
    pub related_transaction_id: Option<i64>,
    pub public_name: Option<String>,
    pub description: String,
    pub pledged_by: Option<PledgedBy>,
    /// The challenge it came in through. Its money still counts once, in the main totals.
    pub challenge_id: Option<i64>,
    pub matched: bool,
}

pub async fn fundraiser_records(conn: &mut SqliteConnection) -> AppResult<Vec<FundraiserRecord>> {
    let rows = sqlx::query_as(
        "SELECT t.id, v.kind, v.direction, v.amount_minor, v.occurred_at, v.account_id, v.to_account_id,
                v.reference, v.related_transaction_id, t.public_name, t.description, t.pledged_by, t.challenge_id,
                EXISTS (SELECT 1 FROM statement_rows r JOIN statement_imports i ON i.id = r.import_id
                        WHERE r.transaction_id = t.id AND i.status = 'ready') AS matched
         FROM transactions t
         JOIN transaction_versions v ON v.transaction_id = t.id AND v.is_current = 1
         WHERE v.removed = 0 AND v.kind <> 'personal'
         ORDER BY v.occurred_at, t.id",
    )
    .fetch_all(conn)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
pub struct Totals {
    pub opening_funds_minor: i64,
    pub contributions_minor: i64,
    pub contributions_count: i64,
    pub expenses_minor: i64,
    pub expenses_count: i64,
    pub charges_minor: i64,
    pub charges_count: i64,
    pub refunds_paid_minor: i64,
    pub refunds_received_minor: i64,
    pub reversals_in_minor: i64,
    pub reversals_out_minor: i64,
    /// Opening funds plus every fundraiser movement in, minus every one out.
    pub remaining_minor: i64,
    /// Pledges not yet covered by linked contributions.
    pub pledged_outstanding_minor: i64,
    /// Unpaid bills not yet covered by linked expenses.
    pub unpaid_bills_minor: i64,
}

impl Totals {
    pub fn from_records(records: &[FundraiserRecord], opening_funds_minor: i64) -> Totals {
        let mut t = Totals { opening_funds_minor, ..Totals::default() };
        let mut pledges: BTreeMap<i64, i64> = BTreeMap::new();
        let mut bills: BTreeMap<i64, i64> = BTreeMap::new();

        for r in records {
            let amount = r.amount_minor;
            match (r.kind, r.direction) {
                (Kind::Contribution, _) => {
                    t.contributions_minor += amount;
                    t.contributions_count += 1;
                }
                (Kind::Expense, _) => {
                    t.expenses_minor += amount;
                    t.expenses_count += 1;
                }
                (Kind::Charge, _) => {
                    t.charges_minor += amount;
                    t.charges_count += 1;
                }
                (Kind::Refund, Some(Direction::Out)) => t.refunds_paid_minor += amount,
                (Kind::Refund, _) => t.refunds_received_minor += amount,
                (Kind::Reversal, Some(Direction::Out)) => t.reversals_out_minor += amount,
                (Kind::Reversal, _) => t.reversals_in_minor += amount,
                (Kind::Pledge, _) => {
                    pledges.insert(r.id, amount);
                }
                (Kind::Commitment, _) => {
                    bills.insert(r.id, amount);
                }
                (Kind::Transfer | Kind::Personal, _) => {}
            }
        }
        for r in records {
            if let Some(link) = r.related_transaction_id {
                match r.kind {
                    Kind::Contribution => {
                        if let Some(left) = pledges.get_mut(&link) {
                            *left -= r.amount_minor;
                        }
                    }
                    Kind::Expense => {
                        if let Some(left) = bills.get_mut(&link) {
                            *left -= r.amount_minor;
                        }
                    }
                    _ => {}
                }
            }
        }
        t.pledged_outstanding_minor = pledges.values().map(|v| (*v).max(0)).sum();
        t.unpaid_bills_minor = bills.values().map(|v| (*v).max(0)).sum();
        t.remaining_minor =
            t.opening_funds_minor + t.contributions_minor + t.refunds_received_minor + t.reversals_in_minor
                - t.expenses_minor
                - t.charges_minor
                - t.refunds_paid_minor
                - t.reversals_out_minor;
        t
    }
}

/// Where a pledge stands, from the money received and linked to it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PledgeStatus {
    /// Nothing received yet.
    Pledged,
    PartReceived,
    Received,
}

/// One pledge with what has come in against it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PledgeProgress {
    pub id: i64,
    pub pledged_by: PledgedBy,
    pub amount_minor: i64,
    /// Contributions linked to the pledge (may exceed the pledge).
    pub received_minor: i64,
    pub status: PledgeStatus,
}

/// Every current pledge, oldest first, with what has been received against it.
pub fn pledge_progress(records: &[FundraiserRecord]) -> Vec<PledgeProgress> {
    let mut received: BTreeMap<i64, i64> = BTreeMap::new();
    for r in records.iter().filter(|r| r.kind == Kind::Contribution) {
        if let Some(link) = r.related_transaction_id {
            *received.entry(link).or_default() += r.amount_minor;
        }
    }
    records
        .iter()
        .filter(|r| r.kind == Kind::Pledge)
        .map(|r| {
            let got = received.get(&r.id).copied().unwrap_or(0);
            PledgeProgress {
                id: r.id,
                pledged_by: r.pledged_by.unwrap_or(PledgedBy::Friends),
                amount_minor: r.amount_minor,
                received_minor: got,
                status: match got {
                    0 => PledgeStatus::Pledged,
                    g if g < r.amount_minor => PledgeStatus::PartReceived,
                    _ => PledgeStatus::Received,
                },
            }
        })
        .collect()
}

/// Pledges by one group, added up.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct PledgeGroup {
    pub count: i64,
    pub pledged_minor: i64,
    /// Money received against these pledges.
    pub received_minor: i64,
    /// Still promised: each pledge's unpaid part, never below zero.
    pub outstanding_minor: i64,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct PledgeTotals {
    pub family: PledgeGroup,
    pub friends: PledgeGroup,
}

pub fn pledge_totals(progress: &[PledgeProgress]) -> PledgeTotals {
    let mut totals = PledgeTotals::default();
    for p in progress {
        let group = match p.pledged_by {
            PledgedBy::Family => &mut totals.family,
            PledgedBy::Friends => &mut totals.friends,
        };
        group.count += 1;
        group.pledged_minor += p.amount_minor;
        group.received_minor += p.received_minor;
        group.outstanding_minor += (p.amount_minor - p.received_minor).max(0);
    }
    totals
}

/// What one challenge has brought in. Its money is part of the fundraiser's
/// totals already; this only adds up the records linked to the challenge.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct ChallengeTotals {
    pub raised_minor: i64,
    pub contributions_count: i64,
    pub pledged_minor: i64,
    /// Pledged through the challenge and not yet received.
    pub pledged_outstanding_minor: i64,
    /// UTC instant of the latest money received through it.
    pub last_received_at: Option<String>,
    /// For a challenge that keeps its own money: what its account still holds,
    /// owed to the main fund until handed over.
    pub held_minor: Option<i64>,
    /// For a challenge that keeps its own money: what it has handed over to the
    /// fundraiser's other accounts.
    pub handed_over_minor: Option<i64>,
}

/// Every challenge's kitty, from the money received and pledged through it.
pub fn challenge_totals(records: &[FundraiserRecord]) -> BTreeMap<i64, ChallengeTotals> {
    let mut by_challenge: BTreeMap<i64, ChallengeTotals> = BTreeMap::new();
    for r in records {
        let Some(challenge) = r.challenge_id else { continue };
        let t = by_challenge.entry(challenge).or_default();
        match r.kind {
            Kind::Contribution => {
                t.raised_minor += r.amount_minor;
                t.contributions_count += 1;
                if t.last_received_at.as_deref().is_none_or(|last| r.occurred_at.as_str() > last) {
                    t.last_received_at = Some(r.occurred_at.clone());
                }
            }
            Kind::Pledge => t.pledged_minor += r.amount_minor,
            _ => {}
        }
    }
    for p in pledge_progress(records) {
        let challenge = records.iter().find(|r| r.id == p.id).and_then(|r| r.challenge_id);
        if let Some(t) = challenge.and_then(|c| by_challenge.get_mut(&c)) {
            t.pledged_outstanding_minor += (p.amount_minor - p.received_minor).max(0);
        }
    }
    by_challenge
}

/// A challenge's own account: what it holds now, and what it has handed over to
/// the fundraiser's other accounts (transfers out of it).
pub fn kitty(records: &[FundraiserRecord], account: i64) -> (i64, i64) {
    let held = funds_by_account(records, None).get(&account).copied().unwrap_or(0);
    let handed_over = records
        .iter()
        .filter(|r| r.kind == Kind::Transfer && r.account_id == Some(account) && r.to_account_id != Some(account))
        .map(|r| r.amount_minor)
        .sum();
    (held, handed_over)
}

/// Where the fundraiser's money is, per account. Transfers move it between
/// accounts without changing the total.
pub fn funds_by_account(records: &[FundraiserRecord], opening: Option<(i64, i64)>) -> BTreeMap<i64, i64> {
    let mut by_account: BTreeMap<i64, i64> = BTreeMap::new();
    if let Some((account, amount)) = opening {
        *by_account.entry(account).or_default() += amount;
    }
    for r in records {
        let Some(account) = r.account_id else { continue };
        match r.kind {
            Kind::Transfer => {
                *by_account.entry(account).or_default() -= r.amount_minor;
                if let Some(to) = r.to_account_id {
                    *by_account.entry(to).or_default() += r.amount_minor;
                }
            }
            kind if kind.affects_fundraiser_totals() => {
                let signed = match r.direction {
                    Some(Direction::In) => r.amount_minor,
                    _ => -r.amount_minor,
                };
                *by_account.entry(account).or_default() += signed;
            }
            _ => {}
        }
    }
    by_account
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec(id: i64, kind: Kind, direction: Option<Direction>, amount: i64) -> FundraiserRecord {
        FundraiserRecord {
            id,
            kind,
            direction,
            amount_minor: amount,
            occurred_at: "2024-06-01T00:00:00Z".into(),
            account_id: if kind.moves_money() { Some(1) } else { None },
            to_account_id: if kind == Kind::Transfer { Some(2) } else { None },
            reference: None,
            related_transaction_id: None,
            public_name: None,
            description: String::new(),
            pledged_by: None,
            challenge_id: None,
            matched: false,
        }
    }

    #[test]
    fn remaining_funds_follow_the_rules() {
        let mut fulfilled = rec(6, Kind::Contribution, Some(Direction::In), 30_000);
        fulfilled.related_transaction_id = Some(5);
        let records = vec![
            rec(1, Kind::Contribution, Some(Direction::In), 100_000),
            rec(2, Kind::Expense, Some(Direction::Out), 40_000),
            rec(3, Kind::Charge, Some(Direction::Out), 1_300),
            rec(4, Kind::Transfer, Some(Direction::Out), 20_000),
            rec(5, Kind::Pledge, None, 50_000),
            fulfilled,
            rec(7, Kind::Refund, Some(Direction::Out), 5_000),
            rec(8, Kind::Commitment, None, 9_000),
        ];
        let t = Totals::from_records(&records, 10_000);
        assert_eq!(t.contributions_minor, 130_000);
        assert_eq!(t.expenses_minor, 40_000);
        assert_eq!(t.charges_minor, 1_300);
        assert_eq!(t.refunds_paid_minor, 5_000);
        // The transfer, the pledge and the unpaid bill change nothing.
        assert_eq!(t.remaining_minor, 10_000 + 130_000 - 40_000 - 1_300 - 5_000);
        assert_eq!(t.pledged_outstanding_minor, 20_000);
        assert_eq!(t.unpaid_bills_minor, 9_000);

        let places = funds_by_account(&records, Some((1, 10_000)));
        assert_eq!(places.values().sum::<i64>(), t.remaining_minor);
        assert_eq!(places[&2], 20_000);
    }

    #[test]
    fn a_challenge_is_a_view_of_the_main_totals() {
        let in_challenge = |mut r: FundraiserRecord| {
            r.challenge_id = Some(9);
            r
        };
        let mut paid = in_challenge(rec(4, Kind::Contribution, Some(Direction::In), 2_000));
        paid.related_transaction_id = Some(3);
        paid.occurred_at = "2024-06-03T00:00:00Z".into();
        let records = vec![
            rec(1, Kind::Contribution, Some(Direction::In), 10_000),
            in_challenge(rec(2, Kind::Contribution, Some(Direction::In), 500)),
            in_challenge(rec(3, Kind::Pledge, None, 5_000)),
            paid,
            // Linked by mistake to something that is not money received: ignored.
            in_challenge(rec(5, Kind::Expense, Some(Direction::Out), 700)),
        ];
        let kitty = &challenge_totals(&records)[&9];
        assert_eq!((kitty.raised_minor, kitty.contributions_count), (2_500, 2));
        assert_eq!((kitty.pledged_minor, kitty.pledged_outstanding_minor), (5_000, 3_000));
        assert_eq!(kitty.last_received_at.as_deref(), Some("2024-06-03T00:00:00Z"));
        // The same money counts once in the fundraiser's totals.
        assert_eq!(Totals::from_records(&records, 0).contributions_minor, 12_500);
    }
}
