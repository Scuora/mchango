//! The cashbook: canonical transactions and the rules for what they mean.
//!
//! A transaction has a stable identity (`transactions`) holding presentation
//! fields, and one or more versions (`transaction_versions`) holding financial
//! values. Corrections add a version; only the current version counts.

mod store;
pub mod totals;

pub use store::*;

use serde::{Deserialize, Serialize};

use crate::clock;
use crate::error::{AppError, AppResult};
use crate::money::Amount;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(rename_all = "snake_case")]
pub enum Kind {
    /// Money received for the fundraiser.
    Contribution,
    /// Money actually paid out for the fundraiser.
    Expense,
    /// A transaction fee on fundraiser money.
    Charge,
    /// Money returned to a contributor (out) or by a supplier (in).
    Refund,
    /// A provider reversal of an earlier movement.
    Reversal,
    /// Fundraiser money moved between its own accounts, e.g. a withdrawal to cash.
    Transfer,
    /// Not fundraiser money. Kept to explain an account's balance only.
    Personal,
    /// A promise to contribute. No money has moved.
    Pledge,
    /// A bill or commitment not yet paid. No money has moved.
    Commitment,
}

impl Kind {
    pub fn moves_money(self) -> bool {
        !matches!(self, Kind::Pledge | Kind::Commitment)
    }

    /// Counts towards fundraiser totals (transfers move money between the
    /// fundraiser's own accounts and change no total).
    pub fn affects_fundraiser_totals(self) -> bool {
        !matches!(self, Kind::Personal | Kind::Transfer | Kind::Pledge | Kind::Commitment)
    }

    pub fn label(self) -> &'static str {
        match self {
            Kind::Contribution => "Money received",
            Kind::Expense => "Money spent",
            Kind::Charge => "Charges",
            Kind::Refund => "Refund",
            Kind::Reversal => "Reversal",
            Kind::Transfer => "Transfer between accounts",
            Kind::Personal => "Personal",
            Kind::Pledge => "Pledge",
            Kind::Commitment => "Unpaid bill",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(rename_all = "snake_case")]
pub enum Direction {
    In,
    Out,
}

impl Direction {
    pub fn opposite(self) -> Self {
        match self {
            Direction::In => Direction::Out,
            Direction::Out => Direction::In,
        }
    }
}

/// Financial details of a transaction, as sent by the client for a new record
/// or a correction.
#[derive(Debug, Clone, Deserialize)]
pub struct MovementInput {
    pub kind: Kind,
    #[serde(default)]
    pub direction: Option<Direction>,
    pub amount_minor: Amount,
    /// RFC 3339 with an offset, e.g. `2024-06-02T10:15:00+03:00`.
    pub occurred_at: String,
    #[serde(default)]
    pub account_id: Option<i64>,
    #[serde(default)]
    pub to_account_id: Option<i64>,
    #[serde(default)]
    pub reference: Option<String>,
    #[serde(default)]
    pub is_fee: bool,
    #[serde(default)]
    pub related_transaction_id: Option<i64>,
    #[serde(default)]
    pub counterparty: Option<String>,
}

/// A movement after validation: every rule in this module holds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Movement {
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
}

impl MovementInput {
    /// Checks the rules that do not need the database.
    pub fn validate(self) -> AppResult<Movement> {
        let kind = self.kind;
        let occurred = clock::parse_instant(&self.occurred_at)
            .ok_or_else(|| AppError::field("occurred_at", "Enter the transaction date and time."))?;
        if occurred > clock::now() + time::Duration::days(1) {
            return Err(AppError::field("occurred_at", "The transaction time is in the future."));
        }
        if occurred.year() < 2007 {
            return Err(AppError::field("occurred_at", "The transaction date looks wrong."));
        }

        let direction = match kind {
            Kind::Contribution => {
                if self.direction == Some(Direction::Out) {
                    return Err(AppError::field("direction", "Money received always comes in."));
                }
                Some(Direction::In)
            }
            Kind::Expense | Kind::Charge | Kind::Transfer => {
                if self.direction == Some(Direction::In) {
                    return Err(AppError::field("direction", "This type of record is money going out."));
                }
                Some(Direction::Out)
            }
            Kind::Refund | Kind::Reversal | Kind::Personal => Some(
                self.direction
                    .ok_or_else(|| AppError::field("direction", "Choose whether the money came in or went out."))?,
            ),
            Kind::Pledge | Kind::Commitment => None,
        };

        let (account_id, to_account_id) = match kind {
            Kind::Pledge | Kind::Commitment => (None, None),
            Kind::Transfer => {
                let from = self
                    .account_id
                    .ok_or_else(|| AppError::field("account_id", "Choose where the money came from."))?;
                let to = self
                    .to_account_id
                    .ok_or_else(|| AppError::field("to_account_id", "Choose where the money went."))?;
                if from == to {
                    return Err(AppError::field("to_account_id", "A transfer needs two different accounts."));
                }
                (Some(from), Some(to))
            }
            _ => (Some(self.account_id.ok_or_else(|| AppError::field("account_id", "Choose the account."))?), None),
        };

        let is_fee = match kind {
            Kind::Charge => true,
            Kind::Personal | Kind::Reversal => self.is_fee,
            _ => false,
        };

        let reference = match self.reference.as_deref().map(str::trim).filter(|r| !r.is_empty()) {
            None => None,
            Some(_) if !kind.moves_money() => {
                return Err(AppError::field("reference", "Pledges and unpaid bills have no transaction reference."));
            }
            Some(r) => {
                let r = r.to_ascii_uppercase();
                if !(6..=20).contains(&r.len()) || !r.bytes().all(|b| b.is_ascii_alphanumeric()) {
                    return Err(AppError::field(
                        "reference",
                        "A reference is 6–20 letters and digits, e.g. SFK7ABC123.",
                    ));
                }
                Some(r)
            }
        };

        let counterparty = clean_optional(self.counterparty, 200, "counterparty")?;

        Ok(Movement {
            kind,
            direction,
            amount_minor: self.amount_minor.minor(),
            occurred_at: clock::format_instant(occurred),
            account_id,
            to_account_id,
            reference,
            is_fee,
            related_transaction_id: self.related_transaction_id,
            counterparty,
        })
    }
}

/// Who made a pledge. The family's pledges are its share of the target; the
/// rest is asked of friends and well-wishers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(rename_all = "snake_case")]
pub enum PledgedBy {
    Family,
    Friends,
}

/// Fields shown publicly or kept as private notes. Editing them never changes
/// a financial value or statement evidence.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct Presentation {
    /// `None` shows the fundraiser's anonymous label.
    #[serde(default)]
    pub public_name: Option<String>,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub notes: String,
    /// Pledges only; other records ignore it.
    #[serde(default)]
    pub pledged_by: Option<PledgedBy>,
}

impl Presentation {
    pub fn validate(self) -> AppResult<Presentation> {
        let public_name = clean_optional(self.public_name, 80, "public_name")?;
        let description = self.description.trim().to_string();
        if description.chars().count() > 500 {
            return Err(AppError::field("description", "Keep the description under 500 characters."));
        }
        let notes = self.notes.trim().to_string();
        if notes.chars().count() > 4000 {
            return Err(AppError::field("notes", "Keep notes under 4,000 characters."));
        }
        Ok(Presentation { public_name, description, notes, pledged_by: self.pledged_by })
    }
}

fn clean_optional(value: Option<String>, max: usize, field: &'static str) -> AppResult<Option<String>> {
    let Some(value) = value else { return Ok(None) };
    let value = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if value.is_empty() {
        return Ok(None);
    }
    if value.chars().count() > max {
        return Err(AppError::field(field, format!("Keep this under {max} characters.")));
    }
    Ok(Some(value))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(kind: Kind) -> MovementInput {
        MovementInput {
            kind,
            direction: None,
            amount_minor: Amount::try_from(1000).unwrap(),
            occurred_at: "2024-06-02T10:15:00+03:00".into(),
            account_id: Some(1),
            to_account_id: None,
            reference: Some(" sfk7abc123 ".into()),
            is_fee: false,
            related_transaction_id: None,
            counterparty: None,
        }
    }

    #[test]
    fn contribution_defaults_to_money_in() {
        let m = input(Kind::Contribution).validate().unwrap();
        assert_eq!(m.direction, Some(Direction::In));
        assert_eq!(m.reference.as_deref(), Some("SFK7ABC123"));
        assert_eq!(m.occurred_at, "2024-06-02T07:15:00Z");
    }

    #[test]
    fn refunds_need_a_direction() {
        assert!(input(Kind::Refund).validate().is_err());
    }

    #[test]
    fn transfers_need_two_accounts() {
        let mut i = input(Kind::Transfer);
        assert!(i.clone().validate().is_err());
        i.to_account_id = Some(1);
        assert!(i.clone().validate().is_err());
        i.to_account_id = Some(2);
        assert_eq!(i.validate().unwrap().direction, Some(Direction::Out));
    }

    #[test]
    fn pledges_have_no_account() {
        let mut i = input(Kind::Pledge);
        i.reference = None;
        let m = i.validate().unwrap();
        assert_eq!(m.account_id, None);
        assert_eq!(m.direction, None);
    }
}
