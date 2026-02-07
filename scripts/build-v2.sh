#!/bin/bash

# Build script for Farbrausch V2 Synth WASM
# Requires emcc (Emscripten)

EMCC_OPTS="-O3 --bind -s WASM=1 -s SIDE_MODULE=0 -s EXPORTED_RUNTIME_METHODS=[\"cwrap\",\"ccall\"] -s ALLOW_MEMORY_GROWTH=1 -s MODULARIZE=1 -s EXPORT_ES6=1 -s EXPORT_NAME='V2Synth'"

echo "Building V2 Synth WASM..."

emcc src/engine/v2/V2SynthWasm.cpp \
     src/engine/v2/synth_core.cpp \
     src/engine/v2/v2defs.cpp \
     -Isrc/engine/v2 \
     $EMCC_OPTS \
     -o public/V2Synth.js

echo "Build complete: public/V2Synth.js and public/V2Synth.wasm"

