#!/bin/bash
# Install OpenPanel updater on Linux using systemd timer (polls every minute)
# Run: sudo bash scripts/install-updater.sh
# The updater uses `docker exec` to check for trigger files, no volume path detection needed.

set -euo pipefail

# Auto-detect OS and redirect to Windows installer if needed
if [[ "$(uname -s)" == MINGW* ]] || [[ "$(uname -s)" == MSYS* ]] || [[ "$(uname -s)" == CYGWIN* ]]; then
    echo "Windows detected — use the PowerShell installer instead:"
    echo "  powershell -ExecutionPolicy Bypass -File scripts\\install-updater.ps1"
    exit 1
fi

USER_HOME=$(eval echo ~$SUDO_USER)
PANEL_DIR="${OPENPANEL_DIR:-$USER_HOME/panel}"

# Verify docker is available
if ! docker info >/dev/null 2>&1; then
    echo "Docker is not running or not available."
    exit 1
fi

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

# Create systemd timer (replaces path watcher — more reliable with docker exec approach)
cat > /etc/systemd/system/openpanel-updater.timer << EOF
[Unit]
Description=Poll for OpenPanel update trigger every minute

[Timer]
OnBootSec=30s
OnUnitActiveSec=1min

[Install]
WantedBy=timers.target
EOF

# Remove old path watcher if it exists
if systemctl is-active --quiet openpanel-updater.path 2>/dev/null; then
    systemctl stop openpanel-updater.path
    systemctl disable openpanel-updater.path
fi
rm -f /etc/systemd/system/openpanel-updater.path

# Enable and start the timer
systemctl daemon-reload
systemctl enable openpanel-updater.timer
systemctl start openpanel-updater.timer

echo ""
echo "OpenPanel updater installed successfully!"
echo "  - Timer:  systemctl status openpanel-updater.timer"
echo "  - Service: systemctl status openpanel-updater.service"
echo "  - Logs:   journalctl -u openpanel-updater.service -f"
echo "  - Service: systemctl status openpanel-updater.service"
echo "  - Logs:    journalctl -u openpanel-updater.service -f"
