#!/usr/bin/env bash
# run-audit.sh — Full UADE audio quality audit
#
# Renders all .test-formats/ files with both uade123 (reference) and
# the DEViLBOX UADE WASM (devilbox), then compares the WAVs.
#
# Usage:
#   ./run-audit.sh                   # full audit (skip existing)
#   ./run-audit.sh --force           # re-render everything
#   ./run-audit.sh afterburner.dl    # single file
#
# Output:
#   test-data/uade-ref/<name>.wav    — reference renders
#   test-data/uade-devilbox/<name>.wav — DEViLBOX renders
#   test-data/uade-audit-report.json — comparison report

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

log()  { echo -e "${CYAN}[audit]${RESET} $*"; }
ok()   { echo -e "${GREEN}[audit]${RESET} $*"; }
warn() { echo -e "${YELLOW}[audit]${RESET} $*"; }
err()  { echo -e "${RED}[audit]${RESET} $*"; }

FORCE_FLAG=""
SINGLE_FILE=""

for arg in "$@"; do
  case "$arg" in
    --force) FORCE_FLAG="--force" ;;
    *) SINGLE_FILE="$arg" ;;
  esac
done

# ── Step 1: Render reference WAVs via uade123 ────────────────────────────────

log "Step 1: Rendering reference WAVs via uade123..."
if [ -n "$SINGLE_FILE" ]; then
  "$SCRIPT_DIR/render-reference.sh" "$SINGLE_FILE"
else
  "$SCRIPT_DIR/render-reference.sh"
fi

# ── Step 2: Render DEViLBOX WAVs via UADE WASM ──────────────────────────────

log "Step 2: Rendering DEViLBOX WAVs via UADE WASM..."
if [ -n "$SINGLE_FILE" ]; then
  npx tsx "$SCRIPT_DIR/render-devilbox.ts" "$SINGLE_FILE"
else
  npx tsx "$SCRIPT_DIR/render-devilbox.ts" --batch $FORCE_FLAG
fi

# ── Step 3: Compare WAVs ─────────────────────────────────────────────────────

log "Step 3: Comparing WAVs..."
npx tsx "$SCRIPT_DIR/compare-wavs.ts" --batch \
  "$PROJECT_ROOT/test-data/uade-ref" \
  "$PROJECT_ROOT/test-data/uade-devilbox"

log "Audit complete. Report: test-data/uade-audit-report.json"
