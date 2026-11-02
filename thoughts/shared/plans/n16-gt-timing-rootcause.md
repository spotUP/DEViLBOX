---
date: 2026-11-02
topic: N16 SID trace to GoatTracker - why GT2 tunes score low (eco-fog, proton)
status: partial (causes 1-7 fixed; 90 percent goal not reached)
---

# N16: GoatTracker replay timing root causes

Question: why `eco-fog-goattracker2.sid` (0.128 exact) and `proton-cybernoid-goattracker2.sid`
(0.211) score low when their SID trace is converted to a GT song and replayed in headless
GTUltra. The GT C player (`gtultra-wasm/src/gplay.c`) is the timing reference and was not patched.

## Root causes and fixes

1. **Startup latency not modelled.** `gplay.c` song init sets `tick = 6 - 1` and
   `gatetimer = instr[1].gatetimer & 0x3f` (around line 292-296); the first play call only
   initialises. Row 0's note init lands on GT snapshot 5, not 0. The converter used
   `frameOffset = origin`, so every note was 5+ frames off (outside the lag search of +-3).
   With `gatetimer 0x40` (`& 0x3f` = 0) the row was even read on tick 0 and played a full
   row late.
   Fix: `GT_FIRST_ROW_FRAME = 5`, `frameOffset = origin - 5` (may be negative)
   in `src/lib/import/formats/sidTraceToGoatTracker.ts`; scorer aligns a negative offset
   (`scoreSidTrace` in `src/lib/import/formats/sidTraceScore.ts`).
2. **Hard restart not modelled.** GT2 tunes gate off and write AD 0f SR 00 N frames before
   each note (trace eco-fog frame 6). GT does this at GETNEWNOTES (`gplay.c` 1203-1215)
   unless `gatetimer & 0x40` (none) or `& 0x80` (gate off only). The converter always set
   0x40. Fix: `hardRestartOf` detects per note the gate-off frames with a freshly written
   ADSR; global gate frames = most common count (capped at tempo - 1, `gplay.c` 483 stops the
   song otherwise), `adparam` = most common hard-restart ADSR, per-instrument flag 0 / 0x80 /
   0x40 (`gatetimerOf`, part of the instrument key).
3. **Wave and pulse programs one frame late.** On the note-init frame GT jumps to NEXTCHN
   (`gplay.c` ~709-712) and skips WAVEEXEC / PULSEEXEC. Converter row 0 duplicated the
   firstwave frame. Fix: `waveRows` / `pulseRows` start at `n.start + 1`.
4. **Filter owner rejected / filter encoding off by one.** Route bit was checked at the
   owner's gate rise (eco-fog routes one frame later), giving "filter used but no note starts
   it". The filter table runs before the channel loop, so row 0 runs the frame after the owner
   note init; the old run encoder consumed rows one frame early. Fix: `filterProgram` checks
   routing at the filter start, lead = `fs - (owner.start + 1)`, one row per frame for set
   rows, delta runs mod 256 (GT cutoff is an unsigned byte).
5. **Scorer compared bits the SID ignores.** GT writes the pan nibble into pulse-high
   (regs 3/10/17); players leave garbage there; reg 0x15 holds only bits 0..2. Fix: `regMask`
   in `sidTraceScore.ts`.
6. **Channel state leaked between songs in the harness.** `gt_load_sng` / `gt_play` /
   `gt_init` in `GTUltraBridge.cpp` never call `initchannels` (`gplay.c` 69-74), so a song
   started with the previous song's freq / pulse. Fix: one `HeadlessGT` per song; a second
   `play` throws; the score test creates an engine per tune.
7. **Key-off rows wrong.** GT reads a key-off row `gatetimer` frames before its row frame,
   and the next note's hard-restart gate fall was also written as a key-off. Fix: skip gate
   falls inside the next note's hard restart; key-off row = `rowOfFrame(end + gateFrames)`.

## Before / after (exact score, first 3000 frames)

| Tune | Before | After | Lag after |
|------|--------|-------|-----------|
| abaddon-starfish-test | 0.165 | 0.579 | 0 |
| bax-hc-dmc4 | 0.087 | 0.191 | 0 |
| cmp-dns-jchnewplayer20 | 0.143 | 0.463 | 0 |
| eco-fog-goattracker2 | 0.128 | 0.249 | 1 |
| galway-wizball | 0.151 | 0.225 | 0 |
| hubbard-commando | 0.172 | 0.462 | 0 |
| jch-awry-sidfactory2 | 0.190 | 0.575 | 0 |
| jch-tyne-cheesecutter2 | 0.180 | 0.512 | 0 |
| lees-last-ninja | 0.080 | 0.075 | -1 |
| proton-cybernoid-goattracker2 | 0.211 | 0.607 | 0 |
| tel-cybernoid-futurecomposer | 0.209 | 0.439 | 0 |

Per class after, proton: freq 0.275, pulse 0.604, control 0.998, ADSR 0.952, filter 1.0.
Eco-fog: freq 0.195, pulse 0.211, control 0.498, ADSR 0.725, filter 1.0.

## What remains (90 percent not reached)

- **Frequency modulation (largest miss, both tunes).** Vibrato / slides are frame-level freq
  changes (eco-fog voice 1 reg 7: 169 -> 172 -> 175 -> 172). The wave table only carries
  whole-semitone offsets, so vibrato is lost. Needs the speed table (vibrato / portamento
  instrument commands, or wave-table command rows) inferred from the freq trace.
- **Program sharing and length cap.** Eco-fog has 2152 notes; programs are capped at 16
  frames and shared per inferred instrument (warning "more than 63 distinct programs"), so
  long pulse sweeps and later control changes are cut (pulse 0.211, control 0.498). Needs
  program dedup by content (loops in wave / pulse tables) instead of per-note copies.
- **Eco-fog lag 1** remains: unverified cause; inspect the first note frames of voice 0
  with a fresh diagnostic.
- lees-last-ninja dropped slightly (0.080 -> 0.075): unexplained, not investigated.
- `waveLeft` maps control >= 0xe0 to 0xd0|low (lossy, minor).

## Tests

- `src/lib/import/__tests__/sidTraceScore.test.ts`: second song on one engine throws;
  perfect replay with negative offset and pan nibbles scores 1.0 at lag 0 (galway-wizball).
- `src/lib/import/__tests__/sidTraceToGoatTracker.test.ts`: synthetic arpeggio wave / pulse
  rows start one frame after the gate rise; eco-fog hard restart detected (adparam 0x0f00,
  gatetimer with HR) and the filter program kept.
- Fail-before not re-checked by reverting (expected to fail: old code had gatetimer 0x40,
  no throw, no mask, filter warning).

## Speed tables and program dedup

Date: 2026-11-02. Scores from `sidTraceScore.test.ts` (3000 frames per tune).

### Done: exact frequency tracking through wavetable portamento rows

Root cause of the low `freq` class: the wave program only ever wrote integer
semitone note rows, so vibrato, slides, non-semitone arpeggios and the source
player's tuning (its frequency table differs from GT's `freqtbl`) were never
reproduced. Fix in `waveRows`: the GT channel frequency is modelled frame by
frame (note init writes `freqtbl[note]`, a note row writes
`freqtbl[note + offset]`), and every frame whose traced frequency differs from
the model while the waveform holds becomes a wavetable command row 0xF1
(portamento up) or 0xF2 (down). Its speed-table entry is the exact 16-bit delta;
gplay.c WAVEEXEC adds it to `cptr->freq` on that frame, then advances and skips
the tick effects. Speed-table rows are deduplicated by content (`addRows`); when
the speed table is full, the frame falls back to the plain row.

Two misses per note stay structural: the note-init frame (GT runs no table on
it) and a frame that changes both waveform and frequency (one wavetable row per
frame, the waveform row wins).

Regression test: `GoatTracker frequency programs` in `sidTraceScore.test.ts`
(synthetic tuned vibrato, real headless GT replay). With tracking reverted it
misses 101 frequency changes; with the fix 8 (2 per note). Checked both ways.

| tune | before | after | freq exact before / after | programs |
|------|--------|-------|---------------------------|----------|
| abaddon | 0.579 | 0.579 | 0.074 / 0.074 | 16, shared |
| bax | 0.191 | 0.191 | 0.010 / 0.010 | 64, shared |
| cmp-dns | 0.463 | 0.463 | 0.129 / 0.129 | 32, shared |
| eco-fog | 0.249 | 0.249 | 0.195 / 0.195 | 16, shared |
| galway | 0.225 | 0.232 | 0.143 / 0.286 | 64, per note |
| hubbard | 0.462 | 0.462 | 0.489 / 0.489 | 64, shared |
| jch-awry | 0.575 | 0.575 | 0.298 / 0.298 | 64, shared |
| jch-tyne | 0.512 | 0.512 | 0.070 / 0.070 | 64, shared |
| lees | 0.075 | 0.118 | 0.049 / 0.167 | 64, per note |
| proton | 0.607 | 0.607 | 0.275 / 0.275 | 64, shared |
| tel | 0.439 | 0.439 | unchanged (not recorded) | 64, shared |

### Open: why nine of eleven tunes do not move

Nine tunes build in shared mode ("more than 63 distinct programs"): every note
of one inferred instrument plays the program of the instrument's first note.
Exact frequency tracking is per pitch, so it is disabled in shared mode (a
tuning delta from one pitch is wrong for every other pitch). The real limit is
the table budget: 255 rows per GT table and 63 instruments for thousands of
notes. Next steps, in order:

1. Pitch-relative frequency programs: express vibrato as a GT speed-table
   vibrato entry with note-relative speed (`cmp | 0x80`, shift right) and
   slides as note-relative portamento, so one program serves every pitch of an
   instrument. Tuning offset per note stays unreachable without per-pitch rows.
2. Loop the periodic tail of wave/pulse programs with a 0xFF jump row instead of
   cutting at 16/32/64 frames, which shrinks programs and lifts the cap.
3. Cluster notes per inferred instrument by program content (not first note),
   up to the 63-instrument limit, before falling back to shared.
