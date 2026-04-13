#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/deltamusic1"
echo "=== DeltaMusic1 WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function \
    "$SCRIPT_DIR/src/deltamusic1.c" \
    -sEXPORTED_FUNCTIONS="['_dm1_create','_dm1_destroy','_dm1_subsong_count','_dm1_select_subsong','_dm1_channel_count','_dm1_set_channel_mask','_dm1_render','_dm1_render_multi','_dm1_has_ended','_dm1_get_instrument_count','_dm1_get_num_blocks','_dm1_get_cell','_dm1_set_cell','_dm1_get_instrument_name','_dm1_get_instrument_param','_dm1_set_instrument_param','_dm1_export','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createDeltaMusic1 -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/DeltaMusic1.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/DeltaMusic1.js" "$OUT_DIR/DeltaMusic1.wasm" 2>/dev/null
