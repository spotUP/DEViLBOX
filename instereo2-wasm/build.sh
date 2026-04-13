#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/instereo2"
echo "=== InStereo2 WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function \
    "$SCRIPT_DIR/src/instereo2.c" \
    -sEXPORTED_FUNCTIONS="['_is2_create','_is2_destroy','_is2_subsong_count','_is2_select_subsong','_is2_channel_count','_is2_set_channel_mask','_is2_render','_is2_render_multi','_is2_has_ended','_is2_get_instrument_count','_is2_export','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createInStereo2 -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/InStereo2.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/InStereo2.js" "$OUT_DIR/InStereo2.wasm" 2>/dev/null
