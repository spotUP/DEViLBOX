# Graoumf Tracker (GTK / GT2)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/GraoumfTracker2Parser.ts`
**Extensions:** `gtk.*`, `gt2.*`, UADE eagleplayer
**UADE name:** GraoumfTracker
**Reference files:** `Reference Music/Graoumf Tracker 2/` (60 files)
**Replayer reference:** Graoumf Tracker format specification

---

## Overview

Graoumf Tracker was an Atari Falcon/PC tracker by Vincent Voois. Two format versions exist:
- **GTK** (Graoumf Tracker 1, file versions 1–4) — fixed-length structure
- **GT2** (Graoumf Tracker 2, file versions 5–9) — chunk-based IFF-like structure

Both are multi-channel PCM trackers with signed 8-bit or 16-bit samples.

---

## GTK Format (versions 1–4)

### Header (206 bytes)

```
Offset  Size  Description
------  ----  -----------
0x00    3     Magic: "GTK"
0x03    1     fileVersion (1–4)
0x04    32    songName (null-padded ASCII)
0x24    160   smallComment (null-padded ASCII)
0x84    2     numSamples (uint16BE)
0x86    2     numRows (uint16BE) — rows per pattern
0x88    2     numChannels (uint16BE)
0x8A    2     numOrders (uint16BE)
0x8C    2     restartPos (uint16BE)
```

### Sample Headers

Following the file header:

- **Versions 1–3:** 48 bytes per sample header
- **Version 4:** 64 bytes per sample header

### Order List

512 bytes of uint16BE pattern indices.

### Pattern Data

`numOrders × numRows × numChannels × (4 or 5 bytes per cell)`:
- 4 bytes/cell (versions 1–3)
- 5 bytes/cell (version 4, adds an extra effect byte)

### Sample Data

Consecutive raw PCM data blocks following pattern data.

---

## GT2 Format (versions 5–9)

### Header (236 bytes)

```
Offset  Size  Description
------  ----  -----------
0x00    3     Magic: "GT2"
0x03    1     fileVersion (5–9)
0x04    4     headerSize (uint32BE) — offset to first chunk
0x08    32    songName
0x28    160   smallComment
...     1     day, 1 month, 2 year (uint16BE)
...     24    trackerName
...     2     speed (uint16BE)
...     2     tempo (uint16BE) — BPM
...     2     masterVol (uint16BE)
...     2     numPannedTracks (uint16BE)
```

### Chunk Stream

After `headerSize` offset, IFF-style chunks:

| Chunk | Description |
|-------|-------------|
| `PATS` | Channel count |
| `SONG` | Order list |
| `PATD` | Pattern data (one per pattern) |
| `SAMP` | Sample data (8-bit PCM) |
| `SAM2` | Sample data (16-bit PCM) |
| `INST` | Instrument metadata |

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/GraoumfTracker2Parser.ts`
- **UADE player:** `Reference Code/uade-3.05/players/GraoumfTracker`

---

## Implementation Notes

**Current status:** NATIVE_SAMPLER

PCM samples are extracted from the GTK/GT2 file and played via the Sampler engine.
Both fixed-length (GTK) and chunk-based (GT2) layouts are handled.

The format is notable for its dual Atari/PC heritage — Graoumf Tracker ran on both
Atari Falcon (68k) and PC (x86), making it one of the few Amiga-adjacent trackers
with cross-platform origins.
