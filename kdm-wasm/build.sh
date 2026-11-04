#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/kdm"
echo "=== KDM WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function -I"$SCRIPT_DIR/src" \
    "$SCRIPT_DIR/src/kdm_wasm.c" \
    -sEXPORTED_FUNCTIONS="['_kdm_set_bank','_kdm_open','_kdm_error','_kdm_rate','_kdm_total_ticks','_kdm_tick','_kdm_render','_kdm_close','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['HEAPU8','HEAPF32','UTF8ToString']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createKdm -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=8388608 -sMAXIMUM_MEMORY=67108864 \
    -sINVOKE_RUN=0 -lm -o "$OUT_DIR/Kdm.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/Kdm.js" "$OUT_DIR/Kdm.wasm"
