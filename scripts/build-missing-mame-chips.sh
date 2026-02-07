#!/bin/bash
# Build all missing MAME WASM chips

set -e  # Exit on error

CHIPS=(
  "asc" "astrocade" "es5503" "ics2115" "mea8000" "rolandsa"
  "sn76477" "snkwave" "sp0250" "tms36xx" "tms5220" "tr707"
  "upd931" "upd933" "votrax" "ymopq" "vasynth"
)

MAME_WASM_DIR="/Users/spot/Code/DEViLBOX/mame-wasm"
PUBLIC_MAME_DIR="/Users/spot/Code/DEViLBOX/public/mame"

echo "=== Building Missing MAME WASM Chips ==="
echo "Total chips to build: ${#CHIPS[@]}"
echo ""

BUILT_COUNT=0
FAILED_COUNT=0
FAILED_CHIPS=()

for chip in "${CHIPS[@]}"; do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Building: $chip"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  CHIP_DIR="$MAME_WASM_DIR/$chip"
  BUILD_DIR="$CHIP_DIR/build"

  # Check if chip directory exists
  if [ ! -d "$CHIP_DIR" ]; then
    echo "⚠️  Warning: $CHIP_DIR not found, skipping"
    ((FAILED_COUNT++))
    FAILED_CHIPS+=("$chip (dir not found)")
    continue
  fi

  # Create build directory
  mkdir -p "$BUILD_DIR"
  cd "$BUILD_DIR"

  # Configure with emcmake
  echo "→ Configuring..."
  if ! emcmake cmake .. -DCMAKE_BUILD_TYPE=Release; then
    echo "❌ Configure failed for $chip"
    ((FAILED_COUNT++))
    FAILED_CHIPS+=("$chip (configure failed)")
    continue
  fi

  # Build with emmake
  echo "→ Building..."
  if ! emmake make -j$(sysctl -n hw.ncpu); then
    echo "❌ Build failed for $chip"
    ((FAILED_COUNT++))
    FAILED_CHIPS+=("$chip (build failed)")
    continue
  fi

  # Find and copy output files
  CHIP_UPPER=$(echo "$chip" | sed 's/.*/\u&/')  # First letter uppercase

  # Try different naming patterns
  for pattern in "$chip" "$CHIP_UPPER" "${chip^^}"; do
    if [ -f "${pattern}.js" ] && [ -f "${pattern}.wasm" ]; then
      echo "→ Copying ${pattern}.js and ${pattern}.wasm to $PUBLIC_MAME_DIR/"
      cp "${pattern}.js" "$PUBLIC_MAME_DIR/"
      cp "${pattern}.wasm" "$PUBLIC_MAME_DIR/"
      echo "✓ $chip built successfully!"
      ((BUILT_COUNT++))
      break
    fi
  done

  if [ ! -f "$PUBLIC_MAME_DIR/${CHIP_UPPER}.wasm" ]; then
    echo "❌ Output files not found for $chip"
    ((FAILED_COUNT++))
    FAILED_CHIPS+=("$chip (output not found)")
  fi

  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "=== Build Summary ==="
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Successfully built: $BUILT_COUNT/${#CHIPS[@]}"
echo "❌ Failed: $FAILED_COUNT/${#CHIPS[@]}"

if [ $FAILED_COUNT -gt 0 ]; then
  echo ""
  echo "Failed chips:"
  for failed in "${FAILED_CHIPS[@]}"; do
    echo "  - $failed"
  done
fi

echo ""
echo "Done! Restart the dev server and re-run tests."
