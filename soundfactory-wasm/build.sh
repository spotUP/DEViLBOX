#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/soundfactory"
echo "=== SoundFactory2 WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function -Wno-unused-variable -Wno-tautological-constant-out-of-range-compare \
    "$SCRIPT_DIR/src/soundfactory.c" \
    -sEXPORTED_FUNCTIONS="['_sf_create','_sf_destroy','_sf_subsong_count','_sf_select_subsong','_sf_channel_count','_sf_set_channel_mask','_sf_render','_sf_render_multi','_sf_has_ended','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createSoundFactory -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/SoundFactory2.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/SoundFactory2.js" "$OUT_DIR/SoundFactory2.wasm" 2>/dev/null
