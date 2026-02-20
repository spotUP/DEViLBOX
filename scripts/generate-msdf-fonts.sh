#!/bin/bash
# Generate MSDF font atlases for PixiJS WebGL rendering
# Requires: msdf-bmfont-xml (installed via npm devDependencies)
#
# Usage: ./scripts/generate-msdf-fonts.sh
# Called automatically from prebuild/predev if fonts don't exist

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
FONT_DIR="$PROJECT_DIR/public/fonts"
MSDF_DIR="$FONT_DIR/msdf"
TTF_DIR="$FONT_DIR/ttf"
MSDF_BIN="$PROJECT_DIR/node_modules/.bin/msdf-bmfont"

# Character set: ASCII printable + common music/tracker symbols
CHARSET=" !\"#\$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_\`abcdefghijklmnopqrstuvwxyz{|}~"

# Check if MSDF fonts already exist (skip regeneration)
if [ -f "$MSDF_DIR/JetBrainsMono-Regular.fnt" ] && [ -f "$MSDF_DIR/Inter-Regular.fnt" ]; then
  echo "[MSDF] Font atlases already exist, skipping generation."
  exit 0
fi

echo "[MSDF] Generating font atlases..."

# Download JetBrains Mono if not present
if [ ! -f "$TTF_DIR/JetBrainsMono-Regular.ttf" ]; then
  echo "[MSDF] Downloading JetBrains Mono..."
  JBMONO_VERSION="2.304"
  JBMONO_URL="https://github.com/JetBrains/JetBrainsMono/releases/download/v${JBMONO_VERSION}/JetBrainsMono-${JBMONO_VERSION}.zip"
  TMPFILE=$(mktemp -d)
  curl -sL "$JBMONO_URL" -o "$TMPFILE/jbmono.zip"
  unzip -qo "$TMPFILE/jbmono.zip" -d "$TMPFILE/jbmono"
  cp "$TMPFILE/jbmono/fonts/ttf/JetBrainsMono-Regular.ttf" "$TTF_DIR/"
  cp "$TMPFILE/jbmono/fonts/ttf/JetBrainsMono-Bold.ttf" "$TTF_DIR/"
  rm -rf "$TMPFILE"
  echo "[MSDF] JetBrains Mono downloaded."
fi

# Download Inter if not present
if [ ! -f "$TTF_DIR/Inter-Regular.ttf" ]; then
  echo "[MSDF] Downloading Inter..."
  INTER_VERSION="4.0"
  INTER_URL="https://github.com/rsms/inter/releases/download/v${INTER_VERSION}/Inter-${INTER_VERSION}.zip"
  TMPFILE=$(mktemp -d)
  curl -sL "$INTER_URL" -o "$TMPFILE/inter.zip"
  unzip -qo "$TMPFILE/inter.zip" -d "$TMPFILE/inter"
  # Inter v4 has different directory structures; find the TTFs
  find "$TMPFILE/inter" -name "Inter-Regular.ttf" -exec cp {} "$TTF_DIR/" \; 2>/dev/null || \
  find "$TMPFILE/inter" -name "Inter_18pt-Regular.ttf" -exec cp {} "$TTF_DIR/Inter-Regular.ttf" \; 2>/dev/null || true
  find "$TMPFILE/inter" -name "Inter-Medium.ttf" -exec cp {} "$TTF_DIR/" \; 2>/dev/null || \
  find "$TMPFILE/inter" -name "Inter_18pt-Medium.ttf" -exec cp {} "$TTF_DIR/Inter-Medium.ttf" \; 2>/dev/null || true
  find "$TMPFILE/inter" -name "Inter-SemiBold.ttf" -exec cp {} "$TTF_DIR/" \; 2>/dev/null || \
  find "$TMPFILE/inter" -name "Inter_18pt-SemiBold.ttf" -exec cp {} "$TTF_DIR/Inter-SemiBold.ttf" \; 2>/dev/null || true
  find "$TMPFILE/inter" -name "Inter-Bold.ttf" -exec cp {} "$TTF_DIR/" \; 2>/dev/null || \
  find "$TMPFILE/inter" -name "Inter_18pt-Bold.ttf" -exec cp {} "$TTF_DIR/Inter-Bold.ttf" \; 2>/dev/null || true
  rm -rf "$TMPFILE"
  echo "[MSDF] Inter downloaded."
fi

mkdir -p "$MSDF_DIR"

# Generate MSDF atlases — 32px font size, 4096 max texture, 4px field range
generate_msdf() {
  local INPUT="$1"
  local NAME="$2"

  if [ ! -f "$INPUT" ]; then
    echo "[MSDF] WARNING: $INPUT not found, skipping."
    return
  fi

  echo "[MSDF] Generating $NAME..."
  "$MSDF_BIN" \
    -f json \
    -o "$MSDF_DIR/$NAME.png" \
    -s 42 \
    -t msdf \
    -r 6 \
    --pot \
    --smart-size \
    "$INPUT"

  echo "[MSDF] Generated $NAME.png + $NAME.json"
}

# Generate for each font variant we need
generate_msdf "$TTF_DIR/JetBrainsMono-Regular.ttf" "JetBrainsMono-Regular"
generate_msdf "$TTF_DIR/JetBrainsMono-Bold.ttf" "JetBrainsMono-Bold"
generate_msdf "$TTF_DIR/Inter-Regular.ttf" "Inter-Regular"
generate_msdf "$TTF_DIR/Inter-Medium.ttf" "Inter-Medium"
generate_msdf "$TTF_DIR/Inter-SemiBold.ttf" "Inter-SemiBold"
generate_msdf "$TTF_DIR/Inter-Bold.ttf" "Inter-Bold"

echo "[MSDF] Font atlas generation complete!"
ls -la "$MSDF_DIR/"
