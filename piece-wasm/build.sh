#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/piece"
echo "=== P/ECE (piece) WASM Build ==="
mkdir -p "$OUT_DIR"
# Floating-point engine: no fast-math, no FMA contraction (bbmp README). em++, not emcc (libc++).
FLAGS="-O2 -fno-fast-math -ffp-contract=off -fwrapv"
em++ $FLAGS -std=c++17 -Wall -Wextra -Wno-unused-function \
    -I"$SCRIPT_DIR/src" \
    "$SCRIPT_DIR/src/piece_wasm.cpp" \
    -sEXPORTED_FUNCTIONS="['_piece_open','_piece_error','_piece_duration_ms','_piece_parts','_piece_ticks','_piece_part_pos','_piece_poke','_piece_render','_piece_close','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['HEAPU8','HEAPF32','UTF8ToString']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createPiece -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/Piece.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/Piece.js" "$OUT_DIR/Piece.wasm"
