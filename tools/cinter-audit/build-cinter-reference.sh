#!/usr/bin/env bash
# build-cinter-reference.sh — assemble the REAL Amiga Cinter4.S player into a raw
# 68k blob + symbol map, for the song-level lock-test reference (task C).
#
# The reference is the genuine Cinter4.S executed in a 68k core (Musashi), driven
# host-side (bypassing DemoStartup.S, which is full Amiga hardware bootstrap). Its
# per-tick Paula register writes are the ground truth to diff cinter4.c against.
#
# Entry offsets (from the symbol map, CPU=68020):
#   CinterInit  @ 0x0000   (a2=music, a4=instrument space, a6=working memory)
#   CinterPlay1 @ 0x01D8   (a6=working memory) — once per 50 Hz tick
#   CinterPlay2 @ 0x022C   (a6=working memory) — immediately after Play1
#
# Usage: build-cinter-reference.sh [REFERENCE_CINTER_DIR] [OUT_DIR]
#   REFERENCE_CINTER_DIR defaults to the known local checkout; override for CI.
set -euo pipefail

REF_DIR="${1:-/Users/spot/Code/Reference Code/Cinter/player}"
OUT_DIR="${2:-$(cd "$(dirname "$0")" && pwd)/reference}"

command -v vasmm68k_mot >/dev/null || { echo "ERROR: vasmm68k_mot not found (brew install vasm)"; exit 1; }
[ -f "$REF_DIR/Cinter4.S" ] || { echo "ERROR: Cinter4.S not found in $REF_DIR"; exit 1; }

mkdir -p "$OUT_DIR"
cp "$REF_DIR/Cinter4.S" "$OUT_DIR/Cinter4.S"

# Cinter4.S is self-contained (rsreset equates, no external includes). movec in the
# player path needs 68010+, so assemble for 68020.
vasmm68k_mot -m68020 -Fbin -L "$OUT_DIR/Cinter4.lst" -o "$OUT_DIR/Cinter4.bin" "$OUT_DIR/Cinter4.S"

echo "Assembled $(wc -c < "$OUT_DIR/Cinter4.bin" | tr -d ' ') bytes -> $OUT_DIR/Cinter4.bin"
echo "Entry symbols:"
grep -E "^(CinterInit|CinterPlay1|CinterPlay2|CinterInitEnd) " "$OUT_DIR/Cinter4.lst" || true
