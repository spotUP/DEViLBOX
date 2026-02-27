---
date: 2026-02-27
topic: sound-control-format
tags: [amiga, uade, pcm-sampler, 6-channel, format-research]
status: implemented
---

# Sound Control — `.sc` / Custom Extension Format

**Status:** Implemented. NATIVE_SAMPLER — full PCM extraction in DEViLBOX.

---

## Overview

Sound Control is a 6-channel Amiga music format with ADSR envelope support and
sample command sequences (per-instrument effect scripts). Available in versions 3.0
and 4.0; version 4.0 adds instruments (sample command sequences) on top of raw samples.

**Extension:** Format-specific (check `SoundControlParser.ts` for routing)
**Magic bytes:** None — detected by header structure
**Reference files:** ~18 files in `Reference Music/SoundControl/`
**DEViLBOX status:** `NATIVE_SAMPLER` — `SoundControlParser.ts` + Sampler engine

---

## File Layout (Version 3.0)

```
Offset      Content
------      -------
0x00        10 bytes    Song name (ASCII)
0x0A        4 bytes     TL — Length of tracks section (uint32 BE)
0x0E        4 bytes     SL — Length of samples section (uint32 BE)
0x12        4 bytes     PLL — Length of position list (uint32 BE)
0x16        4 bytes     (reserved / padding)
0x20        [reserved]
0x40        TL bytes    Tracks section
0x40+TL     SL bytes    Samples section
0x40+TL+SL  PLL bytes   Position list
```

## File Layout (Version 4.0, extends 3.0)

```
0x00        10 bytes    Song name
0x0A        4 bytes     TL — Track length
0x0E        4 bytes     SL — Sample length
0x12        4 bytes     PLL — Position list length
0x16        4 bytes     IL — Instrument length (4.0 only)
0x1A        2 bytes     Version (4.0 = 0x0040 or similar)
0x1C        2 bytes     Speed (4.0 only; 3.0 uses default)
0x40        TL bytes    Tracks
0x40+TL     SL bytes    Samples
0x40+TL+SL  PLL bytes   Position list
+PLL        IL bytes    Instruments (4.0 only)
```

---

## Tracks Section

```
Offset  Content
------  -------
0x000   256 × uint16 BE    Offsets to track info (max 256 tracks)
0x200   (TL - 0x200) bytes Track info data
```

### Track Info

```
Offset  Content
------  -------
0x00    10 bytes   Track name (ASCII)
0x0A    variable   Track data (see below)
```

### Track Data Format

```
FF FF         = End of track data
00 xx yy yy   = Wait: xx ticks, yy ignored
nn xx yy zz   = Note event (nn is note; 3 bytes follow)
               nn = note (first nibble = octave, second nibble = note in octave; or v4.0 note index)
               yy = sample number (v3.0) or instrument number (v4.0)
               zz = volume; if zz == 0x80 (v4.0), store note+instrument in list
```

---

## Samples Section

```
Offset  Content
------  -------
0x000   256 × uint32 BE    Offsets to sample info (relative to samples base; 0 = empty)
0x400   (SL - 0x400) bytes Sample info + PCM data
```

### Sample Info

```
Offset  Content
------  -------
0x00    10 bytes   Sample name (ASCII)
0x0A    2 bytes    Length of sample data (in bytes)
0x0C    2 bytes    Loop start offset (in bytes, from sample start)
0x0E    2 bytes    Loop end offset (in bytes)
...
0x2A    2 bytes    Note transpose (-12 to +12)
...
0x3C    4 bytes    Total length including header (in bytes)
0x40    N bytes    Raw 8-bit signed PCM data
```

Looping: `loopEnd > loopStart` → sample loops between those byte offsets.

---

## Instruments Section (Version 4.0 only)

```
Offset  Content
------  -------
0x000   256 × uint16 BE    Offsets to instrument info
0x200   (IL - 0x200) bytes Instrument info
```

### Instrument Info

```
Offset  Content
------  -------
0x00    10 bytes   Name (ASCII)
0x0A    2 bytes    Length of sample commands (CL)
0x0C    1 byte     Attack speed
0x0D    1 byte     Attack increment (volume)
0x0E    1 byte     Decay speed
0x0F    1 byte     Decay decrement
0x10    2 bytes    Decay value (sustain level)
0x12    1 byte     Release speed
0x13    1 byte     Release decrement
...
0x24    CL bytes   Sample commands (3 × uint16 each: command + 2 args)
```

### Sample Commands

```
 0        Stop
 1 x      Switch sample to x; update period to current note + new sample transpose
 2 x      Wait x ticks
 3 x      Change hardware sample address to current start + x
 4 x      Switch sample to x; set hardware to sample start
 5 x      Set hardware length to x bytes
 6 x      Switch sample to x; set hardware length
 7 x      Add x to period; set hardware period
 8 x      Transpose current note by x; set new hardware period
 9 x      Add x to volume
 A x y    Start repeat x times; change repeat value to y
 B x y    Add y to repeat value; repeat if not reached x
 C x y    Add y to repeat value x
 D x y    Set repeat value y for x
 E        NOP
 F        Play current sample (set up hardware)
```

---

## Position List

Each position is **12 bytes** (6 channels × 2 bytes):
- Byte 0: Track number for channel
- Byte 1: Control byte (checked for song end)

---

## DEViLBOX Implementation

### Parser: `src/lib/import/formats/SoundControlParser.ts`

- Detects format by header validation (song name, section lengths)
- Parses samples section: extracts 10-byte names + PCM data
- Uses `createSamplerInstrument()` for samples with PCM data
- Falls back to `'Synth'` placeholder for empty sample slots
- Supports both v3.0 (samples only) and v4.0 (+ instruments with ADSR)

---

## Reference

- `Reference Music/SoundControl/` — test corpus
- `Reference Code/uade-3.05/players/SoundControl` — UADE eagleplayer
- Format spec: `docs/formats/Sound Control.txt`
