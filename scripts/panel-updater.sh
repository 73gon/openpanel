#!/bin/bash
# Panel Updater — triggered by systemd when update-trigger file appears
# This script runs on the HOST, not inside Docker.

set -euo pipefail

PANEL_DIR="$HOME/panel"
LOG_TAG="panel-updater"

log() { logger -t "$LOG_TAG" "$@"; echo "[$(date)] $@"; }

# Find the trigger file in the Docker volume
TRIGGER_FILE=$(docker volume inspect panel_panel-data --format '{{ .Mountpoint }}')/update-trigger

if [ ! -f "$TRIGGER_FILE" ]; then
    log "No trigger file found, exiting."
    exit 0
fi

log "Update triggered at $(cat "$TRIGGER_FILE")"

# Remove trigger file immediately to prevent re-runs
rm -f "$TRIGGER_FILE"

cd "$PANEL_DIR"

# Pull latest code
log "Pulling latest code..."
if git pull origin master 2>&1 | tee /dev/stderr | logger -t "$LOG_TAG"; then
    log "Git pull successful"
else
    log "Git pull failed"
    exit 1
fi

# Rebuild and restart
log "Rebuilding and restarting containers..."
if docker compose up -d --build 2>&1 | tee /dev/stderr | logger -t "$LOG_TAG"; then
    log "Update complete!"
else
    log "Docker compose failed"
    exit 1
fi
