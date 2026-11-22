#!/bin/sh
# Build public/md/player.bin (shell + MDSDRV, padded to $4000; sequence goes at $4000). Needs vasmm68k_mot + sjasmplus.
# Run through the queue: ~/.claude/bin/buildq --purpose "<session>: <task>" -- nice -n 19 tools/build-md-player.sh
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
sh "$ROOT/tools/build-mdsdrv.sh" "$T" >/dev/null
cp "$ROOT/public/md/player.s" "$T/player.s"
(cd "$T" && vasmm68k_mot -quiet -Fbin -m68000 -no-opt -spaces -o player.bin player.s)
cp "$T/player.bin" "$ROOT/public/md/player.bin"
rm -rf "$T"
ls -l "$ROOT/public/md/player.bin"
