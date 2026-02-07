#!/bin/bash
# Build all missing MAME WASM chips and copy to correct location

set -e  # Exit on error

CHIPS=(
  "asc" "astrocade" "es5503" "ics2115" "mea8000"
  "sn76477" "sp0250" "tms36xx" "tms5220" "tr707"
  "upd931" "upd933" "votrax" "ymopq" "vasynth"
)

MAME_WASM_DIR="/Users/spot/Code/DEViLBOX/mame-wasm"
MAME_WASM_OUTPUT="/Users/spot/Code/DEViLBOX/mame-wasm/public/mame"
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

  # Clean and create build directory
  rm -rf "$BUILD_DIR"
  mkdir -p "$BUILD_DIR"
  cd "$BUILD_DIR"

  # Configure with emcmake
  echo "→ Configuring..."
  if ! emcmake cmake .. -DCMAKE_BUILD_TYPE=Release 2>&1 | grep -E "(error|Configuring done)"; then
    echo "❌ Configure failed for $chip"
    ((FAILED_COUNT++))
    FAILED_CHIPS+=("$chip (configure failed)")
    continue
  fi

  # Build with emmake
  echo "→ Building..."
  if ! emmake make -j$(sysctl -n hw.ncpu) 2>&1 | grep -E "(error|Built target)"; then
    echo "❌ Build failed for $chip"
    ((FAILED_COUNT++))
    FAILED_CHIPS+=("$chip (build failed)")
    continue
  fi

  # Find output files (try different naming patterns)
  CHIP_UPPER=$(echo "$chip" | sed 's/.*/\u&/')  # First letter uppercase
  CHIP_ALLCAPS=$(echo "$chip" | tr '[:lower:]' '[:upper:]')  # All uppercase

  FOUND=false
  for pattern in "$chip" "$CHIP_UPPER" "$CHIP_ALLCAPS"; do
    if [ -f "$MAME_WASM_OUTPUT/${pattern}.js" ] && [ -f "$MAME_WASM_OUTPUT/${pattern}.wasm" ]; then
      echo "→ Found ${pattern}.js and ${pattern}.wasm"
      echo "→ Copying to $PUBLIC_MAME_DIR/"
      cp "$MAME_WASM_OUTPUT/${pattern}.js" "$PUBLIC_MAME_DIR/"
      cp "$MAME_WASM_OUTPUT/${pattern}.wasm" "$PUBLIC_MAME_DIR/"
      echo "✓ $chip built and copied successfully!"
      ((BUILT_COUNT++))
      FOUND=true
      break
    fi
  done

  if [ "$FOUND" = false ]; then
    echo "❌ Output files not found for $chip"
    echo "   Checked: $chip, $CHIP_UPPER, $CHIP_ALLCAPS"
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
echo "Files copied to: $PUBLIC_MAME_DIR"
echo "Done! The dev server will pick up the new files automatically."
