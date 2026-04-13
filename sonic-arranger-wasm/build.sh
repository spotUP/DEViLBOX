#!/bin/bash
# build.sh — Build Sonic Arranger WASM module
#
# Output:
#   ../public/sonic-arranger/SonicArranger.js
#   ../public/sonic-arranger/SonicArranger.wasm

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/sonic-arranger"

echo "=== Sonic Arranger WASM Build ==="
mkdir -p "$OUT_DIR"

emcc \
    -O2 \
    -Wall -Wextra -Wno-unused-function \
    "$SCRIPT_DIR/src/sonic_arranger.c" \
    -sEXPORTED_FUNCTIONS="['_sa_create','_sa_destroy','_sa_subsong_count','_sa_select_subsong','_sa_channel_count','_sa_set_channel_mask','_sa_render','_sa_render_multi','_sa_has_ended','_sa_get_num_positions','_sa_get_num_track_lines','_sa_get_rows_per_track','_sa_get_cell','_sa_set_cell','_sa_get_position','_sa_set_position','_sa_get_instrument_count','_sa_get_instrument_param','_sa_set_instrument_param','_sa_get_instrument_name','_sa_export','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 \
    -sEXPORT_NAME=createSonicArranger \
    -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 \
    -sINITIAL_MEMORY=4194304 \
    -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 \
    -o "$OUT_DIR/SonicArranger.js"

echo "=== Build complete ==="
ls -lh "$OUT_DIR/SonicArranger.js" "$OUT_DIR/SonicArranger.wasm" 2>/dev/null
