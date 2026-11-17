#!/bin/sh
# Builds the Vectrex cartridge player public/vectrex/player.bin + player.json from public/vectrex/player.asm.
# Needs lwasm (brew install lwtools). Queue it:
#   ~/.claude/bin/buildq --purpose "..." -- tools/build-vectrex-player.sh
# player.json carries the offsets src/lib/export/vectrex/vectrexCartridge.ts patches title/data at.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT
cd "$ROOT/public/vectrex"
lwasm --raw --symbol-dump="$W/player.sym" -o "$W/player.bin" player.asm
cp "$W/player.bin" player.bin
python3 - "$W/player.sym" player.bin player.json <<'PY'
import json, os, re, sys
sym = {}
for line in open(sys.argv[1]):
    m = re.match(r'^(\w+)\s+EQU\s+\$([0-9A-Fa-f]+)', line, re.I)
    if m: sym[m.group(1).lower()] = int(m.group(2), 16)
size = os.path.getsize(sys.argv[2])
assert sym['data'] == size, (sym['data'], size)
meta = {'size': size, 'titleOffset': sym['title'], 'titleLength': 16, 'dataOffset': sym['data'], 'authorOffset': sym['author'], 'authorLength': 16, 'scrollOffset': sym['scroll'], 'scrollLength': sym['scrollend'] - sym['scroll'], 'maxCartridge': 32768}
json.dump(meta, open(sys.argv[3], 'w'), indent=1)
open(sys.argv[3], 'a').write('\n')
print(meta)
PY
