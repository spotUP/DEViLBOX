#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/actionamics"
echo "=== Actionamics WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function -Wno-unused-variable -Wno-tautological-constant-out-of-range-compare \
    "$SCRIPT_DIR/src/actionamics.c" \
    -sEXPORTED_FUNCTIONS="['_act_create','_act_destroy','_act_subsong_count','_act_select_subsong','_act_channel_count','_act_set_channel_mask','_act_render','_act_render_multi','_act_has_ended','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createActionamics -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/Actionamics.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/Actionamics.js" "$OUT_DIR/Actionamics.wasm" 2>/dev/null
