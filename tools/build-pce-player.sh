#!/usr/bin/env bash
# Build the HuSIC PC Engine driver ROM template: public/pce/player.pce + player.json.
# pceas is compiled from the vendored source into a temp dir (no system install).
set -euo pipefail
export LC_ALL=C
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
H="$ROOT/third-party/husic"
T="$(mktemp -d "${TMPDIR:-/tmp}/pce-player.XXXXXX")"
trap 'rm -rf "$T"' EXIT
cc -O1 -w -fcommon -std=gnu89 -DPCE -o "$T/pceas" "$H"/pceas/*.c
cp "$H"/hescode/*.s "$H"/hescode/*.asm "$H"/stub/* "$T/"
( cd "$T" && PCE_INCLUDE="$T;$H/include/pce" ./pceas -raw -S makepce.s > build.log )
sym() { awk -v n="$1" '$1==n {print $2; exit}' "$T/makepce.sym"; }
[ "$(sym _sound_dat)" = "4400" ] || { echo "unexpected _sound_dat $(sym _sound_dat)"; exit 1; }
[ "$(sym LL0)" = "4000" ] || { echo "unexpected LL0 $(sym LL0)"; exit 1; }
# Song region $4400-$5FFF of bank 3 must hold only song labels from the stub.
awk '$3=="03" && $2>="4400" && $2<"6000" {print $1}' "$T/makepce.sym" | grep -v -E '^(_sound_dat|_pcewav|_xpcmdata|song_|.*_table$|.*_lp_table$|pce_|lfo_data|fds_|n106_|vrc7_|dpcm_|xpcm_|__)' && { echo "driver label inside song region"; exit 1; } || true
mkdir -p "$ROOT/public/pce"
cp "$T/makepce.pce" "$ROOT/public/pce/player.pce"
SIZE=$(wc -c < "$T/makepce.pce" | tr -d ' ')
HASH=$(cat "$H"/hescode/* "$H"/stub/* | shasum | cut -c1-12)
printf '{\n  "soundDat": 16384,\n  "songEnd": 24576,\n  "ll0": 16384,\n  "constBank": 3,\n  "firstFreeBank": %d,\n  "sourceHash": "%s"\n}\n' $((SIZE / 8192)) "$HASH" > "$ROOT/public/pce/player.json"
echo "player.pce $SIZE bytes"; cat "$ROOT/public/pce/player.json"
