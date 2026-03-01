#!/bin/bash
# Install panel-updater systemd units
# Run this on the host machine: sudo bash scripts/install-updater.sh

set -euo pipefail

USER_HOME=$(eval echo ~$SUDO_USER)
PANEL_DIR="$USER_HOME/panel"

# Get the Docker volume mount path
VOLUME_PATH=$(docker volume inspect panel_panel-data --format '{{ .Mountpoint }}' 2>/dev/null || echo "")

if [ -z "$VOLUME_PATH" ]; then
    echo "Docker volume panel_panel-data not found. Make sure the panel container has been started at least once."
    exit 1
fi

echo "Volume path: $VOLUME_PATH"
echo "Panel dir: $PANEL_DIR"
echo "User: $SUDO_USER"

# Install the updater script
cp "$PANEL_DIR/scripts/panel-updater.sh" /usr/local/bin/panel-updater
chmod +x /usr/local/bin/panel-updater

# Create systemd service
cat > /etc/systemd/system/panel-updater.service << EOF
[Unit]
Description=Panel Auto-Updater
After=docker.service

[Service]
Type=oneshot
User=$SUDO_USER
ExecStart=/usr/local/bin/panel-updater
Environment=HOME=$USER_HOME
StandardOutput=journal
StandardError=journal
EOF

# Create systemd path watcher
cat > /etc/systemd/system/panel-updater.path << EOF
[Unit]
Description=Watch for Panel update trigger

[Path]
PathExists=$VOLUME_PATH/update-trigger
Unit=panel-updater.service

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the path watcher
systemctl daemon-reload
systemctl enable panel-updater.path
systemctl start panel-updater.path

echo ""
echo "Panel updater installed successfully!"
echo "  - Watcher: systemctl status panel-updater.path"
echo "  - Service: systemctl status panel-updater.service"
echo "  - Logs:    journalctl -u panel-updater.service -f"
