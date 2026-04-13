#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/oktalyzer"
echo "=== Oktalyzer WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function \
    "$SCRIPT_DIR/src/oktalyzer.c" \
    -sEXPORTED_FUNCTIONS="['_okt_create','_okt_destroy','_okt_subsong_count','_okt_select_subsong','_okt_channel_count','_okt_set_channel_mask','_okt_render','_okt_render_multi','_okt_has_ended','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createOktalyzer -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/Oktalyzer.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/Oktalyzer.js" "$OUT_DIR/Oktalyzer.wasm" 2>/dev/null
