# OpenPanel Updater for Windows — triggered by Scheduled Task (polling)
# This script runs on the HOST, not inside Docker.
# It uses `docker exec` to read the trigger file from the container's data volume,
# since Docker Desktop for Windows doesn't expose volume paths to the host filesystem.

$ErrorActionPreference = "Continue"  # use $LASTEXITCODE for native command errors

$COMPOSE_DIR = if ($env:OPENPANEL_DIR) { $env:OPENPANEL_DIR } else { "C:\openpanel" }
$CONTAINER_NAME = "openpanel"
$LOG_FILE = "$COMPOSE_DIR\updater.log"
$composeFile = Join-Path $COMPOSE_DIR "docker-compose.yml"

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

# Read the current image name from docker-compose.yml (e.g. ghcr.io/73gon/panel)
$currentImageLine = ''
if (Test-Path $composeFile) {
    $currentImageLine = (Get-Content $composeFile | Where-Object { $_ -match '^\s+image:\s+' } | Select-Object -First 1)
}
# Parse "  image: ghcr.io/owner/name:tag" -> "ghcr.io/owner/name"
$imageBase = ''
if ($currentImageLine -match 'image:\s+(\S+?)(?::[^\s:]+)?$') {
    $imageBase = $matches[1]
}
if (-not $imageBase) {
    Log "Could not determine image name from docker-compose.yml"
    exit 1
}
$fullImage = "${imageBase}:${tag}"

# Update docker-compose.yml to the new tag
$composeContent = Get-Content $composeFile -Raw
$composeContent = $composeContent -replace ('image:\s+' + [regex]::Escape($imageBase) + '(?::[^\s]+)?'), "image: $fullImage"
Set-Content -Path $composeFile -Value $composeContent
Log "docker-compose.yml updated to $fullImage"

# Pull the image
Set-Location $COMPOSE_DIR
Log "Pulling $fullImage ..."
$pullOutput = docker pull $fullImage 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
    Log "Image pull failed: $pullOutput"
    exit 1
}
Log $pullOutput
Log "Image pull successful"

# Restart with the new image
# Stop and remove the existing container first to avoid name conflicts
# (handles cases where the container was originally created with `docker run`
#  rather than `docker compose`, which would otherwise cause a name conflict)
Set-Location $COMPOSE_DIR
Log "Stopping existing container '$CONTAINER_NAME'..."
docker stop $CONTAINER_NAME 2>&1 | Out-Null
docker rm $CONTAINER_NAME 2>&1 | Out-Null

Log "Starting updated container..."
$dockerOutput = docker compose up -d --remove-orphans 2>$null
if ($LASTEXITCODE -ne 0) {
    # Re-run capturing stderr so we can log the error
    $dockerOutput = docker compose up -d --remove-orphans 2>&1 | Out-String
    Log "Docker compose up failed: $dockerOutput"
    exit 1
}
Log "Update complete! Now running $fullImage"
