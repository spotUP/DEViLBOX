#!/bin/bash
# Build MAME sound chip WASM modules for DEViLBOX

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MAME_WASM_DIR="$PROJECT_ROOT/mame-wasm"
BUILD_DIR="$MAME_WASM_DIR/build"
OUTPUT_DIR="$PROJECT_ROOT/public/mame"

echo "=== Building MAME Sound Chip WASM Modules ==="
echo "Project root: $PROJECT_ROOT"
echo "MAME WASM dir: $MAME_WASM_DIR"
echo "Build dir: $BUILD_DIR"
echo "Output dir: $OUTPUT_DIR"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Create build directory
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Check for Emscripten
if ! command -v emcc &> /dev/null; then
    echo "Error: Emscripten not found. Please install and source emsdk_env.sh"
    exit 1
fi

echo ""
echo "=== Configuring with CMake ==="
emcmake cmake "$MAME_WASM_DIR" -DCMAKE_BUILD_TYPE=Release

echo ""
echo "=== Building all MAME chips ==="
emmake make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

echo ""
echo "=== Build complete! ==="
echo "Output files:"
ls -la "$OUTPUT_DIR"/*.js "$OUTPUT_DIR"/*.wasm 2>/dev/null || echo "No output files found"
