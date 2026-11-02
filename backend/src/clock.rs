//! Time handling.
//!
//! Instants are stored and sent as UTC RFC 3339 strings (`2024-06-02T07:15:00Z`).
//! Local times are Africa/Nairobi, which has been UTC+03:00 without daylight
//! saving since 1960, so a fixed offset is exact for every date this app handles.

use time::format_description::well_known::Rfc3339;
use time::{Date, Month, OffsetDateTime, PrimitiveDateTime, Time, UtcOffset};

pub fn nairobi() -> UtcOffset {
    UtcOffset::from_hms(3, 0, 0).expect("valid offset")
}

pub fn now() -> OffsetDateTime {
    OffsetDateTime::now_utc()
}

/// `2024-06-02T07:15:00Z`, truncated to whole seconds.
pub fn format_instant(at: OffsetDateTime) -> String {
    at.to_offset(UtcOffset::UTC)
        .replace_nanosecond(0)
        .expect("zero is a valid nanosecond")
        .format(&Rfc3339)
        .expect("RFC 3339 formatting of a UTC time")
}

pub fn now_string() -> String {
    format_instant(now())
}

/// Parses an RFC 3339 instant with any offset.
pub fn parse_instant(value: &str) -> Option<OffsetDateTime> {
    OffsetDateTime::parse(value.trim(), &Rfc3339).ok()
}

/// A wall-clock time in Nairobi.
pub fn nairobi_local(date: Date, time: Time) -> OffsetDateTime {
    PrimitiveDateTime::new(date, time).assume_offset(nairobi())
}

/// Parses `YYYY-MM-DD`.
pub fn parse_date(value: &str) -> Option<Date> {
    let mut parts = value.trim().splitn(3, '-');
    let year: i32 = parts.next()?.parse().ok()?;
    let month: u8 = parts.next()?.parse().ok()?;
    let day: u8 = parts.next()?.parse().ok()?;
    Date::from_calendar_date(year, Month::try_from(month).ok()?, day).ok()
}

pub fn format_date(date: Date) -> String {
    format!("{:04}-{:02}-{:02}", date.year(), u8::from(date.month()), date.day())
}

/// The Nairobi calendar date of an instant.
pub fn nairobi_date(at: OffsetDateTime) -> Date {
    at.to_offset(nairobi()).date()
}

/// Start of a Nairobi calendar day, as a stored UTC string.
pub fn day_start(date: Date) -> String {
    format_instant(nairobi_local(date, Time::MIDNIGHT))
}

/// Start of the following Nairobi day (an exclusive upper bound).
pub fn day_end_exclusive(date: Date) -> String {
    let next = date.next_day().unwrap_or(date);
    format_instant(nairobi_local(next, Time::MIDNIGHT))
}

pub fn month_from_abbreviation(name: &str) -> Option<Month> {
    let lower = name.to_ascii_lowercase();
    let month = match lower.get(..3)? {
        "jan" => Month::January,
        "feb" => Month::February,
        "mar" => Month::March,
        "apr" => Month::April,
        "may" => Month::May,
        "jun" => Month::June,
        "jul" => Month::July,
        "aug" => Month::August,
        "sep" => Month::September,
        "oct" => Month::October,
        "nov" => Month::November,
        "dec" => Month::December,
        _ => return None,
    };
    Some(month)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nairobi_round_trip() {
        let date = parse_date("2024-06-02").unwrap();
        let at = nairobi_local(date, Time::from_hms(10, 15, 0).unwrap());
        assert_eq!(format_instant(at), "2024-06-02T07:15:00Z");
        assert_eq!(day_start(date), "2024-06-01T21:00:00Z");
        assert_eq!(day_end_exclusive(date), "2024-06-02T21:00:00Z");
        let parsed = parse_instant("2024-06-02T10:15:00+03:00").unwrap();
        assert_eq!(format_instant(parsed), "2024-06-02T07:15:00Z");
        assert_eq!(nairobi_date(parse_instant("2024-06-01T22:30:00Z").unwrap()), date);
    }
}
