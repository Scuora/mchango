//! Private file storage for statements and receipts.
//!
//! Files live under `UPLOADS_DIR`, outside the frontend's public assets, with
//! generated names. They are only ever served through API handlers.

use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Area {
    Statements,
    Receipts,
    Memorial,
}

impl Area {
    fn dir(self) -> &'static str {
        match self {
            Area::Statements => "statements",
            Area::Receipts => "receipts",
            Area::Memorial => "memorial",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileType {
    Pdf,
    Jpeg,
    Png,
    Webp,
}

impl FileType {
    /// Identifies a file by its leading bytes, not by its name or claimed type.
    pub fn sniff(bytes: &[u8]) -> Option<FileType> {
        if bytes.starts_with(b"%PDF-") {
            Some(FileType::Pdf)
        } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
            Some(FileType::Jpeg)
        } else if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
            Some(FileType::Png)
        } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
            Some(FileType::Webp)
        } else {
            None
        }
    }

    pub fn content_type(self) -> &'static str {
        match self {
            FileType::Pdf => "application/pdf",
            FileType::Jpeg => "image/jpeg",
            FileType::Png => "image/png",
            FileType::Webp => "image/webp",
        }
    }

    fn extension(self) -> &'static str {
        match self {
            FileType::Pdf => "pdf",
            FileType::Jpeg => "jpg",
            FileType::Png => "png",
            FileType::Webp => "webp",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Storage {
    root: PathBuf,
}

impl Storage {
    pub fn open(root: &Path) -> std::io::Result<Storage> {
        for area in [Area::Statements, Area::Receipts, Area::Memorial] {
            std::fs::create_dir_all(root.join(area.dir()))?;
        }
        Ok(Storage { root: root.to_path_buf() })
    }

    /// Writes the file under a random name and returns the stored name
    /// (e.g. `receipts/3f2a…9c.pdf`).
    pub async fn save(&self, area: Area, file_type: FileType, bytes: &[u8]) -> std::io::Result<String> {
        let name = format!("{}/{}.{}", area.dir(), random_hex(16), file_type.extension());
        let path = self.root.join(&name);
        let temp = self.root.join(format!("{}/.{}.part", area.dir(), random_hex(8)));
        tokio::fs::write(&temp, bytes).await?;
        if let Err(e) = tokio::fs::rename(&temp, &path).await {
            let _ = tokio::fs::remove_file(&temp).await;
            return Err(e);
        }
        Ok(name)
    }

    /// Resolves a stored name to a path, refusing anything this module did not generate.
    pub fn path(&self, stored_name: &str) -> Option<PathBuf> {
        let (dir, file) = stored_name.split_once('/')?;
        if ![Area::Statements, Area::Receipts, Area::Memorial].iter().any(|a| a.dir() == dir) {
            return None;
        }
        let (stem, ext) = file.split_once('.')?;
        let stem_ok = stem.len() == 32 && stem.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase());
        let ext_ok = matches!(ext, "pdf" | "jpg" | "png" | "webp");
        (stem_ok && ext_ok).then(|| self.root.join(dir).join(file))
    }

    pub async fn read(&self, stored_name: &str) -> std::io::Result<Vec<u8>> {
        let path = self.path(stored_name).ok_or_else(|| std::io::Error::other("invalid stored file name"))?;
        tokio::fs::read(path).await
    }

    pub async fn remove(&self, stored_name: &str) {
        if let Some(path) = self.path(stored_name)
            && let Err(e) = tokio::fs::remove_file(&path).await
        {
            tracing::warn!(error = %e, file = %stored_name, "could not remove stored file");
        }
    }
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

pub fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    getrandom::fill(&mut buf).expect("operating system random source");
    hex::encode(buf)
}

/// Keeps a display-only copy of an uploaded file name.
pub fn clean_original_name(name: Option<&str>) -> Option<String> {
    let name = name?.rsplit(['/', '\\']).next()?.trim();
    let cleaned: String = name.chars().filter(|c| !c.is_control()).take(120).collect();
    (!cleaned.is_empty()).then_some(cleaned)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_generated_names_resolve() {
        let s = Storage { root: PathBuf::from("/data/uploads") };
        assert!(s.path("receipts/0123456789abcdef0123456789abcdef.pdf").is_some());
        assert!(s.path("receipts/../../etc/passwd").is_none());
        assert!(s.path("other/0123456789abcdef0123456789abcdef.pdf").is_none());
        assert!(s.path("receipts/0123456789abcdef0123456789abcdef.html").is_none());
        assert!(s.path("receipts/0123456789ABCDEF0123456789abcdef.pdf").is_none());
    }

    #[test]
    fn sniffing() {
        assert_eq!(FileType::sniff(b"%PDF-1.7 ..."), Some(FileType::Pdf));
        assert_eq!(FileType::sniff(b"<html>"), None);
    }
}
