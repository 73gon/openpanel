use std::process::Command;

fn main() {
    // Capture short git commit SHA at build time
    let commit = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| {
            // Fall back to BUILD_COMMIT env var (set in Dockerfile)
            std::env::var("BUILD_COMMIT").unwrap_or_else(|_| "unknown".to_string())
        });

    println!("cargo:rustc-env=GIT_COMMIT_SHA={}", commit);

    // Build channel: stable / nightly / dev
    let channel = std::env::var("BUILD_CHANNEL").unwrap_or_else(|_| "dev".to_string());
    println!("cargo:rustc-env=BUILD_CHANNEL={}", channel);

    // Display version (e.g. "nightly-20260303-abc1234" or "v1.0.0")
    // Falls back to Cargo package version if not set
    let display_version =
        std::env::var("BUILD_VERSION").unwrap_or_else(|_| format!("dev-{}", &commit));
    println!("cargo:rustc-env=BUILD_VERSION={}", display_version);

    // GitHub repository (owner/repo) for update checks
    let github_repo = std::env::var("GITHUB_REPOSITORY")
        .or_else(|_| {
            // Try extracting from git remote origin
            Command::new("git")
                .args(["remote", "get-url", "origin"])
                .output()
                .ok()
                .filter(|o| o.status.success())
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .map(|url| {
                    let url = url.trim().trim_end_matches(".git");
                    if let Some(path) = url.strip_prefix("https://github.com/") {
                        path.to_string()
                    } else if let Some(path) = url.strip_prefix("git@github.com:") {
                        path.to_string()
                    } else {
                        String::new()
                    }
                })
                .filter(|s| !s.is_empty())
                .ok_or(std::env::VarError::NotPresent)
        })
        .unwrap_or_default();
    println!("cargo:rustc-env=GITHUB_REPO={}", github_repo);

    // Re-run when the git HEAD changes (e.g. new commit)
    println!("cargo:rerun-if-changed=.git/HEAD");
    println!("cargo:rerun-if-changed=.git/refs/heads");
    println!("cargo:rerun-if-env-changed=BUILD_CHANNEL");
    println!("cargo:rerun-if-env-changed=BUILD_COMMIT");
    println!("cargo:rerun-if-env-changed=BUILD_VERSION");
    println!("cargo:rerun-if-env-changed=GITHUB_REPOSITORY");
}
