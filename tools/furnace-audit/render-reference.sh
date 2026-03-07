#!/usr/bin/env bash
# render-reference.sh — Render Furnace demo songs to reference WAVs
#
# Uses the headless Furnace CLI built from clean upstream source to render
# all demo .fur files to 16-bit stereo 44100Hz WAV files.
#
# Usage:
#   ./render-reference.sh                    # Render all demos
#   ./render-reference.sh gameboy            # Render only gameboy/ demos
#   ./render-reference.sh gameboy/cheap.fur  # Render a single file
#
# Output: test-data/furnace-ref/<category>/<name>.wav

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

FURNACE_CLI="/Users/spot/Code/Reference Code/furnace-master/build-headless/furnace"
DEMOS_DIR="/Users/spot/Code/Reference Code/furnace-master/demos"
OUTPUT_DIR="$PROJECT_ROOT/test-data/furnace-ref"

# Duration: render 1 loop + fadeout (default Furnace behavior with -loops 0)
LOOPS=0

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

log()  { echo -e "${CYAN}[render]${RESET} $*"; }
ok()   { echo -e "${GREEN}[render]${RESET} $*"; }
warn() { echo -e "${YELLOW}[render]${RESET} $*"; }
err()  { echo -e "${RED}[render]${RESET} $*"; }

# ── Verify CLI exists ────────────────────────────────────────────────────────
if [ ! -x "$FURNACE_CLI" ]; then
  err "Furnace CLI not found at: $FURNACE_CLI"
  err "Build it first: cd '/Users/spot/Code/Reference Code/furnace-master/build-headless' && make -j\$(sysctl -n hw.ncpu)"
  exit 1
fi

# ── Determine which files to render ──────────────────────────────────────────
FILTER="${1:-}"
declare -a FUR_FILES=()

if [ -z "$FILTER" ]; then
  # All demos
  while IFS= read -r -d '' f; do
    FUR_FILES+=("$f")
  done < <(find "$DEMOS_DIR" -name "*.fur" -print0 | sort -z)
elif [ -f "$DEMOS_DIR/$FILTER" ]; then
  # Single file
  FUR_FILES+=("$DEMOS_DIR/$FILTER")
elif [ -d "$DEMOS_DIR/$FILTER" ]; then
  # Category directory
  while IFS= read -r -d '' f; do
    FUR_FILES+=("$f")
  done < <(find "$DEMOS_DIR/$FILTER" -name "*.fur" -print0 | sort -z)
else
  err "Not found: $DEMOS_DIR/$FILTER"
  exit 1
fi

TOTAL=${#FUR_FILES[@]}
if [ "$TOTAL" -eq 0 ]; then
  err "No .fur files found."
  exit 1
fi

log "Rendering $TOTAL demo(s) to $OUTPUT_DIR"
echo ""

# ── Render loop ──────────────────────────────────────────────────────────────
PASSED=0
FAILED=0
SKIPPED=0

# Helper to avoid set -e killing on ((0++))
incr() { eval "$1=\$(( $1 + 1 ))"; }

for fur_path in "${FUR_FILES[@]}"; do
  # Extract category/name from path
  rel_path="${fur_path#$DEMOS_DIR/}"
  category=$(dirname "$rel_path")
  name=$(basename "$rel_path" .fur)

  out_dir="$OUTPUT_DIR/$category"
  out_wav="$out_dir/$name.wav"

  # Skip if already rendered
  if [ -f "$out_wav" ]; then
    incr SKIPPED
    continue
  fi

  mkdir -p "$out_dir"

  printf "  [%3d/%3d] %-50s " "$((PASSED + FAILED + SKIPPED + 1))" "$TOTAL" "$rel_path"

  # Render with timeout (some songs may hang)
  if timeout 120 "$FURNACE_CLI" \
    -output "$out_wav" \
    -loops "$LOOPS" \
    -loglevel error \
    "$fur_path" >/dev/null 2>&1; then

    if [ -f "$out_wav" ] && [ -s "$out_wav" ]; then
      size=$(du -h "$out_wav" | cut -f1)
      echo -e "${GREEN}OK${RESET} ($size)"
      incr PASSED
    else
      echo -e "${RED}EMPTY${RESET}"
      rm -f "$out_wav"
      incr FAILED
    fi
  else
    echo -e "${RED}FAIL${RESET}"
    rm -f "$out_wav"
    incr FAILED
  fi
done

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  Rendered: ${GREEN}$PASSED${RESET}  Failed: ${RED}$FAILED${RESET}  Skipped: ${YELLOW}$SKIPPED${RESET}  Total: $TOTAL"
echo -e "  Output:   $OUTPUT_DIR"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
