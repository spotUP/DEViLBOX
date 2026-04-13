#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/activisionpro"
echo "=== ActivisionPro WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function -Wno-unused-variable -Wno-tautological-constant-out-of-range-compare \
    "$SCRIPT_DIR/src/activisionpro.c" \
    -sEXPORTED_FUNCTIONS="['_avp_create','_avp_destroy','_avp_subsong_count','_avp_select_subsong','_avp_channel_count','_avp_set_channel_mask','_avp_render','_avp_render_multi','_avp_has_ended','_avp_get_instrument_count','_avp_export','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createActivisionPro -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/ActivisionPro.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/ActivisionPro.js" "$OUT_DIR/ActivisionPro.wasm" 2>/dev/null
