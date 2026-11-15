#!/bin/sh
# Build tad-compiler (upstream Rust CLI) to WASM for the SNES export. Output: public/tad/.
# Needs: rustup target add wasm32-unknown-emscripten, and emcc on PATH.
set -e
cd "$(dirname "$0")"
L="-C link-args"
RUSTFLAGS="$L=-sMODULARIZE=1 $L=-sEXPORT_ES6=1 $L=-sEXPORT_NAME=createTadCompiler $L=-sINVOKE_RUN=0 $L=-sEXIT_RUNTIME=0 $L=-sALLOW_MEMORY_GROWTH=1 $L=-sENVIRONMENT=web,worker,node $L=-sEXPORTED_RUNTIME_METHODS=callMain,FS" \
  cargo build --release -p tad-compiler --target wasm32-unknown-emscripten --target-dir "${TAD_TARGET_DIR:-target}"
OUT="${TAD_TARGET_DIR:-target}/wasm32-unknown-emscripten/release"
mkdir -p ../public/tad
cp "$OUT/tad-compiler.js" ../public/tad/tad-compiler.js
cp "$OUT/tad_compiler.wasm" ../public/tad/tad_compiler.wasm
