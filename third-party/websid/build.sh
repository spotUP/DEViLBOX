#!/usr/bin/env bash
# Builds public/deepsid/websid.wasm + backend_websid.js from the committed WebSID sources.
#
# Upstream: https://bitbucket.org/wothke/websid commit 52822db (2024-09-09), the
# version DeepSID shipped and DEViLBOX used as a prebuilt binary until 2026-10-12.
# Licence: CC BY-NC-SA 4.0 (README.md). Local changes are marked "DEViLBOX:".
# The upstream makeEmscripten.bat targets fastcomp-era emcc; the flags below are
# its modern equivalents (emcc 3.1+ / 4.x). The stereo and md5 libraries are
# compiled from source instead of upstream's prebuilt .bc files. --trap-mode-clamp is
# upstream's BINARYEN_TRAP_MODE='clamp': the emulator divides by zero (WaveGenerator::
# noiseOutput on a same-cycle poke) and relies on the result being 0, not a trap.
#
# Usage: source emsdk_env.sh (or have emcc on PATH), then third-party/websid/build.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$ROOT/public/deepsid"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cd "$HERE"

# Every EMBIND function in Adapter.cpp is exported (the upstream list had drifted from it).
EXPORTS=$(grep -oE '^EMBIND\([^,]+, *[a-z0-9_]+' src/Adapter.cpp | sed -E 's/.*, *//' | sort -u | sed -E "s/.*/'_&'/" | paste -sd, -)
EXPORTS="[$EXPORTS,'_malloc','_free']"

STEREO_SRC=$(ls src/stereo/*.c src/stereo/Common/*.c)

CFLAGS="-O3 -funroll-loops -fno-rtti -fno-exceptions -Wno-pointer-sign -Wno-everything"
# The stereo and md5 libraries compile with their own include paths only, as upstream does
# (stereo/Common/Filter.h and src/filter.h collide on a case-insensitive file system).
OBJS=()
for f in $STEREO_SRC; do
  o="$TMP/stereo_$(basename "$f" .c).o"
  emcc $CFLAGS -I./src/stereo -I./src/stereo/Common -c "$f" -o "$o"
  OBJS+=("$o")
done
emcc $CFLAGS -I./src/rsa -c src/rsa/md5.c -o "$TMP/md5.o"
OBJS+=("$TMP/md5.o")

emcc $CFLAGS -I./src -I./src/rsa -I./src/stereo -I./src/stereo/Common \
  "${OBJS[@]}" \
  src/SidSnapshot.cpp src/Postprocess.cpp src/loaders.cpp src/filter.cpp src/filter6581.cpp src/filter8580.cpp \
  src/wavegenerator.cpp src/envelope.cpp src/sid.cpp src/memory.c src/system.cpp src/cpu.c src/hacks.c src/cia.c \
  src/vic.c src/core.cpp src/digi.cpp src/Adapter.cpp \
  --closure 1 ${WEBSID_EXTRA_FLAGS:-} \
  -s WASM=1 -s ASSERTIONS=0 -s SAFE_HEAP=0 -s NO_FILESYSTEM=1 \
  -s ENVIRONMENT=web,worker \
  -s WASM_ASYNC_COMPILATION=1 \
  -s BINARYEN_EXTRA_PASSES=--trap-mode-clamp \
  -s EXPORTED_FUNCTIONS="$EXPORTS" \
  -s EXPORTED_RUNTIME_METHODS="['ccall','UTF8ToString','HEAP8','HEAPU8','HEAP16','HEAP32','HEAPF32','HEAPF64']" \
  -o "$TMP/websid.js"

cat shell-pre.js "$TMP/websid.js" shell-post.js websid_adapter.js > "$OUT/backend_websid.js"
# DEViLBOX: ScriptNodePlayerEngine looks the adapter class up on window (a class declaration is no window property).
printf '\n// Expose adapter class on window for dynamic lookup by ScriptNodePlayerEngine\nwindow.SIDBackendAdapter = SIDBackendAdapter;\n' >> "$OUT/backend_websid.js"
cp "$TMP/websid.wasm" "$OUT/websid.wasm"
echo "built $OUT/websid.wasm ($(wc -c < "$OUT/websid.wasm") bytes) + backend_websid.js"
