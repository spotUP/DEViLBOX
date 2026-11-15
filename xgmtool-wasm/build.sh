#!/bin/bash
# Builds SGDK xgmtool (vendored C CLI) to a MODULARIZE ES module. Needs emcc on PATH.
# Usage: ~/.claude/bin/buildq --purpose "<task>" -- xgmtool-wasm/build.sh
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/../third-party/sgdk-xgm/tools/xgmtool"
OUT_DIR="$SCRIPT_DIR/../public/xgmtool"
mkdir -p "$OUT_DIR"
emcc -O2 -w -I"$SRC/inc" "$SRC"/src/*.c \
    -sEXPORTED_RUNTIME_METHODS="['callMain','FS']" \
    -sMODULARIZE=1 -sEXPORT_NAME=createXgmtool -sEXPORT_ES6=1 \
    -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 \
    -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -o "$OUT_DIR/xgmtool.js"
ls -lh "$OUT_DIR/xgmtool.js" "$OUT_DIR/xgmtool.wasm"
