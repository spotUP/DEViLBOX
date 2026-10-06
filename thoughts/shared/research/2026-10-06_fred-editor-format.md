---
date: 2026-10-06
topic: Fred Editor (.fred, FrEd v0.90 "Final" modules) - the song data the replayer reads, and why voices diverged
tags: [formats, fred-editor, reverse-engineering, grid, fredreplayer, amiga]
status: implemented
---

# Fred Editor (.fred) song format

A .fred file is the "music module" FrEd v0.90 saves: the replay routine itself (jump table Init / Play /
Stop / FadeOut at +0/+4/+8/+12) assembled together with the song. The replayer source is in the repo:
`docs/formats/Replayers/FredEditor/FREDPLA0.2ED` (labels `Lab2_*`, "C R A P - P L A Y E R"); the same code
sits at the top of every corpus file. Cross-checked against FlodJS `Reference Code/FlodJS/FEPlayer.js`,
NostalgicPlayer `Source/Agents/Players/Fred` (ported to `fred-replayer-wasm/src/fred_replayer.c`) and the
UADE eagleplayer `third-party/uade-3.05/amigasrc/players/fred/fred_new.asm`.

Corpus: `public/data/songs/formats/{bomb jack,fuzzball-title,rebels}.fred`, `public/data/songs/fredmon/fireworks ii.fred`.
All four have one subsong (MaxPart 0). fuzzball-title.fred is the "type 1a" build (two extra bytes after the
jump table, Base 0x44 bytes before the file start); UADE refuses it (`checktype1a` wants `$4efa0010`, the file
has `$4efa0012`), FredReplayer2 and the decoder read it.

Code: `src/lib/import/formats/FredEditorModule.ts` (module <-> model), `fredEditorGrid.ts` (voice walk, cell
codec, grid edits), `FredEditorParser.ts` (song), `fredEffectGlyphs.ts` (private effects),
`src/engine/fred-replayer/fredModuleEdits.ts` (edits -> FredReplayer2), `src/lib/export/FredEditorExporter.ts`.

## Locating the data (FlodJS loader scan, verified on all 4 files)

- D (dataPtr): InitReplay's `move.b Lab2_MaxPart(pc),d1 / cmp.b d1,d0` = `$123A disp $B001`; D = (disp address + disp) - $895.
- Base: the first `move.l a2,(a0) / lea Lab2_Base(pc),a3` = `$214A xxxx $47FA disp`; Base = disp address + disp.
  0 in three files, -0x44 in fuzzball-title.fred.

## Layout

| where | what | evidence |
|---|---|---|
| [0, D+$B0E) | code + replayer variables, verbatim | |
| D+$895 | MaxPart (subsongs - 1) | InitReplay `cmp.b d1,d0; bhi StopReplay` |
| D+$896 | TempoCur (current ticks per line) | |
| D+$897..$8A0 | Tempo[10]: start tempo per subsong | InitReplay `move.b (a2),(a4)` |
| D+$8A2 | long OffsetStruct: instrument records, from Base | ChangeIns `add.l Lab2_OffsetStruct` |
| D+$8A6 | long OffsetPattern: patterns, from Base | InitReplay / NextPattern `add.l Lab2_OffsetPattern` |
| D+$90E | TrkStr: 4 voice structs of $80 (+$40 voice wave buffer) | |
| D+$B0E | BlockTrk: per subsong 4 words = offset (from BlockTrk) of each voice's track list | InitReplay `lea (a1,d0.w)` with d0 = song << 3 |
| ... | track lists, contiguous, up to the patterns | |
| Base+OffsetPattern | patterns: 128 command streams, each ended by $80; then a pad byte to an even address (bomb jack, fuzzball) | |
| Base+OffsetStruct | 64-byte instrument records (Lab2_InsStr) until the first sample's data | FEPlayer loader |
| ... | 8-bit sample data (record long +0 = InsAdr, from Base) | NoteTrack `add.l Lab2_InsAdr` |

### Track list word

- bit 15 clear: pattern offset from the pattern block start (`add.w (a2),a3`).
- bit 15 set: jump - `bclr #15`, re-read the entry at that BYTE offset of the same list (JumpReturn). The corpus
  lists end with `$8000` (back to entry 0) or `$8004` / `$8006` (to entry 2 / 3, after an intro).
- `$FFFF`: StopMusic (all voices stop). Not in the corpus.
- InitReplay takes entry 0 as a pattern without checking it.

### Pattern command stream (Lab2_NewLine)

| byte | meaning | time |
|---|---|---|
| $00-$7F | note: InsPer-scaled period `PeriodTable[n] * InsPer >> 10`, DMA on, ADSR restarted | one line |
| $80 | end: next track-list entry, read on the same tick | 0 |
| $81 s n d | portamento: glide to note n over s lines (`TrkSpd = s * TempoCur`), starting after d lines; the limit uses the CURRENT instrument's InsPer | 0 |
| $82 t | TempoCur = t - global, for every voice | 0 |
| $83 i | instrument record i (`lsl #6` + OffsetStruct) | 0 |
| $84 | pause: DMA off | one line |
| $85-$FF | hold: TrkDur = (256 - byte) * TempoCur (`neg.b`, NoteDelay). FrEd writes only $A1..$FF (1..95 lines; $81..$A0 are MaxCode's command range), longer holds as several bytes of 95 | 256 - byte lines |

A line = TempoCur ticks of the 50 Hz play call. On the tick before a line ends, `cmp.b #MaxCode,(a1); bpl`
cuts DMA when the next byte - $A0 is negative, i.e. before notes $20-$7F and commands $80-$9F, not before notes
$00-$1F or holds (the signed compare; FlodJS's `(b - 160) & 255 > 127` is the same).

### Timing

Every voice starts with TrkDur 1, so the first line is read on the first play call; a note or pause sets TrkDur
= TempoCur, a hold n * TempoCur; $80 and the zero-time commands are read on the same tick. Voices are processed
3, 2, 1, 0 each tick (Lab2_NextVoice, d5 = 3 down). With one tempo for the whole song every event starts on a
line boundary, so **grid row = line** is tick-exact. No corpus pattern has $82; a tempo change read by voice 0
reaches voices 3..1 one tick late (they were processed first) - not modelled, none in the corpus.

### Instrument record (64 bytes, Lab2_InsStr / FEPlayer)

+0 long InsAdr, +4 word RepLen (-1 = all, 0 = one-shot -> BlankSam), +6 word Len (words), +8 word InsPer
(tuning, 428 = ProTracker, every corpus record), +10 vib delay, +11 pad, +12 vib speed, +13 vib amplitude,
+14 master volume, +15..+21 ADSR (attack speed/level, decay speed/level, sustain time, release speed/level),
+22 16 arpeggio bytes, +38 arp speed, +39 type (0 sample, 1 pulse, 2 blend), +40 pulse -, +41 pulse +,
+42 pulse speed, +43 start, +44 end, +45 pulse delay, +46 sync bits, +47 blend speed, +48 blend delay,
+49 pulse shots, +50 blend shots, +51 arp count, +52 12 bytes unused.

## Why voices diverged (ledger: fireworks ii.fred 0.89 / 0.44 / 0.71 / 0.88)

The old parser (FlodJS-derived loader, own grid):

1. **Voices in step.** One display pattern per track-list POSITION, the four voices side by side. Voices are not
   in step: fireworks ii voice 2 opens with two 64-line patterns where voices 0/1 have 128-line ones (line
   totals per pass are equal, 1376, but the boundaries are not); rebels voice 1 plays 36 sixteen-line patterns
   against voice 0's 128-line ones.
2. **64-row cap.** Each display pattern was cut at 64 rows; corpus patterns are 128 and 160 lines, so the rest of
   every long pattern was dropped (fireworks: 234/166/65/459 notes shown of 342/252/98/522).
3. **Holds counted wrong.** A hold of n lines became n - 1 empty rows, and a note one row: durations shrank by a
   line per hold, so the rows were not ticks.
4. **Jumps ignored.** The grid ended at the longest list; a voice whose list loops (`$8004`) stopped.
5. Note naming FE + 12 (the comment's "FE note 1 = C-1 (period 856)" was wrong: byte 36 plays 428).

Voices 1 and 2 scored lowest because their patterns cross the 64-row cap and the step boundaries most often;
there is no command the old parser decoded wrongly - it decoded the commands but laid them out on the wrong
timeline.

## The grid now

- Each voice walks its own list (`walkFredSong`): lines of each pattern in order, jumps followed. Song length =
  the longest voice's pass up to its first jump back (or the $FFFF line); shorter voices go on through their
  jump, as in the player (rebels: voices 0/2 jump back at line 2912, voices 1/3 at 3040 -> 3040 rows).
- Row = line; cut into 64-row display patterns, order = 0..n-1; speed = Tempo[subsong], 125 BPM (50 ticks/s).
- Cell = one line of one pattern (FredLineRef): note = byte - 11 (ProTracker naming through InsPer 428: byte 36
  = 428 = C-2 = 25; bytes 12..107 -> 1..96), pause = note off (97), $83 = instrument column (i + 1), $82 = Fxx,
  $81 = private P (lines) / T (target note byte) / R (delay, only when non-zero; then the channel shows 3 effect
  columns), a note byte outside 12..107 = private N. Private block 0x70..0x73 (`fredEffectGlyphs.ts`).
- Canonical encoding of a line list: commands tempo, portamento, instrument; holds in chunks of 95. Every one of
  the 512 corpus patterns IS canonical, so decode -> encode is byte-exact with no carrier.

## Edits

A grid edit replaces the line the cell shows, in that pattern (`applyFredGridEdits`), and the module is
re-encoded: later patterns move, the track entries, OffsetStruct and every InsAdr move with them, the pad byte
keeps the records on an even address. The store edit path (`liveCellEdits` -> `fredModuleEdits`) makes the new
module the song's module and hands it to FredReplayer2, which swaps the song data in place
(`fred_replace_module`): each voice keeps its track-list position and its place in time within its track
(lines, then ticks), so an edit ahead of the playhead is heard when it is reached and nothing restarts. The
other grid cells showing the same pattern line are updated too. The previous `setCell` posted to a WASM export
(`_fred_set_cell`) that was never built.

## Verification (2026-10-06)

- Byte-exact decode -> encode on all 4 corpus files; every pattern equals its canonical encoding; the exporter
  returns the file for an unedited song (`fredEditorRoundtrip.test.ts`, exporter ratchet pattern-match -> byte-exact).
- UADE's Paula log, read with the replayer's own note-on burst (AUDxLC, LEN, VOL 0, PER): every grid note-on of
  every voice over the whole song, in order, at the exact period, within 40 ms (one tick + the 10 ms log grain)
  of its row - fireworks ii 342/252/98/522, rebels 482/966/693/1302, bomb jack 190/258/336/0
  (`src/lib/import/__tests__/fredEditorGridMatchesPlayer.test.ts`).
- gridVsPaula (no --secs), before -> after:

  | song | before | after |
  |---|---|---|
  | fireworks ii.fred | 0.96 / 0.59 / 0.67 / 0.99 (ledger 0.89/0.44/0.71/0.88) | 0.99 / 0.79 / 1.00 / 1.00 |
  | rebels.fred | 0.70 / 1.00 / 0.90 / 0.99 | 1.00 / 1.00 / 1.00 / 0.97 |
  | bomb jack.fred | 0.48 / 0.98 / 0.99 / 0 (voice 3 silent) | 0.72 / 1.00 / 1.00 / 0 (voice 3 silent) |
  | fuzzball-title.fred | UADE refuses | UADE refuses |

  The remaining gaps are the tool's Paula reading, not the grid (the exact reading above matches every note):
  the replayer writes AUDxPER twice in a note's tick (NoteTrack, then ModifySound), so gridVsPaula's
  loop-reload rule ("the first sample start after a note-on, before the period is written again") no longer
  applies, and the next tick's loop / BlankSam pointer write reads as a second note (fireworks voice 1 shows
  37,36 where the grid has 37; bomb jack voice 0 a -1 after each note). Counting only a period written on a later
  tick as "written again" (`if (nowMs > v.lastTriggerMs)`) gives 1.00/1.00/1.00/1.00, 1.00x4, 0.99/0.95/1.00 -
  not applied: the tool is shared and the change moves every format's score.
- Edits: `src/engine/__tests__/fredEditReachesReplayer.test.ts` - the store's setCell re-encodes the module,
  FredReplayer2 gets it, the mirrored cell follows; in the worklet the swapped module plays the edited note at
  its row, every tick before it unchanged.

## Open

- Subsongs: the parser takes subsong 0 (no corpus file has more) and FredReplayer2 is loaded without a subsong.
- FredReplayer2 (NostalgicPlayer port) differs from the asm in two places not touched here: voices processed
  0..3 (asm 3..0; matters only with $82), and the pre-line DMA cut tests `byte < $A0` (asm: cut only before
  notes $20-$7F and $80-$9F). Both audible only at a tick's resolution; neither measured.
- FredReplayer2's final-format converter splits patterns by scanning for $80 bytes, not by commands: an argument
  byte $80 ($83 $80, a portamento byte) would split a pattern. None in the corpus; the TS codec parses commands.
- Order of $83 before $81 on one line, two commands of a kind before one line, holds not chunked at 95, and
  trailing commands before $80 are not representable as lines (decode throws on the latter two; the first and
  third would re-encode differently). None in the corpus.
