#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/quadracomposer"
echo "=== QuadraComposer WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function \
    "$SCRIPT_DIR/src/quadracomposer.c" \
    -sEXPORTED_FUNCTIONS="['_qc_create','_qc_destroy','_qc_subsong_count','_qc_select_subsong','_qc_channel_count','_qc_set_channel_mask','_qc_render','_qc_render_multi','_qc_has_ended','_qc_get_instrument_count','_qc_get_num_patterns','_qc_get_pattern_rows','_qc_get_num_positions','_qc_get_cell','_qc_set_cell','_qc_get_instrument_param','_qc_set_instrument_param','_qc_export','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createQuadraComposer -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/QuadraComposer.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/QuadraComposer.js" "$OUT_DIR/QuadraComposer.wasm" 2>/dev/null
