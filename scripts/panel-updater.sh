#!/bin/bash
# OpenPanel Updater — triggered by systemd when update-trigger file appears
# This script runs on the HOST, not inside Docker.
# It reads the desired channel from the trigger file and pulls the correct image.

set -euo pipefail

COMPOSE_DIR="${OPENPANEL_DIR:-$HOME/panel}"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
IMAGE="ghcr.io/73gon/panel"
LOG_TAG="openpanel-updater"

log() { logger -t "$LOG_TAG" "$@"; echo "[$(date)] $@"; }

# Auto-detect the Docker volume mount path for the data volume
# Try the compose project name first (directory-based), then common names
detect_trigger_file() {
    local project_name
    project_name=$(basename "$COMPOSE_DIR" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]//g')

    for vol_name in "${project_name}_openpanel-data" "openpanel-data" "panel_openpanel-data" "panel_panel-data"; do
        local mp
        mp=$(docker volume inspect "$vol_name" --format '{{ .Mountpoint }}' 2>/dev/null || true)
        if [ -n "$mp" ] && [ -f "$mp/update-trigger" ]; then
            echo "$mp/update-trigger"
            return 0
        fi
    done
    return 1
}

TRIGGER_FILE=$(detect_trigger_file) || {
    log "No trigger file found in any known volume, exiting."
    exit 0
}

if [ ! -f "$TRIGGER_FILE" ]; then
    log "No trigger file found, exiting."
    exit 0
fi

# Read channel from trigger file (first line = channel, second line = timestamp)
CONTENT=$(cat "$TRIGGER_FILE")
CHANNEL=$(echo "$CONTENT" | head -n1)
TIMESTAMP=$(echo "$CONTENT" | tail -n1)

# Default to stable if channel is missing or invalid
case "$CHANNEL" in
    nightly) TAG="nightly" ;;
    *)       TAG="latest" ;;
esac

log "Update triggered at $TIMESTAMP (channel=$CHANNEL, tag=$TAG)"

# Remove trigger file immediately to prevent re-runs
rm -f "$TRIGGER_FILE"

# Pull the correct image
log "Pulling $IMAGE:$TAG ..."
if docker pull "$IMAGE:$TAG" 2>&1 | tee /dev/stderr | logger -t "$LOG_TAG"; then
    log "Image pull successful"
else
    log "Image pull failed"
    exit 1
fi

# Update the image tag in docker-compose.yml so `up` uses the right one
cd "$COMPOSE_DIR"
sed -i "s|image: ghcr.io/73gon/panel:.*|image: ghcr.io/73gon/panel:$TAG|" docker-compose.yml

# Restart with the new image (no --build needed)
log "Restarting containers..."
if docker compose up -d 2>&1 | tee /dev/stderr | logger -t "$LOG_TAG"; then
    log "Update complete! Now running $IMAGE:$TAG"
else
    log "Docker compose up failed"
    exit 1
fi
