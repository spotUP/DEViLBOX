#!/bin/bash
# Build RdPiano (Roland SA-synthesis Digital Piano) WASM
# Requires: Emscripten SDK (emsdk) activated

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_DIR/juce-wasm/build"
OUTPUT_DIR="$PROJECT_DIR/public/rdpiano"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Building RdPiano WASM...${NC}"

# Check for emcmake
if ! command -v emcmake &> /dev/null; then
    echo -e "${RED}Error: emcmake not found. Please activate the Emscripten SDK.${NC}"
    echo "  source /path/to/emsdk/emsdk_env.sh"
    exit 1
fi

# Create build directory
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Configure with CMake (Emscripten)
echo -e "${YELLOW}Configuring CMake...${NC}"
emcmake cmake .. -DCMAKE_BUILD_TYPE=Release

# Build RdPiano target
echo -e "${YELLOW}Compiling RdPiano...${NC}"
cmake --build . --target RdPianoWASM --parallel

# Verify output
if [ -f "$OUTPUT_DIR/RdPiano.js" ] && [ -f "$OUTPUT_DIR/RdPiano.wasm" ]; then
    JS_SIZE=$(du -h "$OUTPUT_DIR/RdPiano.js" | cut -f1)
    WASM_SIZE=$(du -h "$OUTPUT_DIR/RdPiano.wasm" | cut -f1)
    echo -e "${GREEN}Build successful!${NC}"
    echo -e "  RdPiano.js:   ${JS_SIZE}"
    echo -e "  RdPiano.wasm: ${WASM_SIZE}"
else
    echo -e "${RED}Build failed - output files not found${NC}"
    exit 1
fi
