#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/futurecomposer"
echo "=== FutureComposer WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function \
    "$SCRIPT_DIR/src/futurecomposer.c" \
    -sEXPORTED_FUNCTIONS="['_fc_create','_fc_destroy','_fc_subsong_count','_fc_select_subsong','_fc_channel_count','_fc_set_channel_mask','_fc_render','_fc_render_multi','_fc_has_ended','_fc_get_instrument_count','_fc_export','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createFutureComposer -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/FutureComposer.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/FutureComposer.js" "$OUT_DIR/FutureComposer.wasm" 2>/dev/null
