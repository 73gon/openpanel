# Panel Updater for Windows — triggered by Scheduled Task when update-trigger file appears
# This script runs on the HOST, not inside Docker.

$ErrorActionPreference = "Stop"

$PANEL_DIR = "C:\panel"
$LOG_FILE = "$PANEL_DIR\updater.log"

function Log($msg) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $entry = "[$timestamp] $msg"
    Write-Output $entry
    Add-Content -Path $LOG_FILE -Value $entry
}

# Find the trigger file in the Docker volume
try {
    $volumePath = (docker volume inspect panel_panel-data --format '{{ .Mountpoint }}' 2>$null)
    if (-not $volumePath) {
        # On Docker Desktop for Windows, volumes are inside the WSL2 VM.
        # Access them via the \\wsl$ share.
        $volumePath = "\\wsl$\docker-desktop-data\data\docker\volumes\panel_panel-data\_data"
    }
} catch {
    $volumePath = "\\wsl$\docker-desktop-data\data\docker\volumes\panel_panel-data\_data"
}

$triggerFile = Join-Path $volumePath "update-trigger"

if (-not (Test-Path $triggerFile)) {
    Log "No trigger file found, exiting."
    exit 0
}

Log "Update triggered at $(Get-Content $triggerFile)"

# Remove trigger file immediately to prevent re-runs
Remove-Item $triggerFile -Force

Set-Location $PANEL_DIR

# Pull latest code
Log "Pulling latest code..."
try {
    $gitOutput = git pull origin master 2>&1 | Out-String
    Log $gitOutput
    Log "Git pull successful"
} catch {
    Log "Git pull failed: $_"
    exit 1
}

# Rebuild and restart
Log "Rebuilding and restarting containers..."
try {
    $dockerOutput = docker compose up -d --build 2>&1 | Out-String
    Log $dockerOutput
    Log "Update complete!"
} catch {
    Log "Docker compose failed: $_"
    exit 1
}
