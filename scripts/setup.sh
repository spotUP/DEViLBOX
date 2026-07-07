#!/bin/bash
# setup.sh — first-time developer setup for DEViLBOX.
#
# Installs npm dependencies and reports whether the OPTIONAL native-WASM toolchain is
# available (only needed to rebuild C/C++/Rust modules — the committed public/**/*.wasm
# binaries cover normal app development). See docs/BUILDING.md.
#
# NOTE: third-party/* are bare gitlinks with no .gitmodules, so there is no
# `git submodule update --init` step — those trees are only for rebuilding WASM from source.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; }

# --- Node version (CI uses 20) ---
if ! command -v node >/dev/null 2>&1; then
  err "Node.js not found. Install Node 20.x (https://nodejs.org)."
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  warn "Node $(node -v) detected; CI uses Node 20. Consider upgrading."
else
  ok "Node $(node -v)"
fi

# --- Install dependencies ---
echo "Installing npm dependencies..."
npm install
ok "npm dependencies installed"

# --- Optional WASM toolchain (only for rebuilding native modules) ---
echo ""
echo "Optional native-WASM toolchain (needed only to rebuild modules from source):"
if command -v emcc >/dev/null 2>&1; then ok "Emscripten $(emcc --version | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"; else warn "Emscripten (emcc) not on PATH — run 'source <emsdk>/emsdk_env.sh' before scripts/build-all-wasm.sh"; fi
if command -v cmake >/dev/null 2>&1; then ok "CMake $(cmake --version | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"; else warn "CMake not found (needed for Emscripten modules)"; fi
if command -v wasm-pack >/dev/null 2>&1; then ok "wasm-pack $(wasm-pack --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"; else warn "wasm-pack not found (needed for Rust modules; safe to ignore otherwise)"; fi

echo ""
ok "Setup complete. Start the dev server with: npm run dev"
echo "   Build docs: docs/BUILDING.md"
