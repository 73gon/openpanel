# Install OpenPanel Updater on Windows using Scheduled Task
# Run this as Administrator: powershell -ExecutionPolicy Bypass -File scripts\install-updater.ps1

$ErrorActionPreference = "Stop"

$PANEL_DIR = if ($env:OPENPANEL_DIR) { $env:OPENPANEL_DIR } else { "C:\panel" }
$TASK_NAME = "OpenPanelUpdater"
$SCRIPT_PATH = "$PANEL_DIR\scripts\panel-updater.ps1"

# Verify prerequisites
if (-not (Test-Path $SCRIPT_PATH)) {
    Write-Error "Updater script not found at $SCRIPT_PATH"
    exit 1
}

# Auto-detect volume path
$projectName = (Split-Path $PANEL_DIR -Leaf).ToLower() -replace '[^a-z0-9]', ''
$volumePath = $null
$candidates = @(
    "${projectName}_openpanel-data",
    "openpanel-data",
    "panel_openpanel-data"
)

foreach ($vol in $candidates) {
    try {
        $inspectPath = docker volume inspect $vol --format '{{ .Mountpoint }}' 2>$null
        if ($inspectPath) {
            $volumePath = $inspectPath
            break
        }
    } catch {}
}

if (-not $volumePath) {
    # Fallback to WSL2 path for Docker Desktop
    foreach ($vol in $candidates) {
        $wslPath = "\\wsl$\docker-desktop-data\data\docker\volumes\${vol}\_data"
        if (Test-Path $wslPath) {
            $volumePath = $wslPath
            break
        }
    }
}

if (-not $volumePath) {
    Write-Error "Docker volume not found. Make sure the OpenPanel container has been started at least once."
    exit 1
}

Write-Host "OpenPanel directory: $PANEL_DIR"
Write-Host "Trigger watch dir: $volumePath"
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
    -Description "Watches for OpenPanel update trigger file and pulls + restarts the Docker container" `
    -Force

Write-Host ""
Write-Host "OpenPanel updater installed successfully!"
Write-Host "  - Task: $TASK_NAME (runs every 1 minute, checks for trigger file)"
Write-Host "  - Logs: $PANEL_DIR\updater.log"
Write-Host "  - Manage: Get-ScheduledTask -TaskName $TASK_NAME"
Write-Host "  - Test:   Start-ScheduledTask -TaskName $TASK_NAME"
