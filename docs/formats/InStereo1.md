# InStereo! 1.0 (ISM 1.2)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/InStereo1Parser.ts`
**Extensions:** `.is`, `.is10`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/InStereo!/`

---

## Overview

InStereo! 1.0 (also called ISM 1.2) is a 4-channel Amiga tracker with synth-based
instruments — each defining waveforms plus ADSR and EGC (Envelope Generator Control)
tables — as well as regular PCM sample playback. Files are identified by "ISM!V1.2" at
offset 0. All multi-byte fields are big-endian.

Reference: NostalgicPlayer `InStereo10Worker.cs`

---

## File Layout

### File Header (204 bytes)

```
Offset  Size  Description
------  ----  -----------
0       8     Magic: "ISM!V1.2"
8       2     totalNumberOfPositions (u16BE)
10      2     totalNumberOfTrackRows (u16BE)
12      4     reserved
16      1     numberOfSamples (u8)
17      1     numberOfWaveforms (u8)
18      1     numberOfInstruments (u8)
19      1     numberOfSubSongs (u8)
20      1     numberOfEnvelopeGeneratorTables (u8)
21      1     numberOfAdsrTables (u8)
22      14    reserved
36      28    moduleName (Amiga string, null-padded)
64      140   reserved / text padding
```

### After Fixed Header (at offset 204)

```
numberOfSamples × 28 bytes   — sample info blocks:
                               [1 reserved, 23 name, 4 reserved]
numberOfSamples × u32BE       — sample byte lengths

numberOfEnvelopeGeneratorTables × 128 bytes — EGC tables
numberOfAdsrTables × 256 bytes              — ADSR tables
numberOfInstruments × ~20 bytes             — instrument info blocks
16 × 16 bytes                               — arpeggio tables (256 bytes total)
numberOfSubSongs × 16 bytes                 — sub-song info
14 bytes                                    — extra sub-song padding
numberOfWaveforms × 256 bytes               — waveform data (signed bytes)
totalNumberOfPositions × 16 bytes           — positions (4 channels × 4 bytes each)
(totalNumberOfTrackRows + 64) × 4 bytes     — track rows
PCM sample data                             — sequential 8-bit signed
```

---

## Detection Algorithm

```
1. buf.byteLength >= 204
2. buf[0..7] == "ISM!V1.2"
```

---

## Track Row Encoding (4 bytes per row)

```
byte 0: note period index (0 = empty; else index into IS10 period table)
byte 1: instrument index (0–numberOfInstruments)
byte 2: effect command
byte 3: effect parameter
```

---

## Period Table

InStereo! uses an extended Amiga period table (109 entries) identical to SonicArranger:

```
IS10_PERIODS[0] = 0 (silence)
IS10_PERIODS[1] = 13696  (lowest, ~5 octaves below C-1)
IS10_PERIODS[49] = 856   (C-1 in standard Amiga/ProTracker tuning)
IS10_PERIODS[108] = 28   (highest note)
```

**Note mapping:** `XM note = noteIndex + 12`
(noteIndex 49 with period 856 = XM note 61 = C-5 in DEViLBOX)

---

## Instrument Types

Instruments reference either:
- **Waveform-based synth**: uses one of the numbered waveform tables (256-byte signed PCM loop)
- **PCM sample**: uses a sample slot from the sample info blocks

Each instrument has ADSR and EGC table references, arpeggio table index, and basic
pitch/transpose parameters.

---

## Sub-Song Structure

The song can contain multiple sub-songs (e.g., ingame/title/ending). The positions table
is shared; each sub-song specifies a start position and length.

---

## PAL Clock

`PAL_CLOCK = 3546895` Hz — used for Amiga period → frequency conversion:
```
freq_hz = PAL_CLOCK / (2 × period)
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/InStereo1Parser.ts`
- **NostalgicPlayer reference:** `Source/Agents/Players/InStereo10/InStereo10Worker.cs`
