#!/bin/bash
# Patches @echogarden/espeak-ng-emscripten to use stripped language data (1.1MB vs 24MB)
# Languages kept: en, en-US, de, sv, fr, es, ja
# Run automatically via postinstall, or manually after npm install

PATCH_SRC="public/espeak-ng.js"
PATCH_DATA="public/espeak-ng.data"
TARGET_JS="node_modules/@echogarden/espeak-ng-emscripten/espeak-ng.js"
TARGET_DATA="node_modules/@echogarden/espeak-ng-emscripten/espeak-ng.data"

if [ ! -f "$PATCH_SRC" ]; then
  echo "[patch-espeak] No stripped JS at $PATCH_SRC — skipping"
  exit 0
fi

if [ ! -d "node_modules/@echogarden/espeak-ng-emscripten" ]; then
  echo "[patch-espeak] Package not installed — skipping"
  exit 0
fi

cp "$PATCH_SRC" "$TARGET_JS"
cp "$PATCH_DATA" "$TARGET_DATA"
echo "[patch-espeak] Patched espeak-ng-emscripten (1.1MB stripped build)"
