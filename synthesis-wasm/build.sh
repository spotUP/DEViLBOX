#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/synthesis"
echo "=== Synthesis WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function -Wno-unused-variable -Wno-tautological-constant-out-of-range-compare \
    "$SCRIPT_DIR/src/synthesis.c" \
    -sEXPORTED_FUNCTIONS="['_syn_create','_syn_destroy','_syn_subsong_count','_syn_select_subsong','_syn_channel_count','_syn_set_channel_mask','_syn_render','_syn_render_multi','_syn_has_ended','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createSynthesis -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/Synthesis.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/Synthesis.js" "$OUT_DIR/Synthesis.wasm" 2>/dev/null
