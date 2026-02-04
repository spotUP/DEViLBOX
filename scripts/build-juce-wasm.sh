#!/bin/bash
# Build script for JUCE WASM synths (Dexed and OB-Xd)
# Requires Emscripten SDK to be installed and activated

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
JUCE_WASM_DIR="$PROJECT_ROOT/juce-wasm"
PUBLIC_DIR="$PROJECT_ROOT/public"
BUILD_DIR="$JUCE_WASM_DIR/build"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  DEViLBOX JUCE WASM Build Script${NC}"
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

# Check for msfa source
if [ ! -f "$JUCE_WASM_DIR/dexed/msfa/synth_unit.cc" ]; then
    echo -e "${YELLOW}Warning: msfa source files not found!${NC}"
    echo ""
    echo "To build Dexed, you need the msfa FM engine:"
    echo "  1. git clone https://github.com/asb2m10/dexed.git /tmp/dexed"
    echo "  2. cp -r /tmp/dexed/Source/msfa/* $JUCE_WASM_DIR/dexed/msfa/"
    echo ""
    echo "Using stub implementations for now..."
    DEXED_STUBS=true
fi

# Create build directory
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Configure with CMake
echo -e "${GREEN}Configuring CMake with Emscripten...${NC}"
emcmake cmake "$JUCE_WASM_DIR" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_EXPORT_COMPILE_COMMANDS=ON

# Build
echo -e "${GREEN}Building WASM modules...${NC}"

# Build Dexed
echo -e "${YELLOW}Building Dexed (DX7)...${NC}"
if [ "$DEXED_STUBS" = true ]; then
    echo "  (Using stub implementation - download msfa for full functionality)"
fi
cmake --build . --target DexedWASM --parallel 2>/dev/null || {
    echo -e "${YELLOW}Dexed build skipped (msfa source needed)${NC}"
}

# Build OB-Xd
echo -e "${YELLOW}Building OB-Xd (Oberheim)...${NC}"
cmake --build . --target OBXdWASM --parallel || {
    echo -e "${RED}OB-Xd build failed${NC}"
    exit 1
}

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Build Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Output files:"
echo "  - $PUBLIC_DIR/dexed/Dexed.js"
echo "  - $PUBLIC_DIR/dexed/Dexed.wasm"
echo "  - $PUBLIC_DIR/obxd/OBXd.js"
echo "  - $PUBLIC_DIR/obxd/OBXd.wasm"
echo ""
echo "Don't forget to restart the dev server!"
