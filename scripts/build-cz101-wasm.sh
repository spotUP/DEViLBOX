#!/bin/bash
# Build CZ-101 WASM module

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SRC_DIR="$PROJECT_ROOT/src/engine/chips/mame/cz101"
OUT_DIR="$PROJECT_ROOT/public/cz101"

# Ensure output directory exists
mkdir -p "$OUT_DIR"

# Check for Emscripten
if ! command -v emcc &> /dev/null; then
    echo "Error: Emscripten not found. Please run:"
    echo "  source /path/to/emsdk/emsdk_env.sh"
    exit 1
fi

echo "Building CZ-101 WASM module..."

# Compile with Emscripten
emcc "$SRC_DIR/UPD933Wrapper.cpp" \
    -o "$OUT_DIR/CZ101.js" \
    -std=c++17 \
    -O3 \
    -s WASM=1 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME=CZ101Module \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s INITIAL_MEMORY=16777216 \
    -s EXPORTED_FUNCTIONS='["_upd933_create","_upd933_destroy","_upd933_reset","_upd933_write","_upd933_set_cs","_upd933_render","_upd933_get_buffer","_malloc","_free"]' \
    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
    -s ENVIRONMENT=web,worker \
    -s FILESYSTEM=0 \
    -s SINGLE_FILE=0

echo "CZ-101 WASM build complete!"
echo "Output: $OUT_DIR/CZ101.js, $OUT_DIR/CZ101.wasm"
