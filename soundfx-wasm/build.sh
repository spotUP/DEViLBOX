#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/soundfx"
echo "=== SoundFx WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function \
    "$SCRIPT_DIR/src/soundfx.c" \
    -sEXPORTED_FUNCTIONS="['_sfx_create','_sfx_destroy','_sfx_subsong_count','_sfx_select_subsong','_sfx_channel_count','_sfx_set_channel_mask','_sfx_render','_sfx_render_multi','_sfx_has_ended','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createSoundFx -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/SoundFx.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/SoundFx.js" "$OUT_DIR/SoundFx.wasm" 2>/dev/null
