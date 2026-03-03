#!/bin/bash
# Install OpenPanel updater — auto-detects OS (Linux/Windows)
# Linux:   sudo bash scripts/install-updater.sh
# Windows: powershell -ExecutionPolicy Bypass -File scripts\install-updater.ps1

set -euo pipefail

# Auto-detect OS and redirect to Windows installer if needed
if [[ "$(uname -s)" == MINGW* ]] || [[ "$(uname -s)" == MSYS* ]] || [[ "$(uname -s)" == CYGWIN* ]] || command -v powershell.exe &>/dev/null && [[ "$(uname -s)" != "Linux" ]]; then
    echo "Windows detected — running PowerShell installer..."
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    powershell.exe -ExecutionPolicy Bypass -NoProfile -File "$SCRIPT_DIR/install-updater.ps1"
    exit $?
fi

USER_HOME=$(eval echo ~$SUDO_USER)
PANEL_DIR="${OPENPANEL_DIR:-$USER_HOME/panel}"
PROJECT_NAME=$(basename "$PANEL_DIR" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]//g')

# Try to find the Docker volume
VOLUME_PATH=""
for vol_name in "${PROJECT_NAME}_openpanel-data" "openpanel-data" "panel_openpanel-data"; do
    mp=$(docker volume inspect "$vol_name" --format '{{ .Mountpoint }}' 2>/dev/null || true)
    if [ -n "$mp" ]; then
        VOLUME_PATH="$mp"
        break
    fi
done

if [ -z "$VOLUME_PATH" ]; then
    echo "Docker volume not found. Make sure the OpenPanel container has been started at least once."
    echo "Looked for volumes: ${PROJECT_NAME}_openpanel-data, openpanel-data, panel_openpanel-data"
    exit 1
fi

echo "Volume path: $VOLUME_PATH"
echo "OpenPanel dir: $PANEL_DIR"
echo "User: $SUDO_USER"

# Install the updater script
cp "$PANEL_DIR/scripts/panel-updater.sh" /usr/local/bin/openpanel-updater
chmod +x /usr/local/bin/openpanel-updater

# Create systemd service
cat > /etc/systemd/system/openpanel-updater.service << EOF
[Unit]
Description=OpenPanel Auto-Updater
After=docker.service

[Service]
Type=oneshot
User=$SUDO_USER
ExecStart=/usr/local/bin/openpanel-updater
Environment=HOME=$USER_HOME
Environment=OPENPANEL_DIR=$PANEL_DIR
StandardOutput=journal
StandardError=journal
EOF

# Create systemd path watcher
cat > /etc/systemd/system/openpanel-updater.path << EOF
[Unit]
Description=Watch for OpenPanel update trigger

[Path]
PathExists=$VOLUME_PATH/update-trigger
Unit=openpanel-updater.service

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the path watcher
systemctl daemon-reload
systemctl enable openpanel-updater.path
systemctl start openpanel-updater.path

echo ""
echo "OpenPanel updater installed successfully!"
echo "  - Watcher: systemctl status openpanel-updater.path"
echo "  - Service: systemctl status openpanel-updater.service"
echo "  - Logs:    journalctl -u openpanel-updater.service -f"
