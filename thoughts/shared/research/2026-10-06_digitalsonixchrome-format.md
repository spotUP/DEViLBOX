---
date: 2026-10-06
topic: Digital Sonix & Chrome (DSC.*) - the song data reversed from the replayer
tags: [formats, dsc, digitalSonixChrome, reverse-engineering, uade, grid, codec]
status: implemented
---

# Digital Sonix & Chrome (DSC.*) format

Source: `third-party/uade-3.05/amigasrc/players/wanted_team/DigitalSonixChrome_v1.asm`
(Wanted Team eagleplayer around the "Dragon's Breath" (1990) replayer by
Andrew E. Bailey & David M. Hanlon). Every claim below is read from that asm
and checked against the 14 corpus files (12 in
`public/data/songs/digital-sonix-and-chrome/David Hanlon/`, plus
`digital-sonix-and-chrome/dragon'sbreath ingame 1.dsc` and
`formats/dragon'sbreath_fanfares.dsc`, both duplicates). No module-read trace
was needed: the asm is complete for the music path.

Code: `src/lib/import/formats/DigitalSonixChromeModule.ts` (model, decode,
encode, subsongs), `src/lib/import/formats/DigitalSonixChromeParser.ts` (grid),
`src/engine/uade/encoders/DigitalSonixChromeEncoder.ts` (cell codec),
`src/lib/export/DigitalSonixChromeExporter.ts` (file export).

## What was wrong before

The old parser read the track block as rows of 4-byte "sequence entries" and
stashed the bytes in invisible carriers: byte-exact, but every cell was empty
(0 notes in all 14 files), so `withNativeThenUADE` fell back to the UADE scan
grid. The header fields were also misnamed (byte 2 is the RECORD count, byte 3
the ENTRY count; the old docs/parser swapped them).

## File layout (big-endian)

| offset | size | field | read by |
|---|---|---|---|
| 0 | word | tempo | InstallSamples: `speed = (tempo/2 + $5DC) / tempo` (lbC00771A = signed 32/32 divide, truncating) -> lbB008082 |
| 2 | byte | nRecords | Check2 `D0`, InitPlayer `Samples`; record table is nRecords x 18 |
| 3 | byte | nEntries | Check2 `D1`, InitPlayer `Length`/SubCheck; entry table is nEntries x 6, the last entry all zero |
| 4 | long | pcmSize | Check2 `D2`; sample data at the end of the file (`last pcmOffset + last length == pcmSize`) |
| 8 | long | trackLen | Check2 `D3`, InstallSamples lbL008324; the track block is 4 x trackLen bytes |
| 12 | nEntries x 6 | entries | |
| 12 + nEntries*6 | 4 x trackLen | tracks | |
| + 4*trackLen | nRecords x 18 | records | lbL008314 |
| + nRecords*18 | pcmSize | 8-bit signed PCM | lbL00806C |

Every corpus file ends exactly at the end of the PCM; nothing else exists.

### Entry (6 bytes)

| +0 long | firstRow - row offset into each track (InstallSamples adds the track block address in place: `ADD.L lbL00830C,(A0)`) |
| +4 byte | repeats - how many times the block plays (lbL00807E); **0 ends the subsong** |
| +5 byte | rows - rows in the block (compared with the row counter lbL008076 after it is incremented, so 0 would mean 2^32 rows; never in the corpus) |

### Tracks

Four parallel byte tracks of `trackLen` rows. On each row the player reads
voice v's byte at `ptr + v * trackLen` (lbC005400: lbL008330 + 0 /
lbL008324 / lbL008328 = 2x / lbL00832C = 3x) and then `ptr++`. A byte
0..nRecords-1 triggers that record on the voice (lbC005936); `$FF` triggers
nothing (the previous sound keeps playing). There is no effect column, no
volume column, no note-off: **one byte per voice per row is the whole song**.

### Record (18 bytes) - a sample at a fixed pitch

| +0 word | period | written to AUDxPER after the DMA handshake |
| +2 long | length (bytes) | AUDxLEN = length/2 |
| +6 long | loopStart (bytes) | repeat part = [loopStart, length) |
| +10 word | repeats | IRQ counter = repeats + 1 (lbW00808C) |
| +12 long | pcmOffset | relative to the PCM block (InstallSamples relocates it in place) |
| +16 byte | volume | `EXT.W`, then `AND #$7F` in ChangeVolume |
| +17 byte | pad | never read |

The record IS the note: pitch, sample, volume and sustain all come from it.
Several records share one sample at different periods (ingame 1: records 0-3
are one sample at periods 428/381/359/320). Volume-0 records exist (silencers).

Sustain (Audio0-3 handlers): the audio IRQ fires each time Paula latches a
block. Counter = repeats+1. First IRQ: counter-1; if still non-zero, point
AUDxLC/LEN at the repeat part; when it reaches 0, point at the 4-byte `Empty`
chip buffer (length 2 = silence); the next IRQ disables the voice's interrupt
and marks the voice free (lbB0080AC..AF = $FF). So a record plays its sample
once, then its repeat part `repeats` times, then silence.

### Song order, subsongs, tempo

- Init(dtg_SndNum = n) walks the entries and starts after the n-th entry whose
  repeats byte is 0. InitPlayer counts subsongs as the number of repeats-0
  entries, so the trailing all-zero entry is a subsong too (fanfares has 4;
  the 4th starts on the terminator and plays nothing useful).
- Row step (every `speed` ticks, Play/lbC005400): read 4 bytes, trigger, row
  counter++; at `rows`: counter = 0, repeats--; if repeats left, restart the
  block; else next entry; if that entry's repeats byte is 0, go back to the
  subsong's first entry and call SongEnd.
- Tick = the DTP_Interrupt call (50 Hz). The first row plays on the first tick
  (lbB008083 starts at 1).
- Corpus tempos: 261..418 -> speed 4..6.

### Sound-effect path (not song data)

lbB0080B0..B3 are per-voice sound-effect requests with a priority compared
against lbB0080AC..AF; the game set them, the eagleplayer never does (they
stay $FF). While a voice is "busy" (AC..AF >= 0) the song's byte for that
voice is replaced by $FF. In UADE this never happens for music.

## Grid mapping (what the parser builds)

- One pattern per distinct (firstRow, rows) block named by any entry with
  repeats > 0, all subsongs, in file order; named `Rows a-b`. Row r of channel
  v = file byte `tracksOff + v*trackLen + firstRow + r`. Across the corpus the
  patterns cover every track byte (tested).
- Order list = the chosen subsong's entries, each `repeats` times.
- Cell = record trigger: note = periodToNote(record.period) (ProTracker naming),
  instrument = record index + 1, `cell.period` = the record's exact period.
- Speed from the tempo word, BPM 125.
- Subsong numbering = UADE's (`parseDscFile(buf, name, subsong)`, routed from
  `ctx.subsong`); a subsong that plays nothing throws (route falls back to UADE).
- Instruments: one sampler per record (sample slice, volume, loop when repeats > 0).

Encode a cell: empty / note-off / no instrument -> $FF; else the instrument's
record when it plays the cell's note; else a record of the same sample
(pcmOffset + length) whose period plays that note; else the instrument's
record (the format has no other pitch). Bytes > nRecords-1 other than $FF never
occur in the corpus; they would decode as empty.

## Proof (2026-10-06)

- Byte-exact: `encodeDscModule(decodeDscModule(f)) == f` for all 14 files;
  every grid cell re-encodes to its track byte; export of an unedited song ==
  the file (`digitalSonixChromeRoundtrip.test.ts`).
- gridVsPaula (`tools/uade-audit/gridVsPaula.ts`, no --secs), before -> after:

| song | before ch0-3 | after ch0-3 |
|---|---|---|
| demo 1 | 0.00 x4 (0 notes) | 1.00 1.00 1.00 1.00 |
| demo 2 | 0.00 x4 | 1.00 1.00 1.00 1.00 |
| ingame 1 (x2 copies) | 0.00 x4 | 1.00 1.00 1.00 1.00 |
| ingame 2 | 0.00 x4 | 1.00 1.00 1.00 1.00 |
| start | 0.00 x4 | 1.00 1.00 1.00 1.00 |
| title | 0.00 x4 | 1.00 1.00 1.00 1.00 |
| fanfares (x2) | 0.00 x4 | 0.92 - 1.00 - (see below) |
| dbfx, drfx, fyfx, spfx, enfx | 0.00 x4 | n/a: 0-9 notes per channel per subsong |

  gridVsPaula's grid side is subsong 0 only, while its Paula side runs on
  through every subsong (UADE moves to the next subsong at a song end, and
  ends a subsong after ~20 s of silence - fanfares subsong 0 is 6.4 s of
  notes then a 40x repeated empty block, so UADE switches to subsong 1 at
  26.9 s), and the scorer needs a few intervals. So for the effect banks and
  fanfares I compared per subsong instead (UADE `_uade_wasm_set_subsong(n)`,
  rendered for exactly the subsong's length from the model): **every subsong
  of every file has the grid's pitch sequence exactly, on every channel**
  (e.g. fanfares 14/3/14/3, 40/8/40/8, 38/38/38/38; enfx sub3 9/5/6/5). The
  test locks ingame 1 whole-song equality against UADE's Paula log.
- The UADE scan grid (what the app showed before) was not scored: it needs
  the worklet (`--grid-json`). The decoded grid is equal to Paula's note
  sequence, which is the ceiling of that metric.
- Measurement notes: UADE runs the first tick inside `_uade_wasm_load`, so a
  Paula log enabled after the load misses row 0 (gridVsPaula sees one note
  fewer per voice - harmless to its LCS score). Enabled before the load, the
  first event per voice is the player's init write (AUDxLC then AUDxPER 150).
- Edit path: `UADEChipEditor.patchPatternCell` (the writeCellToChipRam path)
  with this layout, run against UADE's chip RAM mid-song, changes exactly that
  note in UADE's Paula output (`digitalSonixChromeGridMatchesPlayer.test.ts`).
  The chip-RAM write lands because the track bytes are never relocated.
- Export: NOT the chip-RAM readback (that file would carry the relocated entry
  and record pointers: InstallSamples adds the track/PCM base addresses in
  place). `exportDigitalSonixChrome` decodes the original file, writes only
  changed cells into the tracks and re-encodes.

## The Musashi runner's 0.889 (inference, not measured)

The trigger routine (lbC005970-lbC005A14) is a hardware handshake, not a plain
register write:

1. DMACON clears the voice's DMA bit; AUDxPER = 1; INTREQ clears the voice's
   audio bit; INTENA clears it (Wanted Team moved this `move.w D7,$DFF09A`
   below the INTREQ clear; the original line is commented out above).
2. `CLR.W 10(A2)` writes AUDxDAT = 0 with DMA off: Paula's manual (non-DMA)
   mode, which raises the voice's audio interrupt request when it wants the
   next word - one period (1 colour clock, clamped by Paula) later.
3. Volume, length, pointer, sustain counters are set.
4. **Busy-wait on INTREQR for that bit** (`lbC005A08`).
5. AUDxPER = record period, DMACON sets the voice, INTREQ cleared, INTENA set.

So when the new note's period/DMA lands depends on when the emulated Paula
raises INTREQ for a manual-mode AUDxDAT write. An emulator that raises it at a
different colour clock (or immediately, or from a still-pending IRQ of the
previous block, since step 1 clears INTREQ before the DAT write but the old
DMA block can complete in between) shifts every retrigger by a few colour
clocks and can change which IRQ the sustain counter sees first (one more or
less repeat pass, or the `Empty` pointer latched one block early). In addition
the Audio0-3 handlers spin on the beam (`.line`: wait for VHPOSR's vertical
byte to change; `.wait`: horizontal >= $16) before touching the registers - a
host whose beam counter does not advance while the CPU spins, or advances
coarsely, moves that write too. Both are candidates for the runner's
note-retrigger race; neither was measured here.

## Open

- Grid display for subsong switching inside the app (the `uadeEditableSubsongs`
  model assumes one scan pattern per subsong); a DSC subsong is chosen at
  import (`parseModuleToSong(file, subsong)`).
- Record (instrument) edits are not written back; only track bytes are.
- No corpus file names overlapping blocks (checked: every played (firstRow,
  rows) pair is disjoint), so each track byte is in exactly one pattern. The
  format allows overlap; if a file had it, an edit in one pattern would not
  be mirrored into the other until reload (export writes only changed cells,
  so the edit would survive).
