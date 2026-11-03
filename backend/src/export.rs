//! Data export for the fundraiser's owner (private: includes everything).

use serde_json::{Map, Value};
use sqlx::{Column, Row, SqliteConnection, TypeInfo, ValueRef};

use crate::clock;
use crate::error::AppResult;
use crate::money::format_kes;
use crate::transactions::{self, Direction, Kind};

/// Current transactions as CSV, one line per record, removed records included and marked.
pub async fn transactions_csv(conn: &mut SqliteConnection) -> AppResult<String> {
    let items = transactions::all_items(conn).await?;
    let mut out = String::from(
        "id,version,transaction_time_nairobi,recorded_at_utc,type,direction,amount_kes,account,to_account,\
         reference,is_charge_line,counts_for_fundraiser,public_name,description,private_notes,counterparty,\
         statement_status,archived,challenge,shared_among,recorded_by,last_changed_by,last_changed_at_utc\n",
    );
    for t in items {
        let local = clock::parse_instant(&t.occurred_at)
            .map(|at| {
                let l = at.to_offset(clock::nairobi());
                format!("{} {:02}:{:02}", clock::format_date(l.date()), l.hour(), l.minute())
            })
            .unwrap_or_default();
        let amount = format_kes(t.amount_minor).trim_start_matches("KES ").replace(',', "");
        let fields = [
            t.id.to_string(),
            t.version.to_string(),
            local,
            t.recorded_at.clone(),
            t.kind.label().to_string(),
            match t.direction {
                Some(Direction::In) => "in".into(),
                Some(Direction::Out) => "out".into(),
                None => String::new(),
            },
            amount,
            t.account_name.clone().unwrap_or_default(),
            t.to_account_name.clone().unwrap_or_default(),
            t.reference.clone().unwrap_or_default(),
            t.is_fee.to_string(),
            (t.kind != Kind::Personal).to_string(),
            t.public_name.clone().unwrap_or_default(),
            t.description.clone(),
            t.notes.clone(),
            t.counterparty.clone().unwrap_or_default(),
            format!("{:?}", t.reconciliation).to_lowercase(),
            t.removed.to_string(),
            t.challenge_name.clone().unwrap_or_default(),
            t.shares
                .iter()
                .map(|s| {
                    let amount = format_kes(s.amount_minor).trim_start_matches("KES ").replace(',', "");
                    format!("{} {amount}", s.public_name.as_deref().unwrap_or("anonymous"))
                })
                .collect::<Vec<_>>()
                .join("; "),
            t.created_by.clone().unwrap_or_else(|| "system".into()),
            t.last_changed_by.clone().unwrap_or_else(|| "system".into()),
            t.last_changed_at.clone().unwrap_or_default(),
        ];
        let line: Vec<String> = fields.iter().map(|f| csv_field(f)).collect();
        out.push_str(&line.join(","));
        out.push('\n');
    }
    Ok(out)
}

/// Quotes a CSV field and neutralises spreadsheet formulas.
fn csv_field(value: &str) -> String {
    let mut v = value.to_string();
    if v.starts_with(['=', '+', '-', '@', '\t', '\r']) {
        v.insert(0, '\'');
    }
    if v.contains([',', '"', '\n', '\r']) { format!("\"{}\"", v.replace('"', "\"\"")) } else { v }
}

const TABLES: [(&str, &str); 9] = [
    ("fundraiser", "SELECT * FROM fundraiser"),
    ("accounts", "SELECT * FROM accounts ORDER BY id"),
    ("challenges", "SELECT * FROM challenges ORDER BY id"),
    ("transactions", "SELECT * FROM transactions ORDER BY id"),
    ("transaction_versions", "SELECT * FROM transaction_versions ORDER BY transaction_id, version"),
    ("documents", "SELECT * FROM documents ORDER BY id"),
    ("statement_imports", "SELECT * FROM statement_imports ORDER BY id"),
    ("statement_rows", "SELECT * FROM statement_rows ORDER BY import_id, position"),
    ("change_log", "SELECT * FROM change_log ORDER BY id"),
];

/// Every table as JSON. Files (statements and receipts) are not included;
/// back up the uploads directory for those.
pub async fn full_json(conn: &mut SqliteConnection) -> AppResult<Value> {
    let mut root = Map::new();
    root.insert("exported_at".into(), Value::String(clock::now_string()));
    root.insert("money_unit".into(), Value::String("KES minor units (cents)".into()));
    for (name, sql) in TABLES {
        let rows = sqlx::query(sql).fetch_all(&mut *conn).await?;
        let mut list = Vec::with_capacity(rows.len());
        for row in rows {
            let mut object = Map::new();
            for (i, column) in row.columns().iter().enumerate() {
                let raw = row.try_get_raw(i)?;
                let value = if raw.is_null() {
                    Value::Null
                } else {
                    match raw.type_info().name() {
                        "INTEGER" => Value::from(row.try_get::<i64, _>(i)?),
                        "REAL" => Value::from(row.try_get::<f64, _>(i)?),
                        _ => Value::String(row.try_get::<String, _>(i).unwrap_or_default()),
                    }
                };
                object.insert(column.name().to_string(), value);
            }
            list.push(Value::Object(object));
        }
        root.insert(name.to_string(), Value::Array(list));
    }
    Ok(Value::Object(root))
}

#[cfg(test)]
mod tests {
    use super::csv_field;

    #[test]
    fn csv_escaping() {
        assert_eq!(csv_field("plain"), "plain");
        assert_eq!(csv_field("a,b"), "\"a,b\"");
        assert_eq!(csv_field("say \"hi\""), "\"say \"\"hi\"\"\"");
        assert_eq!(csv_field("=SUM(A1)"), "'=SUM(A1)");
    }
}
