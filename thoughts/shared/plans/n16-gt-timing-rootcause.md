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

### Done (2026-11-02): items 1-3 built

1. **Pitch-relative frequency programs.** Shared programs write vibrato as
   speed-table rows `[0x80, shift]` (note-relative speed, FreqMode `relative` in
   the wave rows), so one program serves every pitch. Test: "serves a
   pitch-relative vibrato at every pitch from one shared program". Fail-before:
   with the speed table removed from the relative path, 534 freq misses
   (limit 24).
2. **Looping periodic tails.** `periodicLoop` finds the repeating tail of a wave
   or pulse program (scan 512 frames) and closes it with a 0xFF jump row
   (`waveLoopRows`, `pulseLoopRows`). Test: "loops a repeating vibrato and pulse
   sweep past the program length". Fail-before proven by the previous agent
   (~350 freq and ~340 pulse misses without loops).
3. **Group by program content.** `clusterPrograms` builds every note's relative
   program, clusters notes per inferred instrument by content, picks each
   instrument's fallback (top 16 candidates by note count) by note-weighted
   agreed register changes, then admits other clusters as extra instruments by
   gain = notes x (own changes - changes agreed with the fallback) while the
   wave/pulse tables and 63 instruments fit. Test: "groups shared programs by
   content, not by the first note of an instrument". Fail-before: with the
   first-note fallback and no admission, 492 freq misses (limit 24).

### Corpus before / after (exact score, first 3000 frames)

| Tune | Plan "after" | Before items 1-3 | Items 1-2 | Items 1-3 |
|------|------|------|------|------|
| starfish | 0.579 | 0.579 | 0.5888 | 0.6475 |
| dmc4 | 0.191 | 0.191 | 0.1855 | 0.2186 |
| jchnewplayer20 | 0.463 | 0.463 | 0.4879 | 0.5421 |
| fog | 0.249 | 0.249 | 0.3193 | 0.3171 |
| wizball | 0.225 | 0.232 | 0.2315 | 0.2315 |
| commando | 0.462 | 0.462 | 0.4625 | 0.5276 |
| awry | 0.575 | 0.575 | 0.6292 | 0.6566 |
| tyne | 0.512 | 0.512 | 0.5114 | 0.5442 |
| last-ninja | 0.075 | 0.118 | 0.3633 | 0.3633 |
| proton | 0.607 | 0.607 | 0.6027 | 0.6096 |
| tel | 0.439 | 0.439 | 0.4637 | 0.4884 |

Fallback/admission variants tried for item 3 (sum of the 11 scores): note-count
fallback + note-count admission 5.0615 (better awry 0.708, proton 0.624, fog
0.342, but tel falls to 0.388 as its pulse drops 0.785 to 0.523);
frame-agreement 5.1479; frame-agreement + gain per row 5.1274;
change-agreement 5.1465 (kept: within 0.002 of the best and counts register
changes, which is what the scorer counts); change-agreement + gain per row
5.1386.

### Open: what still blocks 0.9

- **freq exact is low** on dmc4 (0.01), tyne (0.06), fog (0.10), starfish (0.10):
  the per-pitch tuning offset is unreachable in relative mode, plus the
  note-init and waveform-change frames where GT writes freqtbl[note].
- **filter exact is 0** on starfish, dmc4, jchnewplayer20, tyne, tel: only
  global filter programs started by a voice-0 note are supported ("filter used
  but no note starts it" on dmc4).
- **Table budget**: 217 to 889 distinct note-relative programs per tune against
  63 instruments and 255 rows per table (proton keeps 63 of 440).
- **Note segmentation**: wizball decodes 1 note, last-ninja 4; their score is
  register-copy noise, not conversion.
- **pulse** is low on commando (0.17) and dmc4 (0.34).
- tyne hits "pattern limit reached: song truncated".
- Editing design steps 4-7 stay unbuilt.

## 2026-11-02 evening: why freq exact is low on eco-fog and proton

Baseline (3000 frames): eco-fog score 0.317, freq exact 0.096 (n 5557); proton score 0.610, freq exact 0.259 (n 8103).

Violated invariant: the rebuilt GT song must reproduce every traced frequency write. Level of the root cause: the builder (sidTraceToGoatTracker.ts) for the program vocabulary, and the decoder (sidTraceDecode.ts segmentNotes) for note boundaries. Not the scorer, not the GT player emulation.

Decisive measurement (temporary probe, freq misses at lag 0 classified by note age):
- eco-fog: 3551 misses beyond the 8-frame program (384 hits), 300 in-program misses, 932 with no decoded note.
- proton: 2234 in-program misses (974 hits), 1248 beyond the program.

Causes found:
1. eco-fog uses GT instrument vibrato (voice 3: cmp 2, speed 3, vibdelay 1; the frequency holds on every tick-0 frame because the GT player skips tick effects there, gplay.c `if (!optimizerealtime || cptr->tick)`). The builder never emits instrument vibrato (ins.ptr[STBL] is always 0, vibdelay never set); it writes per-frame wavetable portamento rows, which stop at the program length (8) and the table budget, so the rebuilt note freezes.
2. Most eco-fog vibrato misses are on decoded "notes" that are not GT note inits: the trace shows a gate rise while the frequency and the vibrato phase continue (voice 3 notes at frames 773 and 965, 192 and 578 frames long). A GT note init always rewrites freq (gplay.c line 523), so the rebuild restarts the pitch there. This is a segmentation (decoder) fault: gate rises made by the wavetable, not by the pattern, must not start a note. It ties in with the open wizball/last-ninja segmentation item.
3. proton drum voice uses absolute wavetable notes (0x81-0xDF) and negative relative offsets (0x60-0x7F): age 1 writes 65535 (gtFreq(95)), then 2807, 1768, 1114, 884, 788, 744, 702 whatever the base note. The builder only writes relative offsets r >= 0, so these become approximate portamento rows that are wrong at other pitches.

Attempted fix (not committed, saved as thoughts/shared/plans/n16-vibrato-wip.patch, 263 lines): vibratoOf() detects a GT instrument vibrato per note (sign pattern of gplay.c CMD_VIBRATO from vibtime 0, holds on tick-0 frames, vibdelay counted from frame start + 2), forces a wavetable note row on frame start + 1 to reset vibtime, writes plain wave rows from the vibrato start, and sets ins.ptr[STBL] = [cmp, speed] and ins.vibdelay. Detection finds the right parameters for the first voice-3 note (cmp 2, speed 3, delay 1), but only 5 of 2152 eco-fog notes qualify (cause 2), and the end-to-end regression test in the patch fails: the replayed first note matches only 23 percent of frames. Unverified why: likely the shared (clustered) program build keeps a fallback program without the vibrato for this note, or the GT tick-0 phase in the rebuild differs from the source. Scores with the patch: eco-fog 0.325 (freq exact 0.116, tolerant 0.235), proton 0.609 (unchanged).

Next, in order: (a) find why the rebuilt first note does not replay the vibrato (check which program and instrument the note is assigned, and the GT tick of frame start + 2); (b) fix segmentation so wavetable gate rises do not start notes (decoder level, biggest eco-fog share); (c) absolute and negative wavetable notes for proton; then filter.

## 2026-11-02 late: re-gates inside one note (open item b)

Violated invariant: a decoded note is a GoatTracker note init. A GT note init rewrites the frequency (gplay.c note init), restarts the wave and pulse programs, and (unless gatetimer 0x40) gates off and writes adparam `gatetimer` frames before. A gate rise that does none of this is not a note init; GT makes it with a pattern KEYON (0xbf, gplay.c GETNEWNOTES `cptr->gate = 0xff`, read at the same tick as KEYOFF) after a KEYOFF, or the wavetable with a gate bit.

Level: the decoder (sidTraceDecode.ts segmentNotes), which starts a note at every gate rise. The builder then has to express the continuation as KEYOFF/KEYON rows instead of a new note.

Decisive measurement (eco-fog voice 3, trace dump frames 0-1200): gate rises at 7 (wave 0x09 then 0x41, AD/SR loaded: a real note), falls at 581, rises at 773, falls at 869, rises at 965. Across 581..773 and 869..965 the frequency keeps its vibrato (771 468, 772 465, 773 462, 774 465 ...), the pulse sweep continues (2080 -> 2080 -> 2072), AD/SR stay e0/9e (no adparam 0f00 hard restart), the waveform stays 0x4. So 773 and 965 are KEYONs of the note from frame 7, not new notes.

Rule built: a gate rise continues the voice's previous note when (1) no AD/SR change in the gate-off gap (no hard restart, no ADSR load), (2) the waveform nibble is unchanged and the test bit is clear at the rise, (3) the frequency and pulse steps at the rise are no larger than the largest step in the 4 frames before, and (4) at least one of them was moving in those frames (a static held tone stays a separate note: no evidence either way, old behaviour kept). Such rises become `regates` on the note; the builder writes KEYOFF/KEYON rows and keeps the gate bit set in the program's wave rows across the gap.

Result (3000 frames, sidTraceScore corpus test, before -> after):

| tune | notes | score | freq exact |
|------|-------|-------|------------|
| eco-fog | 2152 -> 2147 | 0.3171 -> 0.3212 | 0.096 -> 0.110 (n 5557) |
| proton | 4365 -> 4365 | 0.6096 -> 0.6096 | 0.259 -> 0.259 (n 8103) |
| wizball | 1 -> 1 | 0.2315 -> 0.2315 | 0.286 |
| last-ninja | 4 -> 4 | 0.3633 -> 0.3633 | 0.392 |

The rule fires where measured (eco-fog voice 2: regates 581->677 and 869->965; voice 3: 581->773 and 869->965, the frame-7 note now runs to 1061), but eco-fog has only five such rises in 3000 frames. Most eco-fog notes are short (voice 1: 4-frame notes, voice 3: 22-frame notes after frame 1543) and are real note inits. So item (b) is correct but small; the earlier estimate that it is the 'biggest eco-fog share' was wrong. The freq gap is dominated by item (a), the missing instrument vibrato, and by (c) absolute wavetable notes. wizball and last-ninja have almost no gate rises: their notes change inside one held gate, a different segmentation problem (pitch-change splitting), not addressed here.

Regression test: sidTraceScore.test.ts 'GoatTracker re-gates inside one note' (synthetic 4 notes with vibrato, pulse sweep and a gate gap). With the rule: 4 notes, 4 KEYON rows, freq exact >= 0.9. With continuesAcrossGate forced false: 8 notes, test fails.

