# OpenPanel Updater for Windows — triggered by Scheduled Task (polling)
# This script runs on the HOST, not inside Docker.
# It uses `docker exec` to read the trigger file from the container's data volume,
# since Docker Desktop for Windows doesn't expose volume paths to the host filesystem.

$ErrorActionPreference = "Stop"

$COMPOSE_DIR = if ($env:OPENPANEL_DIR) { $env:OPENPANEL_DIR } else { "C:\panel" }
$CONTAINER_NAME = "openpanel"
$IMAGE = "ghcr.io/73gon/panel"
$LOG_FILE = "$COMPOSE_DIR\updater.log"

function Log($msg) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $entry = "[$timestamp] $msg"
    Write-Output $entry
    Add-Content -Path $LOG_FILE -Value $entry
}

# Check if the trigger file exists inside the container
try {
    $exists = docker exec $CONTAINER_NAME test -f /data/update-trigger 2>$null
    if ($LASTEXITCODE -ne 0) {
        # No trigger file — silent exit
        exit 0
    }
} catch {
    # Container not running or docker exec failed — silent exit
    exit 0
}

# Read the trigger file content from inside the container
try {
    $content = docker exec $CONTAINER_NAME cat /data/update-trigger 2>$null
    if (-not $content) { exit 0 }
} catch {
    exit 0
}

$lines = $content -split "`n"
$channel = if ($lines.Count -ge 1) { $lines[0].Trim() } else { "stable" }
$timestamp = if ($lines.Count -ge 2) { $lines[1].Trim() } else { "unknown" }

switch ($channel) {
    "nightly" { $tag = "nightly" }
    default   { $tag = "latest" }
}

Log "Update triggered at $timestamp (channel=$channel, tag=$tag)"

# Remove trigger file immediately to prevent re-runs
docker exec $CONTAINER_NAME rm -f /data/update-trigger 2>$null

# Pull the correct image
Log "Pulling ${IMAGE}:${tag} ..."
try {
    $pullOutput = docker pull "${IMAGE}:${tag}" 2>&1 | Out-String
    Log $pullOutput
    Log "Image pull successful"
} catch {
    Log "Image pull failed: $_"
    exit 1
}

# Update the image tag in docker-compose.yml
$composeFile = Join-Path $COMPOSE_DIR "docker-compose.yml"
if (Test-Path $composeFile) {
    $composeContent = Get-Content $composeFile -Raw
    $composeContent = $composeContent -replace "image: ghcr.io/73gon/panel:.*", "image: ghcr.io/73gon/panel:$tag"
    Set-Content -Path $composeFile -Value $composeContent
}

# Restart with the new image
Set-Location $COMPOSE_DIR
Log "Restarting containers..."
try {
    $dockerOutput = docker compose up -d 2>&1 | Out-String
    Log $dockerOutput
    Log "Update complete! Now running ${IMAGE}:${tag}"
} catch {
    Log "Docker compose up failed: $_"
    exit 1
}
