#!/bin/bash
# Builds public/nes/famistudio/player.nes (NROM-256, FamiStudio sound engine) + player.json
# from public/nes/famistudio/player.s. Dev-time only; run through buildq.
# player.json: musicAddr/musicCap (song data area), dpcmAddr/dpcmCap, tickAddr (after famistudio_update),
# titleAddr/authorAddr/textLen: 32-byte uppercase ASCII slots shown on screen (see player.s); chipAddr/chipLen (16),
# scrollAddr/scrollLen (128), nsubAddr (1 byte subsong count), nmiAddr (NMI entry).
# Font and logo: public/nes/screen.chr, shared with public/nes/player.s.
# sourceHash (sha1 of player.s + fs.cfg + engine) for the staleness test.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/public/nes/famistudio"
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
ENG="$ROOT/third-party/famistudio"
ca65 -g -I "$ENG" --bin-include-dir "$ENG" --bin-include-dir "$ROOT/public/nes" player.s -o "$W/p.o"
ld65 -C fs.cfg -Ln "$W/p.lbl" -m "$W/p.map" "$W/p.o" -o player.nes
grep -A3 "^CODE " "$W/p.map" | head -2 || true
python3 - "$W/p.lbl" "$ENG/famistudio_ca65.s" <<'PY'
import hashlib, json, re, sys
lab = {}
for line in open(sys.argv[1]):
    m = re.match(r'^al\s+([0-9A-Fa-f]+)\s+\.(\w+)', line)
    if m: lab[m.group(2)] = int(m.group(1), 16)
assert lab['fs_music'] == 0x8000 and lab['fs_dpcm'] == 0xC000, lab
h = hashlib.sha1()
for f in ['player.s', 'fs.cfg', sys.argv[2], '../screen.chr']: h.update(open(f, 'rb').read())
meta = {'musicAddr': 0x8000, 'musicCap': 0x4000, 'dpcmAddr': 0xC000, 'dpcmCap': 0x2000,
        'prgOffset': 16, 'tickAddr': lab['fs_tick'], 'titleAddr': lab['fs_title'], 'authorAddr': lab['fs_author'], 'textLen': 32,
        'chipAddr': lab['fs_chip'], 'chipLen': 16, 'scrollAddr': lab['fs_scroll'], 'scrollLen': 128, 'nsubAddr': lab['fs_nsub'], 'nmiAddr': lab['fs_nmi'], 'sourceHash': h.hexdigest()}
json.dump(meta, open('player.json', 'w'), indent=1)
print(meta)
PY
