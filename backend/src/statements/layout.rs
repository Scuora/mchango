//! Reads the text of an M-Pesa customer statement ("M-PESA STATEMENT" with a
//! "DETAILED STATEMENT" table), as produced by `pdftotext -layout`.
//!
//! Supported layout: one row per transaction with the columns
//! Receipt No. | Completion Time | Details | Transaction Status | Paid In | Withdrawn | Balance.
//! Charges appear as their own rows sharing the payment's receipt number.
//! Wrapped Details text is joined to the row above it.

use regex::Regex;
use std::sync::LazyLock;
use time::{Date, Time};

use crate::clock;
use crate::money;
use crate::transactions::Direction;

pub const LAYOUT_ID: &str = "mpesa-customer-statement-v1";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedRow {
    pub position: i64,
    pub page: i64,
    pub receipt: String,
    /// UTC RFC 3339.
    pub completed_at: String,
    pub details: String,
    pub row_status: Option<String>,
    pub direction: Option<Direction>,
    pub amount_minor: Option<i64>,
    pub balance_minor: Option<i64>,
    pub is_fee: bool,
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedStatement {
    pub holder_name: Option<String>,
    pub holder_number: Option<String>,
    pub period_start: Date,
    pub period_end: Date,
    /// In the order printed on the statement.
    pub rows: Vec<ParsedRow>,
    pub opening_balance_minor: Option<i64>,
    pub closing_balance_minor: Option<i64>,
    /// Rows whose balance does not follow from the row before.
    pub balance_breaks: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LayoutError {
    NoText,
    NotMpesaStatement,
    NoPeriod,
    NoRows,
}

impl LayoutError {
    pub fn code(self) -> &'static str {
        match self {
            LayoutError::NoText => "no_text",
            LayoutError::NotMpesaStatement => "unsupported_layout",
            LayoutError::NoPeriod => "unsupported_layout",
            LayoutError::NoRows => "no_rows",
        }
    }

    pub fn message(self) -> &'static str {
        match self {
            LayoutError::NoText => {
                "No text could be read from this PDF. It may be a scan or a photo. Download the statement \
                 again from the M-Pesa app or *334# as a PDF and upload that file."
            }
            LayoutError::NotMpesaStatement => {
                "This does not look like an M-Pesa customer statement. Only the M-Pesa statement layout \
                 with a \"Detailed statement\" table is supported at the moment."
            }
            LayoutError::NoPeriod => {
                "The statement period could not be found. Only the M-Pesa statement layout with a \
                 \"Statement Period\" line is supported at the moment."
            }
            LayoutError::NoRows => {
                "No transaction rows were found in the detailed statement table. If the statement is \
                 for a period with no activity there is nothing to reconcile; otherwise the layout may \
                 have changed — please report it."
            }
        }
    }
}

fn re(pattern: &str) -> Regex {
    Regex::new(pattern).expect("valid built-in pattern")
}

static HOLDER: LazyLock<Regex> = LazyLock::new(|| re(r"(?im)^\s*Customer Name\s*:?[ \t]*(\S.*?)\s*$"));
static NUMBER: LazyLock<Regex> = LazyLock::new(|| re(r"(?im)Mobile Number\s*:?[ \t]*(\+?[0-9][0-9* ]{7,14}[0-9])"));
static PERIOD: LazyLock<Regex> = LazyLock::new(|| {
    re(
        r"(?i)Statement Period\s*:?\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\s*(?:-|to|–)\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})",
    )
});
static ROW: LazyLock<Regex> =
    LazyLock::new(|| re(r"^\s*([A-Z0-9]{10})\s+(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s+(.*\S)\s*$"));
static AMOUNT_TOKEN: LazyLock<Regex> = LazyLock::new(|| re(r"-?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}"));
static STATUS: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?i)\s(Completed|Failed|Cancelled|Pending|Declined|Expired|Reversed)\s*$"));
static FEE: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\bcharges?\b"));

/// Column positions (in characters) taken from the table header line.
#[derive(Debug, Clone, Copy)]
struct Columns {
    details: usize,
    status: Option<usize>,
    paid_in: Option<usize>,
    withdrawn: Option<usize>,
}

impl Columns {
    fn from_header(line: &str) -> Option<Columns> {
        let lower = line.to_ascii_lowercase();
        if !(lower.contains("receipt") && lower.contains("balance")) {
            return None;
        }
        let find = |needle: &str| lower.find(needle).map(|b| line[..b].chars().count());
        let centre = |needle: &str| find(needle).map(|start| start + needle.chars().count() / 2);
        Some(Columns {
            details: find("details")?,
            status: find("transaction status").or_else(|| find("status")),
            paid_in: centre("paid in"),
            withdrawn: centre("withdrawn").or_else(|| centre("paid out")),
        })
    }

    fn direction_at(&self, centre: usize) -> Option<Direction> {
        let (paid_in, withdrawn) = (self.paid_in?, self.withdrawn?);
        let to_in = paid_in.abs_diff(centre);
        let to_out = withdrawn.abs_diff(centre);
        match to_in.cmp(&to_out) {
            std::cmp::Ordering::Less => Some(Direction::In),
            std::cmp::Ordering::Greater => Some(Direction::Out),
            std::cmp::Ordering::Equal => None,
        }
    }
}

struct RowEvidence {
    negative: bool,
    column: Option<Direction>,
    two_column_amounts: bool,
}

pub fn parse(text: &str) -> Result<ParsedStatement, LayoutError> {
    if text.trim().is_empty() {
        return Err(LayoutError::NoText);
    }
    let upper = text.to_uppercase();
    if !(upper.contains("M-PESA") && upper.contains("STATEMENT")) {
        return Err(LayoutError::NotMpesaStatement);
    }

    let holder_name = HOLDER.captures(text).map(|c| c[1].trim().to_string());
    let holder_number = NUMBER.captures(text).map(|c| c[1].replace(' ', ""));
    let (period_start, period_end) = PERIOD
        .captures(text)
        .and_then(|c| Some((date(&c[1], &c[2], &c[3])?, date(&c[4], &c[5], &c[6])?)))
        .ok_or(LayoutError::NoPeriod)?;

    let mut rows: Vec<ParsedRow> = Vec::new();
    let mut evidence: Vec<RowEvidence> = Vec::new();
    let mut columns: Option<Columns> = None;

    for (page_index, page) in text.split('\x0c').enumerate() {
        let mut current: Option<usize> = None;
        for line in page.lines() {
            if let Some(found) = Columns::from_header(line) {
                columns = Some(found);
                current = None;
                continue;
            }
            if let Some((row, ev)) = parse_row(line, columns.as_ref(), page_index as i64 + 1, rows.len() as i64 + 1) {
                rows.push(row);
                evidence.push(ev);
                current = Some(rows.len() - 1);
                continue;
            }
            if line.trim().is_empty() {
                continue;
            }
            match (current, columns) {
                (Some(i), Some(cols)) if is_continuation(line, &cols) => {
                    let extra = line.split_whitespace().collect::<Vec<_>>().join(" ");
                    rows[i].details.push(' ');
                    rows[i].details.push_str(&extra);
                    rows[i].is_fee = FEE.is_match(&rows[i].details);
                }
                _ => current = None,
            }
        }
    }

    if rows.is_empty() {
        return Err(LayoutError::NoRows);
    }

    let (opening, closing, breaks) = settle_directions(&mut rows, &evidence);
    Ok(ParsedStatement {
        holder_name,
        holder_number,
        period_start,
        period_end,
        rows,
        opening_balance_minor: opening,
        closing_balance_minor: closing,
        balance_breaks: breaks,
    })
}

fn date(day: &str, month: &str, year: &str) -> Option<Date> {
    Date::from_calendar_date(year.parse().ok()?, clock::month_from_abbreviation(month)?, day.parse().ok()?).ok()
}

fn is_continuation(line: &str, cols: &Columns) -> bool {
    let indent = line.chars().take_while(|c| c.is_whitespace()).count();
    let before_status = cols.status.map(|s| indent < s).unwrap_or(true);
    indent + 2 >= cols.details && before_status && !AMOUNT_TOKEN.is_match(line)
}

fn parse_row(line: &str, cols: Option<&Columns>, page: i64, position: i64) -> Option<(ParsedRow, RowEvidence)> {
    let c = ROW.captures(line)?;
    let num = |i: usize| c[i].parse::<u16>().ok();
    let day = Date::from_calendar_date(
        i32::from(num(2)?),
        time::Month::try_from(u8::try_from(num(3)?).ok()?).ok()?,
        u8::try_from(num(4)?).ok()?,
    )
    .ok()?;
    let at =
        Time::from_hms(u8::try_from(num(5)?).ok()?, u8::try_from(num(6)?).ok()?, u8::try_from(num(7)?).ok()?).ok()?;
    let completed_at = clock::format_instant(clock::nairobi_local(day, at));

    let rest = c.get(8)?;
    let rest_text = rest.as_str();
    let rest_offset = line[..rest.start()].chars().count();

    // The amounts are the run of numbers at the end of the line.
    let tokens: Vec<_> = AMOUNT_TOKEN.find_iter(rest_text).collect();
    let mut trailing = Vec::new();
    let mut end = rest_text.len();
    for token in tokens.iter().rev() {
        if trailing.len() == 3 || !rest_text[token.end()..end].trim().is_empty() {
            break;
        }
        trailing.push(*token);
        end = token.start();
    }
    trailing.reverse();
    let head = rest_text[..end].trim_end();

    let (details, row_status) = match STATUS.captures(head) {
        Some(s) => (head[..s.get(0)?.start()].trim(), Some(s[1].to_string())),
        None => (head.trim(), None),
    };
    let details = details.split_whitespace().collect::<Vec<_>>().join(" ");

    let value = |m: &regex::Match| money::parse_decimal(m.as_str().trim_start_matches('-')).ok();
    let centre =
        |m: &regex::Match| rest_offset + rest_text[..m.start()].chars().count() + m.as_str().chars().count() / 2;

    let mut note = None;
    let mut ev = RowEvidence { negative: false, column: None, two_column_amounts: false };
    let (amount, balance, direction) = match trailing.as_slice() {
        [paid_in, withdrawn, balance] => {
            let (pin, wd) = (value(paid_in), value(withdrawn));
            ev.two_column_amounts = true;
            match (pin, wd) {
                (Some(0), Some(w)) => (Some(w), value(balance), Some(Direction::Out)),
                (Some(p), Some(0)) => (Some(p), value(balance), Some(Direction::In)),
                _ => {
                    note = Some("Both Paid In and Withdrawn have values; check this row.".to_string());
                    (None, value(balance), None)
                }
            }
        }
        [amount, balance] => {
            ev.negative = amount.as_str().starts_with('-');
            ev.column = cols.and_then(|c| c.direction_at(centre(amount)));
            (value(amount), value(balance), None)
        }
        [only] => {
            note = Some("Only one number was found on this row; the amount or balance is missing.".to_string());
            ev.column = cols.and_then(|c| c.direction_at(centre(only)));
            (value(only), None, None)
        }
        _ => {
            note = Some("No amount was found on this row.".to_string());
            (None, None, None)
        }
    };

    let row = ParsedRow {
        position,
        page,
        receipt: c[1].to_string(),
        completed_at,
        is_fee: FEE.is_match(&details),
        details,
        row_status,
        direction,
        amount_minor: amount,
        balance_minor: balance,
        note,
    };
    Some((row, ev))
}

/// Decides each row's direction from its sign, its column and the running
/// balance, then derives the opening and closing balances.
fn settle_directions(rows: &mut [ParsedRow], evidence: &[RowEvidence]) -> (Option<i64>, Option<i64>, i64) {
    let negatives_mark_withdrawals = evidence.iter().any(|e| e.negative);
    for (row, ev) in rows.iter_mut().zip(evidence) {
        if row.direction.is_some() || ev.two_column_amounts {
            continue;
        }
        row.direction = if ev.negative {
            Some(Direction::Out)
        } else if let Some(d) = ev.column {
            Some(d)
        } else if negatives_mark_withdrawals {
            Some(Direction::In)
        } else {
            None
        };
    }

    // Statements are usually newest first; walk them oldest first.
    let newest_first = rows.first().map(|r| &r.completed_at) > rows.last().map(|r| &r.completed_at);
    let order: Vec<usize> = if newest_first { (0..rows.len()).rev().collect() } else { (0..rows.len()).collect() };

    let mut breaks = 0;
    for pair in order.windows(2) {
        let (prev, i) = (pair[0], pair[1]);
        let (Some(before), Some(after), Some(amount)) =
            (rows[prev].balance_minor, rows[i].balance_minor, rows[i].amount_minor)
        else {
            breaks += 1;
            rows[i].note.get_or_insert_with(|| "The running balance could not be checked for this row.".into());
            continue;
        };
        let up = before + amount == after;
        let down = before - amount == after;
        let from_balance = match (up, down) {
            (true, false) => Some(Direction::In),
            (false, true) => Some(Direction::Out),
            (true, true) => rows[i].direction,
            (false, false) => None,
        };
        match (rows[i].direction, from_balance) {
            (_, None) => {
                breaks += 1;
                rows[i].note = Some(
                    "The balance on this row does not follow from the row before. A row may be missing or misread."
                        .into(),
                );
            }
            (Some(printed), Some(actual)) if printed != actual => {
                rows[i].direction = Some(actual);
                rows[i].note =
                    Some("The column position and the running balance disagreed; the balance was used.".into());
            }
            (_, Some(actual)) => rows[i].direction = Some(actual),
        }
    }

    let first = order.first().map(|&i| &rows[i]);
    let opening = first.and_then(|r| match (r.balance_minor, r.amount_minor, r.direction) {
        (Some(b), Some(a), Some(Direction::In)) => Some(b - a),
        (Some(b), Some(a), Some(Direction::Out)) => Some(b + a),
        _ => None,
    });
    let closing = order.last().and_then(|&i| rows[i].balance_minor);
    (opening, closing, breaks)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = include_str!("../../tests/fixtures/mpesa-statement.txt");

    #[test]
    fn reads_the_sample_statement() {
        let s = parse(SAMPLE).unwrap();
        assert_eq!(s.holder_name.as_deref(), Some("AMINA ODHIAMBO"));
        assert_eq!(s.holder_number.as_deref(), Some("0712345678"));
        assert_eq!(clock::format_date(s.period_start), "2024-06-01");
        assert_eq!(clock::format_date(s.period_end), "2024-06-30");
        assert_eq!(s.rows.len(), 7);
        assert_eq!(s.balance_breaks, 0);

        // Newest first: the last printed row is the oldest.
        let oldest = s.rows.last().unwrap();
        assert_eq!(oldest.receipt, "SF11AAA001");
        assert_eq!(oldest.direction, Some(Direction::In));
        assert_eq!(oldest.amount_minor, Some(150_000));
        assert_eq!(oldest.completed_at, "2024-06-02T07:15:22Z");

        // A payment and its charge share a receipt number.
        let fee = s.rows.iter().find(|r| r.is_fee && r.receipt == "SF33CCC003").unwrap();
        assert_eq!(fee.amount_minor, Some(1_300));
        assert_eq!(fee.direction, Some(Direction::Out));
        let payment = s.rows.iter().find(|r| !r.is_fee && r.receipt == "SF33CCC003").unwrap();
        assert_eq!(payment.amount_minor, Some(100_000));
        assert!(payment.details.contains("JANE MWANGI"), "wrapped details are joined: {}", payment.details);

        assert_eq!(s.opening_balance_minor, Some(20_000));
        assert_eq!(s.closing_balance_minor, Some(s.rows[0].balance_minor.unwrap()));
        let credits: i64 =
            s.rows.iter().filter(|r| r.direction == Some(Direction::In)).filter_map(|r| r.amount_minor).sum();
        let debits: i64 =
            s.rows.iter().filter(|r| r.direction == Some(Direction::Out)).filter_map(|r| r.amount_minor).sum();
        assert_eq!(s.opening_balance_minor.unwrap() + credits - debits, s.closing_balance_minor.unwrap());
    }

    #[test]
    fn a_missing_row_breaks_the_balance_chain() {
        let without: String = SAMPLE.lines().filter(|l| !l.contains("SF22BBB002")).collect::<Vec<_>>().join("\n");
        let s = parse(&without).unwrap();
        assert_eq!(s.balance_breaks, 1);
    }

    #[test]
    fn rejects_other_documents() {
        assert_eq!(parse("   ").unwrap_err(), LayoutError::NoText);
        assert_eq!(parse("Bank statement for June").unwrap_err(), LayoutError::NotMpesaStatement);
        assert_eq!(parse("M-PESA STATEMENT\nnothing else").unwrap_err(), LayoutError::NoPeriod);
    }
}
