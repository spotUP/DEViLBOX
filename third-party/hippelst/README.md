# Jochen Hippel ST replayer (spec of the native Hippel ST player)

`hippel_st_play.asm` is the song-playing part of the Wanted Team EaglePlayer module
"Jochen Hippel ST" (`Jochen Hippel ST_v4.asm`, `$VER ... V1.3 (13 Dec 2008)`), cut out for the
repo's asm-to-C transpiler (`tools/asm68k-to-c`). `hippelst-wasm/regen.sh` turns it into
`hippelst-wasm/src/hippelst_play.c`.

- Origin: https://gitlab.com/uade-music-player/uade/-/raw/master/amigasrc/players/wanted_team/Jochen_Hippel_ST/src/Jochen%20Hippel%20ST_v4.asm
- Author line in the file: "Jochen Hippel ST replayer for EaglePlayer, written by Jochen Hippel, updated by WT" (Wanted Team).
- Licence: none stated in the file. UADE's `COPYING` says its players are "works with various licenses".
  Committed here on the owner's decision (2026-10-08) after the question was raised; revisit if the
  author or Wanted Team object.
- What was cut (all in the header of the .asm): the EaglePlayer glue, the Paula emulation (`Play_Emu`),
  `Compress` (done in TypeScript, `compressHstSong`), the sample/SID Paula helpers.
- Two edits for the transpiler, both marked in the file: the two word-offset jump tables are written as
  a switch (`lbW000A2A` kept as the switch; `lbW000BAA` as a compare chain), and the default voice
  sequence data (`lbW000E1A`, `lbW000E22`) is included.
