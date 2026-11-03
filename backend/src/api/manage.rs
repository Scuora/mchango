use axum::extract::multipart::{Field, MultipartError};
use axum::extract::{DefaultBodyLimit, Multipart, Path, Query, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashMap;

use super::{AppState, extension_for, file_response};
use crate::announcements::{self, Announcement, AnnouncementInput};
use crate::auth;
use crate::capture::{self, ParsedMessage};
use crate::challenges::{self, ChallengeInput, ChallengeSummary};
use crate::config::Config;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::export;
use crate::history::{self, Entity};
use crate::publication::{self, PublicPage};
use crate::reconciliation::{self, CreateFromRow, ImportDetail, ReconciledPeriod};
use crate::reports;
use crate::settings::{self, Account, AccountInput, AccountKind, Fundraiser, FundraiserUpdate};
use crate::statements::{self, ImportSummary, StoredUpload};
use crate::storage::{self, Area, FileType};
use crate::transactions::totals::{self, Totals};
use crate::transactions::{
    self, CorrectionRequest, CreateRequest, Created, Detail, ListItem, ListQuery, ListResponse, Presentation,
    StatusFilter,
};

pub fn routes(config: &Config) -> Router<AppState> {
    let upload_limit = DefaultBodyLimit::max(config.max_upload_bytes + 64 * 1024);
    Router::new()
        .route("/api/manage/overview", get(overview))
        .route("/api/manage/settings", get(get_settings).put(put_settings))
        .route("/api/manage/public-preview", get(public_preview))
        .route("/api/manage/settings/photo", put(upload_photo).delete(remove_photo).layer(upload_limit))
        .route("/api/manage/settings/public-details", put(put_public_details))
        .route(
            "/api/manage/settings/share-image",
            put(upload_share_image).delete(remove_share_image).layer(upload_limit),
        )
        .route("/api/manage/announcements", get(list_announcements).post(create_announcement))
        .route("/api/manage/announcements/{id}", put(update_announcement).delete(delete_announcement))
        .route("/api/manage/challenges", get(list_challenges).post(create_challenge))
        .route("/api/manage/challenges/{id}", get(get_challenge).put(update_challenge).delete(delete_challenge))
        .route("/api/manage/challenges/{id}/transactions", post(link_challenge_transactions))
        .route("/api/manage/accounts", get(list_accounts).post(create_account))
        .route("/api/manage/accounts/{id}", put(update_account))
        .route("/api/manage/capture/parse", post(parse_message))
        .route("/api/manage/transactions", get(list_transactions).post(create_transaction))
        .route("/api/manage/pledges", get(list_pledges))
        .route("/api/manage/transactions/{id}", get(transaction_detail))
        .route("/api/manage/transactions/{id}/presentation", put(update_presentation))
        .route("/api/manage/transactions/{id}/corrections", post(correct_transaction))
        .route("/api/manage/transactions/{id}/challenge", put(set_transaction_challenge))
        .route("/api/manage/transactions/{id}/receipts", post(upload_receipt).layer(upload_limit))
        .route("/api/manage/documents/{id}/file", get(document_file))
        .route("/api/manage/documents/{id}/publish", post(publish_document))
        .route("/api/manage/statements", get(list_statements).post(upload_statement).layer(upload_limit))
        .route("/api/manage/statements/{id}", get(statement_detail))
        .route("/api/manage/statements/{id}/retry", post(retry_statement))
        .route("/api/manage/statements/{id}/discard", post(discard_statement))
        .route("/api/manage/statements/{id}/rematch", post(rematch_statement))
        .route("/api/manage/statements/{id}/complete", post(complete_statement))
        .route("/api/manage/statements/{id}/rows/{row_id}/link", post(link_row))
        .route("/api/manage/statements/{id}/rows/{row_id}/unlink", post(unlink_row))
        .route("/api/manage/statements/{id}/rows/{row_id}/create", post(create_from_row))
        .route("/api/manage/reports/statement", get(statement_report))
        .route("/api/manage/export/transactions.csv", get(export_csv))
        .route("/api/manage/export/full.json", get(export_json))
}

// ---------------------------------------------------------------------------
// Overview and settings

#[derive(Serialize)]
struct AccountFunds {
    account_id: i64,
    name: String,
    kind: AccountKind,
    amount_minor: i64,
    /// Set when the account keeps a challenge's own money: owed to the main fund.
    challenge_id: Option<i64>,
}

#[derive(Serialize)]
struct Overview {
    fundraiser: Fundraiser,
    totals: Totals,
    funds_by_account: Vec<AccountFunds>,
    awaiting_reconciliation: i64,
    needs_review: i64,
    missing_receipts: i64,
    statement_rows_to_resolve: i64,
    imports_in_progress: i64,
    reconciled_periods: Vec<ReconciledPeriod>,
    recent: Vec<ListItem>,
    pledges: totals::PledgeTotals,
    /// Every challenge with what it has brought in (already part of `totals`).
    challenges: Vec<ChallengeSummary>,
    /// Part of the remaining funds still held in challenges' own accounts:
    /// a receivable until handed over to the main account.
    held_by_challenges_minor: i64,
}

async fn overview(State(state): State<AppState>) -> AppResult<Json<Overview>> {
    let mut conn = state.pool.acquire().await?;
    let fundraiser = settings::fundraiser(&mut conn).await?;
    let records = totals::fundraiser_records(&mut conn).await?;
    let totals = Totals::from_records(&records, fundraiser.opening_funds_minor);
    let opening = fundraiser.opening_funds_account_id.map(|a| (a, fundraiser.opening_funds_minor));
    let places = totals::funds_by_account(&records, opening);
    let challenges = challenges::summaries(&mut conn).await?;
    let held_by_challenges_minor = challenges.iter().filter_map(|c| c.totals.held_minor).sum();
    let funds_by_account = settings::accounts(&mut conn)
        .await?
        .into_iter()
        .map(|a| AccountFunds {
            amount_minor: places.get(&a.id).copied().unwrap_or(0),
            challenge_id: challenges.iter().find(|c| c.challenge.account_id == Some(a.id)).map(|c| c.challenge.id),
            account_id: a.id,
            name: a.name,
            kind: a.kind,
        })
        .collect();

    let mut count = async |status: StatusFilter| -> AppResult<i64> {
        let q = ListQuery { status: Some(status), limit: Some(1), ..ListQuery::default() };
        Ok(transactions::list(&mut conn, q).await?.total)
    };
    let awaiting_reconciliation = count(StatusFilter::NotMatched).await?;
    let needs_review = count(StatusFilter::NeedsReview).await?;
    let missing_receipts = count(StatusFilter::MissingReceipt).await?;

    let statement_rows_to_resolve: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM statement_rows r JOIN statement_imports i ON i.id = r.import_id
         WHERE i.status = 'ready' AND r.match_status IN ('missing', 'conflict', 'review')",
    )
    .fetch_one(&mut *conn)
    .await?;
    let imports_in_progress: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM statement_imports WHERE status IN ('queued', 'processing')")
            .fetch_one(&mut *conn)
            .await?;
    let reconciled_periods = reconciliation::reconciled_periods(&mut conn).await?;
    let recent = transactions::list(&mut conn, ListQuery { limit: Some(5), ..ListQuery::default() }).await?.items;
    let pledges = totals::pledge_totals(&totals::pledge_progress(&records));

    Ok(Json(Overview {
        fundraiser,
        totals,
        funds_by_account,
        awaiting_reconciliation,
        needs_review,
        missing_receipts,
        statement_rows_to_resolve,
        imports_in_progress,
        reconciled_periods,
        recent,
        pledges,
        challenges,
        held_by_challenges_minor,
    }))
}

#[derive(Serialize)]
struct PublicPreview {
    page: PublicPage,
    published: bool,
    public_url: Option<String>,
}

/// The public view (allowlisted fields only), for previewing and for writing
/// WhatsApp updates, even before the page is published.
async fn public_preview(State(state): State<AppState>) -> AppResult<Json<PublicPreview>> {
    let mut conn = state.pool.acquire().await?;
    let published = settings::fundraiser(&mut conn).await?.public_page_enabled;
    let page = publication::build(&mut conn).await?;
    Ok(Json(PublicPreview { page, published, public_url: state.config.public_url.clone() }))
}

async fn get_settings(State(state): State<AppState>) -> AppResult<Json<Fundraiser>> {
    let mut conn = state.pool.acquire().await?;
    Ok(Json(settings::fundraiser(&mut conn).await?))
}

async fn put_settings(
    State(state): State<AppState>,
    Json(update): Json<FundraiserUpdate>,
) -> AppResult<Json<Fundraiser>> {
    let mut tx = db::begin_write(&state.pool).await?;
    let saved = settings::update_fundraiser(&mut tx, update).await?;
    tx.commit().await?;
    Ok(Json(saved))
}

async fn put_public_details(
    State(state): State<AppState>,
    Json(update): Json<settings::PublicDetailsUpdate>,
) -> AppResult<Json<Fundraiser>> {
    let mut tx = db::begin_write(&state.pool).await?;
    let saved = settings::update_public_details(&mut tx, update).await?;
    tx.commit().await?;
    Ok(Json(saved))
}

async fn list_announcements(State(state): State<AppState>) -> AppResult<Json<Vec<Announcement>>> {
    let mut conn = state.pool.acquire().await?;
    Ok(Json(announcements::list(&mut conn, false).await?))
}

async fn create_announcement(
    State(state): State<AppState>,
    Json(input): Json<AnnouncementInput>,
) -> AppResult<(StatusCode, Json<Announcement>)> {
    let mut tx = db::begin_write(&state.pool).await?;
    let saved = announcements::create(&mut tx, input).await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(saved)))
}

async fn update_announcement(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(input): Json<AnnouncementInput>,
) -> AppResult<Json<Announcement>> {
    let mut tx = db::begin_write(&state.pool).await?;
    let saved = announcements::update(&mut tx, id, input).await?;
    tx.commit().await?;
    Ok(Json(saved))
}

async fn delete_announcement(State(state): State<AppState>, Path(id): Path<i64>) -> AppResult<Json<Value>> {
    let mut tx = db::begin_write(&state.pool).await?;
    announcements::delete(&mut tx, id).await?;
    tx.commit().await?;
    Ok(Json(json!({ "ok": true })))
}

async fn list_accounts(State(state): State<AppState>) -> AppResult<Json<Vec<Account>>> {
    let mut conn = state.pool.acquire().await?;
    Ok(Json(settings::accounts(&mut conn).await?))
}

async fn create_account(
    State(state): State<AppState>,
    Json(input): Json<AccountInput>,
) -> AppResult<(StatusCode, Json<Account>)> {
    let mut tx = db::begin_write(&state.pool).await?;
    let account = settings::create_account(&mut tx, input).await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(account)))
}

async fn update_account(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(input): Json<AccountInput>,
) -> AppResult<Json<Account>> {
    let mut tx = db::begin_write(&state.pool).await?;
    let account = settings::update_account(&mut tx, id, input).await?;
    tx.commit().await?;
    Ok(Json(account))
}

// ---------------------------------------------------------------------------
// Challenges

async fn list_challenges(State(state): State<AppState>) -> AppResult<Json<Vec<ChallengeSummary>>> {
    let mut conn = state.pool.acquire().await?;
    Ok(Json(challenges::summaries(&mut conn).await?))
}

async fn get_challenge(State(state): State<AppState>, Path(id): Path<i64>) -> AppResult<Json<ChallengeSummary>> {
    let mut conn = state.pool.acquire().await?;
    Ok(Json(challenges::summary(&mut conn, id).await?))
}

async fn create_challenge(
    State(state): State<AppState>,
    Json(input): Json<ChallengeInput>,
) -> AppResult<(StatusCode, Json<ChallengeSummary>)> {
    let mut tx = db::begin_write(&state.pool).await?;
    let saved = challenges::create(&mut tx, input).await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(saved)))
}

async fn update_challenge(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(input): Json<ChallengeInput>,
) -> AppResult<Json<ChallengeSummary>> {
    let mut tx = db::begin_write(&state.pool).await?;
    let saved = challenges::update(&mut tx, id, input).await?;
    tx.commit().await?;
    Ok(Json(saved))
}

async fn delete_challenge(State(state): State<AppState>, Path(id): Path<i64>) -> AppResult<Json<Value>> {
    let mut tx = db::begin_write(&state.pool).await?;
    challenges::delete(&mut tx, id).await?;
    tx.commit().await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct LinkTransactions {
    transaction_ids: Vec<i64>,
}

async fn link_challenge_transactions(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(request): Json<LinkTransactions>,
) -> AppResult<Json<ChallengeSummary>> {
    let mut tx = db::begin_write(&state.pool).await?;
    challenges::link_many(&mut tx, id, &request.transaction_ids).await?;
    let saved = challenges::summary(&mut tx, id).await?;
    tx.commit().await?;
    Ok(Json(saved))
}

#[derive(Deserialize)]
struct SetChallenge {
    /// `null` takes the record out of its challenge.
    challenge_id: Option<i64>,
}

async fn set_transaction_challenge(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(request): Json<SetChallenge>,
) -> AppResult<Json<Detail>> {
    let mut tx = db::begin_write(&state.pool).await?;
    challenges::set_for_transaction(&mut tx, id, request.challenge_id).await?;
    tx.commit().await?;
    let mut conn = state.pool.acquire().await?;
    Ok(Json(transactions::detail(&mut conn, id).await?))
}

// ---------------------------------------------------------------------------
// Transactions

#[derive(Deserialize)]
struct ParseRequest {
    message: String,
}

#[derive(Serialize)]
struct ParseResponse {
    parsed: ParsedMessage,
    /// A live record already uses this message or reference.
    already_recorded_id: Option<i64>,
}

async fn parse_message(
    State(state): State<AppState>,
    Json(request): Json<ParseRequest>,
) -> AppResult<Json<ParseResponse>> {
    if request.message.trim().is_empty() {
        return Err(AppError::field("message", "Paste the M-Pesa message first."));
    }
    if request.message.chars().count() > 2000 {
        return Err(AppError::field("message", "That is too long to be an M-Pesa message."));
    }
    let parsed = capture::parse(&request.message);
    let mut conn = state.pool.acquire().await?;
    let mut already = transactions::sms_already_saved(&mut conn, &request.message).await?;
    if already.is_none()
        && let Some(reference) = &parsed.reference.value
    {
        already = sqlx::query_scalar(
            "SELECT transaction_id FROM transaction_versions
                 WHERE is_current = 1 AND removed = 0 AND reference = ? AND is_fee = 0 LIMIT 1",
        )
        .bind(reference)
        .fetch_optional(&mut *conn)
        .await?;
    }
    Ok(Json(ParseResponse { parsed, already_recorded_id: already }))
}

/// A pledge with what has been received against it, for the Pledges page and
/// the "fulfils a pledge" picker.
#[derive(Serialize)]
struct ManagedPledge {
    #[serde(flatten)]
    progress: totals::PledgeProgress,
    public_name: Option<String>,
    description: String,
    occurred_at: String,
}

async fn list_pledges(State(state): State<AppState>) -> AppResult<Json<Vec<ManagedPledge>>> {
    let mut conn = state.pool.acquire().await?;
    let records = totals::fundraiser_records(&mut conn).await?;
    let pledges = totals::pledge_progress(&records)
        .into_iter()
        .rev()
        .filter_map(|progress| {
            let r = records.iter().find(|r| r.id == progress.id)?;
            Some(ManagedPledge {
                public_name: r.public_name.clone(),
                description: r.description.clone(),
                occurred_at: r.occurred_at.clone(),
                progress,
            })
        })
        .collect();
    Ok(Json(pledges))
}

async fn list_transactions(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> AppResult<Json<ListResponse>> {
    let mut conn = state.pool.acquire().await?;
    Ok(Json(transactions::list(&mut conn, query).await?))
}

async fn create_transaction(
    State(state): State<AppState>,
    Json(request): Json<CreateRequest>,
) -> AppResult<(StatusCode, Json<Created>)> {
    let origin = if request.source_message.is_some() { "from pasted M-Pesa message" } else { "entered by hand" };
    let mut tx = db::begin_write(&state.pool).await?;
    let created = transactions::create(&mut tx, request, origin).await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(created)))
}

async fn transaction_detail(State(state): State<AppState>, Path(id): Path<i64>) -> AppResult<Json<Detail>> {
    let mut conn = state.pool.acquire().await?;
    Ok(Json(transactions::detail(&mut conn, id).await?))
}

async fn update_presentation(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(update): Json<Presentation>,
) -> AppResult<Json<Detail>> {
    let mut tx = db::begin_write(&state.pool).await?;
    transactions::update_presentation(&mut tx, id, update).await?;
    tx.commit().await?;
    let mut conn = state.pool.acquire().await?;
    Ok(Json(transactions::detail(&mut conn, id).await?))
}

async fn correct_transaction(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(request): Json<CorrectionRequest>,
) -> AppResult<Json<Detail>> {
    let mut tx = db::begin_write(&state.pool).await?;
    transactions::correct(&mut tx, id, request).await?;
    tx.commit().await?;
    let mut conn = state.pool.acquire().await?;
    Ok(Json(transactions::detail(&mut conn, id).await?))
}

// ---------------------------------------------------------------------------
// Files

struct Upload {
    bytes: Vec<u8>,
    file_name: Option<String>,
    fields: HashMap<String, String>,
}

fn multipart_error(e: MultipartError) -> AppError {
    if e.status() == StatusCode::PAYLOAD_TOO_LARGE {
        AppError::TooLarge("The file is too large.".into())
    } else {
        AppError::invalid(format!("The upload could not be read: {}", e.body_text()))
    }
}

async fn field_bytes(field: Field<'_>, max: usize) -> AppResult<Vec<u8>> {
    let bytes = field.bytes().await.map_err(multipart_error)?;
    if bytes.len() > max {
        return Err(AppError::TooLarge(format!("The file is larger than {} MB.", max / (1024 * 1024))));
    }
    Ok(bytes.to_vec())
}

async fn read_upload(mut multipart: Multipart, max: usize) -> AppResult<Upload> {
    let mut upload = Upload { bytes: Vec::new(), file_name: None, fields: HashMap::new() };
    let mut has_file = false;
    while let Some(field) = multipart.next_field().await.map_err(multipart_error)? {
        let name = field.name().unwrap_or_default().to_string();
        if name == "file" {
            upload.file_name = storage::clean_original_name(field.file_name());
            upload.bytes = field_bytes(field, max).await?;
            has_file = true;
        } else if !name.is_empty() {
            let text = field.text().await.map_err(multipart_error)?;
            upload.fields.insert(name, text.chars().take(500).collect());
        }
    }
    if !has_file || upload.bytes.is_empty() {
        return Err(AppError::field("file", "Choose a file to upload."));
    }
    Ok(upload)
}

async fn upload_receipt(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    multipart: Multipart,
) -> AppResult<Json<Detail>> {
    let upload = read_upload(multipart, state.config.max_upload_bytes).await?;
    let file_type = FileType::sniff(&upload.bytes)
        .ok_or_else(|| AppError::Unsupported("Receipts must be a PDF, JPEG, PNG or WebP file.".into()))?;
    {
        let mut conn = state.pool.acquire().await?;
        transactions::current_version(&mut conn, id).await?;
    }
    let sha256 = storage::sha256_hex(&upload.bytes);
    let stored = state.storage.save(Area::Receipts, file_type, &upload.bytes).await?;

    let result: AppResult<()> = async {
        let mut tx = db::begin_write(&state.pool).await?;
        let doc_id: i64 = sqlx::query_scalar(
            "INSERT INTO documents (kind, transaction_id, storage_name, original_name, content_type, size_bytes, sha256, created_at)
             VALUES ('receipt', ?, ?, ?, ?, ?, ?, ?) RETURNING id",
        )
        .bind(id)
        .bind(&stored)
        .bind(&upload.file_name)
        .bind(file_type.content_type())
        .bind(upload.bytes.len() as i64)
        .bind(&sha256)
        .bind(crate::clock::now_string())
        .fetch_one(&mut *tx)
        .await?;
        history::record(&mut tx, Entity::Transaction, Some(id), "receipt", "Receipt attached (private)", None, Some(json!({ "document_id": doc_id }))).await?;
        tx.commit().await?;
        Ok(())
    }
    .await;
    if let Err(e) = result {
        state.storage.remove(&stored).await;
        return Err(e);
    }
    let mut conn = state.pool.acquire().await?;
    Ok(Json(transactions::detail(&mut conn, id).await?))
}

async fn document_file(State(state): State<AppState>, Path(id): Path<i64>) -> AppResult<Response> {
    let mut conn = state.pool.acquire().await?;
    let found: Option<(String, Option<String>, Option<String>)> =
        sqlx::query_as("SELECT kind, storage_name, content_type FROM documents WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *conn)
            .await?;
    drop(conn);
    let (kind, Some(storage_name), Some(content_type)) = found.ok_or_else(|| AppError::not_found("That file"))? else {
        return Err(AppError::not_found("That file"));
    };
    let bytes = state.storage.read(&storage_name).await?;
    Ok(file_response(bytes, &content_type, &format!("{kind}-{id}.{}", extension_for(&content_type))))
}

#[derive(Deserialize)]
struct PublishRequest {
    publish: bool,
    #[serde(default)]
    confirm_redacted: bool,
}

async fn publish_document(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(request): Json<PublishRequest>,
) -> AppResult<Json<Value>> {
    let mut tx = db::begin_write(&state.pool).await?;
    let found: Option<(String, Option<i64>)> =
        sqlx::query_as("SELECT kind, transaction_id FROM documents WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let (kind, transaction_id) = found.ok_or_else(|| AppError::not_found("That file"))?;
    if kind != "receipt" {
        return Err(AppError::invalid("Only receipts can be published."));
    }
    if request.publish {
        if !request.confirm_redacted {
            return Err(AppError::field(
                "confirm_redacted",
                "Confirm that the receipt shows no phone numbers, ID numbers or other private details.",
            ));
        }
        let current = transactions::current_version(&mut tx, transaction_id.unwrap_or_default()).await?;
        if current.kind == transactions::Kind::Personal {
            return Err(AppError::invalid("Receipts for personal activity are never published."));
        }
        sqlx::query("UPDATE documents SET public_token = ?, published_at = ? WHERE id = ? AND public_token IS NULL")
            .bind(storage::random_hex(16))
            .bind(crate::clock::now_string())
            .bind(id)
            .execute(&mut *tx)
            .await?;
    } else {
        sqlx::query("UPDATE documents SET public_token = NULL, published_at = NULL WHERE id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    history::record(
        &mut tx,
        Entity::Transaction,
        transaction_id,
        if request.publish { "receipt_published" } else { "receipt_unpublished" },
        if request.publish { "Receipt published on the public page" } else { "Receipt removed from the public page" },
        None,
        Some(json!({ "document_id": id })),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({ "ok": true })))
}

async fn upload_photo(State(state): State<AppState>, multipart: Multipart) -> AppResult<Json<Fundraiser>> {
    let upload = read_upload(multipart, state.config.max_upload_bytes).await?;
    let file_type = match FileType::sniff(&upload.bytes) {
        Some(t @ (FileType::Jpeg | FileType::Png | FileType::Webp)) => t,
        _ => return Err(AppError::Unsupported("The photo must be a JPEG, PNG or WebP image.".into())),
    };
    let stored = state.storage.save(Area::Memorial, file_type, &upload.bytes).await?;
    let saved: AppResult<(Option<String>, Fundraiser)> = async {
        let mut tx = db::begin_write(&state.pool).await?;
        let previous = settings::set_memorial_photo(&mut tx, Some((&stored, file_type.content_type()))).await?;
        let fundraiser = settings::fundraiser(&mut tx).await?;
        tx.commit().await?;
        Ok((previous, fundraiser))
    }
    .await;
    match saved {
        Ok((previous, fundraiser)) => {
            if let Some(old) = previous {
                state.storage.remove(&old).await;
            }
            Ok(Json(fundraiser))
        }
        Err(e) => {
            state.storage.remove(&stored).await;
            Err(e)
        }
    }
}

async fn upload_share_image(State(state): State<AppState>, multipart: Multipart) -> AppResult<Json<Fundraiser>> {
    let upload = read_upload(multipart, state.config.max_upload_bytes).await?;
    let file_type = match FileType::sniff(&upload.bytes) {
        Some(t @ (FileType::Jpeg | FileType::Png)) => t,
        _ => return Err(AppError::Unsupported("The preview image must be a JPEG or PNG.".into())),
    };
    let stored = state.storage.save(Area::Memorial, file_type, &upload.bytes).await?;
    let saved: AppResult<(Option<String>, Fundraiser)> = async {
        let mut tx = db::begin_write(&state.pool).await?;
        let previous = settings::set_share_image(&mut tx, Some(&stored)).await?;
        let fundraiser = settings::fundraiser(&mut tx).await?;
        tx.commit().await?;
        Ok((previous, fundraiser))
    }
    .await;
    match saved {
        Ok((previous, fundraiser)) => {
            if let Some(old) = previous {
                state.storage.remove(&old).await;
            }
            Ok(Json(fundraiser))
        }
        Err(e) => {
            state.storage.remove(&stored).await;
            Err(e)
        }
    }
}

async fn remove_share_image(State(state): State<AppState>) -> AppResult<Json<Fundraiser>> {
    let mut tx = db::begin_write(&state.pool).await?;
    let previous = settings::set_share_image(&mut tx, None).await?;
    let fundraiser = settings::fundraiser(&mut tx).await?;
    tx.commit().await?;
    if let Some(old) = previous {
        state.storage.remove(&old).await;
    }
    Ok(Json(fundraiser))
}

async fn remove_photo(State(state): State<AppState>) -> AppResult<Json<Fundraiser>> {
    let mut tx = db::begin_write(&state.pool).await?;
    let previous = settings::set_memorial_photo(&mut tx, None).await?;
    let fundraiser = settings::fundraiser(&mut tx).await?;
    tx.commit().await?;
    if let Some(old) = previous {
        state.storage.remove(&old).await;
    }
    Ok(Json(fundraiser))
}

// ---------------------------------------------------------------------------
// Statements

async fn list_statements(State(state): State<AppState>) -> AppResult<Json<Vec<ImportSummary>>> {
    let mut conn = state.pool.acquire().await?;
    Ok(Json(statements::list(&mut conn).await?))
}

async fn upload_statement(
    State(state): State<AppState>,
    multipart: Multipart,
) -> AppResult<(StatusCode, Json<ImportSummary>)> {
    let upload = read_upload(multipart, state.config.max_upload_bytes).await?;
    if FileType::sniff(&upload.bytes) != Some(FileType::Pdf) {
        return Err(AppError::Unsupported("Statements must be PDF files downloaded from M-Pesa.".into()));
    }
    let account_id: i64 = upload
        .fields
        .get("account_id")
        .and_then(|v| v.trim().parse().ok())
        .ok_or_else(|| AppError::field("account_id", "Choose the account this statement belongs to."))?;
    let password = upload.fields.get("password").map(|p| p.trim().to_string()).filter(|p| !p.is_empty());
    let sha256 = storage::sha256_hex(&upload.bytes);

    {
        let mut conn = state.pool.acquire().await?;
        statements::check_account(&mut conn, account_id).await?;
        if let Some((existing, at)) = statements::existing_import_for_hash(&mut conn, &sha256).await? {
            return Err(AppError::Conflict(format!(
                "This exact file was already uploaded (import #{existing}, {at}). Open that import instead. \
                 A matching file only shows it is the same file, not that the statement is genuine."
            )));
        }
    }

    let stored = state.storage.save(Area::Statements, FileType::Pdf, &upload.bytes).await?;
    let record = StoredUpload {
        account_id,
        storage_name: stored.clone(),
        original_name: upload.file_name,
        size_bytes: upload.bytes.len() as i64,
        sha256,
    };
    let created: AppResult<i64> = async {
        let mut tx = db::begin_write(&state.pool).await?;
        let id = statements::create(&mut tx, &record).await?;
        tx.commit().await?;
        Ok(id)
    }
    .await;
    let id = match created {
        Ok(id) => id,
        Err(e) => {
            state.storage.remove(&stored).await;
            return Err(match e {
                AppError::Conflict(_) => AppError::Conflict("This exact file was already uploaded.".into()),
                other => other,
            });
        }
    };
    state.queue.submit(id, password);
    let mut conn = state.pool.acquire().await?;
    Ok((StatusCode::ACCEPTED, Json(statements::summary(&mut conn, id).await?)))
}

async fn statement_detail(State(state): State<AppState>, Path(id): Path<i64>) -> AppResult<Json<ImportDetail>> {
    let mut conn = state.pool.acquire().await?;
    Ok(Json(reconciliation::detail(&mut conn, id).await?))
}

#[derive(Deserialize)]
struct RetryRequest {
    #[serde(default)]
    password: Option<String>,
}

async fn retry_statement(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(request): Json<RetryRequest>,
) -> AppResult<Json<ImportSummary>> {
    let mut tx = db::begin_write(&state.pool).await?;
    statements::requeue(&mut tx, id).await?;
    tx.commit().await?;
    state.queue.submit(id, request.password.map(|p| p.trim().to_string()));
    let mut conn = state.pool.acquire().await?;
    Ok(Json(statements::summary(&mut conn, id).await?))
}

#[derive(Deserialize)]
struct ReasonRequest {
    reason: String,
}

async fn discard_statement(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(request): Json<ReasonRequest>,
) -> AppResult<Json<ImportSummary>> {
    let mut tx = db::begin_write(&state.pool).await?;
    statements::discard(&mut tx, id, &request.reason).await?;
    tx.commit().await?;
    let mut conn = state.pool.acquire().await?;
    Ok(Json(statements::summary(&mut conn, id).await?))
}

async fn rematch_statement(State(state): State<AppState>, Path(id): Path<i64>) -> AppResult<Json<ImportDetail>> {
    let mut tx = db::begin_write(&state.pool).await?;
    let summary = statements::summary(&mut tx, id).await?;
    if summary.status == statements::ImportStatus::Ready {
        reconciliation::rematch_unresolved(&mut tx, id).await?;
    }
    tx.commit().await?;
    statement_detail(State(state), Path(id)).await
}

async fn complete_statement(State(state): State<AppState>, Path(id): Path<i64>) -> AppResult<Json<ImportDetail>> {
    let mut tx = db::begin_write(&state.pool).await?;
    reconciliation::complete(&mut tx, id).await?;
    tx.commit().await?;
    statement_detail(State(state), Path(id)).await
}

#[derive(Deserialize)]
struct LinkRequest {
    transaction_id: i64,
}

async fn link_row(
    State(state): State<AppState>,
    Path((id, row_id)): Path<(i64, i64)>,
    Json(request): Json<LinkRequest>,
) -> AppResult<Json<ImportDetail>> {
    let mut tx = db::begin_write(&state.pool).await?;
    reconciliation::link_row(&mut tx, id, row_id, request.transaction_id).await?;
    tx.commit().await?;
    statement_detail(State(state), Path(id)).await
}

async fn unlink_row(
    State(state): State<AppState>,
    Path((id, row_id)): Path<(i64, i64)>,
) -> AppResult<Json<ImportDetail>> {
    let mut tx = db::begin_write(&state.pool).await?;
    reconciliation::unlink_row(&mut tx, id, row_id).await?;
    tx.commit().await?;
    statement_detail(State(state), Path(id)).await
}

async fn create_from_row(
    State(state): State<AppState>,
    Path((id, row_id)): Path<(i64, i64)>,
    Json(input): Json<CreateFromRow>,
) -> AppResult<Json<ImportDetail>> {
    let mut tx = db::begin_write(&state.pool).await?;
    reconciliation::create_from_row(&mut tx, id, row_id, input).await?;
    tx.commit().await?;
    statement_detail(State(state), Path(id)).await
}

// ---------------------------------------------------------------------------
// Export

async fn statement_report(
    State(state): State<AppState>,
    Query(query): Query<reports::StatementQuery>,
) -> AppResult<Json<reports::StatementReport>> {
    let mut conn = state.pool.acquire().await?;
    let report = reports::statement(&mut conn, query, auth::current_actor(), state.config.public_url.clone()).await?;
    Ok(Json(report))
}

async fn export_csv(State(state): State<AppState>) -> AppResult<Response> {
    let mut conn = state.pool.acquire().await?;
    let csv = export::transactions_csv(&mut conn).await?;
    let name = format!(
        "mchango-transactions-{}.csv",
        crate::clock::format_date(crate::clock::nairobi_date(crate::clock::now()))
    );
    Ok((
        [
            (header::CONTENT_TYPE, "text/csv; charset=utf-8".to_string()),
            (header::CONTENT_DISPOSITION, format!("attachment; filename=\"{name}\"")),
        ],
        csv,
    )
        .into_response())
}

async fn export_json(State(state): State<AppState>) -> AppResult<Response> {
    let mut conn = state.pool.acquire().await?;
    let data = export::full_json(&mut conn).await?;
    let name =
        format!("mchango-export-{}.json", crate::clock::format_date(crate::clock::nairobi_date(crate::clock::now())));
    Ok((
        [
            (header::CONTENT_TYPE, "application/json".to_string()),
            (header::CONTENT_DISPOSITION, format!("attachment; filename=\"{name}\"")),
        ],
        serde_json::to_string_pretty(&data).map_err(|e| AppError::internal(e.to_string()))?,
    )
        .into_response())
}

// ---------------------------------------------------------------------------
// Sign-in

pub fn auth_routes() -> Router<AppState> {
    Router::new()
        .route("/api/manage/auth/login", post(login))
        .route("/api/manage/auth/logout", post(logout))
        .route("/api/manage/auth/me", get(me))
}

#[derive(Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}

async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<LoginRequest>,
) -> AppResult<Response> {
    if request.username.len() > 64 || request.password.len() > 400 {
        return Err(AppError::Unauthorized {
            code: "invalid_credentials",
            message: "That username and password do not match.".into(),
        });
    }
    let (token, username) = auth::login(&state.pool, &state.limiter, &request.username, &request.password).await?;
    let cookie = auth::session_cookie(&token, super::forwarded_https(&headers));
    Ok(([(header::SET_COOKIE, cookie)], Json(json!({ "username": username }))).into_response())
}

async fn logout(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Response> {
    if let Some(token) = super::session_token(&headers) {
        auth::logout(&state.pool, &token).await?;
    }
    let cookie = auth::clear_cookie(super::forwarded_https(&headers));
    Ok(([(header::SET_COOKIE, cookie)], Json(json!({ "ok": true }))).into_response())
}

async fn me(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Json<Value>> {
    let user = match super::session_token(&headers) {
        Some(token) => auth::session_user(&state.pool, &token).await?,
        None => None,
    };
    match user {
        Some(username) => Ok(Json(json!({ "username": username }))),
        None => Err(AppError::Unauthorized { code: "unauthenticated", message: "Sign in to continue.".into() }),
    }
}
