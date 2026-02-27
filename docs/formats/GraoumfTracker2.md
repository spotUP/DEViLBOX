# Graoumf Tracker 1/2 (GTK/GT2)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/GraoumfTracker2Parser.ts`
**Extensions:** `.gtk`, `.gt2`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/Graoumf Tracker/`

---

## Overview

Graoumf Tracker was an Atari Falcon/PC tracker by Vincent Voois. Two format versions
exist:
- **GTK** (Graoumf Tracker 1) — file versions 1–4, fixed-length sequential structure
- **GT2** (Graoumf Tracker 2) — file versions 5–9, chunk-based IFF structure

Both are big-endian.

Reference: OpenMPT `soundlib/Load_gt2.cpp`

**Note:** `GraoumfTracker.md` documents the earlier GTK-only UADE-based format;
this parser handles both GTK (native) and GT2 (native).

---

## GTK File Layout (versions 1–4)

### Header (206 bytes)

```
Offset  Size  Description
------  ----  -----------
0       3     Magic: "GTK" (0x47 0x54 0x4B)
3       1     fileVersion (u8, 1–4)
4       32    songName[32]
36      160   smallComment[160]
196     2     numSamples (u16BE)
198     2     numRows (u16BE) — rows per pattern
200     2     numChannels (u16BE)
202     2     numOrders (u16BE)
204     2     restartPos (u16BE)
```

### Sample Headers

`numSamples × (48 or 64 bytes depending on version)`:
- v1–2: 48 bytes per header
- v3–4: 64 bytes per header

Each header: name, length, loopStart, loopLength, volume, finetune, panning.

### Order List

512 bytes (256 × u16BE pattern indices).

### Pattern Data

`numOrders × numRows × numChannels × (4 or 5 bytes/cell)`:
- v1–2: 4 bytes/cell
- v3–4: 5 bytes/cell (extra effect byte)

**GTK Pattern Cell (4 bytes):**
```
byte 0: note (0–71; 0=empty)
byte 1: instrument (1-based; 0=no instrument)
byte 2: effect command
byte 3: effect parameter
```

### Sample PCM

Consecutive raw signed PCM after pattern data.

---

## GT2 File Layout (versions 5–9)

### Header (236 bytes)

```
Offset  Size  Description
------  ----  -----------
0       3     Magic: "GT2" (0x47 0x54 0x32)
3       1     fileVersion (u8, 5–9)
4       4     headerSize (u32BE)
8       32    songName[32]
40      160   smallComment[160]
200     2     day (u16BE)
202     1     month (u8)
203     2     year (u16BE)
205     24    trackerName[24]
229     2     speed (u16BE)
231     2     tempo (u16BE)
233     2     masterVol (u16BE)
235     2     numPannedTracks (u16BE)
```

### IFF Chunks (after headerSize offset)

| Chunk ID | Description |
|----------|-------------|
| `PATS`   | Number of channels (u16BE) |
| `SONG`   | Order list |
| `PATD`   | Pattern data (one chunk per pattern) |
| `SAMP`   | Sample data (v5–6) |
| `SAM2`   | Sample data (v7+) |
| `INST`   | Instrument headers |
| `TNAM`   | Track names |
| `TCN1`/`TCN2` | Timing & configuration |
| `TVOL`   | Track volumes |
| `MIXP`   | Mix preset |
| `XCOM`   | Extended comment |
| `ENDC`   | End of chunks |

---

## Detection Algorithm

```
GTK: buf[0..2] == "GTK" and buf[3] in [1, 2, 3, 4]
GT2: buf[0..2] == "GT2" and buf[3] in [5, 6, 7, 8, 9]
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/GraoumfTracker2Parser.ts`
- **OpenMPT reference:** `soundlib/Load_gt2.cpp`

