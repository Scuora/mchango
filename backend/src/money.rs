//! Money is held as integer minor units of KES (cents): KES 1,250.50 = 125050.
//!
//! No floating point is used anywhere in parsing, storage or arithmetic.

use serde::{Deserialize, Serialize};
use std::fmt;

/// Largest single amount accepted: KES 100,000,000.00.
pub const MAX_AMOUNT_MINOR: i64 = 10_000_000_000;

/// A positive amount within the accepted limit, in minor units.
///
/// Serialises as a plain JSON integer. Deserialising rejects zero, negative
/// and out-of-range values so handlers never see an invalid amount.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(try_from = "i64", into = "i64")]
pub struct Amount(i64);

impl Amount {
    pub fn minor(self) -> i64 {
        self.0
    }
}

impl TryFrom<i64> for Amount {
    type Error = MoneyError;

    fn try_from(value: i64) -> Result<Self, Self::Error> {
        if value <= 0 {
            Err(MoneyError::NotPositive)
        } else if value > MAX_AMOUNT_MINOR {
            Err(MoneyError::TooLarge)
        } else {
            Ok(Amount(value))
        }
    }
}

impl From<Amount> for i64 {
    fn from(value: Amount) -> Self {
        value.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MoneyError {
    Empty,
    Malformed,
    TooManyDecimals,
    NotPositive,
    TooLarge,
}

impl fmt::Display for MoneyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            MoneyError::Empty => "Enter an amount.",
            MoneyError::Malformed => "Use digits with an optional decimal point, e.g. 1,250.50.",
            MoneyError::TooManyDecimals => "Use at most two decimal places.",
            MoneyError::NotPositive => "The amount must be more than zero.",
            MoneyError::TooLarge => "The amount is larger than KES 100,000,000.00.",
        })
    }
}

/// Parses a non-negative decimal KES amount such as `1,250.50`, `1250.5`,
/// `Ksh1,000.00` or `KES 20` into minor units.
///
/// Thousands separators are optional but, when used, must group digits in
/// threes. At most two decimal places are accepted; nothing is rounded.
pub fn parse_decimal(input: &str) -> Result<i64, MoneyError> {
    let mut s = input.trim();
    for prefix in ["KSHS", "Kshs", "KES", "Kes", "kes", "KSH", "Ksh", "ksh"] {
        if let Some(rest) = s.strip_prefix(prefix) {
            s = rest.trim_start_matches('.').trim_start();
            break;
        }
    }
    if s.is_empty() {
        return Err(MoneyError::Empty);
    }

    let (whole, fraction) = match s.split_once('.') {
        Some((w, f)) => (w, Some(f)),
        None => (s, None),
    };
    if whole.is_empty() {
        return Err(MoneyError::Malformed);
    }

    let digits: String = if whole.contains(',') {
        let mut groups = whole.split(',');
        let first = groups.next().unwrap_or_default();
        if first.is_empty() || first.len() > 3 || !first.bytes().all(|b| b.is_ascii_digit()) {
            return Err(MoneyError::Malformed);
        }
        let mut digits = first.to_string();
        for group in groups {
            if group.len() != 3 || !group.bytes().all(|b| b.is_ascii_digit()) {
                return Err(MoneyError::Malformed);
            }
            digits.push_str(group);
        }
        digits
    } else {
        if !whole.bytes().all(|b| b.is_ascii_digit()) {
            return Err(MoneyError::Malformed);
        }
        whole.to_string()
    };

    // 12 digits of shillings is far above the limit and cannot overflow i64.
    let digits = digits.trim_start_matches('0');
    if digits.len() > 12 {
        return Err(MoneyError::TooLarge);
    }
    let shillings: i64 = if digits.is_empty() { 0 } else { digits.parse().map_err(|_| MoneyError::Malformed)? };

    let cents: i64 = match fraction {
        None => 0,
        Some(f) if f.is_empty() || !f.bytes().all(|b| b.is_ascii_digit()) => {
            return Err(MoneyError::Malformed);
        }
        Some(f) if f.len() > 2 => return Err(MoneyError::TooManyDecimals),
        Some(f) if f.len() == 1 => f.parse::<i64>().map_err(|_| MoneyError::Malformed)? * 10,
        Some(f) => f.parse::<i64>().map_err(|_| MoneyError::Malformed)?,
    };

    shillings.checked_mul(100).and_then(|v| v.checked_add(cents)).ok_or(MoneyError::TooLarge)
}

/// Parses user input into a valid [`Amount`].
pub fn parse_amount(input: &str) -> Result<Amount, MoneyError> {
    Amount::try_from(parse_decimal(input)?)
}

/// Formats minor units as `KES 1,250.50` (negative values as `-KES 1,250.50`).
pub fn format_kes(minor: i64) -> String {
    let sign = if minor < 0 { "-" } else { "" };
    let abs = minor.unsigned_abs();
    let whole = (abs / 100).to_string();
    let cents = abs % 100;
    let mut grouped = String::with_capacity(whole.len() + whole.len() / 3);
    for (i, ch) in whole.chars().enumerate() {
        if i > 0 && (whole.len() - i).is_multiple_of(3) {
            grouped.push(',');
        }
        grouped.push(ch);
    }
    format!("{sign}KES {grouped}.{cents:02}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Deserialize)]
    struct Vectors {
        valid: Vec<(String, i64)>,
        invalid: Vec<String>,
        format: Vec<(i64, String)>,
    }

    /// The same vectors are checked by the TypeScript implementation.
    #[test]
    fn shared_vectors() {
        let vectors: Vectors = serde_json::from_str(include_str!("../../docs/money-test-vectors.json")).unwrap();
        for (input, expected) in vectors.valid {
            assert_eq!(parse_amount(&input).map(Amount::minor), Ok(expected), "input {input:?}");
        }
        for input in vectors.invalid {
            assert!(parse_amount(&input).is_err(), "input {input:?} should be rejected");
        }
        for (minor, expected) in vectors.format {
            assert_eq!(format_kes(minor), expected);
        }
    }

    #[test]
    fn amount_rejects_out_of_range_json() {
        assert!(serde_json::from_str::<Amount>("0").is_err());
        assert!(serde_json::from_str::<Amount>("-5").is_err());
        assert!(serde_json::from_str::<Amount>("10000000001").is_err());
        assert!(serde_json::from_str::<Amount>("12.5").is_err());
        assert_eq!(serde_json::from_str::<Amount>("125050").unwrap().minor(), 125050);
    }
}
