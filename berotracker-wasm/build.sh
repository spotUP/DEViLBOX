#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/berotracker"
echo "=== BeRoTracker WASM Build ==="
mkdir -p "$OUT_DIR"
# Floating-point engine (single, double and x87 extended steps): no fast-math,
# no FMA contraction (bbmp README). WASM takes the portable path (no x87): close, not bit-exact.
FLAGS="-O2 -fno-fast-math -ffp-contract=off -fwrapv"
em++ $FLAGS -std=c++17 -Wall -Wextra -Wno-unused-function \
    -I"$SCRIPT_DIR/src" \
    "$SCRIPT_DIR/src/berotracker_wasm.cpp" \
    -sEXPORTED_FUNCTIONS="['_brt_open','_brt_error','_brt_duration_ms','_brt_channels','_brt_position','_brt_cell_size','_brt_pattern_rows','_brt_poke','_brt_render','_brt_close','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['HEAPU8','HEAPF32','UTF8ToString']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createBeRoTracker -sENVIRONMENT=worker -sINCOMING_MODULE_JS_API="['wasmBinary']" \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/BeRoTracker.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/BeRoTracker.js" "$OUT_DIR/BeRoTracker.wasm"
