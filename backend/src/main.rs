use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::Arc;

use mchango::api::{self, AppState};
use mchango::auth;
use mchango::config::Config;
use mchango::statements::worker::{self, ImportQueue, Worker};
use mchango::statements::{layout, pdf};
use mchango::storage::Storage;
use mchango::{db, seed};

const USAGE: &str = "Usage: mchango [command]

Commands:
  serve                     Run the web server (default)
  migrate                   Apply database migrations and exit
  seed                      Load fictional demo data into an EMPTY database
  backup <file>             Write a consistent copy of the database to <file>
  inspect-statement <file>  Check whether a statement PDF can be read (prints no personal data).
                            Set STATEMENT_PASSWORD if the PDF is locked.
  user add <name>           Create a management account (asks for the password)
  user password <name>      Set a new password and sign the account out everywhere
  user remove <name>        Delete a management account
  user list                 List management accounts

Passwords are read without echo, or from standard input when it is not a terminal.

Settings come from environment variables or a .env file; see .env.example.";

#[tokio::main]
async fn main() -> ExitCode {
    let _ = dotenvy::dotenv();
    init_logging();
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.first().map(String::as_str) {
        None | Some("serve") => serve().await,
        Some("migrate") => migrate().await,
        Some("seed") => run_seed().await,
        Some("backup") => match args.get(1) {
            Some(file) => backup(Path::new(file)).await,
            None => {
                Err("backup needs a destination file, e.g. mchango backup ./backups/mchango-2024-06-30.sqlite".into())
            }
        },
        Some("inspect-statement") => match args.get(1) {
            Some(file) => inspect(Path::new(file)).await,
            None => Err("inspect-statement needs a PDF file".into()),
        },
        Some("user") => user(&args[1..]).await,
        Some("-h" | "--help" | "help") => {
            println!("{USAGE}");
            Ok(())
        }
        Some(other) => Err(format!("unknown command {other:?}\n\n{USAGE}")),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("error: {message}");
            ExitCode::FAILURE
        }
    }
}

fn init_logging() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,sqlx=warn,tower_http=info"));
    let json = std::env::var("LOG_FORMAT").is_ok_and(|v| v.eq_ignore_ascii_case("json"));
    let builder = tracing_subscriber::fmt().with_env_filter(filter).with_target(false);
    if json {
        builder.json().init();
    } else {
        builder.init();
    }
}

async fn serve() -> Result<(), String> {
    let config = Config::from_env()?;
    let pool = db::connect(&config.database_path).await?;
    let storage = Storage::open(&config.uploads_dir)
        .map_err(|e| format!("cannot use uploads directory {}: {e}", config.uploads_dir.display()))?;
    check_pdftotext(&config.pdftotext_path);

    let recovered = worker::recover(&pool).await.map_err(|e| format!("cannot recover imports: {e}"))?;
    if recovered > 0 {
        tracing::info!(count = recovered, "statement imports interrupted earlier were queued again");
    }
    let queue = ImportQueue::default();
    Worker {
        pool: pool.clone(),
        storage: storage.clone(),
        queue: queue.clone(),
        pdftotext: config.pdftotext_path.clone(),
        timeout: config.pdf_timeout,
    }
    .spawn();
    queue.submit(0, None);

    let accounts = auth::list_users(&pool).await?;
    if accounts.is_empty() {
        tracing::warn!("no management accounts exist yet; create one with `mchango user add <name>`");
    }
    let state = AppState {
        pool: pool.clone(),
        storage,
        queue,
        config: Arc::new(config.clone()),
        limiter: Arc::new(auth::LoginLimiter::default()),
        check_limiter: Arc::new(api::CheckLimiter::default()),
    };
    let public = tokio::net::TcpListener::bind(config.public_addr)
        .await
        .map_err(|e| format!("cannot listen on PUBLIC_ADDR {}: {e}", config.public_addr))?;
    let manage = tokio::net::TcpListener::bind(config.manage_addr)
        .await
        .map_err(|e| format!("cannot listen on MANAGE_ADDR {}: {e}", config.manage_addr))?;
    tracing::info!(public = %config.public_addr, manage = %config.manage_addr, database = %config.database_path.display(), "mchango is running");
    if !config.static_dir.join("index.html").exists() {
        tracing::warn!(dir = %config.static_dir.display(), "frontend build not found; only the API is served");
    }

    let shutdown = shutdown_signal();
    let (stop_tx, stop_rx) = tokio::sync::watch::channel(());
    let public_app = api::public_router(state.clone()).into_make_service_with_connect_info::<std::net::SocketAddr>();
    let public_server = axum::serve(public, public_app).with_graceful_shutdown({
        let mut rx = stop_rx.clone();
        async move {
            let _ = rx.changed().await;
        }
    });
    let manage_server = axum::serve(manage, api::manage_router(state)).with_graceful_shutdown({
        let mut rx = stop_rx;
        async move {
            let _ = rx.changed().await;
        }
    });
    tokio::spawn(async move {
        shutdown.await;
        tracing::info!("shutting down");
        let _ = stop_tx.send(());
    });
    let (a, b) = tokio::join!(public_server.into_future(), manage_server.into_future());
    a.map_err(|e| format!("public server: {e}"))?;
    b.map_err(|e| format!("management server: {e}"))?;
    pool.close().await;
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut signal) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            signal.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

fn check_pdftotext(tool: &Path) {
    if pdf::resolve_program(tool).is_none() {
        tracing::warn!(tool = %tool.display(), "pdftotext was not found; statement uploads will fail until poppler-utils is installed");
    }
}

async fn migrate() -> Result<(), String> {
    let config = Config::for_tasks();
    let pool = db::connect(&config.database_path).await?;
    pool.close().await;
    println!("Database is up to date: {}", config.database_path.display());
    Ok(())
}

async fn run_seed() -> Result<(), String> {
    let config = Config::for_tasks();
    let pool = db::connect(&config.database_path).await?;
    let storage = Storage::open(&config.uploads_dir).map_err(|e| format!("uploads directory: {e}"))?;
    let data_dir: PathBuf = config.database_path.parent().map(Path::to_path_buf).unwrap_or_else(|| PathBuf::from("."));
    let report = seed::run(&pool, &storage, &data_dir).await.map_err(|e| format!("{e:?}"))?;
    pool.close().await;
    println!("Demo data loaded into {}.", config.database_path.display());
    println!("A demo October statement was queued and will be processed when the server starts.");
    println!("A copy is at {} (uploading it again shows duplicate detection).", report.statement_copy.display());
    Ok(())
}

async fn backup(destination: &Path) -> Result<(), String> {
    let config = Config::for_tasks();
    let pool = db::connect(&config.database_path).await?;
    db::backup(&pool, destination).await?;
    pool.close().await;
    println!("Database copied to {}.", destination.display());
    println!("Also back up the uploads directory: {}", config.uploads_dir.display());
    Ok(())
}

/// Reads a statement and reports what was understood, with personal details masked.
async fn inspect(file: &Path) -> Result<(), String> {
    let config = Config::for_tasks();
    let password = std::env::var("STATEMENT_PASSWORD").ok().filter(|p| !p.is_empty());
    let text = pdf::extract_text(&config.pdftotext_path, file, password.as_deref(), config.pdf_timeout)
        .await
        .map_err(|e| e.message())?;
    let parsed = layout::parse(&text).map_err(|e| e.message().to_string())?;
    let mask = |s: &str| -> String {
        s.chars()
            .map(|c| if c.is_ascii_alphanumeric() { if c.is_ascii_digit() { '9' } else { 'X' } } else { c })
            .collect()
    };
    println!("Layout:          {}", layout::LAYOUT_ID);
    println!("Period:          {} to {}", parsed.period_start, parsed.period_end);
    println!("Rows:            {}", parsed.rows.len());
    println!("Charge rows:     {}", parsed.rows.iter().filter(|r| r.is_fee).count());
    println!("Without direction: {}", parsed.rows.iter().filter(|r| r.direction.is_none()).count());
    println!("Balance breaks:  {}", parsed.balance_breaks);
    println!(
        "Opening/closing known: {}/{}",
        parsed.opening_balance_minor.is_some(),
        parsed.closing_balance_minor.is_some()
    );
    println!("\nFirst rows (masked):");
    for row in parsed.rows.iter().take(8) {
        println!(
            "  p{} {} {} {:<40} {:?} {} fee={} {}",
            row.page,
            mask(&row.receipt),
            row.completed_at,
            mask(&row.details).chars().take(40).collect::<String>(),
            row.direction,
            row.amount_minor.map(|a| if a > 0 { "amount ok" } else { "zero" }).unwrap_or("no amount"),
            row.is_fee,
            row.note.as_deref().unwrap_or("")
        );
    }
    Ok(())
}

async fn user(args: &[String]) -> Result<(), String> {
    let config = Config::for_tasks();
    let pool = db::connect(&config.database_path).await?;
    let name = args.get(1).map(String::as_str);
    let result = match (args.first().map(String::as_str), name) {
        (Some("add"), Some(name)) => {
            let password = read_password(true)?;
            auth::add_user(&pool, name, &password).await.map(|n| println!("Account {n} created."))
        }
        (Some("password"), Some(name)) => {
            let password = read_password(true)?;
            auth::set_password(&pool, name, &password)
                .await
                .map(|()| println!("Password changed; existing sessions were signed out."))
        }
        (Some("remove"), Some(name)) => auth::remove_user(&pool, name).await.map(|()| println!("Account removed.")),
        (Some("list"), _) => auth::list_users(&pool).await.map(|users| {
            if users.is_empty() {
                println!("No accounts yet. Create one with: mchango user add <name>");
            }
            for (name, created) in users {
                println!("{name}  (created {created})");
            }
        }),
        _ => Err(format!("unknown user command\n\n{USAGE}")),
    };
    pool.close().await;
    result
}

/// Reads a password without echo from a terminal, or one line from piped input.
fn read_password(confirm: bool) -> Result<String, String> {
    use std::io::{BufRead, IsTerminal};
    if std::io::stdin().is_terminal() {
        let first = rpassword::prompt_password("Password: ").map_err(|e| e.to_string())?;
        if confirm {
            let second = rpassword::prompt_password("Repeat password: ").map_err(|e| e.to_string())?;
            if first != second {
                return Err("the passwords did not match".into());
            }
        }
        Ok(first)
    } else {
        let mut line = String::new();
        std::io::stdin().lock().read_line(&mut line).map_err(|e| e.to_string())?;
        Ok(line.trim_end_matches(['\r', '\n']).to_string())
    }
}
