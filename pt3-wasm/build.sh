#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/pt3"
mkdir -p "$OUT_DIR"
# Main-thread / node module: PT3 grid decode, note encode and the .ay wrapper the aylet engine plays.
# pt3_ay_player.h comes from tools/build-zx-pt3.sh.
em++ -O2 -std=c++17 -Wall -Wextra -I"$SCRIPT_DIR/src" \
    "$SCRIPT_DIR/src/pt3_wasm.cpp" "$SCRIPT_DIR/src/pt3_decode.cpp" \
    -sEXPORTED_FUNCTIONS="['_pt3_grid_open','_pt3_error','_pt3_positions','_pt3_position','_pt3_loop','_pt3_speed','_pt3_pattern_count','_pt3_pattern_rows','_pt3_xm_note','_pt3_pattern','_pt3_encode_note','_pt3_grid_close','_pt3_ay_build','_pt3_ay_size','_pt3_ay_module_addr','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['HEAPU8','HEAP32','UTF8ToString']" \
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createPt3Edit -sENVIRONMENT=web,worker,node \
    -sALLOW_MEMORY_GROWTH=1 -sINVOKE_RUN=0 -o "$OUT_DIR/Pt3Edit.js"
ls -lh "$OUT_DIR/Pt3Edit.js" "$OUT_DIR/Pt3Edit.wasm"
