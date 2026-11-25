#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/digmug"
echo "=== DigMug WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function \
    "$SCRIPT_DIR/src/digmug.c" \
    -sEXPORTED_FUNCTIONS="['_dm_create','_dm_destroy','_dm_subsong_count','_dm_select_subsong','_dm_channel_count','_dm_set_channel_mask','_dm_render','_dm_render_multi','_dm_has_ended','_dm_get_play_pos','_dm_get_play_row','_dm_get_instrument_count','_dm_get_num_tracks','_dm_get_cell','_dm_set_cell','_dm_get_instrument_param','_dm_set_instrument_param','_dm_export','_dm_preview_note','_dm_preview_stop','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createDigMug -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/DigMug.js"
# Editor build: grid exports + a player for tests, loadable from the main thread and node
emcc -O2 -Wall -Wextra -Wno-unused-function \
    "$SCRIPT_DIR/src/digmug.c" \
    -sEXPORTED_FUNCTIONS="['_dm_grid_open','_dm_grid_close','_dm_grid_channels','_dm_grid_restart','_dm_grid_order_length','_dm_grid_order','_dm_grid_pattern_count','_dm_grid_pattern_rows','_dm_grid_pattern','_dm_create','_dm_destroy','_dm_render','_dm_has_ended','_dm_get_play_pos','_dm_get_play_row','_dm_voice_note_index','_dm_voice_instrument','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['HEAPU8','HEAP32','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createDigMugEdit -sENVIRONMENT=web,worker,node \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/DigMugEdit.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/DigMug.js" "$OUT_DIR/DigMug.wasm" "$OUT_DIR/DigMugEdit.js" "$OUT_DIR/DigMugEdit.wasm" 2>/dev/null
