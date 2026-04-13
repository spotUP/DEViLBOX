#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/gmc"
echo "=== Gmc WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function \
    "$SCRIPT_DIR/src/gmc.c" \
    -sEXPORTED_FUNCTIONS="['_gmc_create','_gmc_destroy','_gmc_subsong_count','_gmc_select_subsong','_gmc_channel_count','_gmc_set_channel_mask','_gmc_render','_gmc_render_multi','_gmc_has_ended','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createGmc -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/Gmc.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/Gmc.js" "$OUT_DIR/Gmc.wasm" 2>/dev/null
