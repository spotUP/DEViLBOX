#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/berotracker"
echo "=== BeRoTracker WASM Build ==="
mkdir -p "$OUT_DIR"
# Floating-point engine (single, double and x87 extended steps): no fast-math,
# no FMA contraction (bbmp README). WASM takes the portable path (no x87): close, not bit-exact.
# BRT_DOUBLE: X = double. WASM long double is software binary128, too slow for real time
# (5 of 19 songs over 100% load at 48 kHz); owner accepted close, not bit-exact.
FLAGS="-O2 -fno-fast-math -ffp-contract=off -fwrapv -DBRT_DOUBLE"
em++ $FLAGS -std=c++17 -Wall -Wextra -Wno-unused-function \
    -I"$SCRIPT_DIR/src" \
    "$SCRIPT_DIR/src/berotracker_wasm.cpp" \
    -sEXPORTED_FUNCTIONS="['_brt_open','_brt_error','_brt_duration_ms','_brt_channels','_brt_position','_brt_cell_size','_brt_pattern_rows','_brt_poke','_brt_render','_brt_close','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['HEAPU8','HEAPF32','UTF8ToString']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createBeRoTracker -sENVIRONMENT=worker -sINCOMING_MODULE_JS_API="['wasmBinary']" \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/BeRoTracker.js"
# Main-thread / node copy: grid decode and cell encode for the editor, plus the player calls so
# the grid-matches-player test runs the same engine in node.
em++ $FLAGS -std=c++17 -Wall -Wextra -Wno-unused-function \
    -I"$SCRIPT_DIR/src" \
    "$SCRIPT_DIR/src/berotracker_wasm.cpp" \
    -sEXPORTED_FUNCTIONS="['_brt_grid_open','_brt_grid_channels','_brt_grid_speed','_brt_grid_bpm','_brt_grid_order_length','_brt_grid_order','_brt_grid_pattern_rows','_brt_grid_pattern','_brt_grid_close','_brt_play_pattern','_brt_play_pattern_index','_brt_pattern_rows','_brt_encode_cell','_brt_export_open','_brt_export_cell','_brt_export_order','_brt_export_build','_brt_export_size','_brt_export_close','_brt_open','_brt_error','_brt_position','_brt_cell_size','_brt_poke','_brt_render','_brt_close','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['HEAPU8','HEAP32','HEAPF32','UTF8ToString']" \
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createBeRoTrackerEdit -sENVIRONMENT=web,worker,node \
    -sALLOW_MEMORY_GROWTH=1 -sINVOKE_RUN=0 -o "$OUT_DIR/BeRoTrackerEdit.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/BeRoTracker.js" "$OUT_DIR/BeRoTracker.wasm" "$OUT_DIR/BeRoTrackerEdit.js" "$OUT_DIR/BeRoTrackerEdit.wasm"
