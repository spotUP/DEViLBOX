#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/instereo1"
echo "=== InStereo1 WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function \
    "$SCRIPT_DIR/src/instereo1.c" \
    -sEXPORTED_FUNCTIONS="['_is1_create','_is1_destroy','_is1_subsong_count','_is1_select_subsong','_is1_channel_count','_is1_set_channel_mask','_is1_render','_is1_render_multi','_is1_has_ended','_is1_get_instrument_count','_is1_get_num_track_lines','_is1_get_num_positions','_is1_get_cell','_is1_set_cell','_is1_get_position','_is1_set_position','_is1_get_instrument_param','_is1_set_instrument_param','_is1_export','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createInStereo1 -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/InStereo1.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/InStereo1.js" "$OUT_DIR/InStereo1.wasm" 2>/dev/null
