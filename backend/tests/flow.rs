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
use mchango::{announcements, challenges, db, history, money::Amount, publication, reports, seed, settings};

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
                challenge_id: None,
                shares: None,
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
            challenge_id: None,
            shares: None,
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

fn record(kind: Kind, amount: i64, related: Option<i64>, challenge_id: Option<i64>) -> CreateRequest {
    CreateRequest {
        movement: MovementInput {
            kind,
            direction: None,
            amount_minor: Amount::try_from(amount).unwrap(),
            occurred_at: "2026-09-05T10:00:00+03:00".into(),
            account_id: (kind != Kind::Pledge).then_some(1),
            to_account_id: None,
            reference: None,
            is_fee: false,
            related_transaction_id: related,
            counterparty: None,
        },
        presentation: Presentation {
            public_name: Some("Cousin Zawadi".into()),
            description: String::new(),
            notes: String::new(),
            pledged_by: None,
        },
        source_message: None,
        charge_minor: None,
        client_key: None,
        confirm_possible_duplicate: true,
        challenge_id,
        shares: None,
    }
}

/// A challenge is a kitty inside the main fund: its money counts once, in the
/// main totals, and the challenge adds up what came in through it.
#[tokio::test]
async fn challenges_keep_their_own_tally() {
    let dir = temp_dir();
    let pool = db::connect(&dir.join("test.sqlite")).await.unwrap();
    let storage = Storage::open(&dir.join("uploads")).unwrap();
    seed::run(&pool, &storage, &dir).await.unwrap();
    let before = totals(&pool).await;
    let mut tx = db::begin_write(&pool).await.unwrap();

    let input =
        |name: &str| serde_json::from_value(serde_json::json!({ "name": name, "target_minor": 5_000_00 })).unwrap();
    let cousins = challenges::create(&mut tx, input("Cousins' 1,000 challenge")).await.unwrap().challenge.id;
    assert!(challenges::create(&mut tx, input("Cousins' 1,000 challenge")).await.is_err(), "names are unique");
    let main_account = serde_json::json!({ "name": "Shared", "account_id": 1 });
    let shared = challenges::create(&mut tx, serde_json::from_value(main_account).unwrap()).await;
    assert!(shared.is_err(), "the main account, holding other money, cannot become a challenge's own");

    // Money and a pledge through the challenge; the pledge's payment joins it on its own.
    let gift = transactions::create(&mut tx, record(Kind::Contribution, 1_000_00, None, Some(cousins)), "test")
        .await
        .unwrap()
        .id;
    let pledge =
        transactions::create(&mut tx, record(Kind::Pledge, 3_000_00, None, Some(cousins)), "test").await.unwrap().id;
    let paid = transactions::create(&mut tx, record(Kind::Contribution, 2_000_00, Some(pledge), None), "test")
        .await
        .unwrap()
        .id;
    assert_eq!(transactions::item(&mut tx, paid).await.unwrap().challenge_id, Some(cousins));
    let kitty = challenges::summary(&mut tx, cousins).await.unwrap().totals;
    assert_eq!((kitty.raised_minor, kitty.contributions_count), (3_000_00, 2));
    assert_eq!(kitty.pledged_outstanding_minor, 1_000_00);
    let records = fundraiser_records(&mut tx).await.unwrap();
    assert_eq!(
        Totals::from_records(&records, 12_000_00).contributions_minor,
        before.contributions_minor + 3_000_00,
        "challenge money is counted once, in the main totals"
    );

    // Only money received and pledges come in through a challenge.
    let expense: i64 = sqlx::query_scalar(
        "SELECT transaction_id FROM transaction_versions WHERE is_current = 1 AND kind = 'expense' LIMIT 1",
    )
    .fetch_one(&mut *tx)
    .await
    .unwrap();
    assert!(matches!(
        challenges::set_for_transaction(&mut tx, expense, Some(cousins)).await,
        Err(AppError::Invalid { .. })
    ));

    // An archived record stops counting but keeps its link, so restoring it puts it back;
    // a challenge with records is closed, not deleted.
    transactions::correct(&mut tx, gift, CorrectionRequest { reason: "Entered twice".into(), replacement: None })
        .await
        .unwrap();
    assert_eq!(transactions::item(&mut tx, gift).await.unwrap().challenge_id, Some(cousins));
    assert_eq!(challenges::summary(&mut tx, cousins).await.unwrap().totals.raised_minor, 2_000_00);
    assert!(transactions::restore(&mut tx, gift, "x").await.is_err(), "restoring needs a reason");
    transactions::restore(&mut tx, gift, "It was not a duplicate").await.unwrap();
    assert_eq!(challenges::summary(&mut tx, cousins).await.unwrap().totals.raised_minor, 3_000_00);
    transactions::correct(
        &mut tx,
        gift,
        CorrectionRequest { reason: "Entered twice after all".into(), replacement: None },
    )
    .await
    .unwrap();
    let history = transactions::detail(&mut tx, gift).await.unwrap().history;
    let actions: Vec<_> = history.iter().map(|h| h.action.as_str()).collect();
    assert_eq!(actions[..3], ["removed", "restored", "removed"], "every step is in the history, newest first");
    assert!(matches!(challenges::delete(&mut tx, cousins).await, Err(AppError::Conflict(_))));

    // The public page shows published challenges and tags their contributions.
    let page = publication::build(&mut tx).await.unwrap();
    let shown = page.challenges.iter().find(|c| c.id == cousins).unwrap();
    let tagged: i64 =
        page.contributions.iter().filter(|e| e.challenge_id == Some(cousins)).filter_map(|e| e.amount_minor).sum();
    assert_eq!((shown.raised_minor, tagged), (2_000_00, 2_000_00));
    let hidden =
        serde_json::from_value(serde_json::json!({ "name": "Cousins' 1,000 challenge", "published": false })).unwrap();
    challenges::update(&mut tx, cousins, hidden).await.unwrap();
    let page = publication::build(&mut tx).await.unwrap();
    assert!(page.challenges.is_empty() && page.contributions.iter().all(|e| e.challenge_id.is_none()));

    // A challenge that keeps its own money: what it receives is its own, and what it
    // still holds is owed to the main fund (a receivable) until handed over.
    fn json<T: serde::de::DeserializeOwned>(v: serde_json::Value) -> T {
        serde_json::from_value(v).unwrap()
    }
    let organiser =
        settings::create_account(&mut tx, json(serde_json::json!({ "name": "Walk organiser", "kind": "mpesa" })))
            .await
            .unwrap()
            .id;
    // Givers send to the organiser's number, not the fundraiser's: an optional setting, checked like the fundraiser's.
    let unnamed = json(
        serde_json::json!({ "name": "Sponsored walk", "giving_method": "phone", "giving_number": "0722 000 000" }),
    );
    assert!(challenges::create(&mut tx, unnamed).await.is_err(), "the name M-Pesa shows is required");
    let walk = json(serde_json::json!({
        "name": "Sponsored walk", "account_id": organiser,
        "giving_method": "phone", "giving_number": "0722 000 000", "giving_name": "Jane Organiser",
        "messages": [
            { "title": "Challenge message", "body": "❤️ {name} ❤️\n\n{list}   \n\n•  Salio : KSh {remaining}" },
            { "title": "", "body": "Funds remaining: KES {funds_remaining}" },
            { "title": "Draft", "body": "   " },
        ],
    }));
    let walk = challenges::create(&mut tx, walk).await.unwrap().challenge;
    let messages: Vec<_> = walk.messages.iter().map(|m| (m.title.as_str(), m.body.as_str())).collect();
    assert_eq!(
        messages,
        [
            ("Challenge message", "❤️ {name} ❤️\n\n{list}\n\n•  Salio : KSh {remaining}"),
            ("Message 2", "Funds remaining: KES {funds_remaining}"),
        ],
        "kept as written, in order; an empty one is dropped and an untitled one is named"
    );
    let walk = walk.id;
    let mut into_kitty = record(Kind::Contribution, 4_000_00, None, None);
    into_kitty.movement.account_id = Some(organiser);
    let walked = transactions::create(&mut tx, into_kitty, "test").await.unwrap().id;
    assert_eq!(transactions::item(&mut tx, walked).await.unwrap().challenge_id, Some(walk));
    assert!(
        challenges::set_for_transaction(&mut tx, walked, None).await.is_err(),
        "money in its account stays its own"
    );
    let mut handover = record(Kind::Transfer, 3_000_00, None, None);
    handover.movement.account_id = Some(organiser);
    handover.movement.to_account_id = Some(1);
    transactions::create(&mut tx, handover, "test").await.unwrap();
    let t = challenges::summary(&mut tx, walk).await.unwrap().totals;
    assert_eq!((t.raised_minor, t.held_minor, t.handed_over_minor), (4_000_00, Some(1_000_00), Some(3_000_00)));
    let page = publication::build(&mut tx).await.unwrap();
    assert_eq!(page.totals.held_by_challenges_minor, 1_000_00, "the overall fund tracks it as a receivable");
    let shown = page.challenges.iter().find(|c| c.id == walk).unwrap();
    assert_eq!(shown.giving.as_ref().map(|g| g.number.as_str()), Some("0722 000 000"));
    assert_eq!(page.totals.contributions_minor, before.contributions_minor + 2_000_00 + 4_000_00);

    // A statement for the kitty's account: what came in, what was handed over, what it still holds.
    let statement = |account_id: Option<i64>| reports::StatementQuery { from: None, to: None, account_id };
    let kitty = reports::statement(&mut tx, statement(Some(organiser)), "test".into(), None).await.unwrap();
    assert_eq!(kitty.account.as_ref().and_then(|a| a.challenge_name.as_deref()), Some("Sponsored walk"));
    assert_eq!(kitty.fundraiser.giving_number, "0722 000 000", "givers are pointed to the challenge's own number");
    assert_eq!((kitty.brought_forward_minor, kitty.closing_minor), (0, 1_000_00));
    assert_eq!((kitty.totals.received_minor, kitty.totals.transfers_out_minor), (4_000_00, 3_000_00));
    let labels: Vec<_> = kitty.entries.iter().map(|e| e.label.as_str()).collect();
    assert_eq!(labels, ["Cousin Zawadi", "Moved to M-Pesa"]);
    let whole = reports::statement(&mut tx, statement(None), "test".into(), None).await.unwrap();
    assert!(whole.entries.iter().all(|e| e.kind != Kind::Transfer), "moving money changes no total");
    assert_eq!(whole.totals.transfers_in_minor + whole.totals.transfers_out_minor, 0);
    let held = whole.balances.iter().find(|b| b.challenge_name.as_deref() == Some("Sponsored walk")).unwrap();
    assert_eq!(held.amount_minor, 1_000_00, "the kitty's money, owed to the main fund");
    assert!(whole.challenges.iter().all(|c| c.name != "Cousins' 1,000 challenge"), "hidden challenges stay off");
    let pledges = pledge_totals(&pledge_progress(&fundraiser_records(&mut tx).await.unwrap()));
    assert_eq!(
        whole.pledged_outstanding_minor, pledges.friends.outstanding_minor,
        "the family's share is not a pledge"
    );
    let main = reports::statement(&mut tx, statement(Some(1)), "test".into(), None).await.unwrap();
    assert_eq!(main.totals.transfers_in_minor, 3_000_00);
    assert!(main.entries.iter().all(|e| e.label != "Cousin Zawadi" || e.amount_minor != 4_000_00));
    tx.rollback().await.unwrap();
}

/// One payment from several people: shared equally or with an amount each, the
/// money counts once and the public list shows each person.
#[tokio::test]
async fn a_payment_can_be_shared_among_people() {
    let dir = temp_dir();
    let pool = db::connect(&dir.join("test.sqlite")).await.unwrap();
    let storage = Storage::open(&dir.join("uploads")).unwrap();
    seed::run(&pool, &storage, &dir).await.unwrap();
    let before = totals(&pool).await;
    let mut tx = db::begin_write(&pool).await.unwrap();
    let shares = |parts: &[(&str, i64)]| -> Vec<transactions::ShareInput> {
        let list: Vec<_> = parts
            .iter()
            .map(|(name, amount)| serde_json::json!({ "public_name": name, "amount_minor": amount }))
            .collect();
        serde_json::from_value(serde_json::Value::Array(list)).unwrap()
    };
    let five = [("Amina", 200_00), ("Baraka", 200_00), ("Chebet", 200_00), ("Daudi", 200_00), ("Eunice", 200_00)];

    // Shares must add up to the payment.
    let mut short = record(Kind::Contribution, 1_000_00, None, None);
    short.movement.reference = Some("TK1SHARED1".into());
    short.shares = Some(shares(&five[..4]));
    assert!(matches!(transactions::create(&mut tx, short, "test").await, Err(AppError::Invalid { .. })));

    let mut shared = record(Kind::Contribution, 1_000_00, None, None);
    shared.movement.reference = Some("TK1SHARED1".into());
    shared.shares = Some(shares(&five));
    let id = transactions::create(&mut tx, shared, "test").await.unwrap().id;
    assert_eq!(transactions::item(&mut tx, id).await.unwrap().shares.len(), 5);

    // Counted once in money, once per person in the count; listed per person in public.
    let t = Totals::from_records(&fundraiser_records(&mut tx).await.unwrap(), 12_000_00);
    assert_eq!(t.contributions_minor, before.contributions_minor + 1_000_00);
    assert_eq!(t.contributions_count, before.contributions_count + 5);
    let page = publication::build(&mut tx).await.unwrap();
    let names: Vec<_> = page
        .contributions
        .iter()
        .filter(|e| e.reference_hint.as_deref() == Some("…RED1"))
        .map(|e| e.label.as_str())
        .collect();
    assert_eq!(names, ["Amina", "Baraka", "Chebet", "Daudi", "Eunice"]);
    let sum: i64 = page.contributions.iter().filter_map(|e| e.amount_minor).sum();
    assert_eq!(sum, page.totals.contributions_minor, "the list still adds up to the total");
    let checked = publication::check_contribution(&mut tx, "TK1SHARED1").await.unwrap();
    assert_eq!(checked.contribution.unwrap().listed_as, "Amina, Baraka, Chebet, Daudi, Eunice");

    // Amounts against each name; an expense cannot be shared; a corrected amount drops the shares.
    transactions::set_shares(&mut tx, id, shares(&[("Amina", 700_00), ("Baraka", 300_00)])).await.unwrap();
    assert_eq!(transactions::shares(&mut tx, id).await.unwrap()[0].amount_minor, 700_00);
    let expense: i64 = sqlx::query_scalar(
        "SELECT transaction_id FROM transaction_versions WHERE is_current = 1 AND kind = 'expense' LIMIT 1",
    )
    .fetch_one(&mut *tx)
    .await
    .unwrap();
    assert!(transactions::set_shares(&mut tx, expense, shares(&[("A", 1_00), ("B", 1_00)])).await.is_err());
    let mut corrected = transactions::current_version(&mut tx, id).await.unwrap().movement();
    corrected.amount_minor = 1_200_00;
    let replacement = MovementInput {
        kind: corrected.kind,
        direction: corrected.direction,
        amount_minor: Amount::try_from(corrected.amount_minor).unwrap(),
        occurred_at: corrected.occurred_at,
        account_id: corrected.account_id,
        to_account_id: None,
        reference: corrected.reference,
        is_fee: false,
        related_transaction_id: None,
        counterparty: None,
    };
    let fix = CorrectionRequest { reason: "Amount was 1,200".into(), replacement: Some(replacement) };
    transactions::correct(&mut tx, id, fix).await.unwrap();
    assert!(transactions::shares(&mut tx, id).await.unwrap().is_empty(), "shares no longer add up, so they go");

    // Archiving a payment takes its charge line with it; restoring brings both back.
    let mut tent = record(Kind::Expense, 500_00, None, None);
    tent.presentation.description = "Tent hire".into();
    tent.charge_minor = Some(Amount::try_from(13_00).unwrap());
    let created = transactions::create(&mut tx, tent, "test").await.unwrap();
    let charge = created.charge_id.unwrap();
    let archive = CorrectionRequest { reason: "Paid from the wrong fund".into(), replacement: None };
    transactions::correct(&mut tx, created.id, archive).await.unwrap();
    assert!(transactions::current_version(&mut tx, charge).await.unwrap().removed);
    transactions::restore(&mut tx, created.id, "It was the fundraiser's tent after all").await.unwrap();
    assert!(!transactions::current_version(&mut tx, created.id).await.unwrap().removed);
    assert!(!transactions::current_version(&mut tx, charge).await.unwrap().removed);

    // Activity lists every change, newest first, with the reason.
    let query = history::ActivityQuery { entity: Some("transaction".into()), ..Default::default() };
    let activity = history::activity(&mut tx, query).await.unwrap();
    assert_eq!(activity.entries[0].action, "restored");
    let expected =
        format!("Restored together with transaction #{}: It was the fundraiser's tent after all", created.id);
    assert_eq!(activity.entries[0].reason.as_deref(), Some(expected.as_str()));
    tx.rollback().await.unwrap();
}
