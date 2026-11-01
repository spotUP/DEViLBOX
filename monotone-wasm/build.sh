#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/monotone"
echo "=== Monotone WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function \
    "$SCRIPT_DIR/src/monotone.c" \
    -sEXPORTED_FUNCTIONS="['_mt_create','_mt_destroy','_mt_track_count','_mt_channel_count','_mt_set_channel_mask','_mt_restart','_mt_render','_mt_render_stereo','_mt_has_ended','_mt_get_position','_mt_get_row','_mt_get_rows','_mt_get_pattern','_mt_get_sounding_track','_mt_get_divisor','_mt_get_frequency','_mt_tick','_mt_tick_in_row','_mt_get_speed','_mt_get_channel_frequency','_mt_get_channel_active','_mt_get_pattern_count','_mt_get_order','_mt_set_order','_mt_get_cell','_mt_set_cell','_mt_get_title','_mt_get_comment','_mt_replace_song','_mt_export','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createMonotone -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/Monotone.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/Monotone.js" "$OUT_DIR/Monotone.wasm" "$OUT_DIR/Monotone.worklet.js"
