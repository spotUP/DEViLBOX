#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/digmug"
echo "=== DigMug WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function \
    "$SCRIPT_DIR/src/digmug.c" \
    -sEXPORTED_FUNCTIONS="['_dm_create','_dm_destroy','_dm_subsong_count','_dm_select_subsong','_dm_channel_count','_dm_set_channel_mask','_dm_render','_dm_render_multi','_dm_has_ended','_dm_get_instrument_count','_dm_get_num_tracks','_dm_get_cell','_dm_set_cell','_dm_get_instrument_param','_dm_set_instrument_param','_dm_export','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createDigMug -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/DigMug.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/DigMug.js" "$OUT_DIR/DigMug.wasm" 2>/dev/null
