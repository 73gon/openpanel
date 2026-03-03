# OpenPanel Updater for Windows — triggered by Scheduled Task when update-trigger file appears
# This script runs on the HOST, not inside Docker.
# It reads the desired channel from the trigger file and pulls the correct image.

$ErrorActionPreference = "Stop"

$COMPOSE_DIR = if ($env:OPENPANEL_DIR) { $env:OPENPANEL_DIR } else { "C:\panel" }
$IMAGE = "ghcr.io/73gon/panel"
$LOG_FILE = "$COMPOSE_DIR\updater.log"

function Log($msg) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $entry = "[$timestamp] $msg"
    Write-Output $entry
    Add-Content -Path $LOG_FILE -Value $entry
}

# Auto-detect the Docker volume mount path
function Find-TriggerFile {
    $projectName = (Split-Path $COMPOSE_DIR -Leaf).ToLower() -replace '[^a-z0-9]', ''
    $candidates = @(
        "${projectName}_openpanel-data",
        "openpanel-data",
        "panel_openpanel-data",
        "panel_panel-data"
    )

    foreach ($vol in $candidates) {
        try {
            $mp = docker volume inspect $vol --format '{{ .Mountpoint }}' 2>$null
            if ($mp) {
                $tf = Join-Path $mp "update-trigger"
                if (Test-Path $tf) { return $tf }
            }
        } catch {}

        # Try WSL2 path for Docker Desktop
        $wslPath = "\\wsl$\docker-desktop-data\data\docker\volumes\${vol}\_data\update-trigger"
        if (Test-Path $wslPath) { return $wslPath }
    }
    return $null
}

$triggerFile = Find-TriggerFile

if (-not $triggerFile -or -not (Test-Path $triggerFile)) {
    # No trigger — silent exit (scheduled task runs every minute)
    exit 0
}

# Read channel from trigger file (first line = channel, second line = timestamp)
$content = Get-Content $triggerFile
$channel = if ($content.Count -ge 1) { $content[0] } else { "stable" }
$timestamp = if ($content.Count -ge 2) { $content[1] } else { "unknown" }

switch ($channel) {
    "nightly" { $tag = "nightly" }
    default   { $tag = "latest" }
}

Log "Update triggered at $timestamp (channel=$channel, tag=$tag)"

# Remove trigger file immediately to prevent re-runs
Remove-Item $triggerFile -Force

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
