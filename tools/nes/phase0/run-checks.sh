#!/bin/zsh
# NES native player, Phase 0 checks: assemble three hand ROMs and compare Mesen2 bus logs.
#
# Versions verified 2026-11-17: Mesen 2.1.1 (macOS ARM64 zip from github.com/SourMesen/Mesen2
# releases; NOT in Homebrew), cc65 2.19 (brew install cc65; ca65 V2.18 banner string is normal).
#
# Real Mesen2 2.1.1 headless flags (from the binary's own help text and tests, not the plan):
#   Mesen --testRunner [--timeout=N] [--doNotSaveSettings] [--enableStdout] <script.lua> <rom>
#   * script is the first file argument, ROM the second; order of .lua/.nes is detected by extension.
#   * --timeout=N: seconds; on expiry the process exits 255. emu.stop(code) exits with `code`.
#   * Lua is `emu.stop(code)`; the built-in help text says emu.exit, which does NOT exist.
#   * Lua `print()` goes to stdout; `emu.log()` does NOT reach stdout even with --enableStdout.
#   * `io`/`os` are not available to scripts by default (io.open fails): log through print + shell.
#   * Memory callbacks: emu.addMemoryCallback(fn(addr,value), emu.callbackType.write|read, first, last).
#   * FIRST RUN: with no Settings.json Mesen opens a setup wizard and hangs the test runner
#     forever; this script creates {"FirstRun":false} in the settings dir when missing.
#   * No window opens in test runner mode.
#
# Usage: MESEN=/path/to/Mesen tools/nes/phase0/run-checks.sh [outdir]
set -u
HERE=${0:A:h}
MESEN=${MESEN:-$HOME/Applications/Mesen.app/Contents/MacOS/Mesen}
OUT=${1:-${TMPDIR:-/tmp}/nes0}
SET="$HOME/Library/Application Support/Mesen2"
mkdir -p "$OUT" "$SET"
[ -f "$SET/Settings.json" ] || echo '{"FirstRun":false}' > "$SET/Settings.json"
cd "$HERE"
ca65 a_chips.s -o "$OUT/a.o" && ld65 -C nes.cfg "$OUT/a.o" -o "$OUT/a_chips.nes" || exit 1
ca65 b_dpcm.s -o "$OUT/b.o" && ld65 -C nes.cfg "$OUT/b.o" -o "$OUT/b_dpcm.nes" || exit 1
ca65 c_multi_nsf.s -o "$OUT/c.o" && ld65 -C nsf.cfg "$OUT/c.o" -o "$OUT/c_multi.nsf" || exit 1
run() { timeout 60 "$MESEN" --testRunner --timeout=20 --doNotSaveSettings --enableStdout "$HERE/log.lua" "$1" > "$2" 2>&1; }
run "$OUT/a_chips.nes" "$OUT/a.out"; run "$OUT/b_dpcm.nes" "$OUT/b.out"; run "$OUT/c_multi.nsf" "$OUT/c.out"
# expected write list from the table in regs.inc: "W ADDR VAL"
sed -n 's/^ *w \$\([0-9A-F]*\),\$\([0-9A-F]*\).*/W \1 \2/p' regs.inc > "$OUT/expected.txt"
fail=0
for t in a c; do
  grep '^W ' "$OUT/$t.out" > "$OUT/$t.w"
  # the NSF init also pokes nothing else; a and c must equal the table exactly (order included)
  if diff -q "$OUT/expected.txt" "$OUT/$t.w" >/dev/null; then echo "[OK] $t: $(wc -l < $OUT/expected.txt | tr -d ' ') writes match"; else echo "[ERROR] $t differs"; diff "$OUT/expected.txt" "$OUT/$t.w" | head; fail=1; fi
done
# b: DMC reads must switch AA -> 11 -> 22 mid-sample (87, 169, 256 bytes at $CF00, $CF57, $D000)
got=$(grep '^R ' "$OUT/b.out" | awk '{print $3}' | uniq -c | awk '{printf "%s:%s ", $2,$1}')
if [ "$got" = "AA:87 11:169 22:256 " ]; then echo "[OK] b: DMC bank switch honoured per byte ($got)"; else echo "[ERROR] b: $got"; fail=1; fi
grep -q 'Sound Chips: VRC6, VRC7, FDS, MMC5, Namco 163, Sunsoft 5B' "$OUT/c.out" && echo "[OK] c: NSF multi-chip accepted" || { echo "[ERROR] c: chips"; fail=1; }
exit $fail
