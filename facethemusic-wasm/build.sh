#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/facethemusic"
echo "=== FaceTheMusic WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function -Wno-unused-variable -Wno-tautological-constant-out-of-range-compare \
    "$SCRIPT_DIR/src/facethemusic.c" \
    -sEXPORTED_FUNCTIONS="['_ftm_create','_ftm_destroy','_ftm_subsong_count','_ftm_select_subsong','_ftm_channel_count','_ftm_set_channel_mask','_ftm_render','_ftm_render_multi','_ftm_has_ended','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createFaceTheMusic -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/FaceTheMusic.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/FaceTheMusic.js" "$OUT_DIR/FaceTheMusic.wasm" 2>/dev/null
