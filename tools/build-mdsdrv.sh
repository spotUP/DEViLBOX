#!/bin/sh
# Build MDSDRV (third-party/mdsdrv, zlib) with vasmm68k_mot + sjasmplus, no asm68k/wine/salvador.
# Usage: tools/build-mdsdrv.sh <out-dir>   -> <out-dir>/mdsdrv.bin, mdssub.bin, mdsdrv.lst
# Run through the build queue: ~/.claude/bin/buildq --purpose "<session>: <task>" -- tools/build-mdsdrv.sh <out>
# Port edits (applied to a copy, upstream tree stays pristine):
#  1. mdssub.z80: macro params `addr` of ldib/ldiw renamed (sjasmplus 1.24 re-substitutes `addr` inside `m2_pcm1_addr`).
#  2. mdsdrv.inc: PACK_Z80 1 -> 0 (Z80 code stored uncompressed; upstream option, no salvador needed).
#  3. all .68k/.inc: asm68k `@local` labels -> vasm `.local`; `inform` lines commented out (asm68k-only directive);
#     `if def(X)` -> `ifd X`; mdsseq.inc `if def(MML)&(~def(MMLDEF))` -> `ifd MML`.
#  4. mdssub.inc: named macro params (\ch, \vol) -> positional (\1, \2); vasm mot rejects `\ch` as index register.
#  5. vasm flags: -spaces (asm68k allows blanks after commas), -no-opt (no size optimisation beyond the source).
# Behaviour fixes live in the vendored source itself, each marked `DEViLBOX:` (grep it).
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=$1
mkdir -p "$OUT/src" "$OUT/out"
cp "$ROOT"/third-party/mdsdrv/src/* "$OUT/src/"
cd "$OUT"
perl -0pi -e 's/macro\tldiw addr(.*?)ld\t\tde,addr/macro\tldiw ldiw_dst$1ld\t\tde,ldiw_dst/s; s/macro\tldib addr(.*?)ld\t\t\(addr\),a/macro\tldib ldib_dst$1ld\t\t(ldib_dst),a/s' src/mdssub.z80
sed -i '' 's/^PACK_Z80\t\tequ\t\t1/PACK_Z80\t\tequ\t\t0/' src/mdsdrv.inc
sed -i '' -E '/^[[:space:]]*inform[[:space:]]/s/^/;/; s/^([[:space:]]*)if def\(MML\)&\(~def\(MMLDEF\)\)/\1ifd MML/; s/^([[:space:]]*)if def\(([A-Za-z_0-9]+)\)/\1ifd \2/; s/@([A-Za-z_])/.\1/g' src/*.68k src/*.inc
sed -i '' 's/\\ch\([),*]\)/\\1\1/g; s/\\vol\([),]\)/\\2\1/g' src/mdssub.inc
grep -q '^PACK_Z80		equ		0' src/mdsdrv.inc
sjasmplus src/mdssub.z80 --raw=out/mdssub.bin
vasmm68k_mot -quiet -Fbin -m68000 -no-opt -spaces -L mdsdrv.lst -o mdsdrv.bin src/blob.68k
cp out/mdssub.bin mdssub.bin
ls -l mdsdrv.bin mdssub.bin
