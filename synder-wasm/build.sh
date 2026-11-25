#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/synder"
echo "=== Synder SNG WASM Build ==="
mkdir -p "$OUT_DIR"
# The synthesizer is integer; the sine table (long double) and the resampler are floating
# point: no fast-math, no FMA contraction.
FLAGS="-O2 -fno-fast-math -ffp-contract=off -fwrapv"
em++ $FLAGS -std=c++17 -Wall -Wextra -Wno-unused-function \
    -I"$SCRIPT_DIR/src" \
    "$SCRIPT_DIR/src/synder_wasm.cpp" \
    -sEXPORTED_FUNCTIONS="['_synder_open','_synder_error','_synder_duration_ms','_synder_voices','_synder_frames','_synder_frame_rate','_synder_position','_synder_poke','_synder_render','_synder_close','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['HEAPU8','HEAPF32','UTF8ToString']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createSynder -sENVIRONMENT=worker -sINCOMING_MODULE_JS_API="['wasmBinary']" \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/Synder.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/Synder.js" "$OUT_DIR/Synder.wasm"
