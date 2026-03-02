# Install Panel Updater on Windows using Scheduled Task
# Run this as Administrator: powershell -ExecutionPolicy Bypass -File scripts\install-updater.ps1

$ErrorActionPreference = "Stop"

$PANEL_DIR = "C:\panel"
$TASK_NAME = "PanelUpdater"
$SCRIPT_PATH = "$PANEL_DIR\scripts\panel-updater.ps1"

# Verify prerequisites
if (-not (Test-Path $SCRIPT_PATH)) {
    Write-Error "Updater script not found at $SCRIPT_PATH"
    exit 1
}

# Find the Docker volume path for the trigger file
# Docker Desktop on Windows uses WSL2, volumes are at this path
$volumePath = "\\wsl$\docker-desktop-data\data\docker\volumes\panel_panel-data\_data"

# Also try the docker volume inspect approach
try {
    $inspectPath = docker volume inspect panel_panel-data --format '{{ .Mountpoint }}' 2>$null
    if ($inspectPath) {
        $volumePath = $inspectPath
    }
} catch {}

$triggerDir = $volumePath
$triggerFile = "update-trigger"

Write-Host "Panel directory: $PANEL_DIR"
Write-Host "Trigger watch dir: $triggerDir"
Write-Host "Task name: $TASK_NAME"

# Remove existing task if present
$existing = Get-ScheduledTask -TaskName $TASK_NAME -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Removing existing scheduled task..."
    Unregister-ScheduledTask -TaskName $TASK_NAME -Confirm:$false
}

# Create the scheduled task action
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -NoProfile -File `"$SCRIPT_PATH`"" `
    -WorkingDirectory $PANEL_DIR

# Run every 30 seconds (minimum Windows Task Scheduler interval is 1 minute,
# so we use a repetition interval of 1 minute with a trigger at startup)
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = "PT30S"

# Repeat every 1 minute indefinitely
$repetition = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 1)

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

# Register with both triggers — use SYSTEM account so it works over SSH
Register-ScheduledTask `
    -TaskName $TASK_NAME `
    -Action $action `
    -Trigger $trigger, $repetition `
    -Settings $settings `
    -User "SYSTEM" `
    -RunLevel Highest `
    -Description "Watches for Panel update trigger file and runs git pull + docker compose rebuild" `
    -Force

Write-Host ""
Write-Host "Panel updater installed successfully!"
Write-Host "  - Task: $TASK_NAME (runs every 1 minute, checks for trigger file)"
Write-Host "  - Logs: $PANEL_DIR\updater.log"
Write-Host "  - Manage: Get-ScheduledTask -TaskName $TASK_NAME"
Write-Host "  - Test:   Start-ScheduledTask -TaskName $TASK_NAME"
