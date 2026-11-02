use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;

pub type AppResult<T> = Result<T, AppError>;

/// Errors returned to API clients. Messages are written for the person using
/// the app; internal details are logged, never sent.
#[derive(Debug)]
pub enum AppError {
    /// Input failed validation. `field` names the offending input when known.
    Invalid {
        message: String,
        field: Option<&'static str>,
    },
    NotFound(String),
    Unauthorized {
        code: &'static str,
        message: String,
    },
    TooManyAttempts(String),
    Conflict(String),
    /// Looks like a record that already exists; the client may confirm and resend.
    PossibleDuplicate {
        message: String,
        matches: Vec<i64>,
    },
    TooLarge(String),
    Unsupported(String),
    Internal(String),
}

impl AppError {
    pub fn invalid(message: impl Into<String>) -> Self {
        AppError::Invalid { message: message.into(), field: None }
    }

    pub fn field(field: &'static str, message: impl Into<String>) -> Self {
        AppError::Invalid { message: message.into(), field: Some(field) }
    }

    pub fn not_found(what: &str) -> Self {
        AppError::NotFound(format!("{what} was not found."))
    }

    pub fn internal(context: impl Into<String>) -> Self {
        AppError::Internal(context.into())
    }
}

#[derive(Serialize)]
struct ErrorBody<'a> {
    error: ErrorDetail<'a>,
}

#[derive(Serialize)]
struct ErrorDetail<'a> {
    code: &'a str,
    message: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    field: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    matches: Option<&'a [i64]>,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let matches = match &self {
            AppError::PossibleDuplicate { matches, .. } => Some(matches.as_slice()),
            _ => None,
        };
        let (status, code, message, field) = match &self {
            AppError::Invalid { message, field } => {
                (StatusCode::UNPROCESSABLE_ENTITY, "invalid", message.as_str(), *field)
            }
            AppError::NotFound(m) => (StatusCode::NOT_FOUND, "not_found", m.as_str(), None),
            AppError::Unauthorized { code, message } => (StatusCode::UNAUTHORIZED, *code, message.as_str(), None),
            AppError::TooManyAttempts(m) => (StatusCode::TOO_MANY_REQUESTS, "too_many_attempts", m.as_str(), None),
            AppError::Conflict(m) => (StatusCode::CONFLICT, "conflict", m.as_str(), None),
            AppError::PossibleDuplicate { message, .. } => {
                (StatusCode::CONFLICT, "possible_duplicate", message.as_str(), None)
            }
            AppError::TooLarge(m) => (StatusCode::PAYLOAD_TOO_LARGE, "too_large", m.as_str(), None),
            AppError::Unsupported(m) => (StatusCode::UNSUPPORTED_MEDIA_TYPE, "unsupported", m.as_str(), None),
            AppError::Internal(context) => {
                tracing::error!(error = %context, "internal error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal",
                    "Something went wrong on the server. Nothing was saved; please try again.",
                    None,
                )
            }
        };
        let body = ErrorBody { error: ErrorDetail { code, message, field, matches } };
        (status, Json(body)).into_response()
    }
}

pub fn is_unique_violation(error: &sqlx::Error) -> bool {
    matches!(error, sqlx::Error::Database(db) if db.is_unique_violation())
}

impl From<sqlx::Error> for AppError {
    fn from(error: sqlx::Error) -> Self {
        if is_unique_violation(&error) {
            return AppError::Conflict("This record already exists.".into());
        }
        if let sqlx::Error::Database(db) = &error
            && (db.is_check_violation() || db.is_foreign_key_violation())
        {
            tracing::warn!(error = %error, "database rejected a write");
            return AppError::invalid("Those details are not consistent. Please check and try again.");
        }
        AppError::Internal(format!("database: {error}"))
    }
}

impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        AppError::Internal(format!("io: {error}"))
    }
}
