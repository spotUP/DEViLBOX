#!/bin/bash
# Setup script for JUCE WASM synths
# Downloads required source files for Dexed (DX7) and OB-Xd

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
JUCE_WASM_DIR="$PROJECT_ROOT/juce-wasm"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  DEViLBOX JUCE WASM Setup Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check for git
if ! command -v git &> /dev/null; then
    echo -e "${RED}Error: git is required but not installed.${NC}"
    exit 1
fi

# Setup Dexed (msfa engine)
echo -e "${GREEN}Setting up Dexed (DX7 FM Synthesizer)...${NC}"

if [ -f "$JUCE_WASM_DIR/dexed/msfa/synth_unit.cc" ]; then
    echo -e "${YELLOW}  msfa source already exists, skipping...${NC}"
else
    echo "  Cloning Dexed repository..."
    TEMP_DIR=$(mktemp -d)
    git clone --depth 1 https://github.com/asb2m10/dexed.git "$TEMP_DIR/dexed" 2>/dev/null

    echo "  Copying msfa engine..."
    mkdir -p "$JUCE_WASM_DIR/dexed/msfa"
    cp -r "$TEMP_DIR/dexed/Source/msfa/"* "$JUCE_WASM_DIR/dexed/msfa/"

    echo "  Cleaning up..."
    rm -rf "$TEMP_DIR"

    echo -e "${GREEN}  ✓ Dexed msfa engine installed${NC}"
fi

# Setup OB-Xd (optional - we have standalone implementation)
echo ""
echo -e "${GREEN}Setting up OB-Xd (Oberheim Synthesizer)...${NC}"
echo -e "${YELLOW}  Using standalone implementation (original source optional)${NC}"

read -p "Download original OB-Xd source for reference? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    TEMP_DIR=$(mktemp -d)
    git clone --depth 1 https://github.com/reales/OB-Xd.git "$TEMP_DIR/obxd" 2>/dev/null

    echo "  Copying OB-Xd source..."
    cp -r "$TEMP_DIR/obxd/Source/"* "$JUCE_WASM_DIR/obxd/Source/" 2>/dev/null || true

    rm -rf "$TEMP_DIR"
    echo -e "${GREEN}  ✓ OB-Xd source installed${NC}"
else
    echo -e "${YELLOW}  Skipping OB-Xd original source${NC}"
fi

# Check for Emscripten
echo ""
echo -e "${GREEN}Checking for Emscripten SDK...${NC}"

if command -v emcc &> /dev/null; then
    EMCC_VERSION=$(emcc --version | head -1)
    echo -e "${GREEN}  ✓ Found: $EMCC_VERSION${NC}"
else
    echo -e "${YELLOW}  Emscripten not found in PATH${NC}"
    echo ""
    echo "  To install Emscripten:"
    echo "    git clone https://github.com/emscripten-core/emsdk.git"
    echo "    cd emsdk"
    echo "    ./emsdk install latest"
    echo "    ./emsdk activate latest"
    echo "    source ./emsdk_env.sh"
    echo ""
fi

# Summary
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Setup Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Next steps:"
echo "  1. Ensure Emscripten is activated:"
echo "     source /path/to/emsdk/emsdk_env.sh"
echo ""
echo "  2. Build the WASM modules:"
echo "     ./scripts/build-juce-wasm.sh"
echo ""
echo "  3. Start the dev server:"
echo "     npm run dev"
echo ""
echo "The synths will be available as 'Dexed' and 'OBXd' in the instrument selector."
