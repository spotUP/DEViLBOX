#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/fred-replayer"
echo "=== FredReplayer WASM Build ==="
mkdir -p "$OUT_DIR"
emcc -O2 -Wall -Wextra -Wno-unused-function \
    "$SCRIPT_DIR/src/fred_replayer.c" \
    -sEXPORTED_FUNCTIONS="['_fred_create','_fred_destroy','_fred_subsong_count','_fred_select_subsong','_fred_channel_count','_fred_set_channel_mask','_fred_render','_fred_render_multi','_fred_has_ended','_fred_get_instrument_count','_fred_export','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createFredReplayer -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sMAXIMUM_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/FredReplayer.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/FredReplayer.js" "$OUT_DIR/FredReplayer.wasm" 2>/dev/null
