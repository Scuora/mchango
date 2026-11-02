//! Text extraction with poppler's `pdftotext`.
//!
//! The tool is run directly (no shell), with an empty environment, a wall-clock
//! timeout, a cap on output size and, on Unix, CPU / memory / file-write limits.

use std::path::Path;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::process::Command;

const MAX_TEXT_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PdfError {
    ToolMissing,
    PasswordRequired,
    WrongPassword,
    CopyRestricted,
    Unreadable,
    Timeout,
    TooMuchText,
    Failed(String),
}

impl PdfError {
    pub fn code(&self) -> &'static str {
        match self {
            PdfError::ToolMissing => "tool_missing",
            PdfError::PasswordRequired | PdfError::CopyRestricted => "password_required",
            PdfError::WrongPassword => "wrong_password",
            PdfError::Unreadable => "unreadable",
            PdfError::Timeout => "timeout",
            PdfError::TooMuchText => "too_large",
            PdfError::Failed(_) => "extraction_failed",
        }
    }

    pub fn message(&self) -> String {
        match self {
            PdfError::ToolMissing => "The server cannot read PDFs because pdftotext (poppler-utils) is not installed. \
                 Install it, then retry this import."
                .into(),
            PdfError::PasswordRequired => "This statement is password-protected. M-Pesa sends the statement \
                 password by SMS when you request the statement. Enter it and retry. The password is used only \
                 to read the file and is never stored."
                .into(),
            PdfError::WrongPassword => "That password did not open the statement. Check the SMS from M-Pesa \
                 and retry."
                .into(),
            PdfError::CopyRestricted => "This PDF does not allow its text to be read without the password. \
                 Enter the statement password and retry."
                .into(),
            PdfError::Unreadable => "This file could not be read as a PDF. It may be damaged or incomplete. \
                 Download the statement again and upload the new file."
                .into(),
            PdfError::Timeout => "Reading the PDF took too long and was stopped. Make sure this is an M-Pesa \
                 statement; if it is, try a statement covering a shorter period."
                .into(),
            PdfError::TooMuchText => "This PDF contains far more text than a statement should. Make sure you \
                 uploaded the right file."
                .into(),
            PdfError::Failed(_) => "The PDF could not be read. Download the statement again and retry; if it \
                 keeps failing, the file may use a layout that is not supported yet."
                .into(),
        }
    }
}

pub async fn extract_text(
    tool: &Path,
    file: &Path,
    password: Option<&str>,
    timeout: Duration,
) -> Result<String, PdfError> {
    let tool = resolve_program(tool).ok_or(PdfError::ToolMissing)?;
    let mut command = Command::new(tool);
    command.arg("-layout").arg("-enc").arg("UTF-8").arg("-eol").arg("unix");
    if let Some(password) = password {
        // Passed as an argument for the few seconds the tool runs; never stored.
        command.arg("-upw").arg(password);
    }
    command
        .arg(file)
        .arg("-")
        .env_clear()
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    limit_resources(&mut command, timeout);

    let mut child = command.spawn().map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => PdfError::ToolMissing,
        _ => PdfError::Failed(format!("spawn: {e}")),
    })?;
    let mut stdout = child.stdout.take().ok_or_else(|| PdfError::Failed("no stdout".into()))?;
    let mut stderr = child.stderr.take().ok_or_else(|| PdfError::Failed("no stderr".into()))?;

    let run = async {
        let mut out = Vec::new();
        let mut err = Vec::new();
        let mut limited_out = (&mut stdout).take(MAX_TEXT_BYTES + 1);
        let mut limited_err = (&mut stderr).take(64 * 1024);
        let (read_out, read_err) = tokio::join!(limited_out.read_to_end(&mut out), limited_err.read_to_end(&mut err));
        read_out.map_err(|e| PdfError::Failed(format!("read: {e}")))?;
        read_err.map_err(|e| PdfError::Failed(format!("read: {e}")))?;
        if out.len() as u64 > MAX_TEXT_BYTES {
            return Err(PdfError::TooMuchText);
        }
        let status = child.wait().await.map_err(|e| PdfError::Failed(format!("wait: {e}")))?;
        Ok((status, out, err))
    };

    let (status, out, err) = tokio::time::timeout(timeout, run).await.map_err(|_| PdfError::Timeout)??;
    let stderr_text = String::from_utf8_lossy(&err).to_string();
    if !status.success() {
        let lower = stderr_text.to_ascii_lowercase();
        tracing::info!(code = ?status.code(), stderr = %stderr_text.trim(), "pdftotext failed");
        return Err(if lower.contains("incorrect password") {
            if password.is_some() { PdfError::WrongPassword } else { PdfError::PasswordRequired }
        } else if status.code() == Some(3) || lower.contains("copying of text") {
            PdfError::CopyRestricted
        } else if lower.contains("may not be a pdf")
            || lower.contains("couldn't find trailer")
            || lower.contains("syntax error")
        {
            PdfError::Unreadable
        } else {
            PdfError::Failed(format!("exit {:?}: {}", status.code(), stderr_text.trim()))
        });
    }
    Ok(String::from_utf8_lossy(&out).into_owned())
}

/// Finds the tool on this process's PATH, because the child runs with an empty
/// environment and could not search it itself.
pub fn resolve_program(tool: &Path) -> Option<std::path::PathBuf> {
    if tool.components().count() > 1 {
        return tool.is_file().then(|| tool.to_path_buf());
    }
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path).map(|dir| dir.join(tool)).find(|candidate| candidate.is_file())
}

#[cfg(unix)]
fn limit_resources(command: &mut Command, timeout: Duration) {
    let cpu_seconds = timeout.as_secs().saturating_add(5);
    // SAFETY: the closure runs in the forked child before exec and only calls
    // setrlimit, which is async-signal-safe. It does not allocate or lock.
    unsafe {
        command.pre_exec(move || {
            let set = |resource, limit: libc::rlim_t| {
                let value = libc::rlimit { rlim_cur: limit, rlim_max: limit };
                libc::setrlimit(resource, &value);
            };
            set(libc::RLIMIT_CPU, cpu_seconds as libc::rlim_t);
            // No files may be written; output goes to a pipe, which is unaffected.
            set(libc::RLIMIT_FSIZE, 0);
            set(libc::RLIMIT_CORE, 0);
            #[cfg(target_os = "linux")]
            set(libc::RLIMIT_AS, 1024 * 1024 * 1024);
            Ok(())
        });
    }
}

#[cfg(not(unix))]
fn limit_resources(_command: &mut Command, _timeout: Duration) {}
