#!/usr/bin/env bash
# =============================================================================
# DEViLBOX Pull-Based Deploy — One-Time Server Setup
# =============================================================================
#
# Run this ONCE on the Hetzner server to set up webhook-based pull deployment.
#
# Prerequisites:
#   export DEPLOY_SECRET="your-random-secret-here"
#   bash scripts/server-setup.sh
#
# After running:
#   1. Add the Caddy snippet printed at the end to your Caddyfile
#   2. Run: caddy reload
#   3. Add DEPLOY_SECRET to GitHub repo Settings → Secrets → Actions
#
# =============================================================================

set -euo pipefail

# --- Validation ---------------------------------------------------------------

if [[ -z "${DEPLOY_SECRET:-}" ]]; then
  echo "ERROR: DEPLOY_SECRET is not set."
  echo "  export DEPLOY_SECRET=\"your-random-secret-here\""
  echo "  bash scripts/server-setup.sh"
  exit 1
fi

echo "==> Setting up DEViLBOX pull-based deployment..."

# --- Install adnanh/webhook ---------------------------------------------------

WEBHOOK_VERSION="2.8.1"
WEBHOOK_BIN="/usr/local/bin/webhook"

if [[ ! -x "$WEBHOOK_BIN" ]]; then
  echo "==> Downloading webhook v${WEBHOOK_VERSION}..."
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64) WEBHOOK_ARCH="amd64" ;;
    aarch64|arm64) WEBHOOK_ARCH="arm64" ;;
    *) echo "ERROR: Unsupported arch: $ARCH"; exit 1 ;;
  esac
  WEBHOOK_URL="https://github.com/adnanh/webhook/releases/download/${WEBHOOK_VERSION}/webhook-linux-${WEBHOOK_ARCH}.tar.gz"
  TMP_DIR="$(mktemp -d)"
  curl -fsSL "$WEBHOOK_URL" -o "${TMP_DIR}/webhook.tar.gz"
  tar -xzf "${TMP_DIR}/webhook.tar.gz" -C "$TMP_DIR"
  install -m 0755 "${TMP_DIR}/webhook-linux-${WEBHOOK_ARCH}/webhook" "$WEBHOOK_BIN"
  rm -rf "$TMP_DIR"
  echo "    Installed: $WEBHOOK_BIN"
else
  echo "    webhook already installed: $WEBHOOK_BIN"
fi

# --- Create deploy script -----------------------------------------------------

echo "==> Creating /opt/devilbox-deploy.sh..."
mkdir -p /opt

cat > /opt/devilbox-deploy.sh << 'DEPLOY_SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

LOG="/var/log/devilbox-deploy.log"
DIST_DIR="/var/www/devilbox-dist"
TMP_DIR="$(mktemp -d)"
TARBALL="${TMP_DIR}/devilbox-dist.tar.gz"
GH_REPO="spotUP/DEViLBOX"
RELEASE_TAG="latest"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

log "==> Deploy triggered"

# Download latest release asset
ASSET_URL="https://github.com/${GH_REPO}/releases/download/${RELEASE_TAG}/devilbox-dist.tar.gz"
log "    Downloading ${ASSET_URL}..."
curl -fsSL "$ASSET_URL" -o "$TARBALL"
log "    Downloaded: $(du -sh "$TARBALL" | cut -f1)"

# Atomic swap: extract to temp dir, then move into place
EXTRACT_DIR="${TMP_DIR}/dist"
mkdir -p "$EXTRACT_DIR"
tar -xzf "$TARBALL" -C "$EXTRACT_DIR"

# Sync to web root (rsync preserves permissions, atomically replaces changed files)
# data/presets is a symlink to the devilbox-presets clone, so --delete must not touch it.
rsync -a --delete --exclude '/data/presets' "${EXTRACT_DIR}/" "${DIST_DIR}/"

# Preset banks: separate public repo, cloned outside the dist and served at /data/presets/.
PRESETS_DIR="${PRESETS_DIR:-/var/www/devilbox-presets}"
PRESETS_REPO="https://github.com/spotUP/devilbox-presets.git"
if [[ -d "${PRESETS_DIR}/.git" ]]; then
  git -C "$PRESETS_DIR" pull --ff-only 2>&1 | tee -a "$LOG"
else
  git clone --depth 1 "$PRESETS_REPO" "$PRESETS_DIR" 2>&1 | tee -a "$LOG"
fi
mkdir -p "${DIST_DIR}/data"
ln -sfn "$PRESETS_DIR" "${DIST_DIR}/data/presets"
log "    Presets synced into ${PRESETS_DIR}"

# Backend API: load the image CI built and restart the service on it.
# BACKEND_COMPOSE_DIR holds docker-compose.yml and the .env with JWT_SECRET
# and OPENROUTER_API_KEY.
BACKEND_COMPOSE_DIR="${BACKEND_COMPOSE_DIR:-/var/www/devilbox}"
IMAGE_URL="https://github.com/${GH_REPO}/releases/download/${RELEASE_TAG}/devilbox-backend.tar.gz"
log "    Downloading ${IMAGE_URL}..."
curl -fsSL "$IMAGE_URL" -o "${TMP_DIR}/devilbox-backend.tar.gz"
gunzip -c "${TMP_DIR}/devilbox-backend.tar.gz" | docker load | tee -a "$LOG"
(cd "$BACKEND_COMPOSE_DIR" && docker compose up -d --no-build backend) 2>&1 | tee -a "$LOG"
log "    Backend restarted on devilbox-backend:latest"

# Clean up
rm -rf "$TMP_DIR"

log "==> Deploy complete"
DEPLOY_SCRIPT

chmod 0755 /opt/devilbox-deploy.sh
echo "    Created: /opt/devilbox-deploy.sh"

# --- Create web root if needed ------------------------------------------------

if [[ ! -d /var/www/devilbox-dist ]]; then
  echo "==> Creating /var/www/devilbox-dist/..."
  mkdir -p /var/www/devilbox-dist
fi

# --- Create /var/log/devilbox-deploy.log with correct perms ------------------

touch /var/log/devilbox-deploy.log
echo "    Log file: /var/log/devilbox-deploy.log"

# --- Create webhook hooks.json ------------------------------------------------

echo "==> Creating /etc/webhook/hooks.json..."
mkdir -p /etc/webhook

cat > /etc/webhook/hooks.json << HOOKS_JSON
[
  {
    "id": "deploy",
    "execute-command": "/opt/devilbox-deploy.sh",
    "command-working-directory": "/",
    "response-message": "Deploy triggered.",
    "trigger-rule": {
      "match": {
        "type": "value",
        "value": "${DEPLOY_SECRET}",
        "parameter": {
          "source": "header",
          "name": "X-Deploy-Token"
        }
      }
    }
  }
]
HOOKS_JSON

chmod 0600 /etc/webhook/hooks.json
echo "    Created: /etc/webhook/hooks.json"

# --- Create systemd service ---------------------------------------------------

echo "==> Creating systemd service webhook.service..."

cat > /etc/systemd/system/webhook.service << 'SERVICE'
[Unit]
Description=DEViLBOX Deploy Webhook
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/webhook -hooks /etc/webhook/hooks.json -port 9000 -verbose
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=webhook

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable webhook
systemctl restart webhook
echo "    Service started: $(systemctl is-active webhook)"

# --- Done ---------------------------------------------------------------------

echo ""
echo "================================================================"
echo " SETUP COMPLETE"
echo "================================================================"
echo ""
echo " Next steps:"
echo ""
echo " 1. Add this snippet to your Caddyfile (inside the devilbox.uprough.net block):"
echo ""
echo "        handle /_webhook/* {"
echo "            reverse_proxy localhost:9000"
echo "        }"
echo ""
echo "    Also add these cache headers in the same block. Files outside /assets/"
echo "    (worklets, WASM, data) keep fixed names, so without no-cache browsers keep"
echo "    stale copies by heuristic for days; Vite-hashed /assets/ never change."
echo ""
echo "        @unhashed {"
echo "            not path /assets/*"
echo "            path / *.html *.js *.mjs *.wasm *.json *.data"
echo "        }"
echo "        header @unhashed Cache-Control \"no-cache\""
echo "        header /assets/* Cache-Control \"public, max-age=31536000, immutable\""
echo ""
echo " 2. Reload Caddy:"
echo "        caddy reload"
echo ""
echo " 3. Add DEPLOY_SECRET to GitHub:"
echo "        Settings → Secrets and variables → Actions → New repository secret"
echo "        Name:  DEPLOY_SECRET"
echo "        Value: ${DEPLOY_SECRET}"
echo ""
echo " 4. Push a commit to main and watch it deploy!"
echo "        tail -f /var/log/devilbox-deploy.log"
echo ""
echo "================================================================"
