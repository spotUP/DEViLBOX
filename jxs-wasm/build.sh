#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/jxs"
echo "=== JXS WASM Build ==="
mkdir -p "$OUT_DIR"
# The float flags keep the resonance filters (doubles) identical to the reference build.
emcc -O2 -std=c++17 -fno-fast-math -ffp-contract=off -fwrapv -Wall -Wextra -Wno-unused-function \
    -I"$SCRIPT_DIR/src" \
    "$SCRIPT_DIR/src/jxs_wasm.cpp" \
    -sEXPORTED_FUNCTIONS="['_jxs_open','_jxs_error','_jxs_rate','_jxs_tracks','_jxs_duration_ms','_jxs_bar','_jxs_step','_jxs_render','_jxs_voices','_jxs_voice','_jxs_voice_side','_jxs_set_isolated','_jxs_close','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['HEAPU8','HEAPF32','UTF8ToString']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createJxs -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=268435456 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/Jxs.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/Jxs.js" "$OUT_DIR/Jxs.wasm"
