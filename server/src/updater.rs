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

        // Clean up old UI
        let _ = std::fs::remove_dir_all(&old_ui);
        tracing::info!("UI dist updated at {}", canonical_ui.display());
    } else {
        tracing::warn!("Archive did not contain ui/dist — skipping UI update");
    }

    Ok(old_exe)
}

/// Remove leftover `.old` files from a previous update (called on startup).
pub fn cleanup_old_files() {
    if let Ok(exe) = std::env::current_exe() {
        let old_name = format!(
            "{}.old",
            exe.file_name().unwrap_or_default().to_string_lossy()
        );
        let old_exe = exe.with_file_name(old_name);
        if old_exe.exists() {
            match std::fs::remove_file(&old_exe) {
                Ok(_) => tracing::info!("Cleaned up old binary: {}", old_exe.display()),
                Err(e) => {
                    tracing::warn!("Could not remove old binary {}: {}", old_exe.display(), e)
                }
            }
        }
    }
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
