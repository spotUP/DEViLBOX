#!/usr/bin/env bash
# Build the Master System / Game Gear cartridge player (Banjo driver) into
# public/sms/player.sms + public/sms/player.json.
# Needs WLA-DX (wla-z80 + wlalink): `brew install wla-dx`, or set WLA_BIN to a
# directory holding a source build. Dev-time only; the result is committed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/tools/sms-player"
OUT="$ROOT/public/sms"
WLA_BIN="${WLA_BIN:-}"
WLA="${WLA_BIN:+$WLA_BIN/}wla-z80"
LINK="${WLA_BIN:+$WLA_BIN/}wlalink"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$SRC"
"$WLA" -D BANJO_SYS=1 -o "$WORK/player.o" sms-player.asm
printf '[objects]\n%s\n\n[ramsections]\nbank 0 slot 3 "BANJO_RAM"\n' "$WORK/player.o" > "$WORK/link.txt"
"$LINK" -s -r "$WORK/link.txt" "$WORK/player.sms"
mkdir -p "$OUT"
cp "$WORK/player.sms" "$OUT/player.sms"

HASH="$(cat "$SRC/sms-player.asm" "$ROOT"/third-party/banjo/music_driver/banjo/*.asm "$ROOT"/third-party/banjo/music_driver/banjo/*.inc "$ROOT"/third-party/banjo/music_driver/sn/* "$ROOT/third-party/banjo/music_driver/banjo_defines_wladx.inc" | shasum -a 256 | cut -c1-16)"
node -e '
const fs = require("fs");
const sym = fs.readFileSync(process.argv[1], "utf8");
const want = ["song_data", "song_hz", "banjo_init_sn", "banjo_update_channels_sn", "banjo_mute_channel_sn", "banjo_mute_all_sn", "banjo_song_stop", "sn_tone_lookup"];
const out = { sourceHash: process.argv[3] };
for (const line of sym.split("\n")) {
  const m = /^([0-9a-f]+):([0-9a-f]+) (\S+)$/i.exec(line.trim());
  if (m && want.includes(m[3])) out[m[3]] = parseInt(m[2], 16);
  // ROM file offset = bank * 0x4000 + offset inside the 16 KB slot
  const romKey = { song_data: "song_rom", song_hz: "song_hz", sn_tone_lookup: "sn_tone_rom" }[m ? m[3] : ""];
  if (romKey) out[romKey] = parseInt(m[1], 16) * 0x4000 + (parseInt(m[2], 16) & 0x3fff);
}
for (const w of want) if (out[w] === undefined) { console.error("missing symbol " + w); process.exit(1); }
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 2) + "\n");
' "$WORK/player.sym" "$OUT/player.json" "$HASH"
echo "[OK] public/sms/player.sms ($(wc -c < "$OUT/player.sms") bytes), song at ROM $(node -p "require('$OUT/player.json').song_rom.toString(16)")"
