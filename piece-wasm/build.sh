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
    -sEXPORTED_FUNCTIONS="['_piece_open','_piece_error','_piece_duration_ms','_piece_parts','_piece_ticks','_piece_part_pos','_piece_poke','_piece_render','_piece_close','_piece_replace','_piece_splice','_piece_data','_piece_data_size','_piece_grid','_piece_edit_cell','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['HEAPU8','HEAPF32','UTF8ToString']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createPiece -sENVIRONMENT=worker -sINCOMING_MODULE_JS_API="['wasmBinary']" \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=16777216 \
    -sINVOKE_RUN=0 -o "$OUT_DIR/Piece.js"
# Main-thread / node copy for the editor: grid + cell edits on song bytes (no playback calls).
em++ $FLAGS -std=c++17 -Wall -Wextra -Wno-unused-function \
    -I"$SCRIPT_DIR/src" \
    "$SCRIPT_DIR/src/piece_wasm.cpp" \
    -sEXPORTED_FUNCTIONS="['_piece_open','_piece_close','_piece_error','_piece_data','_piece_data_size','_piece_grid','_piece_edit_cell','_malloc','_free']" \
    -sEXPORTED_RUNTIME_METHODS="['HEAPU8','HEAP32','UTF8ToString']" \
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createPieceEdit -sENVIRONMENT=web,worker,node \
    -sALLOW_MEMORY_GROWTH=1 -sINVOKE_RUN=0 -o "$OUT_DIR/PieceEdit.js"
echo "=== Build complete ==="
ls -lh "$OUT_DIR/Piece.js" "$OUT_DIR/Piece.wasm" "$OUT_DIR/PieceEdit.js" "$OUT_DIR/PieceEdit.wasm"
