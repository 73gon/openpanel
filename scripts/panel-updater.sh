#!/bin/bash
# OpenPanel Updater — triggered by systemd timer or cron (polling)
# This script runs on the HOST, not inside Docker.
# It uses `docker exec` to read the trigger file from the container's data volume.

set -euo pipefail

COMPOSE_DIR="${OPENPANEL_DIR:-$HOME/panel}"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
CONTAINER_NAME="openpanel"
IMAGE="ghcr.io/73gon/panel"
LOG_TAG="openpanel-updater"

log() { logger -t "$LOG_TAG" "$@" 2>/dev/null || true; echo "[$(date)] $@"; }

# Check if the trigger file exists inside the container
if ! docker exec "$CONTAINER_NAME" test -f /data/update-trigger 2>/dev/null; then
    # No trigger file — silent exit
    exit 0
fi

# Read the trigger file content from inside the container
CONTENT=$(docker exec "$CONTAINER_NAME" cat /data/update-trigger 2>/dev/null || true)
if [ -z "$CONTENT" ]; then exit 0; fi

CHANNEL=$(echo "$CONTENT" | head -n1 | tr -d '[:space:]')
TIMESTAMP=$(echo "$CONTENT" | tail -n1 | tr -d '[:space:]')

# Default to stable if channel is missing or invalid
case "$CHANNEL" in
    nightly) TAG="nightly" ;;
    *)       TAG="latest" ;;
esac

log "Update triggered at $TIMESTAMP (channel=$CHANNEL, tag=$TAG)"

# Remove trigger file immediately to prevent re-runs
docker exec "$CONTAINER_NAME" rm -f /data/update-trigger 2>/dev/null || true

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
