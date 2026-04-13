#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/dss"
echo "=== Dss WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function -Wno-unused-variable -Wno-tautological-constant-out-of-range-compare \
    "$SCRIPT_DIR/src/dss.c" \
    -sEXPORTED_FUNCTIONS="['_dss_create','_dss_destroy','_dss_subsong_count','_dss_select_subsong','_dss_channel_count','_dss_set_channel_mask','_dss_render','_dss_render_multi','_dss_has_ended','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createDss -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/Dss.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/Dss.js" "$OUT_DIR/Dss.wasm" 2>/dev/null
