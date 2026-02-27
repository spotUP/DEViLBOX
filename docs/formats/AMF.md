# AMF (Advanced Music Format / ASYLUM Music Format)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/AMFParser.ts`
**Extensions:** `.amf`, `.dmf`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/AMF/`

---

## Overview

The `.amf` extension covers two completely different PC tracker formats:

1. **ASYLUM Music Format (AMF0)** — used in *Crusader: No Remorse* and *Crusader: No Regret*
2. **DSMI Advanced Music Format (AMF/DMF)** — used in many DOS games (Pinball World, Webfoot games)

Both are detected by signature at offset 0.

Reference: OpenMPT `soundlib/Load_amf.cpp`

---

## ASYLUM Music Format (AMF0)

### File Layout

```
Offset  Size  Description
------  ----  -----------
0       32    Signature: "ASYLUM Music Format V1.0\0" (25 bytes + padding)
32      1     defaultSpeed (u8)
33      1     defaultTempo (u8)
34      1     numSamples (u8, ≤ 64)
35      1     numPatterns (u8)
36      1     numOrders (u8)
37      1     restartPos (u8)
38      256   orders[256] (u8 each)
294     2368  64 × AsylumSampleHeader (37 bytes each):
              +0   name[22]      null-terminated
              +22  finetune(u8)  MOD finetune nibble 0–15
              +23  volume(u8)    0–64
              +24  transpose(i8) semitone transpose
              +25  length(u32LE)
              +29  loopStart(u32LE)
              +33  loopLength(u32LE)  (>2 = loop active)
2662    ...   numPatterns × 64 rows × 8 channels × 4 bytes/cell
...     ...   Sample PCM data (8-bit signed, sequential)
```

### ASYLUM Pattern Cell (4 bytes)

```
byte 0: note     (0 = empty; 1-based; XM note = note + 12 + NOTE_MIN)
byte 1: instr    (0 = no instrument)
byte 2: command  (MOD-style effect type)
byte 3: param    (effect parameter)
```

---

## DSMI AMF / DMF

### File Layout

```
Offset  Size  Description
------  ----  -----------
0       3     Signature: "AMF" (0x414D46) or "DMF" (0x444D46)
3       1     version (u8): AMF valid = 1, 8–14; DMF valid = 10–14
4       32    title[32] (AMF only; DMF skips this)
4/36    1     numSamples (u8)
...     1     numOrders (u8)
...     2     numTracks (u16LE)
...     1     numChannels (u8, version ≥ 9 only)
...     ...   chanPan[numChannels] (i8, version ≥ 11: 32 bytes; version 9–10: skip)
...     2     tempo/speed (version ≥ 13: tempo u8 + speed u8)
...     ...   order table: numOrders × (patLen if v≥14) × (numChannels × u16LE track refs)
...     ...   sample headers (old/new/compact depending on version)
...     ...   track map: numTracks × u16LE
...     ...   track data: variable-length track blocks
...     ...   sample PCM data
```

### AMF Track Event Format (3 bytes per event)

```
byte 0: row (0-based position in pattern)
byte 1: command
        0x00..0x7E → note event (command = MIDI note; value = volume or 0xFF)
        0x7F       → instrument without note retrigger
        0x80       → instrument (value = instr index + 1)
        0x81–0x97  → effects (porta, vibrato, volume slide, etc.)
byte 2: value
```

---

## Detection Algorithm

```
ASYLUM: buf[0..24] == "ASYLUM Music Format V1.0\0"

DSMI:   buf[0..2] == "AMF" or "DMF"
        AND version in {1} ∪ {8..14} (AMF) or {10..14} (DMF)
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/AMFParser.ts`
- **OpenMPT reference:** `soundlib/Load_amf.cpp`

