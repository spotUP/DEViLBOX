#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/soundcontrol"
echo "=== SoundControl WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function \
    "$SCRIPT_DIR/src/soundcontrol.c" \
    -sEXPORTED_FUNCTIONS="['_sc_create','_sc_destroy','_sc_subsong_count','_sc_select_subsong','_sc_channel_count','_sc_set_channel_mask','_sc_render','_sc_render_multi','_sc_has_ended','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createSoundControl -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/SoundControl.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/SoundControl.js" "$OUT_DIR/SoundControl.wasm" 2>/dev/null
