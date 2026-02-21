#!/bin/bash
# build.sh — Build UADE WASM module using Emscripten
#
# Prerequisites:
#   - Emscripten (emcc) in PATH
#   - UADE source at ../Reference Code/uade-3.05/
#
# Output:
#   ../public/uade/UADE.js
#   ../public/uade/UADE.wasm
#
# Usage:
#   cd uade-wasm && ./build.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UADE_SRC="$SCRIPT_DIR/../Reference Code/uade-3.05"
OUT_DIR="$SCRIPT_DIR/../public/uade"

cd "$SCRIPT_DIR"

echo "=== UADE WASM Build ==="
echo "UADE source: $UADE_SRC"
echo "Output:      $OUT_DIR"

# ── Step 1: Generate player registry ─────────────────────────────────────
echo ""
echo "Step 1: Generating player registry..."
python3 generate_registry.py

# ── Step 2: Compile ───────────────────────────────────────────────────────
echo ""
echo "Step 2: Compiling with Emscripten..."
mkdir -p "$OUT_DIR"

# UADE core source files (68k emulator + Paula chip)
UADE_CORE_SRCS=(
    "$UADE_SRC/src/audio.c"
    "$UADE_SRC/src/cfgfile.c"
    "$UADE_SRC/src/cia.c"
    "$UADE_SRC/src/custom.c"
    "$UADE_SRC/src/debug.c"
    "$UADE_SRC/src/gencpu.c"
    "$UADE_SRC/src/memory.c"
    "$UADE_SRC/src/missing.c"
    "$UADE_SRC/src/newcpu.c"
    "$UADE_SRC/src/readcpu.c"
    "$UADE_SRC/src/sd-sound-generic.c"
    "$UADE_SRC/src/state_detection.c"
    "$UADE_SRC/src/text_scope.c"
    "$UADE_SRC/src/uade.c"
    "$UADE_SRC/src/uade_logging.c"
    "$UADE_SRC/src/uademain.c"
    "$UADE_SRC/src/sinctable.c"
)

# UADE frontend source files (libuade)
UADE_FRONTEND_SRCS=(
    "$UADE_SRC/src/frontends/common/amifilemagic.c"
    "$UADE_SRC/src/frontends/common/eagleplayer.c"
    "$UADE_SRC/src/frontends/common/effects.c"
    "$UADE_SRC/src/frontends/common/fifo.c"
    "$UADE_SRC/src/frontends/common/md5.c"
    "$UADE_SRC/src/frontends/common/rmc.c"
    "$UADE_SRC/src/frontends/common/songdb.c"
    "$UADE_SRC/src/frontends/common/songinfo.c"
    "$UADE_SRC/src/frontends/common/support.c"
    "$UADE_SRC/src/frontends/common/uadeconf.c"
    "$UADE_SRC/src/frontends/common/uadecontrol.c"
    "$UADE_SRC/src/frontends/common/uadeipc.c"
    "$UADE_SRC/src/frontends/common/uadestate.c"
    "$UADE_SRC/src/frontends/common/uadeutils.c"
    "$UADE_SRC/src/frontends/common/unixwalkdir.c"
    "$UADE_SRC/src/frontends/common/vparray.c"
    # NOTE: unixsupport.c is EXCLUDED — replaced by our shim_ipc.c
)

# Our WASM-specific files
WASM_SRCS=(
    "$SCRIPT_DIR/src/entry.c"
    "$SCRIPT_DIR/src/shim_ipc.c"
    "$SCRIPT_DIR/src/player_registry.c"
)

# Include paths
INCLUDES=(
    "-I$UADE_SRC/src/include"
    "-I$UADE_SRC/src/frontends/common"
    "-I$UADE_SRC/src"
)

# Compiler flags
CFLAGS=(
    "-O2"
    "-DHAVE_CONFIG_H"
    "-DUADE_WASM=1"
    # Suppress warnings from legacy C code
    "-Wno-implicit-function-declaration"
    "-Wno-int-conversion"
    "-Wno-deprecated-declarations"
)

# Linker flags
LDFLAGS=(
    # Memory
    "-s INITIAL_MEMORY=33554432"    # 32 MB initial
    "-s MAXIMUM_MEMORY=134217728"   # 128 MB max
    "-s ALLOW_MEMORY_GROWTH=1"
    # WASM exports
    "-s EXPORTED_FUNCTIONS=['_uade_wasm_init','_uade_wasm_load','_uade_wasm_render','_uade_wasm_stop','_uade_wasm_get_subsong_count','_uade_wasm_get_subsong_min','_uade_wasm_get_subsong_max','_uade_wasm_get_player_name','_uade_wasm_get_format_name','_uade_wasm_set_subsong','_uade_wasm_set_looping','_uade_wasm_cleanup','_malloc','_free']"
    "-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','stringToUTF8','UTF8ToString','HEAPU8','HEAPF32']"
    # WASM output format (for AudioWorklet — no ES modules)
    "-s MODULARIZE=1"
    "-s EXPORT_NAME=createUADE"
    "-s ENVIRONMENT=worker"          # AudioWorklet runs in worker context
    # Filesystem (MEMFS for virtual eagleplayer storage)
    "-s FORCE_FILESYSTEM=1"
    # No main()
    "-s INVOKE_RUN=0"
    # Output
    "-o $OUT_DIR/UADE.js"
)

emcc \
    "${CFLAGS[@]}" \
    "${INCLUDES[@]}" \
    "${UADE_CORE_SRCS[@]}" \
    "${UADE_FRONTEND_SRCS[@]}" \
    "${WASM_SRCS[@]}" \
    "${LDFLAGS[@]}"

echo ""
echo "=== Build complete ==="
echo "Output: $OUT_DIR/UADE.js"
echo "Output: $OUT_DIR/UADE.wasm"
ls -lh "$OUT_DIR/UADE.js" "$OUT_DIR/UADE.wasm" 2>/dev/null || echo "(files will appear after first successful build)"
