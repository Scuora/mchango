//! Deterministic parsing of M-Pesa confirmation messages (Kenya).
//!
//! Supported formats are listed in `docs/formats.md`. The parser proposes
//! values; nothing is saved until the person confirms them. When a value cannot
//! be read with certainty it is left empty and flagged, never guessed.

use regex::Regex;
use serde::Serialize;
use std::sync::LazyLock;
use time::{Date, Month, Time};

use crate::clock;
use crate::money;
use crate::transactions::{Direction, Kind};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageFormat {
    Received,
    Sent,
    PayBill,
    BuyGoods,
    Withdrawal,
    Deposit,
    Airtime,
    Reversal,
}

impl MessageFormat {
    fn label(self) -> &'static str {
        match self {
            MessageFormat::Received => "Money received",
            MessageFormat::Sent => "Money sent to a person",
            MessageFormat::PayBill => "Pay Bill payment",
            MessageFormat::BuyGoods => "Buy Goods (till) payment",
            MessageFormat::Withdrawal => "Cash withdrawal at an agent",
            MessageFormat::Deposit => "Cash deposit at an agent",
            MessageFormat::Airtime => "Airtime purchase",
            MessageFormat::Reversal => "Reversal",
        }
    }
}

/// A proposed value. `certain` is false when the person must check it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Field<T> {
    pub value: Option<T>,
    pub certain: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

impl<T> Field<T> {
    fn sure(value: T) -> Self {
        Field { value: Some(value), certain: true, note: None }
    }
    fn missing(note: &str) -> Self {
        Field { value: None, certain: false, note: Some(note.to_string()) }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ParsedMessage {
    pub recognised: bool,
    pub format: Option<MessageFormat>,
    pub format_label: String,
    pub reference: Field<String>,
    /// UTC RFC 3339.
    pub occurred_at: Field<String>,
    pub amount_minor: Field<i64>,
    pub direction: Field<Direction>,
    /// `value: None, certain: true` means the message states no charge.
    pub charge_minor: Field<i64>,
    pub suggested_kind: Option<Kind>,
    /// Private: name and number as written in the message.
    pub counterparty: Option<String>,
    /// The name part only, offered as an optional public name.
    pub counterparty_name: Option<String>,
    pub original_reference: Option<String>,
    pub warnings: Vec<String>,
}

const AMOUNT: &str = r"(?:Ksh|KES)\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)";

fn re(pattern: &str) -> Regex {
    Regex::new(pattern).expect("valid built-in pattern")
}

static REFERENCE: LazyLock<Regex> = LazyLock::new(|| re(r"^([A-Z0-9]{10})\s*(?i:confirmed)"));
static WHEN: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?i)\bon\s+(\d{1,2})/(\d{1,2})/(\d{2}|\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*([AP]M)"));
static RECEIVED: LazyLock<Regex> = LazyLock::new(|| re(&format!(r"(?i)you have received {AMOUNT} from (.+?) on \d")));
static PAYBILL: LazyLock<Regex> = LazyLock::new(|| re(&format!(r"(?i){AMOUNT} sent to (.+?) for account (.+?) on \d")));
static SENT: LazyLock<Regex> = LazyLock::new(|| re(&format!(r"(?i){AMOUNT} sent to (.+?) on \d")));
static BUY_GOODS: LazyLock<Regex> = LazyLock::new(|| re(&format!(r"(?i){AMOUNT} paid to (.+?)\.? on \d")));
static WITHDRAW: LazyLock<Regex> =
    LazyLock::new(|| re(&format!(r"(?i)withdraw {AMOUNT} from (.+?)\s*(?:New M-PESA|\.\s|$)")));
static DEPOSIT: LazyLock<Regex> =
    LazyLock::new(|| re(&format!(r"(?i)give {AMOUNT} cash to (.+?)\s*(?:New M-PESA|\.\s|$)")));
static AIRTIME: LazyLock<Regex> = LazyLock::new(|| re(&format!(r"(?i)you bought {AMOUNT} of airtime")));
static REVERSAL_AMOUNT: LazyLock<Regex> =
    LazyLock::new(|| re(&format!(r"(?i){AMOUNT} (?:is|has been) (credited|debited)")));
static REVERSED_REF: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?i)(?:transaction|reversal of)\s+([A-Z0-9]{10})\b|\b([A-Z0-9]{10}) has been reversed"));
static COST: LazyLock<Regex> = LazyLock::new(|| re(&format!(r"(?i)transaction cost,?\s*{AMOUNT}")));
static COST_MENTION: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)transaction cost"));
static PHONE_TAIL: LazyLock<Regex> =
    LazyLock::new(|| re(r"^(.*?)\s*((?:\+?254|0)[17]\d{8}|(?:\+?254|0)[17][\d*]{8}|\d{5,7})$"));

pub fn parse(message: &str) -> ParsedMessage {
    let text = message.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut parsed = ParsedMessage {
        recognised: false,
        format: None,
        format_label: "Unrecognised message".into(),
        reference: Field::missing("Enter the M-Pesa reference."),
        occurred_at: Field::missing("Enter the date and time."),
        amount_minor: Field::missing("Enter the amount."),
        direction: Field::missing("Choose money in or out."),
        charge_minor: Field { value: None, certain: true, note: None },
        suggested_kind: None,
        counterparty: None,
        counterparty_name: None,
        original_reference: None,
        warnings: Vec::new(),
    };

    if let Some(c) = REFERENCE.captures(&text) {
        parsed.reference = Field::sure(c[1].to_string());
    }
    if let Some(c) = WHEN.captures(&text) {
        match nairobi_time(&c[1], &c[2], &c[3], &c[4], &c[5], &c[6]) {
            Some(at) => parsed.occurred_at = Field::sure(at),
            None => parsed.occurred_at = Field::missing("The date in the message is not valid; enter it."),
        }
    }

    // A reversal notice can quote the original wording, so it is checked first.
    // Other formats are tried from most to least specific.
    let is_reversal = text.to_ascii_lowercase().contains("revers");
    let matched = if is_reversal {
        None
    } else if let Some(c) = RECEIVED.captures(&text) {
        Some((MessageFormat::Received, c[1].to_string(), Some(c[2].to_string())))
    } else if let Some(c) = PAYBILL.captures(&text) {
        Some((MessageFormat::PayBill, c[1].to_string(), Some(format!("{} (account {})", &c[2], &c[3]))))
    } else if let Some(c) = SENT.captures(&text) {
        Some((MessageFormat::Sent, c[1].to_string(), Some(c[2].to_string())))
    } else if let Some(c) = BUY_GOODS.captures(&text) {
        Some((MessageFormat::BuyGoods, c[1].to_string(), Some(c[2].trim_end_matches('.').to_string())))
    } else if let Some(c) = WITHDRAW.captures(&text) {
        Some((MessageFormat::Withdrawal, c[1].to_string(), Some(c[2].to_string())))
    } else if let Some(c) = DEPOSIT.captures(&text) {
        Some((MessageFormat::Deposit, c[1].to_string(), Some(c[2].to_string())))
    } else {
        AIRTIME.captures(&text).map(|c| (MessageFormat::Airtime, c[1].to_string(), None))
    };

    if let Some((format, amount, party)) = matched {
        parsed.recognised = true;
        parsed.format = Some(format);
        parsed.format_label = format.label().into();
        parsed.amount_minor = amount_field(&amount);
        let (direction, kind) = match format {
            MessageFormat::Received => (Direction::In, Kind::Contribution),
            MessageFormat::Deposit => (Direction::In, Kind::Transfer),
            MessageFormat::Withdrawal => (Direction::Out, Kind::Transfer),
            _ => (Direction::Out, Kind::Expense),
        };
        parsed.direction = Field::sure(direction);
        parsed.suggested_kind = Some(kind);
        if let Some(party) = party {
            let party = party.trim().to_string();
            parsed.counterparty_name = Some(split_phone(&party).0);
            parsed.counterparty = Some(party);
        }
    } else if is_reversal {
        parsed.format = Some(MessageFormat::Reversal);
        parsed.format_label = MessageFormat::Reversal.label().into();
        parsed.suggested_kind = Some(Kind::Reversal);
        if let Some(c) = REVERSED_REF.captures(&text) {
            parsed.original_reference = c.get(1).or_else(|| c.get(2)).map(|m| m.as_str().to_string());
        }
        match REVERSAL_AMOUNT.captures(&text) {
            Some(c) => {
                parsed.recognised = true;
                parsed.amount_minor = amount_field(&c[1]);
                let credited = c[2].eq_ignore_ascii_case("credited");
                parsed.direction = Field::sure(if credited { Direction::In } else { Direction::Out });
            }
            None => parsed
                .warnings
                .push("This looks like a reversal, but the amount and direction could not be read. Enter them from the message.".into()),
        }
        if parsed.original_reference.is_none() {
            parsed.warnings.push("Link this reversal to the original transaction if you can.".into());
        }
    } else {
        parsed.warnings.push(
            "This message format is not recognised. Fill in the details yourself; the message will still be saved as evidence.".into(),
        );
    }

    if let Some(c) = COST.captures(&text) {
        match money::parse_decimal(&c[1]) {
            Ok(0) => {}
            Ok(cost) => parsed.charge_minor = Field::sure(cost),
            Err(_) => parsed.charge_minor = Field::missing("The transaction cost could not be read; enter it."),
        }
    } else if COST_MENTION.is_match(&text) {
        parsed.charge_minor = Field::missing("The transaction cost could not be read; enter it.");
    }

    if parsed.recognised && !parsed.reference.certain {
        parsed.warnings.push("No reference was found at the start of the message.".into());
    }
    if parsed.recognised && !parsed.occurred_at.certain {
        parsed.warnings.push("No date and time were found in the message.".into());
    }
    parsed
}

fn amount_field(raw: &str) -> Field<i64> {
    match money::parse_amount(raw) {
        Ok(a) => Field::sure(a.minor()),
        Err(e) => Field::missing(&format!("The amount could not be read ({e}). Enter it.")),
    }
}

/// Splits "JOHN DOE 0712345678" into the name and the number.
fn split_phone(party: &str) -> (String, Option<String>) {
    match PHONE_TAIL.captures(party) {
        Some(c) if !c[1].is_empty() => (c[1].trim().to_string(), Some(c[2].to_string())),
        _ => (party.to_string(), None),
    }
}

fn nairobi_time(d: &str, m: &str, y: &str, h: &str, min: &str, ampm: &str) -> Option<String> {
    let day: u8 = d.parse().ok()?;
    let month: u8 = m.parse().ok()?;
    let mut year: i32 = y.parse().ok()?;
    if y.len() == 2 {
        year += 2000;
    }
    let mut hour: u8 = h.parse().ok()?;
    let minute: u8 = min.parse().ok()?;
    if !(1..=12).contains(&hour) {
        return None;
    }
    let pm = ampm.eq_ignore_ascii_case("pm");
    hour = match (hour, pm) {
        (12, false) => 0,
        (12, true) => 12,
        (h, true) => h + 12,
        (h, false) => h,
    };
    let date = Date::from_calendar_date(year, Month::try_from(month).ok()?, day).ok()?;
    let time = Time::from_hms(hour, minute, 0).ok()?;
    Some(clock::format_instant(clock::nairobi_local(date, time)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn received_money() {
        let p = parse(
            "SFK7ABC123 Confirmed.You have received Ksh1,500.00 from JOHN DOE 0712345678 on 2/6/24 at 10:15 AM  New M-PESA balance is Ksh5,000.00. Separate personal and business funds through Pochi la Biashara on *334#.",
        );
        assert!(p.recognised);
        assert_eq!(p.format, Some(MessageFormat::Received));
        assert_eq!(p.reference.value.as_deref(), Some("SFK7ABC123"));
        assert_eq!(p.amount_minor.value, Some(150_000));
        assert_eq!(p.direction.value, Some(Direction::In));
        assert_eq!(p.occurred_at.value.as_deref(), Some("2024-06-02T07:15:00Z"));
        assert_eq!(p.suggested_kind, Some(Kind::Contribution));
        assert_eq!(p.counterparty.as_deref(), Some("JOHN DOE 0712345678"));
        assert_eq!(p.counterparty_name.as_deref(), Some("JOHN DOE"));
        assert_eq!(p.charge_minor.value, None);
        assert!(p.charge_minor.certain);
    }

    #[test]
    fn received_with_masked_number() {
        let p = parse(
            "TJ12AB34CD Confirmed. You have received Ksh250.00 from MARY WANJIKU 0722***456 on 14/11/25 at 9:05 PM. New M-PESA balance is Ksh1,250.00.",
        );
        assert_eq!(p.amount_minor.value, Some(25_000));
        assert_eq!(p.counterparty_name.as_deref(), Some("MARY WANJIKU"));
        assert_eq!(p.occurred_at.value.as_deref(), Some("2025-11-14T18:05:00Z"));
    }

    #[test]
    fn sent_money_with_charge() {
        let p = parse(
            "SFK7ABC124 Confirmed. Ksh1,000.00 sent to JANE DOE 0712345678 on 2/6/24 at 12:20 PM. New M-PESA balance is Ksh3,987.00. Transaction cost, Ksh13.00. Amount you can transact within the day is 499,000.00.",
        );
        assert_eq!(p.format, Some(MessageFormat::Sent));
        assert_eq!(p.amount_minor.value, Some(100_000));
        assert_eq!(p.direction.value, Some(Direction::Out));
        assert_eq!(p.charge_minor.value, Some(1_300));
        assert_eq!(p.occurred_at.value.as_deref(), Some("2024-06-02T09:20:00Z"));
        assert_eq!(p.suggested_kind, Some(Kind::Expense));
    }

    #[test]
    fn paybill() {
        let p = parse(
            "SFK7ABC125 Confirmed. Ksh2,500.00 sent to KPLC PREPAID for account 12345678 on 2/6/24 at 11:00 AM New M-PESA balance is Ksh1,464.00. Transaction cost, Ksh23.00.Amount you can transact within the day is 496,500.00.",
        );
        assert_eq!(p.format, Some(MessageFormat::PayBill));
        assert_eq!(p.counterparty.as_deref(), Some("KPLC PREPAID (account 12345678)"));
        assert_eq!(p.charge_minor.value, Some(2_300));
    }

    #[test]
    fn buy_goods_with_zero_cost() {
        let p = parse(
            "SFK7ABC126 Confirmed. Ksh450.00 paid to NAIVAS SUPERMARKET. on 2/6/24 at 12:30 AM.New M-PESA balance is Ksh1,014.00. Transaction cost, Ksh0.00. Amount you can transact within the day is 499,550.00.",
        );
        assert_eq!(p.format, Some(MessageFormat::BuyGoods));
        assert_eq!(p.counterparty.as_deref(), Some("NAIVAS SUPERMARKET"));
        assert_eq!(p.charge_minor.value, None);
        assert_eq!(p.occurred_at.value.as_deref(), Some("2024-06-01T21:30:00Z"));
    }

    #[test]
    fn withdrawal_is_a_transfer_to_cash() {
        let p = parse(
            "SFK7ABC127 Confirmed.on 2/6/24 at 1:00 PMWithdraw Ksh5,000.00 from 123456 - ABC AGENCIES Shop 1 New M-PESA balance is Ksh485.00. Transaction cost, Ksh29.00. Amount you can transact within the day is 495,000.00.",
        );
        assert_eq!(p.format, Some(MessageFormat::Withdrawal));
        assert_eq!(p.amount_minor.value, Some(500_000));
        assert_eq!(p.suggested_kind, Some(Kind::Transfer));
        assert_eq!(p.charge_minor.value, Some(2_900));
        assert_eq!(p.occurred_at.value.as_deref(), Some("2024-06-02T10:00:00Z"));
    }

    #[test]
    fn deposit() {
        let p = parse(
            "SFK7ABC128 Confirmed. On 2/6/24 at 2:00 PM Give Ksh1,000.00 cash to ABC AGENCIES New M-PESA balance is Ksh1,485.00. You can now access M-PESA via *334#",
        );
        assert_eq!(p.format, Some(MessageFormat::Deposit));
        assert_eq!(p.direction.value, Some(Direction::In));
    }

    #[test]
    fn reversal() {
        let p = parse(
            "SGH1234567 Confirmed. Transaction SFK7ABC124 has been reversed. Ksh1,000.00 is credited to your M-PESA account on 3/6/24 at 8:00 AM. New M-PESA balance is Ksh4,987.00.",
        );
        assert_eq!(p.format, Some(MessageFormat::Reversal));
        assert_eq!(p.original_reference.as_deref(), Some("SFK7ABC124"));
        assert_eq!(p.amount_minor.value, Some(100_000));
        assert_eq!(p.direction.value, Some(Direction::In));
    }

    #[test]
    fn unknown_formats_guess_nothing() {
        let p = parse("SFK7ABC129 Confirmed. Something new happened with Ksh700.00 and Ksh50.00 on 2/6/24 at 3:00 PM.");
        assert!(!p.recognised);
        assert_eq!(p.amount_minor.value, None);
        assert!(!p.amount_minor.certain);
        assert_eq!(p.direction.value, None);
        assert_eq!(p.reference.value.as_deref(), Some("SFK7ABC129"));
        assert!(!p.warnings.is_empty());
    }

    #[test]
    fn invalid_dates_are_flagged() {
        let p = parse(
            "SFK7ABC130 Confirmed.You have received Ksh100.00 from JOHN DOE 0712345678 on 31/2/24 at 10:15 AM New M-PESA balance is Ksh5,000.00.",
        );
        assert_eq!(p.occurred_at.value, None);
        assert!(!p.occurred_at.certain);
    }
}
