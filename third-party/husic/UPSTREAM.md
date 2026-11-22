# HuSIC (vendored)

- Upstream: https://github.com/BouKiCHi/HuSIC
- Commit: 94c7f916c0df631e77a129cd632c56117886f764 (2020-09-04)
- License: LICENSE.txt (from src/husic/LICENSE.txt)

Contents:
- `hescode/` : HuC-compiled driver (`main.s`) and HuCard startup, unmodified.
- `include/pce/` : HuC/pceas include files, unmodified.
- `src/husic/` : driver C source that `hescode/main.s` was compiled from, unmodified (reference only).
- `pceas/` : pceas assembler source (from HuSIC `src/huc/src/mkit/as`), except `main.c` includes the bundled `overlay.h` (from HuC `include/`) by local name; built by
  `tools/build-pce-player.sh` into a temp dir.
- `stub/` : MODIFIED. `effect.h`, `define.inc`, `sample.h` are hmckc output for the HuSIC sample
  song, with track A replaced by a silent loop. DEViLBOX assembles the driver once with this stub and
  then overwrites the song region (`_sound_dat` at $4400 in bank 3 up to $6000, plus track data in
  banks after the driver) per exported song; see `src/lib/export/pce/husicSong.ts`.
