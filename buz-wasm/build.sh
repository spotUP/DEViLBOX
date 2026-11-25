#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/buz"
echo "=== BUZ WASM Build ==="
mkdir -p "$OUT_DIR"
# Everything is single-precision float operation by operation: no fast-math, no FMA contraction.
em++ -O2 -std=c++17 -fno-fast-math -ffp-contract=off -fwrapv -Wall -Wextra -Wno-unused-function \
    -I"$SCRIPT_DIR/src" \
    "$SCRIPT_DIR/src/buz_wasm.cpp" \
    -sEXPORTED_FUNCTIONS="['_buz_open','_buz_error','_buz_rate','_buz_duration_ms','_buz_kind','_buz_row','_buz_render','_buz_close','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['HEAPU8','HEAPF32','UTF8ToString']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createBuz -sENVIRONMENT=worker -sINCOMING_MODULE_JS_API="['wasmBinary']" \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=536870912 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/Buz.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/Buz.js" "$OUT_DIR/Buz.wasm"
