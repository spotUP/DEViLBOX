# MadTracker 2 (MT2)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/MadTracker2Parser.ts`
**Extensions:** `.mt2`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/MadTracker 2/`

---

## Overview

MadTracker 2 was a Windows tracker by Yannick Delwiche. Files are identified by the
"MT20" magic signature and support up to 64 channels, 256 patterns, 255 instruments,
and 256 samples. The format uses run-length compressed patterns with 7-byte cells
and optional automation envelopes.

Reference: OpenMPT `soundlib/Load_mt2.cpp`

---

## File Layout

### MT2 File Header (126 bytes)

```
Offset  Size  Description
------  ----  -----------
0       4     Magic: "MT20" (0x4D 0x54 0x32 0x30)
4       4     userID (u32LE)
8       2     version (u16LE, 0x200–0x2FF = v2.x)
10      32    trackerName[32]
42      64    songName[64]
106     2     numOrders (u16LE, max 256)
108     2     restartPos (u16LE)
110     2     numPatterns (u16LE)
112     2     numChannels (u16LE, 1–64)
114     2     samplesPerTick (u16LE)
116     1     ticksPerLine (u8)
117     1     linesPerBeat (u8)
118     4     flags (u32LE):
              bit 0 = packed patterns
              bit 1 = automation envelopes
119     2     numInstruments (u16LE, < 255)
121     2     numSamples (u16LE, < 256)
```

### After File Header

```
Orders: 256 bytes (u8 array)

Drums size (u16LE): if != 0 → MT2DrumsData (274 bytes follows)

Extra data: u32LE size + data bytes

Patterns: numPatterns × [numRows u16LE, chunkSize u32LE, data]

Extra chunks (4-byte ID + 4-byte LE size):
  "BPM+" — double LE tempo value
  "TRKS" — track settings (volume, routing)
  "TRKL" — track names (null-separated)
  "PATN" — pattern names (null-separated)
  "MSG\0" — song message text
  "SUM\0" — song summary (artist name)
  "VST2" — VST plugin data (skipped)

Instruments: 255 × [name[32], dataLength u32LE, instrument data]

Sample headers: 256 × [name[32], dataLength u32LE, sample data]

Sample groups: per instrument, numSamples × MT2Group (8 bytes each)

Sample PCM: per sample, raw 8-bit or 16-bit LE PCM
```

---

## Detection Algorithm

```
1. buf[0..3] == "MT20"
2. u16LE(8) in [0x200, 0x2FF]  (version 2.x)
3. u16LE(112) in [1, 64]        (numChannels)
4. u16LE(110) <= 256            (numPatterns)
```

---

## Pattern Cell Encoding (7 bytes per cell, MT2Command)

```
byte 0: note    (0=empty, 97=key-off, else note + 12 + NOTE_MIN → XM note)
byte 1: instr   (0=no instrument, 1-based)
byte 2: vol     (0x10–0x90 = volume 0–64; 0xA0–0xDF = volume slide commands)
byte 3: pan     (0x00–0x80 = pan L–R; 0xFF = no pan)
byte 4: fxcmd   (effect command)
byte 5: fxparam1
byte 6: fxparam2
```

**Packed patterns** (flags & 0x01): run-length encoded using an infobyte mask:
- bit 0 = note present
- bit 1 = instrument present
- bit 2 = volume present
- bit 3 = panning present
- bit 4 = effect present
- bits 5–7 = skip N channels (RLE repeat)

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/MadTracker2Parser.ts`
- **OpenMPT reference:** `soundlib/Load_mt2.cpp`

