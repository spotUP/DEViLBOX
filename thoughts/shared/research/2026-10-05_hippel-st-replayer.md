---
date: 2026-10-05
topic: How DEViLBOX can play Jochen Hippel's Atari ST formats (.sog TFMX-ST/MMME, .soc COSO-ST)
tags: [hippel, atari-st, ym2149, uade, sc68, sndh, tfmx, coso, F4, B12, grid, reverse-engineering]
status: implemented
---

# Hippel ST replayer: routes (2026-10-05)

Ledger rows: F4 (`thoughts/shared/plans/2026-10-02-format-breakage-todos.md`, `.sog` silent, owner decided
option (b) 2026-10-04) and B12 (`thoughts/shared/plans/2026-10-05-broken-formats-sweep.md`, `.soc`/`.sog` need an
"Atari ST YM replayer").

All numbers below were measured today headless, with DEViLBOX's own bundles (`tools/uade-audit/uadeRenderCore.ts`
for UADE, `src/test/wasm/webBundle.ts` for sc68). Probe scripts were throwaway (not committed). "rms" = RMS of the
rendered float samples; the flat UADE "buzz" signature is rms 0.002-0.006 with no per-second variation.

## Format facts (measured)

- `.hst` = Hippel's original ST replayer (68000, position independent) in front, then song. The first 2632 bytes of
  all five `crown *.hst` are replay code (five different md5, same length); `TFMX` header at offset 2632. The file
  starts with `bra.w` x4 (init +0, exit +4, play +8, 4th at +12): the SNDH calling convention minus the `SNDH` tag block.
- `.sog` = the song only (`TFMX\0` 11 files, `MMME` 3 files, and 2 that already carry the replayer: `grand monster
  slam.sog`, `wings of death intro.sog`, they start with `60 00 00 06`). Corpus `Hippel ST/Jochen Hippel`: 16 files.
- `.soc` = `COSO` + 7 offsets + inner `TFMX` (71 of 96) or `MMME` (25 of 96) song at 0x20, replayer-less, packed.
  Desktop corpus `Hippel ST COSO/Jochen Hippel`: 96 files. Repo: 1 file.
- Routing today: `eagleplayer.conf` maps `soc` -> `JochenHippelCOSO` (Amiga, Paula: renders silence on ST data),
  `sog` -> `JochenHippel` (Amiga: `module check failed`), `hst,sdc` -> `Jochen_Hippel_ST`.
  `FormatRegistry.ts:383-392` sends `.soc` to the native `HippelCoSoParser` (Amiga COSO parser) with UADE fallback;
  `FormatRegistry.ts:1102-1112` `jochenHippelST` registers `.sog` / `hst.` / `mdst.` prefixes.
  `JochenHippelSTParser.ts` is a stub grid (detection mirrors the WT asm Check2). No ST/YM replayer exists in
  `src/lib/import/formats` (grep Hippel: `HippelCoSoParser`, `JochenHippel7VParser`, `JochenHippelSTParser`, `TFMXParser`).
- The same UADE issue is known upstream: https://gitlab.com/uade-music-player/uade/-/issues/1 ("All Atari ST Hippel
  tunes fail to load": `.sog/.soc` are handed to the Amiga players).

## Routes

### R1. `.soc` through UADE's ST player: rename the hint to `hst.*` (FOUND, WORKS)

`Jochen_Hippel_ST` (Wanted Team EaglePlayer, "Jochen Hippel & Wanted Team", readme says it supports "TFMX, MMME,
COSO for TFMX and MMME songfiles", with "the best known Atari ST soundchip emulator on the Amiga") accepts COSO
files, which `soc` never reaches because the prefix routes to the Amiga COSO player.

Measured: all 96 corpus `.soc` rendered 4 s through the shipped `public/uade/UADE.wasm` with filename `x.hst`:
- TFMX-inner: 59 of 71 audible (rms 0.03-0.17, per-second variation, i.e. real music).
- MMME-inner: 21 of 25 audible.
- Not audible: 5 TFMX + 4 MMME flat buzz 0.004 (`chambers of shaolin title`, `spacedemo`, `stormlord original`,
  `teramis highscore`, `unknown`, `atomino title`, `demo music11`, `shaolin remix`, `spiel`); 7 `wings of death 1-7.soc`
  fail to load: two-file format, need the `SMP.*` sample companion (player readme note 3).
- 80 of 96 sounding. `ghostbattle titletune.soc` (the repo file): rms 0.131 steady.
- Source: https://gitlab.com/uade-music-player/uade/-/tree/master/amigasrc/players/wanted_team/Jochen_Hippel_ST
  (`src/Jochen Hippel ST_v4.asm`, 2990 lines, readme `EP_JHippelST.readme`). Licence: UADE repo `COPYING` says "works
  with various licenses"; the WT player is distributed with its source by Wanted Team (https://exotica.org.uk). Per-file
  licence of the asm not stated in the file: unverified.
- Effort: small. Pass the UADE load a `.hst`-named hint for `.soc` (the hint is where UADE picks the player; the
  eagleplayer.conf is prefix keyed) and make `hippelCoso`'s `/\.(hipc|soc|coso)$/` stop claiming `.soc` for the native
  Amiga parser (`.soc` is ST only; `.hipc`/`.coso` stay Amiga). Add a test that drives the loader with a `.soc` and
  asserts the player name `Jochen Hippel ST` plus rms > 0.05 (one reachability test per feature).
- Fails to cover: the 16 above; `.sog` with raw replayer-less TFMX; editability (UADE only = still stub grid /
  heuristic scan grid).

### R2. `.hst`-with-code and `.sog`-with-code wrapped as SNDH for sc68 (WORKS for code-carrying files only)

- sc68 SNDH loader needs `SNDH` at offset 12. The `.hst` already has bra init/exit/play at 0/4/8, so a wrapper is:
  keep bytes 0-11, insert a tag block (`SNDH TITL.. COMM.. TC50 ##01 HDNS`, even-aligned), append the rest, add the
  block length to the three `bra.w` displacements at +2/+6/+10 (the 4th bra and all later PC-relative references only
  point forward past the insertion, they do not change).
- Measured: `crown arabia.hst` wrapped this way renders in `public/sc68` (rms 0.10-0.15, peak 0.27, varies per second).
  Raw `.hst` without wrapping: `_sc68_wasm_init` returns -2.
- Fails: `.sog` (11 TFMX + 3 MMME) and `.soc` have no replayer. Prepending the first 2632 bytes of each of the five
  crown replayers and wrapping: peak 0.000 for every `.sog` x replayer pair (sc68), and under UADE as `.hst`: buzz
  0.002-0.006 except one hit (`cuddlymusic.sog` + crown arabia replayer rms 0.062). So replayer variants do not
  interchange ("several different formats of TFMX replayers" in the WT readme); you need the replayer that matches the
  song. Two corpus sogs carry theirs (`grand monster slam`, `wings of death intro`): both play through UADE as `.hst`
  (rms 0.02-0.11).
- Effort: small for the wrapper; open-ended for finding replayers. Not a general `.sog`/`.soc` answer; no new value for
  `.hst` (UADE already plays them).

### R3. SNDH archive conversions of the same tunes (WORKS, corpus route)

- Source: https://sndh.atari.org/sndh/sndh_sf/mad_max/ (357 SNDH files / 941 subtunes by Mad Max per
  https://sndh.atari.org/?p=composer&name=Mad+Max). Folders `games/` (55 files: `astaroth.snd`, `spacball.snd`,
  `5th_gear.snd`, `grndmons.snd`, `jambala.snd`, `wod.snd`, `enchland.snd`, `ghostbat.snd`, ...), `demos/`, root
  (`car_race.snd`, `demoshrt.snd`, ...). Files are ICE-packed SNDH; sc68 depacks them.
- Measured: `astaroth.snd` (6272 B), `spacball.snd`, `5th_gear.snd` render in the shipped sc68 wasm: peak 0.17 / 0.53 /
  0.53, music-like per-second variation. The other FormatRegistry fact: `sndh` regex is `\.(sndh|sc68)$`
  (`FormatRegistry.ts:1833`), but these archive files are `.snd`; `Sc68Parser.ts:211` already strips `.snd`, the registry
  does not list it.
- Licence: tunes are copyright Jochen Hippel; the archive states no redistribution licence in the pages read. Unverified;
  treat as the owner's call, same as the Modland files already in the corpus.
- Effort: trivial (download, add `.snd` to the registry ext).
- Fails: it plays the archive's conversion, not the owner's `.sog`/`.soc` bytes; no `.sog` editing; not every `.sog`
  has a SNDH twin (coverage by tune name only, owner's 16 sogs: at least astaroth, starballs, fifth gear, jambala,
  grand monster slam exist by name; the rest unchecked).

### R4. Fix the raw-`.sog` path in the WT ST player (OPEN, NOT RESOLVED)

`Jochen Hippel ST_v4.asm` handles raw TFMX: `Check2` (line 343) returns 2, `InitPlayer` (line ~590) takes the
non-`COSO` branch, calls its own `Compress` (TFMX -> COSO in memory) and plays. UADE accepts the file (no module check
failure) and plays a flat 0.004 buzz. What is wrong is not measured. Candidates from the asm (all unproven): the
`CheckReplay` loop (lines ~690-730) derives the MFP timer value, the "ST periods table" flag (`$3C686`) and the
"standard sample" flag from the replay code in front; with no replay code in front they default (period `$248`,
type 0), and the `LongType` flag comes from `tst.w 64(A0)` on the pre-compress image. A raw sog therefore plays with the
wrong timer/period defaults. Needed measurement: trace the player's YM register writes for `demo music10.sog` vs the
SNDH archive twin, or run `tools/uade-audit/traceModuleReads.ts`. Cheapest hypothesis test: prepend a minimal stub
carrying only the right `FA23`-style timer byte and the period-table marker.
- Effort: medium (a debugging session on 68k asm; owner decision F4 option (b) already points here).
- Fails: needs the 68k debugging done; result is still UADE-only (no native grid).

### R5. Native TFMX-ST decoder + YM2149 model (the long-term goal)

- Input: the WT asm (`Jochen Hippel ST_v4.asm`, ~3000 lines; includes `Compress` and the sequencer; the replayer is
  Jochen Hippel's own code) is the specification of the format and of every command (E1/E2/E5-EF sound macro
  commands, SID `$EE`, digi samples); the SNDH archive twins are reference renders (sc68 dump) to lock-step against.
- Hardware side exists: `public/sc68` (YM2149 emulation, libsc68 / emu68), `aylet` AY, `libtfmxaudiodecoder` (TFMX
  sequencer, Amiga only: rejects ST, `tfmx_load_module failed: -3`, F4).
- Alternative in the same class, cheaper than a clean port: run the original 68000 replay code (it IS position
  independent 68k with SNDH-style entry points) inside a 68000 core with YM output, i.e. sc68, after supplying the
  matching replayer. Requires a replayer corpus per TFMX variant: `.hst` and SNDH archive files contain them, `.sog` does
  not.
- Effort: large (days). Gives editable grids, native export, mute/solo per voice.
- Other players checked: NostalgicPlayer (https://github.com/neumatho/NostalgicPlayer) documents Hippel / Hippel COSO /
  Hippel 7V for Amiga only (no ST variant found in its docs; licence not verified here); libxmp/OpenMPT: no Hippel ST;
  aylet/ayfly/ZXTune are AY, not YM replay of TFMX. HVSC/SID is unrelated. No standalone open source for "Hippel ST"
  other than the WT asm. The only upstream "ST COSO" replayer source found is that asm; the original Atari replay
  routine (Hippel's, "a big mess", per Atari-Forum thread about Amiga TFMX
  https://www.atari-forum.com/viewtopic.php?t=9621&start=25) is not published as source in anything I could fetch.

## Recommendation

1. Do R1 now: route `.soc` to `Jochen_Hippel_ST` (80 of 96 corpus files sound). Smallest change, evidence measured.
2. Add R3's `.snd` to the sndh registry regex and offer SNDH twins as the interim for `.sog` tunes that have one.
3. For raw `.sog` (F4 option (b)) do R4: debug why the WT player buzzes on replayer-less TFMX (timer/period defaults hypothesis);
   do not wrap crown replayers (measured: no interchange).
4. R5 (native TFMX-ST + YM) stays the long-term goal; use the WT asm as spec and SNDH archive renders as oracle.
5. Unchecked: of the 16 `.soc` that fail, 9 buzz (debug pass, same as R4) and 7 `wings of death` need `SMP.*` companions; none of the 80 passes is verified by ear (rms and variation only).

## Addendum: local copies of the player source (found by a background filesystem search after the main run)

- `/Users/spot/Code/Up_Rough_Demo_System/amiga/vendor/uade-3.05/amigasrc/players/wanted_team/Jochen_Hippel_ST/Jochen Hippel_v1.asm`
  (UADE 3.05 vendored copy; this is the older v1 that `JochenHippelSTParser.ts` mirrors; the gitlab master file read above is v4,
  which fixes digi samples and adds first-SID `$EE`). Same vendor tree has `hippel-coso/HippelCOSO_v1.0.s` (Amiga COSO).
- `/Users/spot/Code/Reference Docs/Replayers/Hip Hippel/` (`Hippel.s`, `HippelCOSO_v1.0.s`, `HippelCOSO_v1.0_2.s`) and
  `/Users/spot/Code/Reference Docs/Replayers/DeliPlayers/Delirium/Hippel.s`: Amiga Hippel replayers, not ST.
- Consequence: R4 (debug the raw-`.sog` path) and R5 (spec for a native port) need no download; use v4 from gitlab for the
  current behaviour. Not read in full here.


## 2026-10-06: the song reversed, the grid decoded (provenance row `jochenHippelST`, C -> A)

Source read: `Jochen Hippel ST_v4.asm` (uade gitlab master, `$VER ... V1.3 (13 Dec 2008)`; UADE ships the V1.2
binary `players/Jochen_Hippel_ST`). Routines: `Check` (lbC0001C0), `InitPlayer`, `Compress` (TFMX -> COSO),
`Init` (lbC0008FE), `Play` (lbC0006D6 / lbC000784 row step / lbC000854 note), `Play_Emu` (YM on Paula).
Code: `src/lib/import/formats/JochenHippelSTModule.ts` (model, codec, Compress port, sequencer),
`JochenHippelSTSong.ts` (grid cells, playback image, edits, export), `JochenHippelSTParser.ts` (grid, route),
`src/lib/export/JochenHippelSTExporter.ts`.

### Corpus (8 songs) - what they really are

| file | song | prefix | note |
|---|---|---|---|
| `hippel-st/crown {arabia,england,japan,russia,viking}.hst` | **COSO** at 2600 (word pointers), TFMX header at 2632 | 2600 bytes replay code (lea at 54 and 104 -> 2600) | the old doc said "TFMX header at 2632": that is the header INSIDE the COSO |
| `hippel-st/demo music10.sog` | raw TFMX at 0 | - | table cut 4 bytes short |
| `formats/astaroth.sog` | raw TFMX at 0 | - | table cut 2 bytes short, 7 subsongs (4-7 = step 208, no notes) |
| `hippel-st-coso/ghostbattle titletune.soc` | COSO at 0 | - | 1151 bytes after the table (digi or text, kept verbatim) |

**R4 root cause found (the `.sog` "buzz"):** both raw rips are a few bytes shorter than InitPlayer's size sum
(`(2+snd+vol)*64 + (1+pat)*patSize + (1+steps)*12 + (2+subsongs+table)*6 + 32`): `sub.l D1,D0; bmi Short` ->
`EPR_ModuleTooShort`, so UADE never played them (the 0.004-0.007 flat output is "nothing"). With the table's zero
bytes put back, demo music10 plays (peak 0.34) and astaroth (0.17); the timer/period-default hypothesis was wrong.
The playback image (below) carries the full table, so both now play in the app.

### Song structures (all big-endian; counts are n - 1 words)

TFMX header (32 bytes): `+0` magic TFMX/MMME, `+4` sound sequences, `+6` volume sequences (= instruments), `+8`
patterns, `+10` steps, `+12` pattern size (bytes; 64 or 128), `+14` unused, `+16` subsongs (n; the table holds
n + 1 entries), `+18` 6-byte table entries - 1, `+20..31` copied verbatim.

Raw TFMX: header, sound sequences x 64, volume sequences x 64, patterns x patternSize (rows of note, info; note 0 =
empty, 1 = pattern end), steps x 12, subsongs x 6 (first step, last step, speed), table x 6, then digital drums
(a table of 8-byte entries whose first word is $80/$100) or a text or nothing.

COSO: `+0` 'COSO', `+4` sound pointer table, `+8` volume pointer table, `+12` pattern pointer table, `+16` steps,
`+20` subsongs, `+24` table, `+28` digi (the player writes it), `+32` the TFMX header. Pointers are word offsets
from the song start, or longs when the first sound pointer word is 0 (`TypeAdr`; also drives `TypePlay`).
Pattern = byte stream: `FF` end; `FE w` set the voice's wait; `FD w` set it and rest this row; else note, info,
and one more byte when info & $E0. Compress (ported, `compressHstSong`) packs a raw pattern: leading empty rows ->
one FD, a note's trailing empty rows -> its wait (FE only when the wait changes), the extra byte = the byte before
the note in the raw pattern (previous row's info; row 0 takes the pattern's last byte). Sequences are cut after
the last $E1 (or $E0 + offset).

Step (12 bytes): three voices x (pattern, transpose s8, sound transpose s8, command). Command `$Fx`: the voice is
attenuated by x for the step (volume = macro - $30); `$Ex`: speed = x from the next row on (the counter was
reloaded before the voices ran; Init reads only $Fx of the first step). **Three voices** (YM A, B, C); the YM
emulation writes A -> Paula 0, B -> Paula 3, C -> Paula 2; Paula 1 is the digi voice.

Sequencer (per player tick, 50 Hz): the global counter (init 1) reloads from the speed (subsong word +4; 0 -> 4);
on reload each voice counts down its wait and, when negative, reads: FF -> next step (voice 0 counts steps; after
`last` it ends the pass: SongEnd, all voices back to `first`), FE -> wait, FD -> wait + rest, note -> trigger.
Note trigger (lbC000854): $1E = note byte, $1F = info, $2C = extra; note < $80 sets the instrument: volume sequence
`((info & $1F) + sound transpose) & $FF`, 0 when past the last; its sound sequence, or `extra` when info & $40.
info & $20 = portamento by `extra` per tick. Pitch = YM table[(macro + $1E + transpose) & $7F]; table index 0 =
$EEE = 32.7 Hz = C-1.

### Grid (what the parser builds)

One pattern per step (rows = the rows the step lasts: 64 for the crowns, 32 for the others; all three voices end
every step together in the whole corpus - checked, the parser throws otherwise), three channels, order = the
subsong's steps. Cell = the note event the voice reads on that row: note = (note & $7F) + transpose + 13 (XM; C-1),
instrument = volume sequence + 1 (none for a note >= $80, which triggers no instrument). Row 0 volume shows `$Fx`;
`$Ex` is the speed effect on the step's second row. Hidden bits (note bit 7, info top bits, extra byte, raw
empty-row info bytes) stay in the model and survive edits. Subsongs: UADE numbers them from 1
(`uadeEditableSubsongs.first = 1`, UADEEngine.loadTune adds it).

### Playback image and edits

A packed stream moves every later row when a note is added, so UADE is handed a playback image of the same song
(`HstSongEdit.image`): the COSO song (a raw song first packed by the Compress port) whose patterns are stored
one event per row (empty row = `FD 00`, wait always 0) in slots with room for three bytes per row; the source file
sits in the pattern region (unreferenced, tag `DVBXHSTS`) so the exporter can write the edits into the file's own
encoding. A grid edit = `UADEPatternLayout.writeCell` (new, for layouts whose cell bytes depend on their step):
the changed byte run of that pattern's slot, written by `UADEChipEditor.patchPatternCell`; there is no chip-RAM
read-back for such a layout. The export decodes the source, writes edited cells only (raw rows in place, COSO
patterns packed again with the Compress strategy and the pattern region re-laid), byte-exact when unedited.
Limit: an edit that changes a row's length (empty <-> note, or a 3-byte note) moves the rows after it in that slot;
a voice inside that pattern at that moment may misread the rest of the pattern (until its FF). Not measured.

### Proof (2026-10-06)

- Byte-exact: decode/encode on all 8 files; the image gives back its source; unedited export == file
  (`jochenHippelSTSong.test.ts`; exporter harness: `jochenHippelST byte-exact 6058/6058`).
- Packing the decoded rows again reproduces every pattern stream the player reads (all used patterns, 8 files);
  the Compress port's output equals the player's own packed copy in UADE memory byte for byte (2524 and 6222 bytes).
- Player oracle: the V1.2 binary's voice records (3 x $34 bytes ending $FE before the period table) read every
  half tick. Over one full pass of every subsong of every file (probe, 2026-10-06), every voice's reads equal the
  decoded events exactly, in order (e.g. crown arabia 705 / 903 / 775 reads, ghostbattle 705 / 1198 / 1604,
  astaroth subsong 3 1952 / 1556 / 928), on the grid's rows (offset within the half-tick sampling jitter; UADE's
  clock runs 1.0001x). CI checks 20 s of every file plus astaroth subsong 2 (`jochenHippelSTGridMatchesPlayer.test.ts`).
- The image plays the song: the same voice reads row for row, and the same Paula register writes (values, order)
  as the original for 20 s (crown arabia, demo music10, ghostbattle). Sample output differs slightly: the writes
  land at other cycle positions (the player's DMA wait loops), not other values.
- Edits: two edits (a note on an empty row, a note moved a tone) through `UADEChipEditor.patchPatternCell` at 1 s
  are read by the player when their rows come (crown arabia COSO, demo music10 raw).
- gridVsPaula is blind to this player: it writes AUDxLC only when a YM voice switches tone/noise, so its note-on
  rule finds 0 events on the three YM voices (crown arabia: Paula 0/2/3 = 0 events; ghostbattle: 0 on all). The
  UADE scan grid the app showed for .hst/.soc uses the same rule (inference: not run, needs the worklet). Heard
  pitch instead (probe): at each grid note-on tick, the YM period Paula is given ((P - 1) / 7), per instrument's
  commonest offset (its sound sequence's first note offset), per channel:

  | song | ch A | ch B | ch C |
  |---|---|---|---|
  | crown arabia | 0.96 | 0.96 | 0.92 |
  | crown england | 1.00 | 0.97 | 1.00 |
  | crown japan | 0.99 | 0.96 | 0.79 |
  | crown russia | 0.92 | 0.94 | 0.84 |
  | crown viking | 0.95 | 0.97 | 0.99 |
  | demo music10 (sub 1 / 2) | 0.90 / 1.00 | 0.90 / 1.00 | 0.83 / 1.00 |
  | astaroth (sub 1 / 2 / 3) | 0.92 / 0.95 / 0.89 | 0.94 / 0.90 / 0.88 | 1.00 / 0.81 / 0.88 |
  | ghostbattle | 1.00 | 1.00 | 0.95 |

  The misses are the player's own pitch moves on the first tick (arpeggio and vibrato sequences, portamento
  notes, noise-mode drums): the note read is proven exact by the voice records above.
- Before: `.sog` stub grid, 0 notes, and no sound (module too short); `.hst` / `.soc` the UADE scan grid.

### Open

- The live-edit misread window above (length-changing edit inside the pattern a voice is playing).
- Volume (`$Fx`) and speed (`$Ex`) step commands are shown, not editable; instruments (sound/volume sequences)
  are not decoded into an editor; the YM sound itself is UADE's ST emulation on Paula.
- `.hip` / `.mcmd` (the Amiga "Jochen Hippel" SOG./MCMD. player) keep the old detection and empty grid
  (provenance row `hip`), untouched here.
- MMME songs and long-pointer COSO are handled by the code paths but have no corpus file (not measured).
