#!/usr/bin/env bash
# Builds public/chiptune3/libopenmpt.render.js - the libopenmpt the DJ render worker
# (src/workers/dj-render.worker.ts) renders modules with.
#
# Source: libopenmpt 0.8.4, the version public/chiptune3/libopenmpt.worklet.js ships
# (a prebuilt chiptune3 binary; the tracker's live playback keeps using it). Built
# unpatched with this script, it renders MOD (Amiga resampler) / S3M / IT / XM
# sample-exact to that binary. devilbox-taps.patch adds per-channel taps
# (openmpt_module_enable_channel_taps / openmpt_module_read_channel_tap): each pattern
# channel's share of the mix from the same render pass, for the deck scopes and mute
# stems, where the renderer used to run one solo instance per channel. Changes are
# marked "DEViLBOX:" in the sources (README.md).
#
# Usage: emcc on PATH (tested with emcc 4.0.16), then third-party/libopenmpt-render/build.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
URL="https://lib.openmpt.org/files/libopenmpt/src/libopenmpt-0.8.4+release.makefile.tar.gz"
SHA256="9f610ac26b2656f8edef85ffdac95b6495037108ec6d937fe913c5fe4751c44e"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

curl -sSfL -o "$TMP/libopenmpt.tar.gz" "$URL"
echo "$SHA256  $TMP/libopenmpt.tar.gz" | shasum -a 256 -c -
tar xzf "$TMP/libopenmpt.tar.gz" -C "$TMP"
cd "$TMP/libopenmpt-0.8.4+release"
patch -p1 < "$HERE/devilbox-taps.patch"
patch -p1 < "$HERE/devilbox-edit.patch"
TMPDIR="$TMP" make CONFIG=emscripten EMSCRIPTEN_TARGET=audioworkletprocessor -j"${JOBS:-4}" bin/libopenmpt.js
cp bin/libopenmpt.js "$ROOT/public/chiptune3/libopenmpt.render.js"
# The tracker worklet runs the same patched binary (in-place edit API, devilbox-edit.patch).
cp bin/libopenmpt.js "$ROOT/public/chiptune3/libopenmpt.worklet.js"
echo "built $ROOT/public/chiptune3/libopenmpt.render.js ($(wc -c < "$ROOT/public/chiptune3/libopenmpt.render.js") bytes)"
