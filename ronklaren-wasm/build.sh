#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/ronklaren"
echo "=== RonKlaren WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function -Wno-unused-variable -Wno-tautological-constant-out-of-range-compare \
    "$SCRIPT_DIR/src/ronklaren.c" \
    -sEXPORTED_FUNCTIONS="['_rk_create','_rk_destroy','_rk_subsong_count','_rk_select_subsong','_rk_channel_count','_rk_set_channel_mask','_rk_render','_rk_render_multi','_rk_has_ended','_rk_get_instrument_count','_rk_export','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createRonKlaren -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/RonKlaren.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/RonKlaren.js" "$OUT_DIR/RonKlaren.wasm" 2>/dev/null
