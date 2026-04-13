#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/deltamusic2"
echo "=== DeltaMusic2 WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function \
    "$SCRIPT_DIR/src/deltamusic2.c" \
    -sEXPORTED_FUNCTIONS="['_dm2_create','_dm2_destroy','_dm2_subsong_count','_dm2_select_subsong','_dm2_channel_count','_dm2_set_channel_mask','_dm2_render','_dm2_render_multi','_dm2_has_ended','_dm2_get_instrument_count','_dm2_export','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createDeltaMusic2 -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/DeltaMusic2.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/DeltaMusic2.js" "$OUT_DIR/DeltaMusic2.wasm" 2>/dev/null
