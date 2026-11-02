use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::time::Duration;

/// Runtime settings, read from environment variables (see `.env.example`).
#[derive(Debug, Clone)]
pub struct Config {
    pub database_path: PathBuf,
    pub uploads_dir: PathBuf,
    /// Built frontend (`frontend/dist`). Optional in development.
    pub static_dir: PathBuf,
    /// Serves the public page and public API only.
    pub public_addr: SocketAddr,
    /// Serves everything, including unauthenticated management. Must stay private.
    pub manage_addr: SocketAddr,
    /// Extra host names allowed to reach the management listener (DNS-rebinding guard).
    pub manage_allowed_hosts: Vec<String>,
    pub pdftotext_path: PathBuf,
    pub pdf_timeout: Duration,
    pub max_upload_bytes: usize,
    pub log_json: bool,
    /// The public page's address, used in shared updates (e.g. https://mchango.example.org).
    pub public_url: Option<String>,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let manage_addr: SocketAddr = parse_var("MANAGE_ADDR", "127.0.0.1:8081")?;
        let public_addr: SocketAddr = parse_var("PUBLIC_ADDR", "127.0.0.1:8080")?;
        if manage_addr == public_addr {
            return Err("MANAGE_ADDR and PUBLIC_ADDR must be different.".into());
        }
        let confirmed: bool = parse_var("MANAGE_ADDR_PRIVATE_CONFIRMED", "false")?;
        check_management_address(manage_addr.ip(), confirmed)?;

        let max_upload_mb: usize = parse_var("MAX_UPLOAD_MB", "10")?;
        if !(1..=50).contains(&max_upload_mb) {
            return Err("MAX_UPLOAD_MB must be between 1 and 50.".into());
        }

        Ok(Config {
            database_path: var("DATABASE_PATH", "./data/mchango.sqlite").into(),
            uploads_dir: var("UPLOADS_DIR", "./data/uploads").into(),
            static_dir: var("STATIC_DIR", "../frontend/dist").into(),
            public_addr,
            manage_addr,
            manage_allowed_hosts: var("MANAGE_ALLOWED_HOSTS", "")
                .split(',')
                .map(|h| h.trim().to_ascii_lowercase())
                .filter(|h| !h.is_empty())
                .collect(),
            pdftotext_path: var("PDFTOTEXT_PATH", "pdftotext").into(),
            pdf_timeout: Duration::from_secs(parse_var("PDF_TIMEOUT_SECS", "30")?),
            max_upload_bytes: max_upload_mb * 1024 * 1024,
            log_json: var("LOG_FORMAT", "text").eq_ignore_ascii_case("json"),
            public_url: public_url()?,
        })
    }

    /// Settings for command-line tasks that only need the data paths.
    pub fn for_tasks() -> Self {
        Config {
            database_path: var("DATABASE_PATH", "./data/mchango.sqlite").into(),
            uploads_dir: var("UPLOADS_DIR", "./data/uploads").into(),
            static_dir: PathBuf::new(),
            public_addr: "127.0.0.1:0".parse().expect("valid"),
            manage_addr: "127.0.0.1:0".parse().expect("valid"),
            manage_allowed_hosts: Vec::new(),
            pdftotext_path: var("PDFTOTEXT_PATH", "pdftotext").into(),
            pdf_timeout: Duration::from_secs(30),
            max_upload_bytes: 10 * 1024 * 1024,
            log_json: false,
            public_url: None,
        }
    }
}

fn public_url() -> Result<Option<String>, String> {
    let raw = var("PUBLIC_URL", "");
    let url = raw.trim().trim_end_matches('/');
    if url.is_empty() {
        return Ok(None);
    }
    if !(url.starts_with("https://") || url.starts_with("http://")) || url.contains(char::is_whitespace) {
        return Err(format!("PUBLIC_URL must be a full address such as https://mchango.example.org, not {raw:?}"));
    }
    Ok(Some(url.to_string()))
}

fn var(name: &str, default: &str) -> String {
    std::env::var(name).ok().filter(|v| !v.trim().is_empty()).unwrap_or_else(|| default.to_string())
}

fn parse_var<T: std::str::FromStr>(name: &str, default: &str) -> Result<T, String> {
    let raw = var(name, default);
    raw.trim().parse().map_err(|_| format!("{name} has an invalid value: {raw:?}"))
}

/// Management has no login yet, so it may only listen where the public cannot reach it.
///
/// Loopback is always allowed. Private-network addresses (LAN, Tailscale/CGNAT,
/// IPv6 ULA) are allowed with a warning. Anything else, including 0.0.0.0, needs
/// `MANAGE_ADDR_PRIVATE_CONFIRMED=true`, which is meant for containers whose port
/// is published only on the host's loopback interface.
fn check_management_address(ip: IpAddr, confirmed: bool) -> Result<(), String> {
    if ip.is_loopback() {
        return Ok(());
    }
    let private = match ip {
        IpAddr::V4(v4) => {
            let [a, b, ..] = v4.octets();
            v4.is_private() || (a == 100 && (64..128).contains(&b))
        }
        IpAddr::V6(v6) => (v6.segments()[0] & 0xfe00) == 0xfc00,
    };
    if private {
        tracing::warn!(%ip, "management listens on a private network address; anyone on that network can change records");
        return Ok(());
    }
    if confirmed {
        tracing::warn!(%ip, "management listens on a non-private address because MANAGE_ADDR_PRIVATE_CONFIRMED=true; make sure the port is not reachable publicly");
        return Ok(());
    }
    Err(format!(
        "MANAGE_ADDR {ip} is not a loopback or private address. Management has no login yet, \
         so it must not be reachable publicly. Use 127.0.0.1, a VPN address, or set \
         MANAGE_ADDR_PRIVATE_CONFIRMED=true only if the port is otherwise private (e.g. a Docker \
         port published on 127.0.0.1)."
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn management_address_policy() {
        assert!(check_management_address("127.0.0.1".parse().unwrap(), false).is_ok());
        assert!(check_management_address("100.101.1.2".parse().unwrap(), false).is_ok());
        assert!(check_management_address("192.168.1.5".parse().unwrap(), false).is_ok());
        assert!(check_management_address("0.0.0.0".parse().unwrap(), false).is_err());
        assert!(check_management_address("8.8.8.8".parse().unwrap(), false).is_err());
        assert!(check_management_address("0.0.0.0".parse().unwrap(), true).is_ok());
    }
}
