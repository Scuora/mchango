//! One end-to-end check of the financial rules, using the demo data and the
//! demo statement. Kept deliberately small.

// Amounts are written as shillings_cents, e.g. 1_500_00 for KES 1,500.00.
#![allow(clippy::inconsistent_digit_grouping)]

use axum::body::Body;
use axum::http::{Request, StatusCode};
use std::path::PathBuf;
use std::sync::Arc;
use tower::ServiceExt;

use mchango::api::{self, AppState};
use mchango::config::Config;
use mchango::error::AppError;
use mchango::reconciliation::{self, CreateFromRow, MatchStatus};
use mchango::statements::worker::{ImportQueue, Worker};
use mchango::statements::{self, StoredUpload, pdf};
use mchango::storage::{self, Area, FileType, Storage};
use mchango::transactions::totals::{
    PledgeStatus, Totals, fundraiser_records, funds_by_account, pledge_progress, pledge_totals,
};
use mchango::transactions::{self, CorrectionRequest, CreateRequest, Kind, MovementInput, PledgedBy, Presentation};
use mchango::{announcements, db, money::Amount, publication, seed};

fn temp_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("mchango-test-{}", storage::random_hex(6)));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

async fn totals(pool: &sqlx::SqlitePool) -> Totals {
    let mut conn = pool.acquire().await.unwrap();
    let records = fundraiser_records(&mut conn).await.unwrap();
    Totals::from_records(&records, 12_000_00)
}

async fn transaction_count(pool: &sqlx::SqlitePool) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM transactions").fetch_one(pool).await.unwrap()
}

#[tokio::test]
async fn demo_flow() {
    let dir = temp_dir();
    let db_path = dir.join("test.sqlite");
    let pool = db::connect(&db_path).await.unwrap();
    let storage = Storage::open(&dir.join("uploads")).unwrap();
    seed::run(&pool, &storage, &dir).await.unwrap();

    // Totals: corrections count once, personal activity and transfers count for nothing.
    let t = totals(&pool).await;
    assert_eq!(t.contributions_minor, 29_000_00);
    assert_eq!(t.expenses_minor, 16_000_00, "the corrected 1,800 → 1,500 is counted once");
    assert_eq!(t.charges_minor, 89_00, "53 + 29 + 7, each charge once");
    assert_eq!(t.refunds_paid_minor, 500_00);
    assert_eq!(t.remaining_minor, 12_000_00 + 29_000_00 - 16_000_00 - 89_00 - 500_00);
    assert_eq!(t.pledged_outstanding_minor, 10_000_00 + 150_000_00, "the group's balance and the family pledge");
    {
        let mut conn = pool.acquire().await.unwrap();
        let records = fundraiser_records(&mut conn).await.unwrap();
        let places = funds_by_account(&records, Some((2, 12_000_00)));
        assert_eq!(places[&2], 12_000_00 + 3_000_00 - 1_500_00, "a withdrawal moves money to cash");
        assert_eq!(places.values().sum::<i64>(), t.remaining_minor);
    }

    // Pledges say who made them; money linked to a pledge moves it from promised to received.
    {
        let mut tx = db::begin_write(&pool).await.unwrap();
        let records = fundraiser_records(&mut tx).await.unwrap();
        let pledges = pledge_totals(&pledge_progress(&records));
        assert_eq!((pledges.family.pledged_minor, pledges.family.received_minor), (150_000_00, 0));
        assert_eq!((pledges.friends.pledged_minor, pledges.friends.received_minor), (15_000_00, 5_000_00));
        assert_eq!(pledges.friends.outstanding_minor, 10_000_00, "the group's pledge is part received");
        let group = pledge_progress(&records).into_iter().find(|p| p.pledged_by == PledgedBy::Friends).unwrap();
        assert_eq!(group.status, PledgeStatus::PartReceived);
        // Regrouping is a presentation change: no money moves.
        let regroup = Presentation {
            public_name: Some("Makao Welfare Group".into()),
            description: String::new(),
            notes: String::new(),
            pledged_by: Some(PledgedBy::Family),
        };
        transactions::update_presentation(&mut tx, group.id, regroup).await.unwrap();
        let records = fundraiser_records(&mut tx).await.unwrap();
        assert_eq!(pledge_totals(&pledge_progress(&records)).family.pledged_minor, 165_000_00);
        tx.rollback().await.unwrap();
    }

    // Pasting the same message twice is refused.
    {
        let mut tx = db::begin_write(&pool).await.unwrap();
        let message = "TI1A2B3C4D Confirmed.You have received Ksh2,000.00 from GRACE WANJIRU 0722111222 on 3/9/26 at 9:12 AM New M-PESA balance is Ksh3,412.00.";
        let again = transactions::create(
            &mut tx,
            CreateRequest {
                movement: MovementInput {
                    kind: Kind::Contribution,
                    direction: None,
                    amount_minor: Amount::try_from(2_000_00).unwrap(),
                    occurred_at: "2026-09-03T09:12:00+03:00".into(),
                    account_id: Some(1),
                    to_account_id: None,
                    reference: Some("TI1A2B3C4D".into()),
                    is_fee: false,
                    related_transaction_id: None,
                    counterparty: None,
                },
                presentation: Presentation {
                    public_name: None,
                    description: String::new(),
                    notes: String::new(),
                    pledged_by: None,
                },
                source_message: Some(message.into()),
                charge_minor: None,
                client_key: None,
                confirm_possible_duplicate: true,
            },
            "test",
        )
        .await;
        assert!(matches!(again, Err(AppError::Conflict(_))));
    }

    // A hand-entered copy of Mama Brian's contribution is flagged; a repeated
    // submission of the same form returns the record already saved.
    {
        let manual = |confirm: bool, key: Option<&str>| CreateRequest {
            movement: MovementInput {
                kind: Kind::Contribution,
                direction: None,
                amount_minor: Amount::try_from(2_000_00).unwrap(),
                occurred_at: "2026-09-03T15:00:00+03:00".into(),
                account_id: Some(1),
                to_account_id: None,
                reference: None,
                is_fee: false,
                related_transaction_id: None,
                counterparty: None,
            },
            presentation: Presentation {
                public_name: None,
                description: String::new(),
                notes: String::new(),
                pledged_by: None,
            },
            source_message: None,
            charge_minor: None,
            client_key: key.map(Into::into),
            confirm_possible_duplicate: confirm,
        };
        let mut tx = db::begin_write(&pool).await.unwrap();
        let flagged = transactions::create(&mut tx, manual(false, None), "test").await;
        assert!(matches!(flagged, Err(AppError::PossibleDuplicate { ref matches, .. }) if !matches.is_empty()));
        let first = transactions::create(&mut tx, manual(true, Some("form-key-0001")), "test").await.unwrap();
        let again = transactions::create(&mut tx, manual(true, Some("form-key-0001")), "test").await.unwrap();
        assert_eq!(first.id, again.id, "a repeated submission does not create a second record");
        tx.rollback().await.unwrap();
    }

    if pdf::resolve_program(std::path::Path::new("pdftotext")).is_none() {
        eprintln!("pdftotext is not installed; skipping the statement part of this test");
        return;
    }
    let worker = Worker {
        pool: pool.clone(),
        storage: storage.clone(),
        queue: ImportQueue::default(),
        pdftotext: "pdftotext".into(),
        timeout: std::time::Duration::from_secs(30),
    };
    assert!(worker.run_once().await.unwrap());

    let mut conn = pool.acquire().await.unwrap();
    let detail = reconciliation::detail(&mut conn, 1).await.unwrap();
    assert_eq!(detail.import.error_message, None);
    assert_eq!(
        (detail.counts.matched, detail.counts.conflict, detail.counts.review, detail.counts.missing),
        (7, 1, 1, 1),
        "a payment and its charge share a reference but match separately"
    );
    assert_eq!(detail.ledger_only.len(), 2);
    assert!(!detail.readiness.can_complete);
    let row = |status: MatchStatus| detail.rows.iter().find(|r| r.match_status == status).unwrap();
    let (conflict, review, missing) = (row(MatchStatus::Conflict), row(MatchStatus::Review), row(MatchStatus::Missing));
    let (conflict_record, review_record) =
        (conflict.candidate_transaction_id.unwrap(), review.candidate_transaction_id.unwrap());
    let (review_row, missing_row) = (review.id, missing.id);
    drop(conn);

    // Resolve: correct the typo, confirm the suggestion, add the missing row.
    let mut tx = db::begin_write(&pool).await.unwrap();
    let mut fixed = transactions::current_version(&mut tx, conflict_record).await.unwrap().movement();
    fixed.amount_minor = 2_000_00;
    let replacement = MovementInput {
        kind: fixed.kind,
        direction: fixed.direction,
        amount_minor: Amount::try_from(fixed.amount_minor).unwrap(),
        occurred_at: fixed.occurred_at,
        account_id: fixed.account_id,
        to_account_id: None,
        reference: fixed.reference,
        is_fee: false,
        related_transaction_id: None,
        counterparty: None,
    };
    transactions::correct(
        &mut tx,
        conflict_record,
        CorrectionRequest {
            reason: "The statement shows 2,000; I typed 2,500.".into(),
            replacement: Some(replacement),
        },
    )
    .await
    .unwrap();
    reconciliation::link_row(&mut tx, 1, review_row, review_record).await.unwrap();
    reconciliation::create_from_row(
        &mut tx,
        1,
        missing_row,
        CreateFromRow {
            kind: Kind::Contribution,
            other_account_id: None,
            related_transaction_id: None,
            presentation: Presentation {
                public_name: Some("Samuel K.".into()),
                description: String::new(),
                notes: String::new(),
                pledged_by: None,
            },
        },
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();

    let mut conn = pool.acquire().await.unwrap();
    let detail = reconciliation::detail(&mut conn, 1).await.unwrap();
    assert_eq!(detail.counts.matched, 10);
    assert!(detail.ledger_only.is_empty());
    assert_eq!(detail.balance.as_ref().unwrap().unexplained_difference_minor, Some(0));
    assert!(detail.readiness.can_complete, "{:?}", detail.readiness.blockers);
    let church = transactions::item(&mut conn, review_record).await.unwrap();
    assert_eq!(church.public_name.as_deref(), Some("St Paul's Church harambee"), "custom names survive matching");
    assert_eq!(church.reference.as_deref(), Some("TJD3E4F5G6"));
    let corrected = transactions::detail(&mut conn, conflict_record).await.unwrap();
    assert_eq!(corrected.versions.len(), 2, "the original is kept with the reason");
    drop(conn);
    let mut tx = db::begin_write(&pool).await.unwrap();
    reconciliation::complete(&mut tx, 1).await.unwrap();
    tx.commit().await.unwrap();

    // The same file again is recognised; an overlapping statement creates no new records.
    let mut conn = pool.acquire().await.unwrap();
    let original = std::fs::read(dir.join("demo-statement-october-2026.pdf")).unwrap();
    assert!(statements::existing_import_for_hash(&mut conn, &storage::sha256_hex(&original)).await.unwrap().is_some());
    drop(conn);
    let mut pages = seed::demo_statement_pages();
    pages[1].push("Second download of the same period.".into());
    let overlap = seed::simple_pdf(&pages, 6.5, true);
    let stored = storage.save(Area::Statements, FileType::Pdf, &overlap).await.unwrap();
    let before = transaction_count(&pool).await;
    let mut tx = db::begin_write(&pool).await.unwrap();
    let second = statements::create(
        &mut tx,
        &StoredUpload {
            account_id: 1,
            storage_name: stored,
            original_name: None,
            size_bytes: overlap.len() as i64,
            sha256: storage::sha256_hex(&overlap),
        },
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();
    assert!(worker.run_once().await.unwrap());
    let mut conn = pool.acquire().await.unwrap();
    let again = reconciliation::detail(&mut conn, second).await.unwrap();
    assert_eq!(again.counts.matched, 10);
    assert_eq!(transaction_count(&pool).await, before);

    // The public page lists exactly what it totals, and nothing private.
    let page = publication::page(&mut conn).await.unwrap();
    let sum = |entries: &[publication::PublicEntry]| entries.iter().filter_map(|e| e.amount_minor).sum::<i64>();
    assert_eq!(sum(&page.contributions), page.totals.contributions_minor);
    assert_eq!(sum(&page.spending), page.totals.expenses_minor);
    assert_eq!(sum(&page.charges), page.totals.charges_minor);
    assert_eq!(page.statement_checks.reconciled_periods.len(), 1);
    let json = serde_json::to_string(&page).unwrap();
    for private in [
        "GRACE WANJIRU",
        "0722111222",
        "TI1A2B3C4D",
        "DAVID MUTUA",
        "Loan repaid",
        "AMINA",
        "Airtime for my own",
        "1435000",
    ] {
        assert!(!json.contains(private), "public page leaked {private:?}");
    }
    assert!(json.contains("Mama Brian") && json.contains("…3C4D"));

    // "Check my contribution" finds contributions only; personal activity looks like "not found".
    let found = publication::check_contribution(&mut conn, "ti1a2b3c4d").await.unwrap();
    assert!(found.found && found.contribution.as_ref().unwrap().listed_as == "Mama Brian");
    let personal = publication::check_contribution(&mut conn, "TJ5P6Q7R8S").await.unwrap();
    assert!(!personal.found && personal.contribution.is_none());

    // A Kiswahili version is published beside the English; left blank, the English stands alone.
    let update = |title_sw: &str| {
        serde_json::from_value(
            serde_json::json!({ "title": "Burial on Saturday", "title_sw": title_sw, "body": "At home." }),
        )
        .unwrap()
    };
    announcements::create(&mut conn, update("Mazishi Jumamosi")).await.unwrap();
    announcements::create(&mut conn, update("  ")).await.unwrap();
    let page = publication::page(&mut conn).await.unwrap();
    let titles: Vec<_> = page.announcements.iter().map(|a| (a.title.as_str(), a.title_sw.as_deref())).collect();
    assert_eq!(titles, [("Burial on Saturday", None), ("Burial on Saturday", Some("Mazishi Jumamosi"))]);
    drop(conn);

    // Everything survives a restart.
    let expected = totals(&pool).await;
    pool.close().await;
    let pool = db::connect(&db_path).await.unwrap();
    assert_eq!(totals(&pool).await, expected);
    let mut conn = pool.acquire().await.unwrap();
    assert_eq!(reconciliation::reconciled_periods(&mut conn).await.unwrap().len(), 1);
}

#[tokio::test]
async fn routes_keep_management_private() {
    let dir = temp_dir();
    let pool = db::connect(&dir.join("test.sqlite")).await.unwrap();
    let storage = Storage::open(&dir.join("uploads")).unwrap();
    let config = Config { static_dir: dir.join("no-frontend"), ..Config::for_tasks() };
    mchango::auth::add_user(&pool, "tester", "a long test password").await.unwrap();
    let state = AppState {
        pool,
        storage,
        queue: ImportQueue::default(),
        config: Arc::new(config),
        limiter: Arc::new(mchango::auth::LoginLimiter::default()),
        check_limiter: Arc::new(api::CheckLimiter::default()),
    };

    let get = |uri: &str, host: &str| Request::get(uri).header("host", host).body(Body::empty()).unwrap();
    let public = api::public_router(state.clone());
    let response = public.clone().oneshot(get("/api/manage/overview", "example.org")).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND, "the public listener has no management API");
    let response = public.oneshot(get("/api/public/page", "example.org")).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND, "unpublished until switched on");

    let manage = api::manage_router(state);
    let response = manage.clone().oneshot(get("/api/manage/overview", "localhost:8081")).await.unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED, "management needs a signed-in account");

    let sign_in = |password: &str| {
        Request::post("/api/manage/auth/login")
            .header("host", "localhost")
            .header("x-mchango", "1")
            .header("content-type", "application/json")
            .body(Body::from(format!(r#"{{"username":"Tester","password":"{password}"}}"#)))
            .unwrap()
    };
    let response = manage.clone().oneshot(sign_in("wrong password")).await.unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    let response = manage.clone().oneshot(sign_in("a long test password")).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let cookie = response.headers()["set-cookie"].to_str().unwrap().split(';').next().unwrap().to_string();
    let signed_in = Request::get("/api/manage/overview")
        .header("host", "localhost")
        .header("cookie", &cookie)
        .body(Body::empty())
        .unwrap();
    let response = manage.clone().oneshot(signed_in).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let response = manage.clone().oneshot(get("/api/manage/overview", "evil.example")).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN, "unexpected Host (DNS rebinding) is refused");
    let post = Request::post("/api/manage/accounts")
        .header("host", "localhost")
        .header("cookie", &cookie)
        .header("content-type", "application/json")
        .body(Body::from(r#"{"name":"Bank","kind":"bank"}"#))
        .unwrap();
    let response = manage.oneshot(post).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN, "changes need the app's own header");
}
