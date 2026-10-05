#!/usr/bin/env bash
# Regenerate the build-time sources psgplay's Makefile makes before it compiles:
#   m68k/m68kops.{c,h}  - Musashi's opcode tables, written by lib/m68k/m68kmake
#   tos/tos.h           - the precompiled TOS image (lib/tos/tos) as a C array
# They are committed under psgplay-wasm/generated/ so the wasm build needs only
# emcmake. Run this after updating third-party/psgplay.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/../third-party/psgplay"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp -R "$SRC/." "$WORK/"
make -C "$WORK" include/m68k/m68kops.h include/tos/tos.h >/dev/null
cp "$WORK/include/m68k/m68kops.h" "$WORK/lib/m68k/m68kops.c" "$HERE/generated/m68k/"
cp "$WORK/include/tos/tos.h" "$HERE/generated/tos/"
echo "[OK] regenerated psgplay-wasm/generated/"
