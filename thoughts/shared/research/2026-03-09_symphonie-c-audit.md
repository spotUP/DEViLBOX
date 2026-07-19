---
date: 2026-03-09
topic: symphonie-c-replayer-1:1-audit
tags: [symphonie, wasm, audit, 68k]
status: in-progress
---

# Symphonie C Replayer — 1:1 Audit Against ASM

## Critical Bugs Found

### Bug 1: Pattern Data — Stereo Channel Handling (FATAL)
**C code** (`play_stereo_pat_line`): Reads ONE note per stereo pair, plays the SAME note to both L and R channels.
**ASM** (`PlayStereoPatLine`): Reads TWO notes per pair — one for L channel, one for R channel. Pattern layout is [L0][R0][L1][R1]...
- Right channel is played with `DOSAMPLEDIFF=TRUE` flag which offsets sample start for stereo instruments
- `CheckNoteType` logic optimizes: if R note is empty, copy L note with instrument+1 offset

### Bug 2: Effect Processing Rate (FATAL)
**C code** (`render_voice_sample`): Effects (vol slide, pitch slide, vibrato, tremolo, portamento, etc.) applied PER OUTPUT SAMPLE (~44100 Hz).
**ASM** (`CopySample`): Effects applied ONCE per buffer-fill call from `CopyVoiceBuffer`, then inner loop renders buffer with fixed parameters.
- Effects running at sample rate = ~500-1000x too fast
- Vol slide reaches 0/max in microseconds instead of over seconds
- Pitch slide teleports to destination instantly
- Vibrato/tremolo oscillate at ultrasonic frequencies

### Bug 3: Instrument Volume Applied During Mixing (WRONG)
**C code**: `sample *= inst->volume / 100.0f` in render_voice_sample
**ASM**: No instrument volume applied during CopySample mixing. Instrument volume is NOT in the INSTR_ struct used at runtime. `SAMPLENAME_VOLUME` in the file format is for the editor/preprocessor, not the playback engine.

### Bug 4: Volume Scaling Formula
**C code**: `volScale = volByte / 100.0f` (float division, applied as multiplication)
**ASM**: `d4 = (vol * 256) / 100; sample = (sample * d4) >> 8` (integer multiply+shift)
- C uses float; ASM uses 8.8 fixed-point
- Small rounding differences, not fatal but should match

### Bug 5: Mixing Output
**C code**: Returns a single float sample per voice, accumulated in the render loop
**ASM**: CopySample uses `add.w d0,(a1)` — ADDITIVE mixing into 16-bit integer mix buffers
- ASM mixes into 16-bit word buffers, then converts to output format at the end
- C uses float accumulation which is fine but the integer overflow behavior differs

### Bug 6: `NOTE_FULLEMPTY` Check
**C code**: Checks individual bytes `note->fx == 0 && note->pitch == 0xFF && note->volume == 0 && note->instr == 0`
**ASM**: Checks 32-bit word: `cmpi.l #NOTE_FULLEMPTY,(a2)` where `NOTE_FULLEMPTY = 0x00FF0000`
- Byte layout: `[fx=00][pitch=FF][vol=00][instr=00]`
- C check matches (fx=0, pitch=0xFF, vol=0, instr=0) — this is correct

### Bug 7: Effect Dispatch — Effects With Notes
**C code**: `if (note->fx >= 1)` returns after handling effect — never triggers a note
**ASM**: Many effects (FX_REPLAYFROM, FX_FROMANDPITCH, etc.) include note triggering as part of their handler. Effects 1-4 (vol/pitch slide) and 9+ set state and THEN fall through to note processing. Only some effects are "complex FX" that skip note triggering.
- The C's early return prevents notes from sounding when effects are present

### Bug 8: DOSAMPLEDIFF Not Implemented
**C code**: No concept of stereo sample offset
**ASM**: `DOSAMPLEDIFF` flag makes StartSample offset the sample start by `SAMPLEDIFF` for stereo pair processing — essential for stereo instruments

## Key ASM Values for Reference

| Constant | Value |
|----------|-------|
| COPYSMPLEN | 2 (stereo stride) |
| SAMPLEST_PENDING | 0 |
| SAMPLEST_INUSE | 1 |
| FADETO_STEPS | 9 |
| FADEOUT_STEPS | 28 (but runtime FADEOUTSTEPS = FADETOSTEPSm = 8) |
| SAMPLE_SIZEOF | 256 |
| INSTR_SIZEOF | 64 |
| NOTE_SIZEOF | 4 |
| NOTE_FULLEMPTY | 0x00FF0000 |

## Frequency Table

ASM uses Gleichschwebend (equal-tempered) base table:
```
10000, 10595, 11225, 11892, 12599, 13348, 14142, 14983, 15874, 16818, 17818, 18878
```
These are 12-TET ratios × 10000. Combined with System_FreqBase and /3500 to produce step values.

## Fix Plan

1. Move all effects to per-tick processing (new `process_voice_tick()` function)
2. Fix `play_stereo_pat_line` to read 2 notes per pair
3. Remove instrument volume from mixing
4. Fix effect dispatch to allow notes with effects
5. Simplify `render_voice_sample` to just: sample read + advance + loop
6. Match freq table to ASM formula
