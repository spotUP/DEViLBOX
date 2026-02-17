#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_DIR/ami-sampler-wasm/build"

echo ""
echo -e "\033[0;36m========================================"
echo "  Building Ami-Sampler WASM"
echo -e "========================================\033[0m"
echo ""

# Check for Emscripten
if ! command -v emcc &> /dev/null; then
  echo -e "\033[0;31mError: emcc not found. Please install Emscripten and source emsdk_env.sh\033[0m"
  exit 1
fi

# Clean and create build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Configure
cd "$BUILD_DIR"
emcmake cmake .. \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_CROSSCOMPILING_EMULATOR="" \
  2>&1 | tail -5

# Build
cmake --build . 2>&1

echo ""
echo -e "\033[0;32m========================================"
echo "  Build Complete!"
echo -e "========================================\033[0m"
echo ""
echo "Output files:"
ls -la "$PROJECT_DIR/public/ami-sampler/AmiSampler.js" "$PROJECT_DIR/public/ami-sampler/AmiSampler.wasm" 2>/dev/null || echo "Build output not found"
