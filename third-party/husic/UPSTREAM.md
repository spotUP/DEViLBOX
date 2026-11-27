# HuSIC (vendored)

- Upstream: https://github.com/BouKiCHi/HuSIC
- Commit: 94c7f916c0df631e77a129cd632c56117886f764 (2020-09-04)
- License: LICENSE.txt (from src/husic/LICENSE.txt)

Contents:
- `hescode/` : HuC-compiled driver (`main.s`) and HuCard startup. MODIFIED: `_vsync_drv` in `main.s` maps DATA_BANK (bank 4) at MPR3 while `_drv_intr` runs, so song tables spilled past the const bank are readable; `_main` starts song 0 at boot instead of calling `_select_song` (an exported HuCard plays at power-on). `_set_note` treats octave nibble $F (a note env step below byte $00, i.e. octave -1) as period << 1 clamped to $FFF instead of freq >> 15 = 0. None of these changes is mirrored into `src/husic/main.c`.
- `include/pce/` : HuC/pceas include files, unmodified.
- `src/husic/` : driver C source that `hescode/main.s` was compiled from, unmodified (reference only).
- `pceas/` : pceas assembler source (from HuSIC `src/huc/src/mkit/as`), except `main.c` includes the bundled `overlay.h` (from HuC `include/`) by local name; built by
  `tools/build-pce-player.sh` into a temp dir.
- `stub/` : MODIFIED. `effect.h`, `define.inc`, `sample.h` are hmckc output for the HuSIC sample
  song, with track A replaced by a silent loop. DEViLBOX assembles the driver once with this stub and
  then overwrites the song region (`_sound_dat` at $4400 in bank 3 up to $6000, plus track data in
  banks after the driver) per exported song; see `src/lib/export/pce/husicSong.ts`.
