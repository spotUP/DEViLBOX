#!/bin/sh
# Regenerate src/hippelst_play.c from the player source with the repo's asm-to-C transpiler.
set -e
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/.." && pwd)
out=$(mktemp -d)
(cd "$root/tools/asm68k-to-c" && npx tsc && node dist/cli.js "$root/third-party/hippelst/hippel_st_play.asm" -o "$out" -n hippelst --pass2)
cp "$out/hippelst/hippelst.c" "$here/src/hippelst_play.c"
rm -rf "$out"
