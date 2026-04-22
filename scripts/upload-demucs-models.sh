#!/usr/bin/env bash
# =============================================================================
# Upload Demucs GGML model weights to the Hetzner server
# =============================================================================
#
# Downloads htdemucs 4-stem and 6-stem models from HuggingFace, then
# uploads them to the production server at devilbox.uprough.net so users
# download from our CDN (fast, no HuggingFace rate limits).
#
# Prerequisites:
#   - ssh access to devilbox.uprough.net (as root or deploy user)
#   - curl
#
# Usage:
#   bash scripts/upload-demucs-models.sh
#
# The script is idempotent — re-running skips already-uploaded files.
# =============================================================================

set -euo pipefail

SERVER="devilbox.uprough.net"
SERVER_MODELS_DIR="/var/www/devilbox-dist/models"
LOCAL_TMP="$(mktemp -d)"

# HuggingFace source URLs
HF_BASE="https://huggingface.co/datasets/Retrobear/demucs.cpp/resolve/main"
MODELS=(
  "ggml-model-htdemucs-4s-f16.bin"
  "ggml-model-htdemucs-6s-f16.bin"
)

cleanup() { rm -rf "$LOCAL_TMP"; }
trap cleanup EXIT

echo "=== Demucs Model Upload ==="
echo "Server: $SERVER"
echo "Target: $SERVER_MODELS_DIR"
echo ""

# Create models directory on server
ssh "$SERVER" "mkdir -p $SERVER_MODELS_DIR"

for model in "${MODELS[@]}"; do
  echo "--- $model ---"

  # Check if already on server
  REMOTE_SIZE=$(ssh "$SERVER" "stat -c%s '$SERVER_MODELS_DIR/$model' 2>/dev/null || echo 0")
  if [[ "$REMOTE_SIZE" -gt 1000000 ]]; then
    echo "  Already on server ($(numfmt --to=iec "$REMOTE_SIZE")). Skipping."
    continue
  fi

  # Download from HuggingFace
  LOCAL_FILE="$LOCAL_TMP/$model"
  echo "  Downloading from HuggingFace..."
  curl -fSL --progress-bar "$HF_BASE/$model" -o "$LOCAL_FILE"
  LOCAL_SIZE=$(stat -f%z "$LOCAL_FILE" 2>/dev/null || stat -c%s "$LOCAL_FILE")
  echo "  Downloaded: $(numfmt --to=iec "$LOCAL_SIZE")"

  # Upload to server
  echo "  Uploading to $SERVER..."
  scp "$LOCAL_FILE" "$SERVER:$SERVER_MODELS_DIR/$model"
  echo "  Done."
done

echo ""
echo "=== Verifying ==="
ssh "$SERVER" "ls -lh $SERVER_MODELS_DIR/"

echo ""
echo "=== Verify URLs ==="
for model in "${MODELS[@]}"; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$SERVER/models/$model")
  SIZE=$(curl -sI "https://$SERVER/models/$model" | grep -i content-length | awk '{print $2}' | tr -d '\r')
  echo "  https://$SERVER/models/$model → HTTP $HTTP_CODE (${SIZE:-?} bytes)"
done

echo ""
echo "Done! Models are available at:"
for model in "${MODELS[@]}"; do
  echo "  https://$SERVER/models/$model"
done
