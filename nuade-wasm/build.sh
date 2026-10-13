#!/usr/bin/env bash
# Builds public/nuade/Nuade.{js,wasm} from third-party/nuade (pristine upstream) plus nuade-wasm/src/nuade_wasm.c.
# Patches to the upstream tree, if ever needed, live in nuade-wasm/patches/NNNN-*.patch and are applied to a scratch
# copy of the tree for the build; third-party/nuade itself is never edited.
# Usage: have emcc on PATH (source emsdk_env.sh), then nuade-wasm/build.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BUILD="$HERE/build"
SRC="$HERE"
mkdir -p "$BUILD"

if compgen -G "$HERE/patches/*.patch" > /dev/null; then
  PATCHED="$BUILD/patched"
  rm -rf "$PATCHED"
  mkdir -p "$PATCHED/third-party" "$PATCHED/nuade-wasm"
  cp -R "$HERE/../third-party/nuade" "$PATCHED/third-party/nuade"
  cp -R "$HERE/CMakeLists.txt" "$HERE/src" "$PATCHED/nuade-wasm/"
  for p in "$HERE"/patches/*.patch; do
    (cd "$PATCHED/third-party/nuade" && patch -p1 < "$p")
  done
  SRC="$PATCHED/nuade-wasm"
fi

emcmake cmake -S "$SRC" -B "$BUILD/cmake" -DCMAKE_BUILD_TYPE=Release -DNUADE_OUT_DIR="$HERE/../public/nuade"
cmake --build "$BUILD/cmake" --target Nuade -j"$(sysctl -n hw.ncpu 2>/dev/null || nproc)"
OUT="$HERE/../public/nuade"
ls -l "$OUT/Nuade.wasm" "$OUT/Nuade.js"
