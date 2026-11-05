use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use sha2::{Digest, Sha256};

/// Target triple baked in at compile time by build.rs
pub fn current_target() -> &'static str {
    env!("BUILD_TARGET")
}

/// Map a Rust target triple to the archive filename used in CI releases
pub fn archive_name_for_target(target: &str) -> Option<&'static str> {
    match target {
        "x86_64-unknown-linux-gnu" => Some("openpanel-linux-x64.tar.gz"),
        "aarch64-unknown-linux-gnu" => Some("openpanel-linux-arm64.tar.gz"),
        "x86_64-pc-windows-msvc" => Some("openpanel-windows-x64.zip"),
        "aarch64-apple-darwin" => Some("openpanel-macos-arm64.tar.gz"),
        _ => None,
    }
}

/// Binary name for the current platform
fn binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "openpanel-server.exe"
    } else {
        "openpanel-server"
    }
}

/// The public half of the key CI signs every release archive with (Ed25519, hex). Its private
/// half is the repository's UPDATE_SIGNING_KEY secret (see .github/workflows/release.yml); an
/// update whose signature doesn't verify under this key is never installed.
pub const UPDATE_PUBLIC_KEY: &str =
    "95e0a7b612709145dd5e1557fc77e498bd6d1ce66e35f6baa714f4362e276ec2";

/// Checks an archive against its `.sig`: the hex Ed25519 signature CI makes with
/// `openssl pkeyutl -sign -rawin`.
pub fn verify_signature(archive: &[u8], signature_hex: &str, public_key_hex: &str) -> Result<()> {
    use ed25519_dalek::{Signature, VerifyingKey};
    let key: [u8; 32] = hex::decode(public_key_hex.trim())
        .ok()
        .and_then(|k| k.try_into().ok())
        .context("This build's update key isn't valid")?;
    let signature: [u8; 64] = hex::decode(signature_hex.trim())
        .ok()
        .and_then(|s| s.try_into().ok())
        .context("The release's signature isn't valid")?;
    VerifyingKey::from_bytes(&key)
        .context("This build's update key isn't valid")?
        .verify_strict(archive, &Signature::from_bytes(&signature))
        .context("The release's signature doesn't match: it wasn't made by OpenPanel's release key")
}

/// Download a file from URL, returning the bytes and their SHA256 hex digest.
pub async fn download_file(client: &reqwest::Client, url: &str) -> Result<(Vec<u8>, String)> {
    tracing::info!("Downloading update from {}", url);

    let resp = client
        .get(url)
        .header("Accept", "application/octet-stream")
        .send()
        .await
        .context("Failed to start download")?;

    if !resp.status().is_success() {
        bail!("Download failed with HTTP {}", resp.status());
    }

    let bytes = resp
        .bytes()
        .await
        .context("Failed to read download body")?
        .to_vec();

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let hash = hex::encode(hasher.finalize());

    tracing::info!("Downloaded {} bytes, SHA256: {}", bytes.len(), &hash[..12]);
    Ok((bytes, hash))
}

/// Extract a .tar.gz archive to a destination directory (Unix builds).
#[cfg(not(target_os = "windows"))]
pub fn extract_archive(archive_bytes: &[u8], dest: &Path) -> Result<()> {
    use flate2::read::GzDecoder;
    use std::io::Cursor;

    let cursor = Cursor::new(archive_bytes);
    let decoder = GzDecoder::new(cursor);
    let mut archive = tar::Archive::new(decoder);
    archive
        .unpack(dest)
        .context("Failed to extract tar.gz archive")?;
    Ok(())
}

/// Extract a .zip archive to a destination directory (Windows builds).
#[cfg(target_os = "windows")]
pub fn extract_archive(archive_bytes: &[u8], dest: &Path) -> Result<()> {
    use std::io::Cursor;

    let cursor = Cursor::new(archive_bytes);
    let mut archive = zip::ZipArchive::new(cursor).context("Failed to open zip archive")?;
    archive
        .extract(dest)
        .context("Failed to extract zip archive")?;
    Ok(())
}

/// Perform the binary + UI dist swap.
///
/// 1. Extracts the archive to a temp directory
/// 2. Renames the current binary to `.old`
/// 3. Moves the new binary into place
/// 4. Replaces the UI dist directory
///
/// Returns the path to the old binary for later cleanup.
pub fn apply_update(archive_bytes: &[u8], ui_dir: &Path) -> Result<PathBuf> {
    let tmp_dir = tempfile::tempdir().context("Failed to create temp directory")?;
    let tmp_path = tmp_dir.path();

    tracing::info!("Extracting update to {}", tmp_path.display());
    extract_archive(archive_bytes, tmp_path)?;

    // --- Swap binary ---
    let new_binary = tmp_path.join(binary_name());
    if !new_binary.exists() {
        bail!(
            "Archive does not contain expected binary '{}'",
            binary_name()
        );
    }

    let current_exe =
        std::env::current_exe().context("Failed to determine current executable path")?;
    let current_exe = current_exe
        .canonicalize()
        .unwrap_or_else(|_| current_exe.clone());

    let old_exe_name = format!(
        "{}.old",
        current_exe
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
    );
    let old_exe = current_exe.with_file_name(&old_exe_name);

    // Remove leftover .old from a previous update
    let _ = std::fs::remove_file(&old_exe);

    tracing::info!(
        "Swapping binary: {} -> {}",
        current_exe.display(),
        old_exe.display()
    );

    // On Windows we can rename a running exe (the OS just keeps the old handle),
    // on Unix the old inode remains until the process exits.
    std::fs::rename(&current_exe, &old_exe).context("Failed to rename current binary to .old")?;

    std::fs::copy(&new_binary, &current_exe).context("Failed to copy new binary into place")?;

    // Make executable on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&current_exe)?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&current_exe, perms)?;
    }

    // --- Swap UI dist ---
    let new_ui_dist = tmp_path.join("ui").join("dist");
    if new_ui_dist.exists() && new_ui_dist.join("index.html").exists() {
        let canonical_ui = ui_dir
            .canonicalize()
            .unwrap_or_else(|_| ui_dir.to_path_buf());

        let old_ui = canonical_ui.with_file_name("dist.old");
        let _ = std::fs::remove_dir_all(&old_ui);

        if canonical_ui.exists() {
            std::fs::rename(&canonical_ui, &old_ui).context("Failed to rename current UI dist")?;
        }

        copy_dir_all(&new_ui_dist, &canonical_ui)
            .context("Failed to copy new UI dist into place")?;

        // The old UI stays beside it until the new version has run for a while (see
        // `confirm_update`), so a rollback can put it back
        tracing::info!("UI dist updated at {}", canonical_ui.display());
    } else {
        tracing::warn!("Archive did not contain ui/dist — skipping UI update");
    }

    // Counts the new version's starts until it has run for a while (see `on_start`)
    std::fs::write(sibling(&current_exe, "update-pending"), "0")
        .context("Failed to mark the update as pending")?;

    Ok(old_exe)
}

/// Starts of a new version that may fail before it is rolled back.
const MAX_STARTS: u32 = 3;
/// How long a new version runs before it is kept for good.
pub const CONFIRM_AFTER: std::time::Duration = std::time::Duration::from_secs(60);

/// `<exe>.<suffix>`, beside the running binary.
fn sibling(exe: &Path, suffix: &str) -> PathBuf {
    exe.with_file_name(format!(
        "{}.{}",
        exe.file_name().unwrap_or_default().to_string_lossy(),
        suffix
    ))
}

/// What `on_start` found.
#[derive(Debug, PartialEq)]
pub enum Start {
    /// Nothing pending: an ordinary start.
    Normal,
    /// A new version, starting for the nth time.
    Trying(u32),
    /// A new version that didn't get going after MAX_STARTS tries; the previous one is back in
    /// place, and this process should exit so the service manager starts it.
    RolledBack,
}

/// Called first thing on startup. After an update, counts the new version's starts, and puts the
/// previous version back once it has failed to get going MAX_STARTS times. Otherwise removes
/// what an earlier update left behind.
pub fn on_start(ui_dir: &Path) -> Start {
    let Ok(exe) = std::env::current_exe() else {
        return Start::Normal;
    };
    let exe = exe.canonicalize().unwrap_or(exe);
    let ui = ui_dir
        .canonicalize()
        .unwrap_or_else(|_| ui_dir.to_path_buf());
    let start = check_pending(&exe, &ui);
    match &start {
        Start::Normal => cleanup_old_files(&exe, &ui),
        Start::Trying(n) => tracing::info!("New version, start {} of {}", n, MAX_STARTS),
        Start::RolledBack => {
            tracing::error!(
                "The update didn't start {MAX_STARTS} times: the previous version is back"
            )
        }
    }
    start
}

fn check_pending(exe: &Path, ui: &Path) -> Start {
    let marker = sibling(exe, "update-pending");
    let Ok(text) = std::fs::read_to_string(&marker) else {
        return Start::Normal;
    };
    let starts = text.trim().parse::<u32>().unwrap_or(0) + 1;
    let old_exe = sibling(exe, "old");
    if starts <= MAX_STARTS || !old_exe.exists() {
        if starts > MAX_STARTS {
            // Nothing to go back to: keep this version
            let _ = std::fs::remove_file(&marker);
            return Start::Normal;
        }
        let _ = std::fs::write(&marker, starts.to_string());
        return Start::Trying(starts);
    }

    // A running binary can be renamed (on Windows too), so the failed one steps aside
    let failed = sibling(exe, "failed");
    let _ = std::fs::remove_file(&failed);
    if std::fs::rename(exe, &failed).is_err() {
        return Start::Trying(starts);
    }
    if std::fs::rename(&old_exe, exe).is_err() {
        let _ = std::fs::rename(&failed, exe);
        return Start::Trying(starts);
    }
    let old_ui = ui.with_file_name("dist.old");
    if old_ui.exists() {
        let _ = std::fs::remove_dir_all(ui);
        let _ = std::fs::rename(&old_ui, ui);
    }
    let _ = std::fs::remove_file(&marker);
    Start::RolledBack
}

/// The new version has run for CONFIRM_AFTER: keep it, and drop the previous one.
pub fn confirm_update(ui_dir: &Path) {
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let exe = exe.canonicalize().unwrap_or(exe);
    let ui = ui_dir
        .canonicalize()
        .unwrap_or_else(|_| ui_dir.to_path_buf());
    if std::fs::remove_file(sibling(&exe, "update-pending")).is_ok() {
        tracing::info!("The update is running well; the previous version is removed");
        cleanup_old_files(&exe, &ui);
    }
}

/// Removes the previous version an update kept for a rollback, and a version rolled back from.
fn cleanup_old_files(exe: &Path, ui: &Path) {
    for leftover in [sibling(exe, "old"), sibling(exe, "failed")] {
        if leftover.exists() {
            match std::fs::remove_file(&leftover) {
                Ok(_) => tracing::info!("Cleaned up old binary: {}", leftover.display()),
                Err(e) => {
                    tracing::warn!("Could not remove old binary {}: {}", leftover.display(), e)
                }
            }
        }
    }
    let _ = std::fs::remove_dir_all(ui.with_file_name("dist.old"));
}

fn copy_dir_all(src: &Path, dst: &Path) -> Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dest_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dest_path)?;
        } else {
            std::fs::copy(entry.path(), &dest_path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // A throwaway key; CI signs the same way: openssl pkeyutl -sign -rawin, as hex
    const KEY: &str = "9f96f7716b8abb42d49771926fb5c59aa405f7b3164a79ac522429c94b6ea0c4";
    const SIGNATURE: &str = "6a5b4f3f00aac1c5612fc90ce05354205860bb042cb58352bc2d657009a4562974faa7aad0d8e2d78a1dfacc2f5633a7398d1ca31c70f182aa6f5769c8c0da0c";

    #[test]
    fn only_an_archive_signed_with_the_key_verifies() {
        let archive = b"openpanel test archive";
        assert!(verify_signature(archive, SIGNATURE, KEY).is_ok());
        assert!(verify_signature(b"openpanel test archivE", SIGNATURE, KEY).is_err());
        assert!(verify_signature(archive, &SIGNATURE.replace('6', "7"), KEY).is_err());
        let other_key = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
        assert!(verify_signature(archive, SIGNATURE, other_key).is_err());
        assert!(verify_signature(archive, "", KEY).is_err());
    }

    #[test]
    fn the_release_key_is_a_valid_key() {
        let key = hex::decode(UPDATE_PUBLIC_KEY).expect("UPDATE_PUBLIC_KEY is hex");
        let key: [u8; 32] = key.try_into().expect("UPDATE_PUBLIC_KEY is 32 bytes");
        assert!(ed25519_dalek::VerifyingKey::from_bytes(&key).is_ok());
    }

    #[test]
    fn an_update_that_keeps_failing_to_start_is_rolled_back() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("openpanel-server");
        let ui = dir.path().join("dist");
        std::fs::write(&exe, "new").unwrap();
        std::fs::write(sibling(&exe, "old"), "previous").unwrap();
        std::fs::create_dir_all(&ui).unwrap();
        std::fs::write(ui.join("index.html"), "new ui").unwrap();
        std::fs::create_dir_all(dir.path().join("dist.old")).unwrap();
        std::fs::write(
            dir.path().join("dist.old").join("index.html"),
            "previous ui",
        )
        .unwrap();
        std::fs::write(sibling(&exe, "update-pending"), "0").unwrap();

        for n in 1..=MAX_STARTS {
            assert_eq!(check_pending(&exe, &ui), Start::Trying(n));
        }
        assert_eq!(check_pending(&exe, &ui), Start::RolledBack);

        assert_eq!(std::fs::read_to_string(&exe).unwrap(), "previous");
        assert_eq!(
            std::fs::read_to_string(sibling(&exe, "failed")).unwrap(),
            "new"
        );
        assert_eq!(
            std::fs::read_to_string(ui.join("index.html")).unwrap(),
            "previous ui"
        );
        assert!(!sibling(&exe, "update-pending").exists());
        assert_eq!(check_pending(&exe, &ui), Start::Normal);
    }

    #[test]
    fn an_update_that_runs_is_kept() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("openpanel-server");
        let ui = dir.path().join("dist");
        std::fs::write(&exe, "new").unwrap();
        std::fs::write(sibling(&exe, "old"), "previous").unwrap();
        std::fs::create_dir_all(dir.path().join("dist.old")).unwrap();
        std::fs::write(sibling(&exe, "update-pending"), "0").unwrap();

        assert_eq!(check_pending(&exe, &ui), Start::Trying(1));
        // What confirm_update does once the new version has run for a while
        std::fs::remove_file(sibling(&exe, "update-pending")).unwrap();
        cleanup_old_files(&exe, &ui);

        assert!(!sibling(&exe, "old").exists());
        assert!(!dir.path().join("dist.old").exists());
        assert_eq!(std::fs::read_to_string(&exe).unwrap(), "new");
    }
}
