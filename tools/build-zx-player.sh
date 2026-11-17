#!/bin/sh
# Builds the ZX Spectrum 128K AY player public/zx/player.bin + player.json from public/zx/player.asm (+ screen.inc).
# Needs sjasmplus (https://github.com/z00m128/sjasmplus). Queue it:
#   ~/.claude/bin/buildq --purpose "..." -- tools/build-zx-player.sh
# Run tools/hwplayer/assets.ts first when the font changes (it writes public/zx/screen_font.inc).
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT
cd "$ROOT/public/zx"
sjasmplus --nologo --msg=war --raw="$W/player.bin" --sym="$W/player.sym" player.asm
cp "$W/player.bin" player.bin
python3 - "$W/player.sym" player.bin player.json <<'PY'
import json, os, re, sys
sym = {}
for line in open(sys.argv[1]):
    m = re.match(r'^(\w+):\s+EQU\s+0x([0-9A-Fa-f]+)', line)
    if m: sym[m.group(1)] = int(m.group(2), 16)
size = os.path.getsize(sys.argv[2])
load = 0x8000
assert sym['banktab'] - load + 8 == size, (sym['banktab'], size)
meta = {
    'loadAddress': load, 'entry': sym['start'], 'size': size, 'bankTableOffset': sym['banktab'] - load, 'maxBanks': 8,
    'dataAddress': 0xC000, 'bankSize': 16384, 'usableBanks': [0, 1, 3, 4, 6, 7],
    'titleOffset': sym['title_str'] - load, 'authorOffset': sym['author_str'] - load, 'textLength': 32,
    'screenStatic': sym['screen_static'], 'barStatic': sym['bar_static'], 'updateBars': sym['update_bars'],
    'vars': sym['VARS'],
    'songTableOffset': sym['songtab'] - load, 'songCountOffset': sym['nsongs'] - load, 'maxSongs': sym['MAXSONGS'],
    'statusTextOffset': sym['statustxt'] - load,
}
json.dump(meta, open(sys.argv[3], 'w'), indent=1)
open(sys.argv[3], 'a').write('\n')
print(meta)
PY
