# DSM (DSIK Sound Module / Dynamic Studio)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/DSMParser.ts`
**Extensions:** `.dsm`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/DSM/`

---

## Overview

The `.dsm` extension covers two completely different formats:

1. **DSIK RIFF DSMF** — used in Silverball and other DOS games by Digital Sound Interface Kit
2. **Dynamic Studio DSm** — produced by DSM/Dynamic Studio tracker

Both are little-endian. Detection by magic at offset 0.

Reference: OpenMPT `soundlib/Load_dsm.cpp`

---

## Format A — DSIK RIFF DSMF

### File Layout

```
Offset  Size  Description
------  ----  -----------
0       4     "RIFF" (with size) or "DSMF" (if RIFF wrapper absent)
4       4     RIFF size (u32LE, if RIFF header present)
8       4     "DSMF" identifier
...     ...   IFF-like RIFF chunks (little-endian):
```

| Chunk ID | Description |
|----------|-------------|
| `SONG`   | Song header (64 bytes) |
| `PATT`   | Pattern data (64 rows, compressed) |
| `INST`   | Sample header + PCM data |

**SONG Chunk (64 bytes):**
```
+0   songName[28]
+28  version (u16LE)
+30  flags (u16LE)
+32  orderPos (u16LE)
+34  restartPos (u16LE)
+36  numOrders (u16LE)
+38  numSamples (u16LE)
+40  numPatterns (u16LE)
+42  numChannels (u16LE, 1–16)
+44  globalVol (u8)
+45  masterVol (u8)
+46  speed (u8)
+48  bpm (u8)
+52  chanPan[16] (u8 each, 0=L..255=R, 128=center)
```

**PATT Chunk (compressed, 64 rows × N channels):**
Each row: channel mask byte + per-channel data. If mask == 0 → empty row.
Channel data: note(u8) + instr(u8) + vol(u8) + command(u8) + param(u8)

---

## Format B — Dynamic Studio DSm

### File Layout

```
Offset  Size  Description
------  ----  -----------
0       4     Magic: "DSm\x1A" (0x44 0x53 0x6D 0x1A)
4       1     version (u8, must be 0x20)
5       28    songName[28]
33      2     numChannels (u16LE)
35      2     numOrders (u16LE)
37      2     numSamples (u16LE)
39      2     numPatterns (u16LE)
41      2     globalVol (u16LE)
43      2     speed (u16LE)
45      2     bpm (u16LE)
47      1     panPos[numChannels] — per-channel panning
...     ...   order list: numOrders bytes
...     ...   track names (optional, null-terminated)
...     ...   sample headers (sequential)
...     ...   pattern data (fixed 4 bytes/cell × 16 channels × 64 rows)
...     ...   sample PCM data
```

**Pattern cell (DSm, 4 bytes):**
```
byte 0: note (0 = empty; 1-based; XM = note + NOTE_MIN)
byte 1: instrument (1-based)
byte 2: volume (0–64; 255 = no volume)
byte 3: effect type (MOD numbering)
+ byte 4: effect parameter
```

---

## Detection Algorithm

```
DSIK: buf[0..3] == "RIFF" and buf[8..11] == "DSMF"
  OR  buf[0..3] == "DSMF"

DSm:  buf[0..3] == "DSm\x1A" and buf[4] == 0x20
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/DSMParser.ts`
- **OpenMPT reference:** `soundlib/Load_dsm.cpp`

