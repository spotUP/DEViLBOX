#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/smx"
echo "=== SMX (SCC-Musixx) WASM Build ==="
mkdir -p "$OUT_DIR"
OBJ_DIR="$(mktemp -d)"
trap 'rm -rf "$OBJ_DIR"' EXIT
# The output filter is double precision step by step: no fast-math, no FMA contraction.
FLAGS="-O2 -fno-fast-math -ffp-contract=off -fwrapv"
emcc $FLAGS -std=c99 -c "$SCRIPT_DIR/src/emu2212/emu2212.c" -o "$OBJ_DIR/emu2212.o"
em++ $FLAGS -std=c++17 -Wall -Wextra -Wno-unused-function \
    -I"$SCRIPT_DIR/src" -I"$SCRIPT_DIR/src/emu2212" \
    "$SCRIPT_DIR/src/smx_wasm.cpp" "$OBJ_DIR/emu2212.o" \
    -sEXPORTED_FUNCTIONS="['_smx_open','_smx_error','_smx_duration_ms','_smx_position','_smx_poke','_smx_render','_smx_close','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['HEAPU8','HEAPF32','UTF8ToString']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createSmx -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/Smx.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/Smx.js" "$OUT_DIR/Smx.wasm"
