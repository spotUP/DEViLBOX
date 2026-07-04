#!/usr/bin/env bash
# Build the Shrinkler size-reporter WASM module.
#
# Wraps Blueberry's Shrinkler cruncher (github.com/askeksa/Shrinkler) to report the
# compressed size of a byte buffer — the metric Cinter musicians optimize. Output:
#   public/shrinkler/Shrinkler.mjs  + Shrinkler.wasm
#
# Requires the Shrinkler source headers. Point SHRINKLER_SRC at a clone of
# github.com/askeksa/Shrinkler (defaults to the reference-code location).
set -euo pipefail

if ! command -v emcc &>/dev/null; then
  echo "emcc not found. Activate emsdk: source /path/to/emsdk/emsdk_env.sh"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/third-party/shrinkler-wasm/shrinkler_size.cpp"
SHRINKLER_SRC="${SHRINKLER_SRC:-/Users/spot/Code/Reference Code/Shrinkler}"
OUT="$ROOT/public/shrinkler"

if [ ! -d "$SHRINKLER_SRC/cruncher" ]; then
  echo "Shrinkler source not found at: $SHRINKLER_SRC"
  echo "Clone it: git clone https://github.com/askeksa/Shrinkler.git \"$SHRINKLER_SRC\""
  exit 1
fi

mkdir -p "$OUT"
echo "Building Shrinkler size WASM..."
emcc "$SRC" \
  -o "$OUT/Shrinkler.mjs" \
  -std=c++17 -O3 \
  -I "$SHRINKLER_SRC/cruncher" \
  -s WASM=1 -s MODULARIZE=1 -s EXPORT_ES6=1 -s EXPORT_NAME=ShrinklerModule \
  -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=33554432 \
  -s EXPORTED_FUNCTIONS='["_shrinkler_compressed_size","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPU8"]' \
  -s ENVIRONMENT=web,worker,node -s FILESYSTEM=0 -s SINGLE_FILE=0

echo "Done: $OUT/Shrinkler.mjs + Shrinkler.wasm"
