#!/bin/bash
# Build script for Furnace Dispatch WASM (chip emulation via Furnace engine)
# Requires Emscripten SDK to be installed and activated

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
FURNACE_WASM_DIR="$PROJECT_ROOT/furnace-wasm"
PUBLIC_DIR="$PROJECT_ROOT/public/furnace-dispatch"
BUILD_DIR="$FURNACE_WASM_DIR/build"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  DEViLBOX Furnace Dispatch WASM Build${NC}"
echo -e "${GREEN}========================================${NC}"

# Check for Emscripten
if ! command -v emcc &> /dev/null; then
    echo -e "${RED}Error: Emscripten (emcc) not found!${NC}"
    echo ""
    echo "Please install Emscripten SDK:"
    echo "  1. git clone https://github.com/emscripten-core/emsdk.git"
    echo "  2. cd emsdk"
    echo "  3. ./emsdk install latest"
    echo "  4. ./emsdk activate latest"
    echo "  5. source ./emsdk_env.sh"
    echo ""
    exit 1
fi

echo -e "${YELLOW}Emscripten version:${NC}"
emcc --version | head -1

# Check for Furnace source
FURNACE_ROOT="$PROJECT_ROOT/Reference Code/furnace-master"
if [ ! -d "$FURNACE_ROOT/src/engine/platform" ]; then
    echo -e "${RED}Error: Furnace source not found!${NC}"
    echo ""
    echo "Expected at: $FURNACE_ROOT"
    echo "Please ensure the Furnace source tree is at 'Reference Code/furnace-master/'"
    echo ""
    exit 1
fi

echo -e "${GREEN}Furnace source found at: $FURNACE_ROOT${NC}"

# Create output directory
mkdir -p "$PUBLIC_DIR"

# Create build directory
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Parse build options
BUILD_GB="ON"
BUILD_NES="OFF"
BUILD_SMS="OFF"
BUILD_AY="OFF"
BUILD_GENESIS="OFF"
BUILD_ARCADE="OFF"

while [[ $# -gt 0 ]]; do
    case $1 in
        --all)
            BUILD_GB="ON"
            BUILD_NES="ON"
            BUILD_SMS="ON"
            BUILD_AY="ON"
            BUILD_GENESIS="ON"
            BUILD_ARCADE="ON"
            shift
            ;;
        --gb)     BUILD_GB="ON"; shift ;;
        --nes)    BUILD_NES="ON"; shift ;;
        --sms)    BUILD_SMS="ON"; shift ;;
        --ay)     BUILD_AY="ON"; shift ;;
        --genesis) BUILD_GENESIS="ON"; shift ;;
        --arcade) BUILD_ARCADE="ON"; shift ;;
        --clean)
            echo -e "${YELLOW}Cleaning build directory...${NC}"
            rm -rf "$BUILD_DIR"/*
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Usage: $0 [--all] [--gb] [--nes] [--sms] [--ay] [--genesis] [--arcade] [--clean]"
            exit 1
            ;;
    esac
done

echo ""
echo -e "${YELLOW}Build configuration:${NC}"
echo "  Game Boy:    $BUILD_GB"
echo "  NES:         $BUILD_NES"
echo "  SMS/PSG:     $BUILD_SMS"
echo "  AY-3-8910:   $BUILD_AY"
echo "  Genesis:     $BUILD_GENESIS"
echo "  Arcade/OPM:  $BUILD_ARCADE"
echo ""

# Configure with CMake
echo -e "${GREEN}Configuring CMake with Emscripten...${NC}"
emcmake cmake "$FURNACE_WASM_DIR" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_EXPORT_COMPILE_COMMANDS=ON \
    -DBUILD_GB="$BUILD_GB" \
    -DBUILD_NES="$BUILD_NES" \
    -DBUILD_SMS="$BUILD_SMS" \
    -DBUILD_AY="$BUILD_AY" \
    -DBUILD_GENESIS="$BUILD_GENESIS" \
    -DBUILD_ARCADE="$BUILD_ARCADE"

# Build
echo -e "${GREEN}Building Furnace Dispatch WASM...${NC}"
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
echo "  - $PUBLIC_DIR/FurnaceDispatch.js"
echo "  - $PUBLIC_DIR/FurnaceDispatch.wasm"
echo ""
echo "Don't forget to restart the dev server!"
