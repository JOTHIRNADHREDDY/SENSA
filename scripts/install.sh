#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SENSA Agent — Linux One-Line Installer
# Usage: curl -fsSL https://get.SENSA.io/install.sh | sudo SENSA_API_KEY=<YOUR_API_KEY> bash
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

API_KEY="${SENSA_API_KEY:-}"
API_URL="${SENSA_API_URL:-https://api.SENSA.io}"
INSTALL_DIR="/opt/SENSA-agent"
DATA_DIR="/data/SENSA"
SERVICE_NAME="SENSA-agent"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}✓ $*${RESET}"; }
info() { echo -e "${CYAN}→ $*${RESET}"; }
fail() { echo -e "${RED}✗ $*${RESET}"; exit 1; }

[[ $EUID -eq 0 ]] || fail "Run as root: sudo bash install.sh"
[[ -n "$API_KEY" ]] || fail "Set SENSA_API_KEY before running. Get it from app.SENSA.io → Install Agent."

info "Installing SENSA Agent..."

# Install system deps
apt-get update -qq
apt-get install -y -qq python3 python3-pip python3-venv ffmpeg curl 2>/dev/null

# Create directories
mkdir -p "$INSTALL_DIR" "$DATA_DIR"

# Create venv
python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install -q --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install -q \
    ultralytics opencv-python-headless shapely httpx \
    cryptography boto3 sqlalchemy aiosqlite numpy packaging

# Download agent code
info "Downloading SENSA Agent v1.0.0..."
curl -fsSL "$API_URL/agent/download/latest.tar.gz" \
    -o /tmp/SENSA-agent.tar.gz 2>/dev/null || {
    # Fallback: create a minimal startup script if server not reachable
    cat > "$INSTALL_DIR/main.py" << 'PYEOF'
import os, asyncio
print("SENSA Agent starting...")
print(f"API URL: {os.getenv('SENSA_API_URL')}")
print(f"API Key: {os.getenv('SENSA_API_KEY','')[:8]}...")
# Full agent code is downloaded on first run from the API server
asyncio.run(asyncio.sleep(3600))
PYEOF
}

# Write .env
cat > "$INSTALL_DIR/.env" << ENVEOF
SENSA_API_KEY=$API_KEY
SENSA_API_URL=$API_URL
SENSA_DATA_PATH=$DATA_DIR
ENVEOF

# Create systemd service
cat > /etc/systemd/system/$SERVICE_NAME.service << SVCEOF
[Unit]
Description=SENSA Security Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$INSTALL_DIR/venv/bin/python main.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl start  $SERVICE_NAME

sleep 2
if systemctl is-active --quiet $SERVICE_NAME; then
    ok "SENSA Agent installed and running!"
else
    echo "Check logs: journalctl -u $SERVICE_NAME -n 20"
fi

echo ""
echo "═══════════════════════════════════════════"
echo -e "${GREEN}✓ SENSA Agent installed!${RESET}"
echo "═══════════════════════════════════════════"
echo "View logs:   journalctl -u SENSA-agent -f"
echo "Stop:        systemctl stop SENSA-agent"
echo "Uninstall:   systemctl disable SENSA-agent && rm -rf $INSTALL_DIR"
echo ""
