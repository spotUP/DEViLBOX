---
date: 2026-10-05
topic: StoneTracker (.spm + .sps) replayer route
tags: [stonetracker, amiga, 68k, musashi, paula, deltahuffman, wasm]
status: final
---

# StoneTracker replayer - routes, licence, cost, choice

StoneTracker (Emmanuel Marty & Michael Lavaire, 1995-96) is an 8-track
Amiga tracker. A song is two files: `SPM.<tune>` (song, 'SPM' + version 2)
and `SPS.<tune>` (sample bank, 'SPS' + version 2). Corpus:
`public/data/songs/stonetracker/hypnosphere.spm` (10 918 B) +
`hypnosphere.sps` (440 186 B), byte-identical to Aminet stonefree2's
`Modules/SPM.Hypnosphere` / `SPS.Hypnosphere`. UADE, libxmp, libopenmpt and
FlodJS have no player for it.

## What exists (searched 2026-10-05)

| Source | What it is | Where |
|--------|-----------|-------|
| Aminet `mus/edit/stonefree1.lha` | StoneTracker 1.26 full + `Libs/StonePlayer.Library` (86 748 B), `Libs/StonePacker.library` (8 492 B, the bank packers) | aminet.net |
| Aminet `stonefree2.lha` | `Docs.LHS`, `Includes.LHS`, `CDev.LHS`, `Players.LHS`, `Externals.LHS` + `StoneEx` (the authors' unpacker for their own `SCMk` archive format) + both demo modules | aminet.net |
| Aminet `stonefree3.lha` | `StoneTracker_E.Guide` - user + developer guide, effect list | aminet.net |
| ExoticA wiki | "A DOS/GUS x86 player source was made available by E. Marty" | exotica.org.uk/wiki/StoneTracker - no download found on ExoticA, lclevy's ExoticA mirror, or by web search |

The `.LHS` files are not LHA: they unpack with `StoneEx File=<x>.LHS To=<dir>`
under amitools' `vamos -C 68020` (it needs a 68020; the default 68000 crashes
at PC $24EE). Contents that matter:

* `StonePlayer.doc` / `.Guide` - AutoDoc for the player API (spInstallPlayer,
  spInstallModule(Module, SampleHeader, SampleData), spInitPlayer,
  spSetPlayerPos, spStartPlayer, spSlideSongVolume, spSlideBalance, ...).
* `StonePlayer.I`, `StonePlayer_lib.h` - the file format headers (module
  header, song header, sample header, sample-bank flags; packing methods
  1 DeltaHuffman, 2 CrunchMania, 3 StoneCruncher).
* `StonePlayer_Hard.bin` (83 248 B) - the authors' **no-OS** player: a
  position-independent binary with a jump table at offset 0 ($00 install,
  $08 install module, ... $34 check module). Install takes D0 = AttnFlags,
  A0 = 4140 bytes of chip RAM, A1 = VBR. It hooks level 4 (audio) and
  level 6 (CIA-B) autovectors and borrows level 1 (SOFT) for mixing.
* `StonePlayer_Sys.bin`, `StonePlayer.lib`, `DeliStone`, `EagleStone`,
  `CPlay.c`, `CPlayBin.c` - the OS-friendly variants and C examples.

No format document covers the pattern encoding or the effect semantics
beyond the guide's user-level effect list (52 effect numbers, up to seven
per note, an FX/CTRL track, per-track absolute volume, multi-song), and
no player source exists anywhere I could find.

### Format notes recovered from the Hard player (offsets into the binary)

* Module header: 'SPM', version, name[31], flags, NbSong, NbPattern,
  NbPatternCTRL, PatternLength, private long, then NbSong + NbPattern +
  NbPatternCTRL long offsets. Song: name[31], BPM, NbVoice, CtrlList,
  NbPosition, then NbVoice (+1 if CtrlList) lists of NbPosition pattern
  numbers.
* A pattern is one track. Words (`$1e5c`, `$1730`): byte 0 bit 7 = last word
  of the row; `$7F nn` = this row and nn more rows are empty; byte 0 < 37 =
  note (1-36, 0 none) with sample in byte 1 (0 none); byte 0 >= 37 = effect
  (byte0 - 37, 0..51) with byte 1 as parameter.
* Note n plays the finetune table entry n-1; finetune 0 starts at 856 =
  ProTracker C-1, so StoneTracker note n = DEViLBOX note n + 12.
* Sample bank: 'SPS', version, flags (low 4 bits = packing method),
  NbSamples, 32-byte sample headers, then data. hypnosphere.sps is method 1
  (DeltaHuffman): a 'psn' stream (symbol count - 1, unpacked length 664 242,
  a (symbol, bit length, code) table, then the code as 16-bit words, MSB
  first, each symbol a byte delta). Decoder: StonePacker.library code hunk
  $3CC/$A1C. The Hard player only plays an unpacked bank (its
  spCheckModule rejects one whose last sample ends past the file).

## Routes

1. **Own replayer from the documented format.** The format is only half
   documented (headers yes, pattern packing and effect semantics no). An own
   replayer means re-deriving ~6 000 instructions of 68020 player: 52
   effects, the FX track routing (commands 20-22), per-track absolute
   volume, TFMX-style mixing of tracks 5-8 into Paula 3/4 at a programmable
   period, the hardware-channel DMA restart dance through a CIA-B one-shot.
   Cost: weeks; no reference to check it against except the binary itself.
   Fails to cover: nothing in principle, but every mismatch is invisible
   without an oracle.
2. **asm68k-to-C transpile** (tools/asm68k-to-c). Needs assembler source;
   there is none, only a binary. The transpiler has no 68020 support
   (scaled index, memory-indirect `(a1@(40))@(14)`, `divs.l`, `extb.l`,
   `movec cacr`), no computed `jsr (pc,d1.w*4)` tables, and its Paula
   runtime (paula_soft.c) has no register-level DMA/interrupt model, which
   this player is built around (audio interrupts drive the mix buffers,
   SOFT interrupt runs the mixer, CIA-B timer A the tick, timer B the DMA
   restart). Fails to cover: the interrupt-driven architecture.
3. **UADE.** Would need a hand-written eagleplayer around the Sys or Hard
   player, a stonepacker.library for DeliStone, and a rebuilt UADE player
   tree; per-track mute is impossible after the 8->4 software mix (UADE
   only sees four Paula channels). And UADE is the last resort by owner
   rule (memory: feedback_uade_last_resort).
4. **Run the authors' own Hard player on a 68020 core inside a dedicated
   wasm** - Musashi 4.10 (MIT, Karl Stenerud; 68020 core, used in MAME for
   years) plus a register-level Paula (4 DMA channels, LC/LEN latching,
   AUDx interrupts) and CIA-B (timers A/B, ICR) - ~600 lines of glue, not a
   CPU emulator of our own. DeltaHuffman depack ported to C from the
   StonePacker disassembly (~60 lines). Exact output by construction: it is
   the authors' code. Per-track mute: the seven instructions that read a
   track's volume for the Paula/mix volume lookup (`$a40 $2ac8 $2d24 $2d9e
   $35ae $3624 $369a`, all `move.w aN@(26),dX`) see 0 for a muted track,
   so the track keeps running (positions, effects) but contributes nothing.
   Fails to cover: editing - the grid is a view; edits do not reach the
   player (same shape as TFM / AY today). Not "native" in the owner's
   strongest sense (own C replayer + export).

## Licence

* StoneTracker: re-released free on Aminet in 2001 by Emmanuel Marty with
  Michael Lavaire's agreement - "Feel free to provide these archives for
  download on your own site, as long as you retain this document." The
  Hard player binary is shipped with that readme in
  `third-party/stonetracker/`.
* Musashi 4.10: MIT (readme.txt in `third-party/musashi/`).

## Choice

Route 4. It is the only route that makes the song play exactly as its
authors' player plays it without first inventing a reference, and it is the
oracle any later own-replayer (route 1) must match. The pattern decoding
recovered above is shared: StoneTrackerParser draws the grid (8 tracks,
notes, sample, first effect) from the same rules the player uses.

## Result (built 2026-10-05)

* `stonetracker-wasm/` (Musashi 68020 at 28.375 MHz, Paula box-filtered to
  the output rate, CIA-B on the 709 379 Hz E clock), `public/stonetracker/`,
  `StoneTrackerEngine`, `StoneTrackerParser`, route in
  `AmigaFormatParsers.tryRouteFormat` (bank from `companionFiles`).
* Playback is the player's own: install, install module, init, volume 64,
  balance 128, song 1, start - the order of the authors' `CPlay.c`.
* hypnosphere at 48 kHz: RMS 0.03-0.17 per 0.5 s window from 0 s (track 4
  starts on line 0, quiet: 0C08), BPM 123 / speed 6 = 8.2 lines/s as the
  player counts them; the song ends itself at position 62 line 13 (0F00,
  ~7:50). CPU still running at the end of a sample slice in 5 % of slices:
  no mix underruns at this clock.
* Mute: the seven volume reads above return 0 for a masked track. Mask 0
  -> RMS 0.000000; without track 4 0.1007 -> 0.0568; without track 2
  0.1007 -> 0.0843 (first 3 s).
* **Player bug found and fixed:** the SOFT-interrupt mixer handler's tail
  (`$F3E tst.b 180(a5) / $F42 bne $F1A / $F44 move.w #4,INTREQ`) loses a
  request raised by an interrupt taken at `$F42`/`$F44`: 180(a5) stays set,
  nothing requests SOFT again, the tick stops, the song freezes on one line
  and the overrun guard walks the mix period up to `$3C1`. Measured: frozen
  at 108.036 s, position 13 line 53, CIA-B interrupt pending at PC `$F42`.
  st_machine.c reorders the tail (clear the request, then check) - the same
  three instructions. With it the song plays to its end. Regression test:
  `stoneTrackerPlaysHypnosphere.test.ts` "keeps advancing past the
  SOFT-interrupt race" (fails at position 13 line 53 without the reorder).

Open after this: an own C replayer + SPM export for editing (route 1, with
this wasm as its lock-step oracle); song 2..n selection (the engine plays
song 1, the subsong the C examples default to); CrunchMania (method 2) and
StoneCruncher (method 3) banks are refused - none in the corpus; per-channel
oscilloscope stream (the worklet sends none yet).
