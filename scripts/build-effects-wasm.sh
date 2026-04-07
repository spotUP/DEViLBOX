#!/bin/bash
# build-effects-wasm.sh — Build all WASM audio effect modules
#
# Usage:
#   scripts/build-effects-wasm.sh              # Build all effect modules
#   scripts/build-effects-wasm.sh --list       # List effect modules
#   scripts/build-effects-wasm.sh --clean      # Clean + rebuild
#   scripts/build-effects-wasm.sh delay        # Build only effects matching "delay"

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# All effect module directory names (without -wasm suffix)
EFFECTS=(
  # Dynamics
  noise-gate limiter deesser multiband-comp transient-designer expander
  mono-comp sidechain-gate multiband-gate multiband-limiter sidechain-limiter
  clipper dynamics-proc x42-comp ducka beat-breather multiband-clipper
  multiband-dynamics multiband-expander gott-comp maximizer agc panda
  # Distortion
  overdrive cabinet-sim tube-amp saturator exciter autosat satma
  distortion-shaper driva
  # Modulation
  flanger ring-mod juno-chorus pulsator multi-chorus calf-phaser
  # Reverb & Delay
  dragonfly-plate dragonfly-hall dragonfly-room reverse-delay vintage-delay
  artistic-delay slapback-delay zam-delay early-reflections della roomy
  spacey-delayer re-tape-echo
  # EQ & Filter
  parametric-eq bass-enhancer eq5 eq8 eq12 geq31 zam-eq2 phono-filter
  dynamic-eq kuiza
  # Stereo & Spatial
  haas-enhancer multi-spread multiband-enhancer binaural-panner vihda
  # Creative / Lo-Fi
  masha vinyl bitta
  # Voice
  kiss-of-shame
)

# Pass through to build-all-wasm.sh with each effect, or use filter
if [[ "$1" == "--list" ]]; then
  echo "Effect WASM modules (${#EFFECTS[@]} total):"
  for e in "${EFFECTS[@]}"; do
    dir="${SCRIPT_DIR}/../${e}-wasm"
    if [[ -f "$dir/CMakeLists.txt" ]]; then
      printf "  %-35s ✓\n" "${e}-wasm"
    else
      printf "  %-35s ✗ (missing CMakeLists.txt)\n" "${e}-wasm"
    fi
  done
  exit 0
fi

# Build mode — iterate through effects
ARGS=("$@")
FILTER=""
PASS_ARGS=()

for arg in "${ARGS[@]}"; do
  case "$arg" in
    --clean|--dry-run|-j*) PASS_ARGS+=("$arg") ;;
    --list) ;; # handled above
    *) FILTER="$arg" ;;
  esac
done

BUILT=0
FAILED=0
TOTAL=0

for e in "${EFFECTS[@]}"; do
  if [[ -n "$FILTER" && "$e" != *"$FILTER"* ]]; then
    continue
  fi
  ((TOTAL++))
  echo "── Building ${e}-wasm..."
  if bash "$SCRIPT_DIR/build-all-wasm.sh" "${PASS_ARGS[@]}" "${e}" 2>&1 | tail -5; then
    ((BUILT++))
  else
    ((FAILED++))
    echo "  FAILED: ${e}-wasm"
  fi
done

echo ""
echo "Effects build complete: ${BUILT}/${TOTAL} succeeded, ${FAILED} failed"
