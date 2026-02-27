# SoundMon (Brian Postma Sound Monitor)

**Status:** FULLY_NATIVE — custom WASM synthesizer
**Parser:** `src/lib/import/formats/SoundMonParser.ts`
**Extensions:** `.bp`, `.bp3`, `.sndmon`
**UADE name:** N/A (native WASM synth)
**Reference files:** `Reference Music/SoundMon/`

---

## Overview

SoundMon (also called BP Sound Monitor) is a 4-channel Amiga tracker by Brian Postma.
Unlike ProTracker, SoundMon instruments are primarily software synthesizers: each defines
an ADSR envelope, LFO, EG (envelope generator), FX chain, and modulation tables. Regular
PCM samples are also supported. Three versions exist (V1, V2, V3), identified by a 4-byte
magic string at offset 26.

Reference: FlodJS `BPPlayer.js` by Christian Corti (Neoart)

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0       26    Song title (ASCII, null-padded)
26      4     Format version magic:
              "BPSM" = Version 1
              "V.2\0" = Version 2
              "V.3\0" = Version 3
29      1     Number of synth tables (V2/V3 only)
30      2     Song length (u16BE, number of sequence steps)
32      ...   15 instrument definitions (synth or PCM)
...     ...   Track/sequence data (songLength × 4 entries, 4 bytes each)
...     ...   Pattern data (3 bytes per row: note, sampleOrEffect, param)
...     ...   Synth table data (numTables × 64 bytes, V2/V3 only)
...     ...   Sample PCM data (8-bit signed)
```

---

## Detection Algorithm

```
1. buf.byteLength >= 30
2. buf[26..29] in {"BPSM", "V.2\0", "V.3\0"}
```

---

## Instrument Definitions

SoundMon supports 15 instruments per song (indices 1–15). Each instrument is either a
**synth instrument** (software synthesizer) or a **sample instrument** (PCM).

### Synth Instrument Parameters

```
ADSR:
  - Attack time
  - Decay time
  - Sustain level
  - Release time

LFO (Low Frequency Oscillator):
  - Type: sine, ramp, square, random
  - Speed
  - Depth

EG (Envelope Generator):
  - Pitch envelope with multiple points

FX:
  - Modulation table (up to 64 steps, V2/V3)
  - Waveform type (sine, square, sawtooth, triangle)
  - Resonance / filter
  - Portamento
```

---

## Pattern Cell Encoding (3 bytes per row)

```
byte 0: note value (0 = empty; else Amiga period table index)
byte 1: high nibble = instrument (1-15; 0 = no change)
        low nibble  = effect command
byte 2: effect parameter
```

---

## Period Table

SoundMon uses an extended Amiga period table with 84 entries (7 octaves). The player
indexes the table with `note + 35`. The standard ProTracker period range (C-1=856 down
to B-4=57) is a subset.

```
Full range: 6848 (low) → 57 (high), 84 entries
PT range:   856 (C-1)  → 57 (B-4),  36 × 4 = 48 entries (4 octaves in PT tuning)
```

---

## Sequence Format

The sequence is `songLength × 4` bytes. Each group of 4 bytes specifies the pattern
reference for each of the 4 channels at that step:

```
Per step, per channel (4 channels):
  1 byte: pattern block index (0 = silent)
```

---

## Synth Engine

DEViLBOX uses a custom WASM synthesizer for SoundMon. The C synth engine implements:
- Amiga period table lookup for pitch
- ADSR envelope generator (attack/decay/sustain/release)
- LFO with configurable shape, speed, depth
- Pitch envelope (EG)
- Modulation tables (V2/V3 synth table data)
- Waveform generation (sine, sawtooth, square, triangle, noise)

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/SoundMonParser.ts`
- **WASM synth:** `soundmon-wasm/`
- **FlodJS reference:** `BPPlayer.js` by Christian Corti (Neoart)
