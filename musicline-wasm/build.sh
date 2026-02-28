#!/bin/bash
set -e
mkdir -p build
mkdir -p ../../public/musicline
cd build
emcmake cmake ..
emmake make -j4
echo "Build complete: public/musicline/MusicLine.js + .wasm"
