#!/bin/sh
# Builds the Jesper Olsen replayer (bbmp jo_engine.cpp + ScummVM Paula) to public/jo/Jo.js.
set -e
cd "$(dirname "$0")"
mkdir -p ../public/jo
em++ -O2 -std=c++17 -fno-fast-math -ffp-contract=off -fwrapv -I src/scummvm -I src \
  src/jo_wasm.cpp src/scummvm/audio/mods/paula.cpp \
  -s EXPORTED_FUNCTIONS='["_jo_open","_jo_error","_jo_tracks","_jo_kind","_jo_ticks","_jo_render","_jo_poke","_jo_close","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["HEAPU8","HEAPF32","UTF8ToString"]' \
  -s MODULARIZE=1 -s EXPORT_NAME=createJo -s ENVIRONMENT=worker -sINCOMING_MODULE_JS_API="['wasmBinary']" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -o ../public/jo/Jo.js
