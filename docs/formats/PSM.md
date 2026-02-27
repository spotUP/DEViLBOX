# PSM (ProTracker Studio / Epic MegaGames MASI)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/PSMParser.ts`
**Extensions:** `.psm`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/PSM/`

---

## Overview

Two distinct PSM formats share the `.psm` extension:

1. **New PSM** (`"PSM "`) — RIFF-like chunk-based format used in Epic MegaGames games
   (Jazz Jackrabbit, Zone 66, Radix, Pinball Fantasies, etc.)
2. **PSM16** (`"PSM\xFE"`) — older flat-file format from earlier Epic MegaGames productions

Both are little-endian.

Reference: OpenMPT `soundlib/Load_psm.cpp`

---

## New PSM Layout

### File Header (12 bytes)

```
Offset  Size  Description
------  ----  -----------
0       4     "PSM " (0x50534D20)
4       4     fileSize (u32LE = filesize - 12)
8       4     "FILE" (0x46494C45)
```

### RIFF-like Chunks (4-byte ID + 4-byte LE length)

| Chunk | Description |
|-------|-------------|
| `SDFT` | "MAINSONG" magic — identifies new PSM; also identifies Sinaria variant |
| `TITL` | Song title (space-padded) |
| `SONG` | Subsong data (contains sub-chunks: `OPLH`, `PPAN`, `PATT`, `DSAM`) |
| `DSMP` | Sample data (96-byte header + delta-PCM) |
| `PBOD` | Pattern data |

### SONG → OPLH Sub-chunk Opcodes

```
0x00 — end of OPLH
0x01 — order list entry (4-byte pattern ID "P0  "/"P13 " or "PATT0   " for Sinaria)
0x02 — play range (skip 4 bytes)
0x03 — jump loop (restart pos + skip 1)
0x04 — jump line (restart pos)
0x05 — channel flip (channel, type)
0x06 — transpose (skip 1)
0x07 — default speed (1 byte)
0x08 — default tempo (1 byte)
0x0C — sample map table (6 bytes: 00 FF 00 00 01 00)
0x0D — channel panning (channel, pan, type)
0x0E — channel volume (channel, vol)
```

### PBOD Pattern Data

```
length u32LE (repeated twice)
pattern ID (4 or 8 bytes depending on variant)
numRows u16LE
rows: each row starts with u16LE rowSize, then (rowSize - 2) bytes of events
  Each event: flags u8, channel u8, then conditional:
    if note:   note(u8) + instrument(u8)
    if vol:    volume(u8)
    if effect: effectType(u8) + effectParam(u8)
```

### DSMP Sample Header (96 bytes)

Sample PCM is stored as 8-bit delta-PCM (difference-coded). Sinaria variant uses a
slightly different header structure.

---

## PSM16 Layout

### File Header (146 bytes)

```
Offset  Size  Description
------  ----  -----------
0       4     "PSM\xFE" (0x50534DFE)
4       59    songName[59]
63      1     lineEnd (0x1A)
64      1     songType (u8)
65      1     formatVersion (0x10 or 0x01)
66      1     patternVersion (must be 0)
67      1     songSpeed (u8)
68      1     songTempo (u8)
69      1     masterVolume (u8)
70      2     songLength (u16LE)
72      2     songOrders (u16LE)
74      2     numPatterns (u16LE)
76      2     numSamples (u16LE)
78      2     numChannelsPlay (u16LE)
80      2     numChannelsReal (u16LE)
82      4     orderOffset (u32LE, file offset - 4 from "PORD")
86      4     panOffset (u32LE, from "PPAN")
90      4     patOffset (u32LE, from "PPAT")
94      4     smpOffset (u32LE, from "PSAH")
98      4     commentsOffset (u32LE)
102     4     patSize (u32LE)
```

---

## Detection Algorithm

```
New PSM:  buf[0..3] == "PSM " AND buf[8..11] == "FILE"
PSM16:    buf[0..3] == "PSM\xFE"
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/PSMParser.ts`
- **OpenMPT reference:** `soundlib/Load_psm.cpp`

