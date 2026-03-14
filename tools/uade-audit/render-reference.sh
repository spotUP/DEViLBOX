#!/usr/bin/env bash
# render-reference.sh — Render UADE test files to reference WAVs using uade123
#
# Uses the native uade123 CLI to render Amiga module files to 16-bit stereo
# 44100Hz WAV files that can be compared against DEViLBOX WASM output.
#
# Usage:
#   ./render-reference.sh                          # Render all .test-formats/ files
#   ./render-reference.sh afterburner.dl           # Render a single file
#   ./render-reference.sh .test-formats/           # Render all in a directory
#   ./render-reference.sh --duration 30            # Override render duration (seconds)
#
# Output: test-data/uade-ref/<name>.wav

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

UADE123="/opt/homebrew/bin/uade123"
TEST_FORMATS_DIR="$PROJECT_ROOT/.test-formats"
OUTPUT_DIR="$PROJECT_ROOT/test-data/uade-ref"

DURATION=30  # seconds to render per file

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

log()  { echo -e "${CYAN}[render-ref]${RESET} $*"; }
ok()   { echo -e "${GREEN}[render-ref]${RESET} $*"; }
warn() { echo -e "${YELLOW}[render-ref]${RESET} $*"; }
err()  { echo -e "${RED}[render-ref]${RESET} $*"; }

# ── Parse arguments ──────────────────────────────────────────────────────────

TARGET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --duration)
      DURATION="$2"
      shift 2
      ;;
    *)
      TARGET="$1"
      shift
      ;;
  esac
done

# ── Verify uade123 ───────────────────────────────────────────────────────────

if [ ! -x "$UADE123" ]; then
  err "uade123 not found at: $UADE123"
  err "Install with: brew install uade"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

# ── Render a single file ─────────────────────────────────────────────────────

render_file() {
  local input="$1"
  local name
  name="$(basename "$input")"
  local output="$OUTPUT_DIR/${name}.wav"

  if [ -f "$output" ]; then
    warn "Skip (exists): $name.wav"
    return 0
  fi

  log "Rendering: $name (${DURATION}s)..."

  # uade123 flags:
  #   -f <output.wav>         write WAV output
  #   -t <seconds>            limit render duration
  #   --disable-timeouts      don't abort on silence
  #   -k 0                    play subsong 0 (default)
  if timeout $((DURATION + 10)) "$UADE123" \
      -f "$output" \
      -t "$DURATION" \
      --disable-timeouts \
      --one \
      "$input" \
      2>/dev/null; then
    if [ -f "$output" ] && [ -s "$output" ]; then
      local size
      size="$(du -h "$output" | cut -f1)"
      ok "Rendered: $name.wav ($size)"
    else
      err "No output for: $name (uade123 ran but produced no file)"
      rm -f "$output"
      return 1
    fi
  else
    local exit_code=$?
    err "Failed: $name (exit=$exit_code)"
    rm -f "$output"
    return 1
  fi
}

# ── Collect files to render ──────────────────────────────────────────────────

if [ -z "$TARGET" ]; then
  # Render all files in .test-formats/
  log "Rendering all files in .test-formats/..."
  SUCCESS=0; FAIL=0; SKIP=0

  for f in "$TEST_FORMATS_DIR"/*; do
    [ -f "$f" ] || continue
    name="$(basename "$f")"
    output="$OUTPUT_DIR/${name}.wav"
    if [ -f "$output" ]; then
      SKIP=$((SKIP + 1))
      continue
    fi
    if render_file "$f"; then
      SUCCESS=$((SUCCESS + 1))
    else
      FAIL=$((FAIL + 1))
    fi
  done

  echo ""
  log "Done. Rendered: ${GREEN}$SUCCESS${RESET}, Failed: ${RED}$FAIL${RESET}, Skipped: ${YELLOW}$SKIP${RESET}"

elif [ -f "$TARGET" ]; then
  render_file "$TARGET"

elif [ -f "$TEST_FORMATS_DIR/$TARGET" ]; then
  render_file "$TEST_FORMATS_DIR/$TARGET"

else
  err "File not found: $TARGET"
  exit 1
fi
