# DTM (Digital Tracker)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/DTMParser.ts`
**Extensions:** `.dtm`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/Digital Tracker/`

---

## Overview

Digital Tracker (also "Digital Home Studio") is a big-endian IFF-style chunked Amiga
tracker format supporting up to 32 channels and 256 instruments. Three internal pattern
formats exist: `PT` (ProTracker-compatible 4-byte cells), `2.04` (compact XM-style
4-byte cells), and `2.06` (tick-based, not supported).

Reference: OpenMPT `Load_dtm.cpp`

---

## File Layout

### DTM File Header (22 bytes)

```
Offset  Size  Description
------  ----  -----------
0       4     Magic: "D.T." (0x442E542E)
4       4     headerSize (u32BE) — total header size (≥ 14)
8       2     type (u16BE) — must be 0
10      1     stereoMode: 0xFF = panoramic, 0x00 = LRRL
11      1     bitDepth (ignored)
12      2     reserved (u16BE)
14      2     speed (u16BE) — initial ticks/row (default 6)
16      2     tempo (u16BE) — initial BPM (default 125)
18      4     forcedSampleRate (u32BE) — used for PT pattern samples
22      ...   songName: null-terminated string, (headerSize - 14) bytes available
```

### IFF Chunks (follow the file header)

Each chunk: `id[4](u32BE) + length(u32BE) + data`

| Chunk ID | Description |
|----------|-------------|
| `S.Q.`   | Song sequence / order list |
| `PATT`   | Pattern container (wraps per-pattern chunks) |
| `DAPT`   | Pattern header (within PATT) |
| `DAIT`   | Pattern row data (within PATT, follows DAPT) |
| `INST`   | Instrument headers |
| `DAIT`   | Also used for sample PCM data |

---

## Detection Algorithm

```
1. u32BE(0) == 0x442E542E  ("D.T.")
2. u32BE(4) >= 14          (minimum header size)
3. u16BE(8) == 0           (type == 0)
```

---

## Pattern Formats

### PT Format (`DTM_PT_FORMAT = 0x00000000`)

4-byte ProTracker-compatible cells:
```
byte 0: instrHi[4] | period_hi[4]
byte 1: period_lo[8]
byte 2: instrLo[4] | effect[4]
byte 3: param[8]
Amiga period → XM note via standard period table
```

### 2.04 Format (`"2.04"` chunk ID)

4-byte XM-style cells:
```
byte 0: XM note (1–96; 0 = empty; 97 = note cut)
byte 1: instrument (0–255)
byte 2: volume column (0x10–0x50 = vol 0–64; other = effect)
byte 3: effect type, param split in various ways
```

### 2.06 Format (`"2.06"` chunk ID)

Tick-based format — not implemented; empty patterns returned.

---

## Instrument Headers

Instruments are read from the `INST` chunk. Each instrument entry describes a
sample with name, length, loop points, volume, finetune, and panning.

---

## Stereo Mode

```
stereoMode = 0xFF → panoramic: channel panning from file data
stereoMode = 0x00 → LRRL hard stereo (Amiga default)
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/DTMParser.ts`
- **OpenMPT reference:** `soundlib/Load_dtm.cpp`

