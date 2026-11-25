#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/axs"
echo "=== AXS WASM Build ==="
mkdir -p "$OUT_DIR"
# Integer engine with float filters: wrapping 32-bit maths, no fast-math, no FMA contraction.
FLAGS="-O2 -fno-fast-math -ffp-contract=off -fwrapv"
em++ $FLAGS -std=c++17 -Wall -Wextra -Wno-unused-function \
    -I"$SCRIPT_DIR/src" \
    "$SCRIPT_DIR/src/axs_wasm.cpp" \
    -sEXPORTED_FUNCTIONS="['_axs_open','_axs_error','_axs_duration_ms','_axs_position','_axs_row','_axs_render','_axs_close','_axs_grid','_axs_set_cell','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['HEAPU8','HEAPF32','UTF8ToString']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createAxs -sENVIRONMENT=worker -sINCOMING_MODULE_JS_API="['wasmBinary']" \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=33554432 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/Axs.js"
# Main-thread / node copy: grid for the importer, render for the test.
em++ $FLAGS -std=c++17 -Wall -Wextra -Wno-unused-function \
    -I"$SCRIPT_DIR/src" \
    "$SCRIPT_DIR/src/axs_wasm.cpp" \
    -sEXPORTED_FUNCTIONS="['_axs_open','_axs_close','_axs_error','_axs_duration_ms','_axs_grid','_axs_render','_axs_set_cell','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['HEAPU8','HEAP32','HEAPF32','UTF8ToString']" \
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createAxsEdit -sENVIRONMENT=web,worker,node \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=33554432 -sINVOKE_RUN=0 -o "$OUT_DIR/AxsEdit.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/Axs.js" "$OUT_DIR/Axs.wasm" "$OUT_DIR/AxsEdit.js" "$OUT_DIR/AxsEdit.wasm"
