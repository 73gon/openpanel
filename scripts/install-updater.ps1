# Install OpenPanel Updater on Windows using Scheduled Task
# Run this as Administrator: powershell -ExecutionPolicy Bypass -File scripts\install-updater.ps1
# The updater uses `docker exec` to check for trigger files, so no volume path detection needed.

$ErrorActionPreference = "Stop"

$PANEL_DIR = if ($env:OPENPANEL_DIR) { $env:OPENPANEL_DIR } else { "C:\panel" }
$TASK_NAME = "OpenPanelUpdater"
$SCRIPT_PATH = "$PANEL_DIR\scripts\panel-updater.ps1"

# Verify prerequisites
if (-not (Test-Path $SCRIPT_PATH)) {
    Write-Error "Updater script not found at $SCRIPT_PATH"
    exit 1
}

# Verify docker is available
try {
    docker info | Out-Null
} catch {
    Write-Error "Docker is not running or not available."
    exit 1
}

Write-Host "OpenPanel directory: $PANEL_DIR"
Write-Host "Updater script: $SCRIPT_PATH"
Write-Host "Task name: $TASK_NAME"

# Remove existing task if present (also remove old task name)
foreach ($name in @($TASK_NAME, "PanelUpdater")) {
    $existing = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "Removing existing scheduled task: $name"
        Unregister-ScheduledTask -TaskName $name -Confirm:$false
    }
}

# Create the scheduled task action
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -NoProfile -File `"$SCRIPT_PATH`"" `
    -WorkingDirectory $PANEL_DIR

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

# Register — use SYSTEM account so it works over SSH
Register-ScheduledTask `
    -TaskName $TASK_NAME `
    -Action $action `
    -Trigger $trigger, $repetition `
    -Settings $settings `
    -User "SYSTEM" `
    -RunLevel Highest `
    -Description "Polls for OpenPanel update trigger via docker exec, then pulls and restarts the container" `
    -Force

Write-Host ""
Write-Host "OpenPanel updater installed successfully!"
Write-Host "  - Task: $TASK_NAME (runs every 1 minute, checks for trigger file)"
Write-Host "  - Logs: $PANEL_DIR\updater.log"
Write-Host "  - Manage: Get-ScheduledTask -TaskName $TASK_NAME"
Write-Host "  - Test:   Start-ScheduledTask -TaskName $TASK_NAME"
