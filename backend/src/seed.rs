//! Fictional demo data, loaded only by the explicit `mchango seed` command and
//! only into an empty database. The fundraiser is marked as a demo, which the
//! management screens and the public page both show.

use sqlx::SqlitePool;
use std::path::{Path, PathBuf};

use crate::capture;
use crate::clock;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::money::{Amount, format_kes};
use crate::settings::{self, FundraiserUpdate};
use crate::statements::{self, StoredUpload};
use crate::storage::{self, Area, FileType, Storage};
use crate::transactions::{
    self, CorrectionRequest, CreateRequest, Direction, Kind, MovementInput, PledgedBy, Presentation,
};

const MPESA: i64 = 1;
const CASH: i64 = 2;

pub struct SeedReport {
    pub statement_copy: PathBuf,
}

pub async fn run(pool: &SqlitePool, storage: &Storage, data_dir: &Path) -> AppResult<SeedReport> {
    let used: i64 =
        sqlx::query_scalar("SELECT (SELECT COUNT(*) FROM transactions) + (SELECT COUNT(*) FROM statement_imports)")
            .fetch_one(pool)
            .await?;
    if used > 0 {
        return Err(AppError::Conflict(
            "Demo data is only loaded into an empty database. Point DATABASE_PATH and UPLOADS_DIR at a separate demo location."
                .into(),
        ));
    }

    let mut tx = db::begin_write(pool).await?;
    sqlx::query("UPDATE accounts SET number_hint = '678' WHERE id = ?").bind(MPESA).execute(&mut *tx).await?;
    settings::update_fundraiser(
        &mut tx,
        FundraiserUpdate {
            name: "Funeral of the late Mzee Joseph Ochieng Odhiambo".into(),
            description: "Contributions towards mortuary fees, the casket, transport and the burial at home in \
                          Siaya, and support for the family. This is demo data: every name and record is fictional."
                .into(),
            description_sw: None,
            memorial_name: "Mzee Joseph Ochieng Odhiambo".into(),
            memorial_dates: "1948 – 2026".into(),
            memorial_tribute: "Lala salama, Mzee.".into(),
            target_minor: Some(amount(350_000_00)),
            start_date: Some("2026-09-01".into()),
            opening_funds_minor: Some(amount(12_000_00)),
            opening_funds_date: Some("2026-09-01".into()),
            opening_funds_note:
                "Cash collected at the first family meeting on 1 September, before records moved to this app.".into(),
            opening_funds_account_id: Some(CASH),
            anonymous_label: "Anonymous contributor".into(),
            show_reference_hint: true,
            show_promises: true,
            public_page_enabled: true,
        },
    )
    .await?;
    sqlx::query("UPDATE fundraiser SET is_demo = 1").execute(&mut *tx).await?;

    // September: before the demo statement's period.
    sms(&mut tx, "TI1A2B3C4D Confirmed.You have received Ksh2,000.00 from GRACE WANJIRU 0722111222 on 3/9/26 at 9:12 AM New M-PESA balance is Ksh3,412.00.", Kind::Contribution, Some("Mama Brian"), "").await?;
    let otieno = sms(&mut tx, "TI3C4D5E6F Confirmed.You have received Ksh5,000.00 from PETER OTIENO 0733222333 on 5/9/26 at 7:45 PM New M-PESA balance is Ksh8,412.00.", Kind::Contribution, Some("The Otieno Family"), "").await?;
    sms(&mut tx, "TI5E6F7G8H Confirmed.You have received Ksh10,000.00 from JOHN KAMAU 0711333444 on 10/9/26 at 1:05 PM New M-PESA balance is Ksh18,412.00.", Kind::Contribution, Some("Class of 2015"), "").await?;
    sms(&mut tx, "TI7G8H9J0K Confirmed.You have received Ksh500.00 from ESTHER CHEBET 0799888777 on 12/9/26 at 8:30 AM New M-PESA balance is Ksh18,912.00.", Kind::Contribution, None, "").await?;
    sms(&mut tx, "TI9J0K1L2M Confirmed. Ksh8,500.00 sent to NURU MORTUARY for account MRT2231 on 15/9/26 at 11:20 AM New M-PESA balance is Ksh10,359.00. Transaction cost, Ksh53.00.Amount you can transact within the day is 491,500.00.", Kind::Expense, None, "Mortuary fees, first instalment (invoice MRT-2231)").await?;
    sms(&mut tx, "TIB2C3D4E5 Confirmed.on 20/9/26 at 4:10 PMWithdraw Ksh3,000.00 from 654321 - UPENDO AGENCIES Kijiji New M-PESA balance is Ksh7,330.00. Transaction cost, Ksh29.00. Amount you can transact within the day is 497,000.00.", Kind::Transfer, None, "Cash for transport to the mortuary").await?;

    let transport = manual(
        &mut tx,
        Kind::Expense,
        None,
        1_800_00,
        "2026-09-21T09:30:00+03:00",
        CASH,
        None,
        None,
        "Transport for family members to the mortuary",
    )
    .await?;
    transactions::correct(
        &mut tx,
        transport,
        CorrectionRequest {
            reason: "Typed 1,800 by mistake; the matatu receipt shows 1,500.".into(),
            replacement: Some(movement(Kind::Expense, None, 1_500_00, "2026-09-21T09:30:00+03:00", CASH, None, None)),
        },
    )
    .await?;
    let pledge =
        promise(&mut tx, Kind::Pledge, 15_000_00, "2026-09-25T18:00:00+03:00", Some("Makao Welfare Group"), "").await?;
    let family_share = Presentation {
        pledged_by: Some(PledgedBy::Family),
        ..presentation(Some("The family"), "The family's own share, agreed at the first meeting", "")
    };
    family_pledge(&mut tx, 150_000_00, "2026-09-01T18:00:00+03:00", family_share).await?;
    promise(&mut tx, Kind::Commitment, 4_000_00, "2026-09-28T12:00:00+03:00", None, "Balance for tent and chairs hire")
        .await?;

    // October: covered by the demo statement.
    sms(&mut tx, "TJ1K2L3M4N Confirmed.You have received Ksh3,000.00 from MARY ATIENO 0700444555 on 2/10/26 at 10:00 AM New M-PESA balance is Ksh10,350.00.", Kind::Contribution, Some("Mwalimu Mary"), "").await?;
    let casket = sms(&mut tx, "TJ3M4N5P6Q Confirmed. Ksh6,000.00 paid to TUMAINI CASKETS. on 5/10/26 at 2:30 PM.New M-PESA balance is Ksh4,350.00. Transaction cost, Ksh0.00. Amount you can transact within the day is 494,000.00.", Kind::Expense, None, "Deposit for the casket").await?;
    sms_personal(&mut tx, "TJ5P6Q7R8S Confirmed.You have received Ksh1,200.00 from DAVID MUTUA 0712888999 on 8/10/26 at 6:15 PM New M-PESA balance is Ksh5,550.00.", Direction::In, "Loan repaid by a friend (personal).").await?;
    sms_personal(&mut tx, "TJ7R8S9T0U confirmed.You bought Ksh100.00 of airtime on 9/10/26 at 7:00 AM.New M-PESA balance is Ksh5,450.00. Transaction cost, Ksh0.00.", Direction::Out, "Airtime for my own phone.").await?;
    let welfare = sms(&mut tx, "TJ9T0U1V2W Confirmed.You have received Ksh5,000.00 from MAKAO WELFARE GROUP 0799555666 on 10/10/26 at 12:00 PM New M-PESA balance is Ksh10,450.00.", Kind::Contribution, Some("Makao Welfare Group"), "First part of the group's pledge").await?;
    link(&mut tx, welfare, pledge, "Linked to the Makao Welfare Group pledge").await?;
    // Entered by hand with a typing mistake: the statement will disagree.
    manual(
        &mut tx,
        Kind::Contribution,
        None,
        2_500_00,
        "2026-10-14T16:20:00+03:00",
        MPESA,
        Some("TJB1C2D3E4"),
        Some("Lucy N."),
        "",
    )
    .await?;
    // Entered by hand without a reference: the statement will suggest a match.
    manual(
        &mut tx,
        Kind::Contribution,
        None,
        1_000_00,
        "2026-10-18T11:00:00+03:00",
        MPESA,
        None,
        Some("St Paul's Church harambee"),
        "",
    )
    .await?;
    let refund = sms(&mut tx, "TJF5G6H7J8 Confirmed. Ksh500.00 sent to PETER OTIENO 0733222333 on 20/10/26 at 3:00 PM. New M-PESA balance is Ksh12,943.00. Transaction cost, Ksh7.00. Amount you can transact within the day is 499,500.00.", Kind::Refund, None, "Refund of an accidental double payment").await?;
    link(&mut tx, refund, otieno, "Refund of part of this contribution").await?;
    tx.commit().await?;

    // A published receipt for the casket deposit.
    let receipt = simple_pdf(
        &[vec![
            "TUMAINI CASKETS".into(),
            "Kisumu Road, Shop 14".into(),
            String::new(),
            "RECEIPT No. 0457                         Date: 05 Oct 2026".into(),
            String::new(),
            "Casket deposit (balance on collection)      KES 6,000.00".into(),
            String::new(),
            "Paid by M-Pesa Buy Goods, ref TJ3M4N5P6Q".into(),
            "Customer details removed for publication.".into(),
            String::new(),
            "Demo document - fictional.".into(),
        ]],
        12.0,
        false,
    );
    let stored_receipt = storage.save(Area::Receipts, FileType::Pdf, &receipt).await?;
    let mut tx = db::begin_write(pool).await?;
    sqlx::query(
        "INSERT INTO documents (kind, transaction_id, storage_name, original_name, content_type, size_bytes, sha256,
                                public_token, published_at, created_at)
         VALUES ('receipt', ?, ?, 'casket-receipt.pdf', 'application/pdf', ?, ?, ?, ?, ?)",
    )
    .bind(casket)
    .bind(&stored_receipt)
    .bind(receipt.len() as i64)
    .bind(storage::sha256_hex(&receipt))
    .bind(storage::random_hex(16))
    .bind(clock::now_string())
    .bind(clock::now_string())
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    // The October statement, queued for the worker to process.
    let pdf = simple_pdf(&demo_statement_pages(), 6.5, true);
    let statement_copy = data_dir.join("demo-statement-october-2026.pdf");
    tokio::fs::write(&statement_copy, &pdf).await?;
    let stored = storage.save(Area::Statements, FileType::Pdf, &pdf).await?;
    let mut tx = db::begin_write(pool).await?;
    statements::create(
        &mut tx,
        &StoredUpload {
            account_id: MPESA,
            storage_name: stored,
            original_name: Some("demo-statement-october-2026.pdf".into()),
            size_bytes: pdf.len() as i64,
            sha256: storage::sha256_hex(&pdf),
        },
    )
    .await?;
    tx.commit().await?;
    Ok(SeedReport { statement_copy })
}

fn amount(minor: i64) -> Amount {
    Amount::try_from(minor).expect("demo amounts are valid")
}

fn movement(
    kind: Kind,
    direction: Option<Direction>,
    minor: i64,
    at: &str,
    account: i64,
    to_account: Option<i64>,
    reference: Option<&str>,
) -> MovementInput {
    MovementInput {
        kind,
        direction,
        amount_minor: amount(minor),
        occurred_at: at.into(),
        account_id: Some(account),
        to_account_id: to_account,
        reference: reference.map(Into::into),
        is_fee: false,
        related_transaction_id: None,
        counterparty: None,
    }
}

fn presentation(name: Option<&str>, description: &str, notes: &str) -> Presentation {
    Presentation {
        public_name: name.map(Into::into),
        description: description.into(),
        notes: notes.into(),
        pledged_by: None,
    }
}

/// Records a pasted message exactly as the app does: parse, then confirm.
async fn sms(tx: &mut db::Tx, message: &str, kind: Kind, name: Option<&str>, description: &str) -> AppResult<i64> {
    let p = capture::parse(message);
    assert!(p.recognised, "demo message should be recognised: {message}");
    let direction = if matches!(kind, Kind::Refund | Kind::Personal) { p.direction.value } else { None };
    let to_account = (kind == Kind::Transfer).then_some(CASH);
    let input = MovementInput {
        kind,
        direction,
        amount_minor: amount(p.amount_minor.value.expect("amount")),
        occurred_at: p.occurred_at.value.clone().expect("time"),
        account_id: Some(MPESA),
        to_account_id: to_account,
        reference: p.reference.value.clone(),
        is_fee: false,
        related_transaction_id: None,
        counterparty: p.counterparty.clone(),
    };
    let created = transactions::create(
        tx,
        CreateRequest {
            movement: input,
            presentation: presentation(name, description, ""),
            source_message: Some(message.into()),
            charge_minor: p.charge_minor.value.map(amount),
            client_key: None,
            confirm_possible_duplicate: true,
            challenge_id: None,
        },
        "demo data",
    )
    .await?;
    Ok(created.id)
}

async fn sms_personal(tx: &mut db::Tx, message: &str, direction: Direction, notes: &str) -> AppResult<i64> {
    let p = capture::parse(message);
    let input = MovementInput {
        kind: Kind::Personal,
        direction: Some(direction),
        amount_minor: amount(p.amount_minor.value.expect("amount")),
        occurred_at: p.occurred_at.value.clone().expect("time"),
        account_id: Some(MPESA),
        to_account_id: None,
        reference: p.reference.value.clone(),
        is_fee: false,
        related_transaction_id: None,
        counterparty: p.counterparty.clone(),
    };
    let created = transactions::create(
        tx,
        CreateRequest {
            movement: input,
            presentation: presentation(None, "", notes),
            source_message: Some(message.into()),
            charge_minor: None,
            client_key: None,
            confirm_possible_duplicate: true,
            challenge_id: None,
        },
        "demo data",
    )
    .await?;
    Ok(created.id)
}

#[allow(clippy::too_many_arguments)]
async fn manual(
    tx: &mut db::Tx,
    kind: Kind,
    direction: Option<Direction>,
    minor: i64,
    at: &str,
    account: i64,
    reference: Option<&str>,
    name: Option<&str>,
    description: &str,
) -> AppResult<i64> {
    let created = transactions::create(
        tx,
        CreateRequest {
            movement: movement(kind, direction, minor, at, account, None, reference),
            presentation: presentation(name, description, ""),
            source_message: None,
            charge_minor: None,
            client_key: None,
            confirm_possible_duplicate: true,
            challenge_id: None,
        },
        "demo data",
    )
    .await?;
    Ok(created.id)
}

/// A pledge by the family, recorded like any other pledge.
async fn family_pledge(tx: &mut db::Tx, minor: i64, at: &str, presentation: Presentation) -> AppResult<i64> {
    let movement = MovementInput {
        kind: Kind::Pledge,
        direction: None,
        amount_minor: amount(minor),
        occurred_at: at.into(),
        account_id: None,
        to_account_id: None,
        reference: None,
        is_fee: false,
        related_transaction_id: None,
        counterparty: None,
    };
    let request = CreateRequest {
        movement,
        presentation,
        source_message: None,
        charge_minor: None,
        client_key: None,
        confirm_possible_duplicate: true,
        challenge_id: None,
    };
    Ok(transactions::create(tx, request, "demo data").await?.id)
}

async fn promise(
    tx: &mut db::Tx,
    kind: Kind,
    minor: i64,
    at: &str,
    name: Option<&str>,
    description: &str,
) -> AppResult<i64> {
    let input = MovementInput {
        kind,
        direction: None,
        amount_minor: amount(minor),
        occurred_at: at.into(),
        account_id: None,
        to_account_id: None,
        reference: None,
        is_fee: false,
        related_transaction_id: None,
        counterparty: None,
    };
    let created = transactions::create(
        tx,
        CreateRequest {
            movement: input,
            presentation: presentation(name, description, ""),
            source_message: None,
            charge_minor: None,
            client_key: None,
            confirm_possible_duplicate: true,
            challenge_id: None,
        },
        "demo data",
    )
    .await?;
    Ok(created.id)
}

async fn link(tx: &mut db::Tx, id: i64, related: i64, reason: &str) -> AppResult<()> {
    let mut m = transactions::current_version(tx, id).await?.movement();
    m.related_transaction_id = Some(related);
    let input = MovementInput {
        kind: m.kind,
        direction: m.direction,
        amount_minor: amount(m.amount_minor),
        occurred_at: m.occurred_at,
        account_id: m.account_id,
        to_account_id: m.to_account_id,
        reference: m.reference,
        is_fee: m.is_fee,
        related_transaction_id: m.related_transaction_id,
        counterparty: m.counterparty,
    };
    transactions::correct(tx, id, CorrectionRequest { reason: reason.into(), replacement: Some(input) }).await?;
    Ok(())
}

/// The text of a fictional M-Pesa statement for October 2026, laid out in the
/// supported format. Rows are printed newest first, as M-Pesa does.
pub fn demo_statement_pages() -> Vec<Vec<String>> {
    // (receipt, Nairobi time, details, continuation, signed amount in cents)
    let rows: [(&str, &str, &str, &str, i64); 10] = [
        ("TJ1K2L3M4N", "2026-10-02 10:00:41", "Funds received from - 0700***555", "MARY ATIENO", 3_000_00),
        ("TJ3M4N5P6Q", "2026-10-05 14:30:12", "Merchant Payment Online to 445566 -", "TUMAINI CASKETS", -6_000_00),
        ("TJ5P6Q7R8S", "2026-10-08 18:15:03", "Funds received from - 0712***999", "DAVID MUTUA", 1_200_00),
        ("TJ7R8S9T0U", "2026-10-09 07:00:27", "Airtime Purchase", "", -100_00),
        ("TJ9T0U1V2W", "2026-10-10 12:00:09", "Funds received from - 0799***666", "MAKAO WELFARE GROUP", 5_000_00),
        ("TJB1C2D3E4", "2026-10-14 16:20:44", "Funds received from - 0722***999", "LUCY NJERI", 2_000_00),
        ("TJD3E4F5G6", "2026-10-18 11:05:30", "Funds received from - 0720***123", "ST PAULS CHURCH HARAMBEE", 1_000_00),
        ("TJF5G6H7J8", "2026-10-20 15:00:18", "Customer Transfer to - 0733***333", "PETER OTIENO", -500_00),
        ("TJF5G6H7J8", "2026-10-20 15:00:18", "Customer Transfer of Funds Charge", "", -7_00),
        ("TJH7J8K9L0", "2026-10-25 09:40:55", "Funds received from - 0711***777", "SAMUEL KIPROTICH", 2_500_00),
    ];
    let header = format!(
        "{:<14}{:<22}{:<44}{:<21}{:<4}{:<13}{:<17}{}",
        "Receipt No.", "Completion Time", "Details", "Transaction Status", "", "Paid In", "Withdrawn", "Balance"
    );
    let mut balance = 7_350_00i64;
    let mut lines_oldest_first: Vec<Vec<String>> = Vec::new();
    for (receipt, at, details, more, signed) in rows {
        balance += signed;
        let plain = |v: i64| format_kes(v).trim_start_matches("KES ").to_string();
        let (paid_in, withdrawn) =
            if signed > 0 { (plain(signed), String::new()) } else { (String::new(), format!("-{}", plain(-signed))) };
        let mut line = format!("{receipt:<14}{at:<22}{details:<44}{:<21}", "Completed");
        line.push_str(&format!("{paid_in:>11}{withdrawn:>15}{:>15}", plain(balance)));
        let mut row = vec![line];
        if !more.is_empty() {
            row.push(format!("{:36}{more}", ""));
        }
        lines_oldest_first.push(row);
    }

    let mut first = vec![
        format!("{:48}M-PESA STATEMENT", ""),
        String::new(),
        "Customer Name:        AMINA ODHIAMBO".into(),
        "Mobile Number:        0712345678".into(),
        "Email Address:".into(),
        "Statement Period:     01 Oct 2026 - 31 Oct 2026".into(),
        "Request Date:         01 Nov 2026".into(),
        String::new(),
        "DETAILED STATEMENT".into(),
        header.clone(),
    ];
    let mut second = vec![header];
    for (i, row) in lines_oldest_first.into_iter().rev().enumerate() {
        if i < 6 { first.extend(row) } else { second.extend(row) }
    }
    first.push(String::new());
    first.push("Demo statement - fictional data.                                                                       Page 1 of 2".into());
    second.push(String::new());
    second.push("Demo statement - fictional data.                                                                       Page 2 of 2".into());
    vec![first, second]
}

/// A minimal PDF with Courier text, one string per line. Enough for demo files.
pub fn simple_pdf(pages: &[Vec<String>], font_size: f32, landscape: bool) -> Vec<u8> {
    let (width, height) = if landscape { (842, 595) } else { (595, 842) };
    let leading = font_size * 1.35;
    let escape = |s: &str| s.replace('\\', "\\\\").replace('(', "\\(").replace(')', "\\)");

    let page_count = pages.len();
    let font_id = 3 + page_count * 2;
    let mut objects: Vec<String> = Vec::new();
    objects.push("<< /Type /Catalog /Pages 2 0 R >>".into());
    let kids: Vec<String> = (0..page_count).map(|i| format!("{} 0 R", 3 + i * 2)).collect();
    objects.push(format!("<< /Type /Pages /Kids [{}] /Count {page_count} >>", kids.join(" ")));
    for (i, lines) in pages.iter().enumerate() {
        let content_id = 4 + i * 2;
        objects.push(format!(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width} {height}] /Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>"
        ));
        let mut stream = format!("BT /F1 {font_size} Tf {leading} TL 24 {} Td\n", height - 36);
        for line in lines {
            stream.push_str(&format!("({}) Tj T*\n", escape(line)));
        }
        stream.push_str("ET");
        objects.push(format!("<< /Length {} >>\nstream\n{stream}\nendstream", stream.len()));
    }
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>".into());

    let mut out = b"%PDF-1.4\n".to_vec();
    let mut offsets = Vec::with_capacity(objects.len());
    for (i, body) in objects.iter().enumerate() {
        offsets.push(out.len());
        out.extend_from_slice(format!("{} 0 obj\n{body}\nendobj\n", i + 1).as_bytes());
    }
    let xref = out.len();
    out.extend_from_slice(format!("xref\n0 {}\n0000000000 65535 f \n", objects.len() + 1).as_bytes());
    for offset in offsets {
        out.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    out.extend_from_slice(
        format!("trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n", objects.len() + 1).as_bytes(),
    );
    out
}
