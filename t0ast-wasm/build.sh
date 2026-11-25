#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/t0ast"
echo "=== T0AST WASM Build ==="
mkdir -p "$OUT_DIR"
# Floating-point engine (singles from extended results) and a float resampler: no fast-math,
# no FMA contraction (bbmp README). WASM takes the portable path: close, not bit-exact.
# T0AST_DOUBLE: engine type double, not software binary128 long double (owner 2026-11-25: too slow).
FLAGS="-O2 -fno-fast-math -ffp-contract=off -fwrapv -DT0AST_DOUBLE"
em++ $FLAGS -std=c++17 -Wall -Wextra -Wno-unused-function \
    -I"$SCRIPT_DIR/src" \
    "$SCRIPT_DIR/src/t0ast_wasm.cpp" \
    -sEXPORTED_FUNCTIONS="['_t0ast_open','_t0ast_error','_t0ast_duration_ms','_t0ast_channels','_t0ast_position','_t0ast_poke','_t0ast_render','_t0ast_close','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['HEAPU8','HEAPF32','UTF8ToString']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createT0ast -sENVIRONMENT=worker -sINCOMING_MODULE_JS_API="['wasmBinary']" \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/T0ast.js"
# Main-thread / node copy: grid decode and cell encode for the editor, plus the player calls so
# the grid-matches-player test runs the same engine in node.
em++ $FLAGS -std=c++17 -Wall -Wextra -Wno-unused-function \
    -I"$SCRIPT_DIR/src" \
    "$SCRIPT_DIR/src/t0ast_wasm.cpp" \
    -sEXPORTED_FUNCTIONS="['_t0ast_grid_open','_t0ast_grid_channels','_t0ast_grid_order_length','_t0ast_grid_order','_t0ast_grid_pattern','_t0ast_grid_close','_t0ast_play_pattern','_t0ast_play_pattern_index','_t0ast_encode_cell','_t0ast_open','_t0ast_error','_t0ast_position','_t0ast_poke','_t0ast_render','_t0ast_close','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['HEAPU8','HEAP32','HEAPF32','UTF8ToString']" \
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createT0astEdit -sENVIRONMENT=web,worker,node \
    -sALLOW_MEMORY_GROWTH=1 -sINVOKE_RUN=0 -o "$OUT_DIR/T0astEdit.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/T0ast.js" "$OUT_DIR/T0ast.wasm" "$OUT_DIR/T0astEdit.js" "$OUT_DIR/T0astEdit.wasm"
