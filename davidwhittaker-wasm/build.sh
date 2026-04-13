#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/davidwhittaker"
echo "=== DavidWhittaker WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function \
    "$SCRIPT_DIR/src/davidwhittaker.c" \
    -sEXPORTED_FUNCTIONS="['_dw_create','_dw_destroy','_dw_subsong_count','_dw_select_subsong','_dw_channel_count','_dw_set_channel_mask','_dw_render','_dw_render_multi','_dw_has_ended','_dw_get_instrument_count','_dw_export','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createDavidWhittaker -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/DavidWhittaker.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/DavidWhittaker.js" "$OUT_DIR/DavidWhittaker.wasm" 2>/dev/null
