#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/voodoo"
echo "=== Voodoo WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function \
    "$SCRIPT_DIR/src/voodoo.c" \
    -sEXPORTED_FUNCTIONS="['_vs_create','_vs_destroy','_vs_subsong_count','_vs_select_subsong','_vs_channel_count','_vs_set_channel_mask','_vs_render','_vs_render_multi','_vs_has_ended','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createVoodoo -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/Voodoo.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/Voodoo.js" "$OUT_DIR/Voodoo.wasm" 2>/dev/null
