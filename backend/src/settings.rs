//! Fundraiser settings and the accounts money is held in.

use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::SqliteConnection;

use crate::clock;
use crate::error::{AppError, AppResult};
use crate::history::{self, Entity};
use crate::money::{Amount, format_kes};

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Fundraiser {
    pub name: String,
    pub description: String,
    /// Kiswahili version of `description`; empty shows the English in both languages.
    pub description_sw: String,
    /// The person being remembered, e.g. "Mzee Joseph Ochieng Otieno".
    pub memorial_name: String,
    /// Free text such as "1948 – 2026".
    pub memorial_dates: String,
    /// A line of tribute shown under the dates.
    pub memorial_tribute: String,
    pub target_minor: Option<i64>,
    pub start_date: Option<String>,
    pub opening_funds_minor: i64,
    pub opening_funds_date: Option<String>,
    pub opening_funds_note: String,
    pub opening_funds_account_id: Option<i64>,
    pub anonymous_label: String,
    pub show_reference_hint: bool,
    pub show_promises: bool,
    pub public_page_enabled: bool,
    pub is_demo: bool,
    pub updated_at: String,
    /// Set when a memorial photo exists; changes whenever it is replaced.
    pub memorial_photo_updated_at: Option<String>,
    pub giving_method: Option<GivingMethod>,
    pub giving_number: String,
    pub giving_account: String,
    pub giving_name: String,
    pub funeral_when: String,
    pub funeral_where: String,
    pub funeral_map_url: String,
    pub show_contribution_amounts: bool,
    /// Set when a link-preview image exists; changes whenever it is replaced.
    pub share_image_updated_at: Option<String>,
    #[serde(skip)]
    pub organisers_json: String,
    #[sqlx(skip)]
    pub organisers: Vec<Organiser>,
}

/// How people send money to the fundraiser.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(rename_all = "snake_case")]
pub enum GivingMethod {
    Paybill,
    Till,
    /// Send Money to a phone number.
    Phone,
}

/// Someone who stands behind the page, shown publicly with their consent.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Organiser {
    pub name: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub phone: String,
}

pub async fn fundraiser(conn: &mut SqliteConnection) -> AppResult<Fundraiser> {
    let mut f: Fundraiser = sqlx::query_as(
        "SELECT name, description, description_sw, memorial_name, memorial_dates, memorial_tribute, target_minor, start_date, opening_funds_minor, opening_funds_date,
                opening_funds_note, opening_funds_account_id, anonymous_label, show_reference_hint,
                show_promises, public_page_enabled, is_demo, updated_at, memorial_photo_updated_at,
                giving_method, giving_number, giving_account, giving_name, funeral_when, funeral_where,
                funeral_map_url, show_contribution_amounts, share_image_updated_at, organisers AS organisers_json
         FROM fundraiser WHERE id = 1",
    )
    .fetch_one(&mut *conn)
    .await?;
    f.organisers = serde_json::from_str(&f.organisers_json).unwrap_or_default();
    Ok(f)
}

#[derive(Debug, Deserialize)]
pub struct FundraiserUpdate {
    pub name: String,
    #[serde(default)]
    pub description: String,
    /// Left out by older forms, which keeps the saved text.
    #[serde(default)]
    pub description_sw: Option<String>,
    #[serde(default)]
    pub memorial_name: String,
    #[serde(default)]
    pub memorial_dates: String,
    #[serde(default)]
    pub memorial_tribute: String,
    #[serde(default)]
    pub target_minor: Option<Amount>,
    #[serde(default)]
    pub start_date: Option<String>,
    /// Funds already held before records started here. Not a contribution.
    #[serde(default)]
    pub opening_funds_minor: Option<Amount>,
    #[serde(default)]
    pub opening_funds_date: Option<String>,
    #[serde(default)]
    pub opening_funds_note: String,
    #[serde(default)]
    pub opening_funds_account_id: Option<i64>,
    pub anonymous_label: String,
    pub show_reference_hint: bool,
    pub show_promises: bool,
    pub public_page_enabled: bool,
}

pub async fn update_fundraiser(conn: &mut SqliteConnection, update: FundraiserUpdate) -> AppResult<Fundraiser> {
    let name = update.name.trim().to_string();
    if name.is_empty() || name.chars().count() > 120 {
        return Err(AppError::field("name", "Enter a name of up to 120 characters."));
    }
    let description = update.description.trim().to_string();
    if description.chars().count() > 2000 {
        return Err(AppError::field("description", "Keep the description under 2,000 characters."));
    }
    let memorial_name = update.memorial_name.split_whitespace().collect::<Vec<_>>().join(" ");
    if memorial_name.chars().count() > 120 {
        return Err(AppError::field("memorial_name", "Keep the name under 120 characters."));
    }
    let memorial_dates = update.memorial_dates.split_whitespace().collect::<Vec<_>>().join(" ");
    if memorial_dates.chars().count() > 40 {
        return Err(AppError::field("memorial_dates", "Keep the dates under 40 characters, e.g. 1948 – 2026."));
    }
    let memorial_tribute = update.memorial_tribute.split_whitespace().collect::<Vec<_>>().join(" ");
    if memorial_tribute.chars().count() > 160 {
        return Err(AppError::field("memorial_tribute", "Keep the tribute line under 160 characters."));
    }
    let anonymous_label = update.anonymous_label.trim().to_string();
    if anonymous_label.is_empty() || anonymous_label.chars().count() > 60 {
        return Err(AppError::field("anonymous_label", "Enter a label of up to 60 characters."));
    }
    let start_date = optional_date(update.start_date, "start_date")?;

    let opening = update.opening_funds_minor.map(Amount::minor).unwrap_or(0);
    let (opening_date, opening_note, opening_account) = if opening > 0 {
        let date = optional_date(update.opening_funds_date, "opening_funds_date")?
            .ok_or_else(|| AppError::field("opening_funds_date", "Opening funds need the date they were held."))?;
        let note = update.opening_funds_note.trim().to_string();
        if note.chars().count() < 5 {
            return Err(AppError::field(
                "opening_funds_note",
                "Explain where the opening funds came from (this is shown publicly).",
            ));
        }
        let account = update
            .opening_funds_account_id
            .ok_or_else(|| AppError::field("opening_funds_account_id", "Choose where the opening funds are held."))?;
        (Some(date), note, Some(account))
    } else {
        (None, String::new(), None)
    };

    let before = fundraiser(conn).await?;
    let description_sw =
        update.description_sw.map(|d| d.trim().to_string()).unwrap_or_else(|| before.description_sw.clone());
    if description_sw.chars().count() > 2000 {
        return Err(AppError::field("description_sw", "Keep the description under 2,000 characters."));
    }
    sqlx::query(
        "UPDATE fundraiser SET name = ?, description = ?, description_sw = ?, memorial_name = ?, memorial_dates = ?, memorial_tribute = ?,
                target_minor = ?, start_date = ?,
                opening_funds_minor = ?, opening_funds_date = ?, opening_funds_note = ?,
                opening_funds_account_id = ?, anonymous_label = ?, show_reference_hint = ?,
                show_promises = ?, public_page_enabled = ?, updated_at = ?
         WHERE id = 1",
    )
    .bind(&name)
    .bind(&description)
    .bind(&description_sw)
    .bind(&memorial_name)
    .bind(&memorial_dates)
    .bind(&memorial_tribute)
    .bind(update.target_minor.map(Amount::minor))
    .bind(&start_date)
    .bind(opening)
    .bind(&opening_date)
    .bind(&opening_note)
    .bind(opening_account)
    .bind(&anonymous_label)
    .bind(update.show_reference_hint)
    .bind(update.show_promises)
    .bind(update.public_page_enabled)
    .bind(clock::now_string())
    .execute(&mut *conn)
    .await?;

    let mut summary = vec!["Settings updated".to_string()];
    if before.opening_funds_minor != opening {
        summary.push(format!("opening funds {} → {}", format_kes(before.opening_funds_minor), format_kes(opening)));
    }
    if before.public_page_enabled != update.public_page_enabled {
        summary.push(if update.public_page_enabled { "public page published" } else { "public page hidden" }.into());
    }
    history::record(
        conn,
        Entity::Fundraiser,
        Some(1),
        "updated",
        &summary.join("; "),
        None,
        Some(json!({ "opening_funds_before": before.opening_funds_minor, "opening_funds_after": opening })),
    )
    .await?;
    fundraiser(conn).await
}

fn optional_date(value: Option<String>, field: &'static str) -> AppResult<Option<String>> {
    match value.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
        None => Ok(None),
        Some(v) => clock::parse_date(v)
            .map(|d| Some(clock::format_date(d)))
            .ok_or_else(|| AppError::field(field, "Use a date like 2024-06-30.")),
    }
}

// ---------------------------------------------------------------------------
// How to give, funeral details and organisers

#[derive(Debug, Deserialize)]
pub struct PublicDetailsUpdate {
    #[serde(default)]
    pub giving_method: Option<GivingMethod>,
    #[serde(default)]
    pub giving_number: String,
    #[serde(default)]
    pub giving_account: String,
    #[serde(default)]
    pub giving_name: String,
    #[serde(default)]
    pub funeral_when: String,
    #[serde(default)]
    pub funeral_where: String,
    #[serde(default)]
    pub funeral_map_url: String,
    #[serde(default)]
    pub organisers: Vec<Organiser>,
    pub show_contribution_amounts: bool,
}

fn one_line(value: &str, max: usize, field: &'static str, label: &str) -> AppResult<String> {
    let value = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if value.chars().count() > max {
        return Err(AppError::field(field, format!("Keep {label} under {max} characters.")));
    }
    Ok(value)
}

fn phone_number(value: &str, field: &'static str) -> AppResult<String> {
    let value = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let digits = value.chars().filter(char::is_ascii_digit).count();
    let allowed = value.chars().all(|c| c.is_ascii_digit() || c == ' ' || c == '+');
    if !allowed || !(9..=13).contains(&digits) {
        return Err(AppError::field(field, "Enter a phone number such as 0712 345 678 or +254 712 345 678."));
    }
    Ok(value)
}

/// Checks how to give: the number, the Paybill account and the name M-Pesa shows.
/// Without a method, all three are empty. Used by the fundraiser and by challenges.
pub fn clean_giving(
    method: Option<GivingMethod>,
    number: &str,
    account: &str,
    name: &str,
) -> AppResult<(String, String, String)> {
    let (number, account, name) = match method {
        None => (String::new(), String::new(), String::new()),
        Some(method) => {
            let number = match method {
                GivingMethod::Phone => phone_number(number, "giving_number")?,
                GivingMethod::Paybill | GivingMethod::Till => {
                    let digits: String = number.chars().filter(|c| !c.is_whitespace()).collect();
                    if !(4..=8).contains(&digits.len()) || !digits.bytes().all(|b| b.is_ascii_digit()) {
                        return Err(AppError::field(
                            "giving_number",
                            "Enter the business or till number (digits only).",
                        ));
                    }
                    digits
                }
            };
            let account = if method == GivingMethod::Paybill {
                let account = one_line(account, 30, "giving_account", "the account")?;
                if account.is_empty() {
                    return Err(AppError::field("giving_account", "Enter the account number givers should use."));
                }
                account
            } else {
                String::new()
            };
            let name = one_line(name, 60, "giving_name", "the name")?;
            if name.is_empty() {
                return Err(AppError::field(
                    "giving_name",
                    "Enter the name M-Pesa shows before the PIN, so givers can check they have the right account.",
                ));
            }
            (number, account, name)
        }
    };
    Ok((number, account, name))
}

pub async fn update_public_details(conn: &mut SqliteConnection, update: PublicDetailsUpdate) -> AppResult<Fundraiser> {
    let (number, account, name) =
        clean_giving(update.giving_method, &update.giving_number, &update.giving_account, &update.giving_name)?;
    let when = one_line(&update.funeral_when, 120, "funeral_when", "the date and time")?;
    let place = one_line(&update.funeral_where, 160, "funeral_where", "the place")?;
    let map = update.funeral_map_url.trim().to_string();
    if !map.is_empty()
        && (!(map.starts_with("https://") || map.starts_with("http://"))
            || map.len() > 500
            || map.contains(char::is_whitespace))
    {
        return Err(AppError::field("funeral_map_url", "Paste a full map link starting with https://"));
    }
    if update.organisers.len() > 6 {
        return Err(AppError::field("organisers", "List at most six organisers."));
    }
    let mut organisers = Vec::with_capacity(update.organisers.len());
    for organiser in &update.organisers {
        let name = one_line(&organiser.name, 60, "organisers", "each name")?;
        if name.is_empty() {
            return Err(AppError::field("organisers", "Every organiser needs a name."));
        }
        let role = one_line(&organiser.role, 40, "organisers", "each role")?;
        let phone = if organiser.phone.trim().is_empty() {
            String::new()
        } else {
            phone_number(&organiser.phone, "organisers")?
        };
        organisers.push(Organiser { name, role, phone });
    }
    let organisers_json = serde_json::to_string(&organisers).map_err(|e| AppError::internal(e.to_string()))?;

    sqlx::query(
        "UPDATE fundraiser SET giving_method = ?, giving_number = ?, giving_account = ?, giving_name = ?,
                funeral_when = ?, funeral_where = ?, funeral_map_url = ?, organisers = ?,
                show_contribution_amounts = ?, updated_at = ?
         WHERE id = 1",
    )
    .bind(update.giving_method)
    .bind(&number)
    .bind(&account)
    .bind(&name)
    .bind(&when)
    .bind(&place)
    .bind(&map)
    .bind(&organisers_json)
    .bind(update.show_contribution_amounts)
    .bind(clock::now_string())
    .execute(&mut *conn)
    .await?;
    history::record(
        conn,
        Entity::Fundraiser,
        Some(1),
        "updated",
        "Giving, funeral and organiser details updated",
        None,
        None,
    )
    .await?;
    fundraiser(conn).await
}

// ---------------------------------------------------------------------------
// Memorial photo

pub struct MemorialPhoto {
    pub storage_name: String,
    pub content_type: String,
    pub published: bool,
}

pub async fn memorial_photo(conn: &mut SqliteConnection) -> AppResult<Option<MemorialPhoto>> {
    let row: Option<(Option<String>, Option<String>, bool)> =
        sqlx::query_as("SELECT memorial_photo, memorial_photo_type, public_page_enabled FROM fundraiser WHERE id = 1")
            .fetch_optional(conn)
            .await?;
    Ok(match row {
        Some((Some(storage_name), Some(content_type), published)) => {
            Some(MemorialPhoto { storage_name, content_type, published })
        }
        _ => None,
    })
}

/// Records a new photo (or none) and returns the previous file so the caller
/// can delete it after the change is committed.
pub async fn set_memorial_photo(conn: &mut SqliteConnection, photo: Option<(&str, &str)>) -> AppResult<Option<String>> {
    let previous: Option<String> =
        sqlx::query_scalar("SELECT memorial_photo FROM fundraiser WHERE id = 1").fetch_one(&mut *conn).await?;
    let now = clock::now_string();
    sqlx::query(
        "UPDATE fundraiser SET memorial_photo = ?, memorial_photo_type = ?, memorial_photo_updated_at = ?,
                updated_at = ? WHERE id = 1",
    )
    .bind(photo.map(|p| p.0))
    .bind(photo.map(|p| p.1))
    .bind(photo.map(|_| now.clone()))
    .bind(&now)
    .execute(&mut *conn)
    .await?;
    let summary = if photo.is_some() { "Memorial photo updated" } else { "Memorial photo removed" };
    history::record(conn, Entity::Fundraiser, Some(1), "photo", summary, None, None).await?;
    Ok(previous)
}

/// The link-preview image: (stored file, page published).
pub async fn share_image(conn: &mut SqliteConnection) -> AppResult<Option<(String, bool)>> {
    let row: Option<(Option<String>, bool)> =
        sqlx::query_as("SELECT share_image, public_page_enabled FROM fundraiser WHERE id = 1")
            .fetch_optional(conn)
            .await?;
    Ok(row.and_then(|(name, published)| name.map(|n| (n, published))))
}

/// Records a new link-preview image (or none); returns the previous file to delete after commit.
pub async fn set_share_image(conn: &mut SqliteConnection, image: Option<&str>) -> AppResult<Option<String>> {
    let previous: Option<String> =
        sqlx::query_scalar("SELECT share_image FROM fundraiser WHERE id = 1").fetch_one(&mut *conn).await?;
    let now = clock::now_string();
    sqlx::query("UPDATE fundraiser SET share_image = ?, share_image_updated_at = ?, updated_at = ? WHERE id = 1")
        .bind(image)
        .bind(image.map(|_| now.clone()))
        .bind(&now)
        .execute(&mut *conn)
        .await?;
    let summary = if image.is_some() { "Link preview image updated" } else { "Link preview image removed" };
    history::record(conn, Entity::Fundraiser, Some(1), "share_image", summary, None, None).await?;
    Ok(previous)
}

// ---------------------------------------------------------------------------
// Accounts

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(rename_all = "snake_case")]
pub enum AccountKind {
    Mpesa,
    Bank,
    Cash,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Account {
    pub id: i64,
    pub name: String,
    pub kind: AccountKind,
    pub number_hint: Option<String>,
    pub created_at: String,
}

pub async fn accounts(conn: &mut SqliteConnection) -> AppResult<Vec<Account>> {
    Ok(sqlx::query_as("SELECT id, name, kind, number_hint, created_at FROM accounts ORDER BY id")
        .fetch_all(conn)
        .await?)
}

pub async fn account(conn: &mut SqliteConnection, id: i64) -> AppResult<Account> {
    sqlx::query_as("SELECT id, name, kind, number_hint, created_at FROM accounts WHERE id = ?")
        .bind(id)
        .fetch_optional(conn)
        .await?
        .ok_or_else(|| AppError::not_found("That account"))
}

#[derive(Debug, Deserialize)]
pub struct AccountInput {
    pub name: String,
    pub kind: AccountKind,
    #[serde(default)]
    pub number_hint: Option<String>,
}

fn clean_account(input: &AccountInput) -> AppResult<(String, Option<String>)> {
    let name = input.name.trim().to_string();
    if name.is_empty() || name.chars().count() > 60 {
        return Err(AppError::field("name", "Enter an account name of up to 60 characters."));
    }
    let hint = input
        .number_hint
        .as_deref()
        .map(|h| h.chars().filter(char::is_ascii_digit).collect::<String>())
        .filter(|h| !h.is_empty());
    if let Some(h) = &hint
        && (h.len() < 3 || h.len() > 4)
    {
        return Err(AppError::field("number_hint", "Enter the last 3 or 4 digits of the number."));
    }
    Ok((name, hint))
}

pub async fn create_account(conn: &mut SqliteConnection, input: AccountInput) -> AppResult<Account> {
    let (name, hint) = clean_account(&input)?;
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO accounts (name, kind, number_hint, created_at) VALUES (?, ?, ?, ?) RETURNING id",
    )
    .bind(&name)
    .bind(input.kind)
    .bind(&hint)
    .bind(clock::now_string())
    .fetch_one(&mut *conn)
    .await
    .map_err(|e| match crate::error::is_unique_violation(&e) {
        true => AppError::field("name", "An account with that name already exists."),
        false => e.into(),
    })?;
    history::record(conn, Entity::Account, Some(id), "created", &format!("Account “{name}” added"), None, None).await?;
    account(conn, id).await
}

pub async fn update_account(conn: &mut SqliteConnection, id: i64, input: AccountInput) -> AppResult<Account> {
    let existing = account(conn, id).await?;
    if existing.kind != input.kind {
        return Err(AppError::field("kind", "An account's type cannot be changed once created."));
    }
    let (name, hint) = clean_account(&input)?;
    sqlx::query("UPDATE accounts SET name = ?, number_hint = ? WHERE id = ?")
        .bind(&name)
        .bind(&hint)
        .bind(id)
        .execute(&mut *conn)
        .await
        .map_err(|e| match crate::error::is_unique_violation(&e) {
            true => AppError::field("name", "An account with that name already exists."),
            false => e.into(),
        })?;
    history::record(
        conn,
        Entity::Account,
        Some(id),
        "updated",
        &format!("Account “{}” updated", existing.name),
        None,
        None,
    )
    .await?;
    account(conn, id).await
}
