#!/bin/sh
# Assemble the hUGEDriver Game Boy player once (decision D4: dev-time RGBDS, no in-app assembler).
# Writes public/gb/huge-player.gb + huge-player.json (song offset, tick address, source hash for the staleness test).
# Needs RGBDS (brew install rgbds). Run from the repo root.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
D=$(mktemp -d)
trap 'rm -rf "$D"' EXIT
H="$ROOT/third-party/hugedriver"
rgbasm -I "$H" -o "$D/driver.o" "$H/hUGEDriver.asm"
rgbasm -I "$H" -I "$ROOT/public/gb" -o "$D/player.o" "$ROOT/public/gb/huge-player.asm"
rgblink -t -o "$D/p.gb" -n "$D/p.sym" "$D/player.o" "$D/driver.o"
rgbfix -v -c -m 0x19 -p 0xFF -t DEVILBOX "$D/p.gb"
cp "$D/p.gb" "$ROOT/public/gb/huge-player.gb"
python3 - "$D/p.sym" "$ROOT" <<'PY'
import hashlib, json, sys
sym = {}
for line in open(sys.argv[1]):
    p = line.split()
    if len(p) == 2 and ':' in p[0]:
        b, a = p[0].split(':'); sym[p[1]] = (int(b, 16), int(a, 16))
root = sys.argv[2]
srcs = ['public/gb/huge-player.asm', 'tools/build-gb-player.sh', 'third-party/hugedriver/hUGEDriver.asm', 'third-party/hugedriver/include/hardware.inc', 'third-party/hugedriver/include/hUGE.inc', 'third-party/hugedriver/include/hUGE_note_table.inc', 'public/gb/screen_font.inc']
h = hashlib.sha1()
for s in srcs: h.update(open(f'{root}/{s}', 'rb').read())
assert sym['song'] == (0, 0x2000), sym['song']
assert sym['note_table'][0] == 0, sym['note_table']
meta = {'songAddress': 0x2000, 'songOffset': 0x2000, 'songCapacity': 0x6000, 'tickAddress': sym['player_tick'][1], 'rateOffset': sym['scr_rate'][1], 'titleOffset': sym['scr_title'][1], 'authorOffset': sym['scr_author'][1], 'scrollOffset': sym['scr_scroll'][1], 'noteTableOffset': sym['note_table'][1], 'sources': srcs, 'sourceHash': h.hexdigest()}
json.dump(meta, open(f'{root}/public/gb/huge-player.json', 'w'), indent=1)
open(f'{root}/public/gb/huge-player.json', 'a').write('\n')
print(meta)
PY
