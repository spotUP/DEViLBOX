#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/soundmon"
echo "=== SoundMon WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function \
    "$SCRIPT_DIR/src/soundmon.c" \
    -sEXPORTED_FUNCTIONS="['_sm_create','_sm_destroy','_sm_subsong_count','_sm_select_subsong','_sm_channel_count','_sm_set_channel_mask','_sm_render','_sm_render_multi','_sm_has_ended','_sm_get_instrument_count','_sm_export','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createSoundMon -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/SoundMon.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/SoundMon.js" "$OUT_DIR/SoundMon.wasm" 2>/dev/null
