#!/bin/bash
# Build script for SpaceyDelayer WASM (multitap delay effect)
# Requires Emscripten SDK to be installed and activated

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WASM_DIR="$PROJECT_ROOT/spacey-delayer-wasm"
PUBLIC_DIR="$PROJECT_ROOT/public/spacey-delayer"
BUILD_DIR="$WASM_DIR/build"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  DEViLBOX SpaceyDelayer WASM Build${NC}"
echo -e "${GREEN}========================================${NC}"

if ! command -v emcc &> /dev/null; then
    echo -e "${RED}Error: Emscripten (emcc) not found!${NC}"
    echo ""
    echo "Please install Emscripten SDK:"
    echo "  1. git clone https://github.com/emscripten-core/emsdk.git"
    echo "  2. cd emsdk"
    echo "  3. ./emsdk install latest"
    echo "  4. ./emsdk activate latest"
    echo "  5. source ./emsdk_env.sh"
    exit 1
fi

echo -e "${YELLOW}Emscripten version:${NC}"
emcc --version | head -1

if [[ "$1" == "--clean" ]]; then
    echo -e "${YELLOW}Cleaning build directory...${NC}"
    rm -rf "$BUILD_DIR"/*
fi

mkdir -p "$PUBLIC_DIR"
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

echo -e "${GREEN}Configuring CMake with Emscripten...${NC}"
emcmake cmake "$WASM_DIR" -DCMAKE_BUILD_TYPE=Release

echo -e "${GREEN}Building SpaceyDelayer WASM...${NC}"
cmake --build . --parallel || {
    echo -e "${RED}Build failed!${NC}"
    exit 1
}

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Build Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Output files:"
ls -la "$PUBLIC_DIR"/SpaceyDelayer.* 2>/dev/null || echo "  (check $PUBLIC_DIR)"
echo ""
