#!/bin/bash
# Build projectM v4 as Emscripten WASM for DEViLBOX
# Output: public/projectm/ProjectM.js + ProjectM.wasm
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECTM_SRC="$REPO_ROOT/Reference Code/projectm-master"
PROJECTM_INSTALL="$PROJECTM_SRC/install-em"
NPROC=$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)

echo "=== Step 1: Build libprojectM static library ==="

# Init submodules if needed
if [ ! -f "$PROJECTM_SRC/vendor/projectm-eval/CMakeLists.txt" ]; then
    echo "Initialising projectm-eval submodule..."
    cd "$PROJECTM_SRC"
    git submodule update --init --recursive
fi

mkdir -p "$PROJECTM_SRC/build-em"
cd "$PROJECTM_SRC/build-em"

if [ ! -f Makefile ]; then
    echo "Configuring projectM..."
    emcmake cmake .. -G "Unix Makefiles" \
        -DCMAKE_INSTALL_PREFIX="$PROJECTM_INSTALL" \
        -DENABLE_PLAYLIST=OFF \
        -DENABLE_SDL_UI=OFF \
        -DBUILD_TESTING=OFF \
        -DBUILD_DOCS=OFF \
        -DENABLE_SYSTEM_GLM=OFF \
        -DENABLE_SYSTEM_PROJECTM_EVAL=OFF
fi

echo "Building projectM (this may take a few minutes)..."
emmake make -j"$NPROC"

echo "Installing to $PROJECTM_INSTALL..."
emmake make install

echo ""
echo "=== Step 2: Build ProjectM bridge ==="

mkdir -p "$SCRIPT_DIR/build"
cd "$SCRIPT_DIR/build"

if [ ! -f Makefile ]; then
    echo "Configuring bridge..."
    emcmake cmake .. -G "Unix Makefiles"
fi

echo "Building bridge..."
emmake make -j"$NPROC"

echo ""
echo "=== Done! ==="
ls -lh "$REPO_ROOT/public/projectm/"
