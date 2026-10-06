---
date: 2026-10-06
topic: MIDI Loriciel - how the player maps a MIDI file onto Paula, and the decoded grid
tags: [midi-loriciel, eagleplayer, reverse-engineering, grid, amiga, paula]
status: implemented
---

# MIDI Loriciel - the player, reversed

Format key `midiLoriciel`, eagleplayer `MIDI-Loriciel` (EaglePlayerEngine on the
Musashi host). Module `MIDI.<tune>` (or `<tune>.MID`) is a Standard MIDI File;
`SMPL.<tune>` (or `<tune>.BSP`) is a `BNKS` sample bank. Corpus: 10 songs with
banks in `public/data/songs/formats/Michel Winogradoff/` (Bumpy's Arcade
Fantasy, Cartoons 1-9). `public/data/songs/midi-loriciel/MIDI.Entity L0` has no
bank (the player refuses it: InitPlayer `Corrupt`); `sonix/miscellaneous/midi.*`
are not MIDI files.

Sources:
- `third-party/uade-3.05/amigasrc/players/wanted_team/MIDI-Loriciel/MIDI - Loriciel_v1.asm`
  (Wanted Team's adaptation of the Entity intro player, (c) 1993 Loriciel; the
  routine names below are its labels).
- `public/eagleplayer/players/MIDI-Loriciel` (the binary the runner and UADE
  run; one code hunk, 58 reloc32, none in the period-table span).
- Runner trace: the real worklet + WASM (`src/engine/__tests__/workletHarness.ts`),
  Paula registers (`ep_wasm_voice_state`) at the end of every interrupt.
- UADE Paula write log: `tools/uade-audit/gridVsPaula.ts`.

## Init (Init_1 lbC00001C, Init_2 lbC00026C, InitSamples lbC0007F8)

- MThd: skips 8 bytes, reads format+ntracks as one long (ntracks = low word),
  division word. Division bit 15 (SMPTE) -> treated as 192 ticks/quarter.
  `lbL00059A = division * 10000`.
- Up to 16 tracks (320-byte table, 20 bytes each): +0 active flag, +2 start,
  +6 current pointer, +10 end (never read), +14 delta counter (long, starts at
  `$FFFF8000` = "read the first delta"), +18 current channel.
- The player stops a track only at FF 2F; the MTrk length is ignored.
- Bank: `BNKS` is cleared to 0 - those 4 zero bytes are the "empty sample"
  every active voice loops on. Then u32 instrument count, count x u32 offset to
  an instrument. Instrument: u16 n, n x 8-byte key range {s32 -offset of a
  sample header, u8 base key, u8 ?, u8 top key, u8 ?}. Sample header: {s32
  -offset of the PCM, u16 ?, u16 length in bytes}. Negative offsets are
  relocated once (a header shared by two ranges is positive the second time).
- Init_2: Paula off (volumes 0, DMACON $000F off), 4 voice slots freed, all 16
  MIDI channels on program 0 with no voice; tempo 500000 us/quarter.

## Timing (Play = the interrupt, lbC00024C, lbC000356)

- Timer: `rate = floor(floor(division*10000 / floor(tempo/100)) / 4)`;
  `CIA timer = floor(715909 / rate)` (16-bit DIVU throughout; a quotient over
  $FFFF leaves the old rate). On a PAL Amiga the interrupt runs at
  709379 / timer Hz (Cartoons: 130.8 Hz; Bumpy's: 118.9 Hz).
- Every interrupt: for each active track, `counter -= 4` (SUBQ.L #4); when it
  is <= 0 the pending event runs, then deltas are read: a delta of 0 runs the
  next event in the same interrupt, a delta d > 0 is added (`counter += d`) and
  the track waits. The first interrupt only reads the first delta (no
  decrement).
- Consequence: interrupt = 4 MIDI ticks, but an event with a non-zero delta
  never fires in the interrupt of the event before it, even when its tick
  rounds there (fire = max(ceil(T/4), previous fire + 1); delta 0 = same
  interrupt). The decoder simulates the counters, it does not round ticks.
- Tracks run in file order inside an interrupt; that order is the order of
  their Paula writes (voice allocation depends on it).
- Song end: the interrupt after the one that ends the last track calls SongEnd,
  Init_1 and Init_2 (Paula off, voices freed, programs 0, tempo 500000); the
  song starts again on the next interrupt. One pass = last end-of-track
  interrupt + 2 rows.

## Events (lbC0000DC and its tables)

| Byte | Player | Effect |
|---|---|---|
| 9c kk vv | lbC0001C8 | note on; vv = 0 -> note off |
| 8c kk vv | lbC0001EA | note off |
| Cc pp | lbC000206 | program change (bank instrument pp, unchecked against the count) |
| Ac, Bc, Ec + 2 bytes | lbC000128 | skipped - no aftertouch, no controllers (no sustain, volume, pan), no pitch bend |
| Dc + 1 byte | lbC000128 | skips 2 bytes: desyncs |
| F0 len data | lbC00012C | skipped |
| F7, F1-FE | lbC000128 | skip 2 bytes: desyncs |
| FF 51 03 tttttt | lbC0001A8 | tempo (assumes length 3) |
| FF 2F 00 | lbC00019C | end of track (assumes length 0) |
| FF 20 01 cc | lbC0001BC | sets the track's channel - overwritten by the next channel event, no effect |
| other FF | lbC000174 | skipped by length |
| running status | - | none: a data byte is read as a status (low nibble -> channel, skip 2) |

midi-file (the reader @tonejs/midi uses) reads every corpus file exactly as the
player does: no running status, no Dx/F7, metas 20/2F/51 at the assumed
lengths, every track ends with FF 2F. `checkPlayerReadable` refuses a file
where they would differ (the grid then falls back to UADE's scan).

## Voices (lbC000B30, lbC000B66)

- 4 slots, one per Paula voice (`$DFF0A0 + 16*n`), each {channel ($FFFF =
  free), key}. Each MIDI channel has ONE voice pointer.
- Note on: the first free slot; else the LAST slot already holding this MIDI
  channel; else slot 0. The slot takes (channel, key); the channel's pointer
  now points at it. No DMA off before the new writes.
- Note off: frees the voice (DMA off) only when the channel's pointer slot
  still holds (channel, key). So a chord's earlier notes are never released by
  their note-offs (the pointer moved on), and a voice stolen by another channel
  is not released by the old channel's off. Such voices stay "busy" until
  stolen: in practice all four voices are allocated after the first chord, and
  allocation becomes "last voice of this channel, else voice 0".
- Unmatched note-offs do nothing (Bumpy's 94, Cartoons 1: 97, Cartoons 6: 45,
  Cartoons 7: 29).

## Pitch, sample, volume (lbC000844, lbC000904, lbC000986)

- Instrument = the channel's program's key ranges. The first range with
  `key <= top` (signed byte compare) is taken; past the last range the player
  reads past the instrument (the decoder refuses - none in the corpus).
- Paula: AUDxLC = sample PCM, AUDxLEN = length >> 1, AUDxPER =
  `word[lbW0008C6 + 2*(key - base)]`, unchecked. Indices -29..30 are a semitone
  ladder 1991..66; index 0 = 373. Grid note = index + 27 (ProTracker naming,
  src/lib/amiga/periodNotes.ts: 373 reads D-2 = 27), exact for all 60.
- Outside -29..30 the player reads its own code and the velocity table:
  Cartoons 1, MIDI channel 1, program 0, key 100 on a range based at 36 ->
  index 64 -> `$1A1A` = period 6682 (two octaves below C-0). The decoder carries
  the words of the binary from index -64 to 98; that cell shows its instrument
  and volume with no note (no grid note exists for 6682).
- AUDxVOL = `2 * VOLUMES[velocity >> 1]` (64-entry table 0..31, compressed
  above 15), times the EaglePlayer volume/balance (64 = unity).
- Samples are one-shot: at the end of every interrupt each allocated voice gets
  AUDxLC = the empty 4-byte sample, AUDxLEN = 2. So:
  - a note on a voice whose DMA is off (freed, or idle on the empty loop)
    starts its sample (DMAWait lets Paula latch it);
  - a note on a voice still playing a long sample does NOT restart it: the new
    LC/LEN wait for the loop point, the interrupt end overwrites them with the
    empty sample, and the old sample plays on at the new period/volume.

## Collisions (two events on one voice in one interrupt)

- note-off then note-on (a retrigger): the cell shows the note; the off is implied.
- two or more note-ons (a MIDI chord squeezed onto one voice): Bumpy's 24,
  Cartoons 1: 84. The first note-on's sample is the one DMA latches, the last
  one's period and volume stay.

## Timing facts that decide the layout (measured on the corpus)

- Note-ons sit on 16ths (Cartoons 5/9 and a few in Bumpy's: 16th triplets,
  16 ticks); a handful are off-grid (Cartoons 3: 1, 5: 1, 6: 8, 4: 2).
- Note-offs sit one tick before the next 16th (gate = length - 1 tick).
- So the player fires most note-ons ONE interrupt after their tick: the
  gate-off at tick 47 fires at interrupt 12, the note-on at tick 48 (delta 1)
  cannot fire in the same interrupt and plays at 13 (Cartoons 1: 1597 of 1608
  note-ons). Note-ons with no gate-off just before them play on their tick.
- The runner plays at the CIA rate (measured: 118 interrupts/s for Cartoons 1,
  129 for Cartoons 2) - the 2.5 x rate BPM is the true rate.

## The decoded grid (src/lib/import/formats/MIDILoricielParser.ts)

Layout rule (loricielLayout), owner 2026-10-06 ("the pattern speed/length/note
distribution is wrong" on the first, one-row-per-interrupt decode):

- Row = G MIDI ticks, G = the largest divisor of a 16th (ppq/4) that is a
  whole number of interrupts (multiple of 4 ticks) and on which >= 98% of the
  song's note-ons start. Corpus: a 16th (48 ticks) everywhere except Cartoons 5
  and 9 (16 ticks, triplet 16ths).
- Speed = G / 4 = player interrupts per row (12 or 4); BPM = 2.5 x the
  interrupt rate (Cartoons 1: speed 12, BPM 297 = 118.9 interrupts/s). One
  tracker tick = one player interrupt.
- Every event sits at row = interrupt / speed with a note delay EDx =
  interrupt % speed: zero rounding. The player's one-interrupt lag shows as
  ED1; a note-on on the row grid is on the row of its MIDI tick.
- Patterns: whole bars, up to 64 rows (4 bars of 16ths; 1 bar of triplets).
- Channel n = Paula voice n (the allocator decides; MIDI channels spread over
  voices). A voice that takes a second event inside one row (a chord stacked
  in one interrupt, or a note one interrupt after another) puts it on that
  voice's chord channel, after the four (Bumpy's: 3, Cartoons 1/4/6: 1).
- Note-on = note (index + 27), instrument = bank sample + 1, volume = 0x10 +
  Paula volume; voice-freeing note-off = 97; the restart interrupt cuts voices
  still allocated (97). Tempo at interrupt 0 -> initialBPM; later tempos ->
  effect F in the second effect column of channel 0 (none in the corpus).
- Playhead: the runner counts an interrupt as it starts it, so runner tick 1
  = interrupt 0; one pass = schedule rows interrupts. The song carries
  eaglePlayerTickGrid {firstTick: 1, passTicks} (format store + live song);
  eaglePlayerGrid / tickGridPosition use it, so the playhead row is the row
  Paula is playing and does not drift over loops when a pass is not a whole
  number of rows.

## Verification

- Runner trace: after every interrupt of one full pass of all ten songs, each
  voice's period, volume and DMA on the runner equal the schedule's
  (0 mismatching interrupts; runner tick 1 = row 0). In test:ci for Cartoons 2:
  `src/engine/__tests__/midiLoricielRunner.test.ts`.
- Playhead: at every Paula note-on in 30 s of Cartoons 2 on the runner, the
  row the posted tick count maps to holds that note on that voice's channel
  (`src/engine/__tests__/midiLoricielPlayhead.test.ts`).
- gridVsPaula (UADE's Paula log, no --secs), voice channels 1-4:

| Song | before (carrier stub) | first decode | now | now, voice + its chord channels merged |
|---|---|---|---|---|
| Bumpy'sArcadeFantasy | 0 notes | 1.00/1.00/1.00/1.00 | 0.98/1.00/1.00/1.00 | 1.00/1.00/1.00/1.00 |
| Cartoons 1 | 0 notes | 1.00/1.00/1.00/1.00 | 1.00/1.00/1.00/1.00 | 1.00/1.00/1.00/1.00 |
| Cartoons 2 | 0 notes | 0.98/0.98/1.00/1.00 | same | same |
| Cartoons 3 | 0 notes | 1.00/1.00/1.00/- | same | same |
| Cartoons 4 | 0 notes | 0.99/1.00/1.00/- | 0.98/1.00/1.00/- | 0.99/1.00/1.00/- |
| Cartoons 5 | 0 notes | 1.00/1.00/1.00/1.00 | same | same |
| Cartoons 6 | 0 notes | 1.00/0.99/1.00/1.00 | 0.95/0.99/1.00/1.00 | 1.00/0.99/1.00/1.00 |
| Cartoons 7 | 0 notes | 0.99/1.00/1.00/1.00 | same | same |
| Cartoons 8 | 0 notes | 1.00/1.00/1.00/- | same | same |
| Cartoons 9 | 0 notes | 1.00/1.00/1.00/- | same | same |

  "-": voice 3 unused (0 notes on both sides). Below 1.0 per voice channel in
  the new layout: the notes a voice plays in the same row as another (moved
  to the chord channel) are missing from the voice channel's sequence; merged
  back by time (--grid-json) the sequences are what they were. Sub-1.0
  entries that stay: one leading interval (UADE's log starts after the first
  interrupt) - the runner register trace has no difference.

## Editing (src/lib/import/formats/MIDILoricielEncoder.ts)

- Unedited: the module comes back byte for byte (midi-file's writer reproduces
  all ten files; an edit and its undo also return the original bytes).
- Edits map to MIDI events (header of MIDILoricielEncoder.ts): a changed
  note/instrument rewrites the note-on's key (and its note-off's) to the key
  that plays that sample at that pitch on the channel's program (a sample of
  another program gets a program change around the note); volume -> velocity;
  cleared note -> note-on + note-off removed; 97 typed under a sounding note ->
  that note's note-off moves there; a typed note -> a note-on on the MIDI
  channel that last played on that voice, ending at the voice's next event.
- New events go in at the tick that makes them fire in the edited interrupt
  (share the tick of an event of the track already firing there, else
  4*row after the previous event).
- Live: `sendCellEditsToEngine` -> `eaglePlayerModuleEdits` re-encodes the
  module, makes it the song's module (`eaglePlayerFileData`, format store) and
  reloads the runner; a playing song keeps playing, from the top.

## Open

- Which voice a typed note lands on is the allocator's choice (first free,
  else last voice of the channel, else 0), not the edited channel's; the grid
  is not re-read after an edit, so the display can show the typed note on a
  different voice than the runner plays it.
- A live edit restarts the song (the runner has no seek). Same-length edits
  (note, volume) could be written into the playing module in place once
  EaglePlayerEngine.writeModule (Sound Player work, uncommitted at the time of
  writing) lands.
- The note-on whose period (6682) has no grid note shows no note.
- Native export of an eagleplayer song's module (eaglePlayerFileData) is not
  wired to a save path; the edited module lives on the song.
