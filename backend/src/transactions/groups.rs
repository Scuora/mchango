//! Merged contributions, and payments out made from several accounts.
//!
//! Several payments from the same giver (a family that gave three times) can be
//! listed publicly as one entry under one name. Nothing about the payments
//! changes: each keeps its amount, M-Pesa message, statement match and history,
//! and the money is counted once per payment as before. Separating them puts
//! everything back as it was.
//!
//! A payment out made from several accounts (30,000 by M-Pesa and 20,000 in
//! cash) is saved as one record per account, linked the same way: listed once,
//! under its description, with each part kept in its own account. Every record
//! in an entry is of one kind.

use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::SqliteConnection;
use std::collections::BTreeSet;

use super::{Kind, ListItem, clean_optional, current_version, item};
use crate::clock;
use crate::error::{AppError, AppResult};
use crate::history::{self, Entity};
use crate::money::format_kes;

/// The merged entry a payment is listed under.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct GroupSummary {
    pub id: i64,
    /// `None` shows the fundraiser's anonymous label.
    pub public_name: Option<String>,
    /// Payments in it that count (archived ones are kept but not counted).
    pub count: i64,
    pub total_minor: i64,
}

/// A merged entry with every payment in it and their original messages.
#[derive(Debug, Serialize)]
pub struct GroupDetail {
    pub id: i64,
    pub public_name: Option<String>,
    pub total_minor: i64,
    /// Oldest first, archived ones included and marked.
    pub members: Vec<ListItem>,
    pub messages: Vec<GroupMessage>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct GroupMessage {
    pub transaction_id: i64,
    pub text_content: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct MergeRequest {
    pub transaction_ids: Vec<i64>,
    /// The name to list them under, `null` for the anonymous label. Left out, a
    /// merged entry keeps its name and a new one takes the first public name among
    /// the payments.
    #[serde(default, deserialize_with = "sent")]
    pub public_name: Option<Option<String>>,
}

/// Tells a field sent as `null` (`Some(None)`) from one left out (`None`).
fn sent<'de, D: serde::Deserializer<'de>>(field: D) -> Result<Option<Option<String>>, D::Error> {
    Option::<String>::deserialize(field).map(Some)
}

async fn group_of(conn: &mut SqliteConnection, id: i64) -> AppResult<Option<i64>> {
    let found: Option<Option<i64>> =
        sqlx::query_scalar("SELECT group_id FROM transactions WHERE id = ?").bind(id).fetch_optional(conn).await?;
    found.ok_or_else(|| AppError::not_found("That transaction"))
}

async fn group_name(conn: &mut SqliteConnection, group: i64) -> AppResult<Option<String>> {
    let found: Option<Option<String>> = sqlx::query_scalar("SELECT public_name FROM contribution_groups WHERE id = ?")
        .bind(group)
        .fetch_optional(conn)
        .await?;
    found.ok_or_else(|| AppError::not_found("That merged entry"))
}

/// Every payment in a merged entry, oldest first, archived ones included.
async fn member_ids(conn: &mut SqliteConnection, group: i64) -> AppResult<Vec<i64>> {
    Ok(sqlx::query_scalar(
        "SELECT t.id FROM transactions t
         JOIN transaction_versions v ON v.transaction_id = t.id AND v.is_current = 1
         WHERE t.group_id = ? ORDER BY v.occurred_at, t.id",
    )
    .bind(group)
    .fetch_all(conn)
    .await?)
}

/// The payment and the others merged with it that still count (just the payment
/// when it is on its own).
pub async fn merged_with(conn: &mut SqliteConnection, id: i64) -> AppResult<Vec<i64>> {
    let Some(group) = group_of(conn, id).await? else { return Ok(vec![id]) };
    let mut ids = Vec::new();
    for member in member_ids(conn, group).await? {
        if member == id || !current_version(conn, member).await?.removed {
            ids.push(member);
        }
    }
    Ok(ids)
}

fn quoted(name: &Option<String>) -> String {
    format!("“{}”", name.as_deref().unwrap_or("anonymous"))
}

/// How history names an entry: a merged entry by its name, a payment from
/// several accounts by what it paid for.
async fn entry_label(conn: &mut SqliteConnection, group: i64) -> AppResult<String> {
    let first: Option<(Kind, String)> = sqlx::query_as(
        "SELECT v.kind, t.description FROM transactions t
         JOIN transaction_versions v ON v.transaction_id = t.id AND v.is_current = 1
         WHERE t.group_id = ? ORDER BY t.id LIMIT 1",
    )
    .bind(group)
    .fetch_optional(&mut *conn)
    .await?;
    Ok(match first {
        Some((Kind::Expense, description)) => {
            format!(
                "payment “{}” from several accounts",
                if description.is_empty() { "money spent" } else { &description }
            )
        }
        _ => format!("merged entry {}", quoted(&group_name(conn, group).await?)),
    })
}

/// Links the parts of a payment out made from several accounts, just saved
/// together, so it is listed and counted once.
pub(crate) async fn link_parts(conn: &mut SqliteConnection, ids: &[i64]) -> AppResult<()> {
    let now = clock::now_string();
    let group: i64 = sqlx::query_scalar(
        "INSERT INTO contribution_groups (public_name, created_at, updated_at) VALUES (NULL, ?, ?) RETURNING id",
    )
    .bind(&now)
    .bind(&now)
    .fetch_one(&mut *conn)
    .await?;
    let mut parts = Vec::new();
    let mut total = 0;
    for &id in ids {
        sqlx::query("UPDATE transactions SET group_id = ?, updated_at = ? WHERE id = ?")
            .bind(group)
            .bind(&now)
            .bind(id)
            .execute(&mut *conn)
            .await?;
        let (account, amount): (String, i64) = sqlx::query_as(
            "SELECT a.name, v.amount_minor FROM transaction_versions v JOIN accounts a ON a.id = v.account_id
             WHERE v.transaction_id = ? AND v.is_current = 1",
        )
        .bind(id)
        .fetch_one(&mut *conn)
        .await?;
        parts.push(format!("#{id} {} from {account}", format_kes(amount)));
        total += amount;
    }
    let summary = format!("Paid from {} accounts, {} in all: {}", ids.len(), format_kes(total), parts.join(", "));
    for &id in ids {
        history::record(
            conn,
            Entity::Transaction,
            Some(id),
            "merged",
            &summary,
            None,
            Some(json!({ "group_id": group, "members": ids })),
        )
        .await?;
    }
    Ok(())
}

/// The records an edit to a payment's description applies to: every part of a
/// payment from several accounts, so they stay one payment; otherwise just it.
pub async fn paid_together(conn: &mut SqliteConnection, id: i64) -> AppResult<Vec<i64>> {
    if current_version(conn, id).await?.kind != Kind::Expense {
        return Ok(vec![id]);
    }
    merged_with(conn, id).await
}

/// Merges payments into one public entry. Payments already merged bring their
/// whole entry with them, so merging two merged entries makes one. Returns the
/// merged entry's id.
pub async fn merge(conn: &mut SqliteConnection, request: MergeRequest) -> AppResult<i64> {
    let chosen: BTreeSet<i64> = request.transaction_ids.iter().copied().collect();
    if chosen.len() > 200 {
        return Err(AppError::invalid("Merge at most 200 payments at a time."));
    }
    let name = request.public_name.map(|name| clean_optional(name, 80, "public_name")).transpose()?;

    let mut existing_groups = BTreeSet::new();
    let mut members = BTreeSet::new();
    for &id in &chosen {
        let current = current_version(conn, id).await?;
        if current.removed {
            return Err(AppError::invalid(format!("Transaction #{id} is archived. Restore it before merging it.")));
        }
        if current.kind != Kind::Contribution {
            return Err(AppError::invalid(format!(
                "Transaction #{id} is not money received. Only money received can be merged."
            )));
        }
        match group_of(conn, id).await? {
            Some(group) => {
                existing_groups.insert(group);
                members.extend(member_ids(conn, group).await?);
            }
            None => {
                members.insert(id);
            }
        }
    }

    // Every payment that counts must be one person's and come in the same way.
    let mut live = Vec::new();
    let mut challenges = BTreeSet::new();
    for &id in &members {
        let current = current_version(conn, id).await?;
        if current.removed {
            continue;
        }
        let shared: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM contribution_shares WHERE transaction_id = ?")
            .bind(id)
            .fetch_one(&mut *conn)
            .await?;
        if shared > 0 {
            return Err(AppError::invalid(format!(
                "Transaction #{id} is shared among several people, so it is already listed person by person. \
                 Make it one person's again before merging it."
            )));
        }
        let challenge: Option<i64> = sqlx::query_scalar("SELECT challenge_id FROM transactions WHERE id = ?")
            .bind(id)
            .fetch_one(&mut *conn)
            .await?;
        challenges.insert(challenge);
        live.push((id, current.amount_minor));
    }
    if live.len() < 2 {
        return Err(AppError::invalid("Choose at least two payments to merge."));
    }
    if challenges.len() > 1 {
        return Err(AppError::invalid(
            "These payments came in through different challenges. Merge only payments that came in the same way.",
        ));
    }

    let now = clock::now_string();
    let (group, before_name) = match existing_groups.first() {
        Some(&group) => (group, group_name(conn, group).await?),
        None => {
            let group: i64 = sqlx::query_scalar(
                "INSERT INTO contribution_groups (public_name, created_at, updated_at) VALUES (NULL, ?, ?) RETURNING id",
            )
            .bind(&now)
            .bind(&now)
            .fetch_one(&mut *conn)
            .await?;
            (group, None)
        }
    };
    let after_name = match name {
        Some(chosen) => chosen,
        None if !existing_groups.is_empty() => before_name.clone(),
        None => {
            let mut first = None;
            for &(id, _) in &live {
                let public_name: Option<String> =
                    sqlx::query_scalar("SELECT public_name FROM transactions WHERE id = ?")
                        .bind(id)
                        .fetch_one(&mut *conn)
                        .await?;
                if public_name.is_some() {
                    first = public_name;
                    break;
                }
            }
            first
        }
    };

    let mut joined = Vec::new();
    for &id in &members {
        if group_of(conn, id).await? != Some(group) {
            joined.push(id);
        }
    }
    if joined.is_empty() && after_name == before_name {
        return Ok(group);
    }

    sqlx::query("UPDATE contribution_groups SET public_name = ?, updated_at = ? WHERE id = ?")
        .bind(&after_name)
        .bind(&now)
        .bind(group)
        .execute(&mut *conn)
        .await?;
    for &id in &joined {
        sqlx::query("UPDATE transactions SET group_id = ?, updated_at = ? WHERE id = ?")
            .bind(group)
            .bind(&now)
            .bind(id)
            .execute(&mut *conn)
            .await?;
    }
    for &old in existing_groups.iter().filter(|&&g| g != group) {
        sqlx::query("DELETE FROM contribution_groups WHERE id = ?").bind(old).execute(&mut *conn).await?;
    }

    let total: i64 = live.iter().map(|(_, amount)| amount).sum();
    let ids: Vec<i64> = members.iter().copied().collect();
    let list = ids.iter().map(|id| format!("#{id}")).collect::<Vec<_>>().join(", ");
    let summary = format!(
        "Merged as {}: {} payments ({list}), {} in all. Each payment and its message are kept.",
        quoted(&after_name),
        live.len(),
        format_kes(total)
    );
    for &id in &ids {
        history::record(
            conn,
            Entity::Transaction,
            Some(id),
            "merged",
            &summary,
            None,
            Some(json!({ "group_id": group, "members": ids, "public_name": after_name })),
        )
        .await?;
    }
    Ok(group)
}

/// Lists a merged entry under another name (`None` shows the anonymous label).
pub async fn rename(conn: &mut SqliteConnection, group: i64, public_name: Option<String>) -> AppResult<()> {
    let after = clean_optional(public_name, 80, "public_name")?;
    let before = group_name(conn, group).await?;
    if before == after {
        return Ok(());
    }
    sqlx::query("UPDATE contribution_groups SET public_name = ?, updated_at = ? WHERE id = ?")
        .bind(&after)
        .bind(clock::now_string())
        .bind(group)
        .execute(&mut *conn)
        .await?;
    let summary = format!("Merged entry renamed from {} to {}", quoted(&before), quoted(&after));
    for id in member_ids(conn, group).await? {
        history::record(conn, Entity::Transaction, Some(id), "merged", &summary, None, None).await?;
    }
    Ok(())
}

/// Takes one payment out of its merged entry; it is listed on its own again. An
/// entry left with one payment ends, and that payment is listed on its own too.
pub async fn separate(conn: &mut SqliteConnection, id: i64) -> AppResult<()> {
    if group_of(conn, id).await?.is_none() {
        return Err(AppError::invalid("This payment is not merged with others."));
    }
    leave_group(conn, id, "taken out by hand").await
}

/// Separates every payment in a merged entry: each is listed on its own again.
pub async fn unmerge(conn: &mut SqliteConnection, group: i64) -> AppResult<()> {
    let label = entry_label(conn, group).await?;
    let members = member_ids(conn, group).await?;
    end_group(conn, group, &members, &format!("The {label} was undone: listed on its own again")).await
}

/// Takes a payment out of its merged entry, if it is in one, saying why.
pub(crate) async fn leave_group(conn: &mut SqliteConnection, id: i64, why: &str) -> AppResult<()> {
    let Some(group) = group_of(conn, id).await? else { return Ok(()) };
    let label = entry_label(conn, group).await?;
    sqlx::query("UPDATE transactions SET group_id = NULL, updated_at = ? WHERE id = ?")
        .bind(clock::now_string())
        .bind(id)
        .execute(&mut *conn)
        .await?;
    let summary = format!("Taken out of the {label} ({why}); listed on its own again");
    history::record(conn, Entity::Transaction, Some(id), "merged", &summary, None, Some(json!({ "group_id": group })))
        .await?;
    let rest = member_ids(conn, group).await?;
    if rest.len() < 2 {
        let summary = format!("The {label} ended: no other payment was left in it");
        end_group(conn, group, &rest, &summary).await?;
    }
    Ok(())
}

async fn end_group(conn: &mut SqliteConnection, group: i64, members: &[i64], summary: &str) -> AppResult<()> {
    let now = clock::now_string();
    for &id in members {
        sqlx::query("UPDATE transactions SET group_id = NULL, updated_at = ? WHERE id = ?")
            .bind(&now)
            .bind(id)
            .execute(&mut *conn)
            .await?;
        history::record(
            conn,
            Entity::Transaction,
            Some(id),
            "merged",
            summary,
            None,
            Some(json!({ "group_id": group })),
        )
        .await?;
    }
    sqlx::query("DELETE FROM contribution_groups WHERE id = ?").bind(group).execute(&mut *conn).await?;
    Ok(())
}

/// The merged entry a payment is in, with every payment and message in it.
pub async fn group_detail(conn: &mut SqliteConnection, id: i64) -> AppResult<Option<GroupDetail>> {
    let Some(group) = group_of(conn, id).await? else { return Ok(None) };
    let public_name = group_name(conn, group).await?;
    let mut members = Vec::new();
    for member in member_ids(conn, group).await? {
        members.push(item(conn, member).await?);
    }
    let total_minor = members.iter().filter(|m| !m.removed).map(|m| m.amount_minor).sum();
    let messages = sqlx::query_as(
        "SELECT d.transaction_id, d.text_content, d.created_at FROM documents d
         JOIN transactions t ON t.id = d.transaction_id
         WHERE t.group_id = ? AND d.kind = 'sms' AND d.text_content IS NOT NULL
         ORDER BY d.transaction_id, d.id",
    )
    .bind(group)
    .fetch_all(&mut *conn)
    .await?;
    Ok(Some(GroupDetail { id: group, public_name, total_minor, members, messages }))
}
