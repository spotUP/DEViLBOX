#!/bin/bash
# Build MAMEChips WASM module (ES5506, ES5503, Roland SA, SWP30, etc.)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SRC_DIR="$PROJECT_ROOT/src/engine/chips/mame"
OUT_DIR="$PROJECT_ROOT/public/mame"

# Ensure output directory exists
mkdir -p "$OUT_DIR"

# Check for Emscripten
if ! command -v emcc &> /dev/null; then
    echo "Error: Emscripten not found. Please run:"
    echo "  source /path/to/emsdk/emsdk_env.sh"
    exit 1
fi

echo "Building MAMEChips WASM module..."
echo "Source: $SRC_DIR"
echo "Output: $OUT_DIR"

# Compile with Emscripten
# Note: We include the cpp files directly in MAMEChips.cpp
emcc "$SRC_DIR/MAMEChips.cpp" \
    -o "$OUT_DIR/MAMEChips.js" \
    -I"$SRC_DIR" \
    -std=c++17 \
    -O3 \
    -s WASM=1 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME=MAMEChips \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s INITIAL_MEMORY=33554432 \
    -s MAXIMUM_MEMORY=134217728 \
    -s EXPORTED_FUNCTIONS='["_mame_create_instance","_mame_delete_instance","_mame_write","_mame_write16","_mame_read","_mame_render","_mame_set_rom","_mame_add_midi_event","_rsa_load_roms","_malloc","_free"]' \
    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
    -s ENVIRONMENT=web,worker \
    -s FILESYSTEM=0 \
    -s SINGLE_FILE=0 \
    -s NO_EXIT_RUNTIME=1 \
    -s DISABLE_EXCEPTION_CATCHING=1 \
    -fno-exceptions \
    -fno-rtti \
    -DNDEBUG

echo "MAMEChips WASM build complete!"
echo "Output files:"
ls -la "$OUT_DIR"/MAMEChips.*
