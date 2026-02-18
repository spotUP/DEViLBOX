#!/bin/bash

# Build BLEP WASM module using Emscripten
# Requires: emscripten SDK installed (emsdk)

set -e

echo "Building BLEP WASM module..."

# Check if emcc is available
if ! command -v emcc &> /dev/null; then
    echo "Error: emcc not found. Please install Emscripten SDK."
    echo "Visit: https://emscripten.org/docs/getting_started/downloads.html"
    exit 1
fi

# Compile to WASM
emcc blep.c \
    -o blep.js \
    -s WASM=1 \
    -s EXPORTED_FUNCTIONS='["_blepInit","_blepAdd","_blepRun","_malloc","_free"]' \
    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME='createBlepModule' \
    -O3 \
    --no-entry

echo "Build complete!"
echo "Output files:"
echo "  - blep.js"
echo "  - blep.wasm"
