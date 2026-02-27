# DigiBooster Pro (DBM0)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/DigiBoosterProParser.ts`
**Extensions:** `*.dbm`
**UADE name:** DigiBoosterPro
**Reference files:** (identified in Amiga game/demo collections)
**Reference:** `Reference Code/openmpt-master/soundlib/Load_dbm.cpp`

---

## Overview

DigiBooster Pro is an Amiga tracker by Toni Lönnberg. The `.dbm` format uses an
IFF-like chunk structure. This is **distinct** from DigiBooster 1.x (`.digi`), which
is handled by `DigiBoosterParser.ts` — see `DigiBooster.md`.

Magic: `"DBM0"` at offset 0, followed by tracker version bytes (major must be ≤ 3).

---

## File Layout

### Header (8 bytes)

```
Offset  Size  Description
------  ----  -----------
0x00    4     "DBM0" — magic
0x04    1     trkVerHi — tracker version major (must be ≤ 3)
0x05    1     trkVerLo — tracker version minor
0x06    2     reserved
```

### Chunk Stream

Each chunk:
```
id[4]    4-byte ASCII chunk identifier
length   uint32BE
data     <length> bytes
```

---

## Chunk Types

| ID     | Description |
|--------|-------------|
| `NAME` | Song name (raw string) |
| `INFO` | Global info: numInstruments, numSamples, numSongs, numPatterns, numChannels (u16BE each) |
| `SONG` | Song order lists: name[44] + u16BE numOrders + numOrders × u16BE pattern indices |
| `INST` | Instrument headers (50 bytes each) |
| `VENV` | Volume envelopes |
| `PENV` | Panning envelopes |
| `PATT` | Pattern data (packed) |
| `PNAM` | Pattern names |
| `SMPL` | Sample PCM data |
| `DSPE` | DSP echo settings (skipped) |
| `MPEG` | MPEG-compressed samples (not supported; skipped) |

---

## Instrument Header (50 bytes, big-endian)

```
name[30]      — null-terminated or padded
sample u16    — 1-based sample index (0 = no sample)
volume u16    — 0–64
sampleRate u32 — C5 base rate
loopStart u32
loopLength u32
panning i16   — -128..128
flags u16     — 0x01=loop, 0x02=pingpong
```

---

## Pattern Data (PATT Chunk)

Per pattern:
```
numRows    uint16BE
packedSize uint32BE
<packed data>
```

Packed data stream:
- `0x00` = end of row
- Otherwise: channel number (1-based), then mask byte:
  - bit 0: note follows
  - bit 1: instrument follows
  - bit 2: command2 follows
  - bit 3: param2 follows
  - bit 4: command1 follows
  - bit 5: param1 follows

Note encoding: `0x1F` = key-off; else `((rawNote >> 4) × 12) + (rawNote & 0x0F) + 13`.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/DigiBoosterProParser.ts`
- **OpenMPT reference:** `Reference Code/openmpt-master/soundlib/Load_dbm.cpp`

---

## Implementation Notes

**Current status:** NATIVE_SAMPLER

PCM samples are extracted from the `SMPL` chunk and played via the Sampler engine.
The `"DBM0"` magic and version byte (≤ 3) unambiguously identify this format.

**Relation to DigiBooster.md:** `DigiBooster.md` covers the older DigiBooster 1.x
format (`"DBMX"` magic, handled by `DigiBoosterParser.ts`). This document covers
DigiBooster Pro (`"DBM0"` magic, handled by `DigiBoosterProParser.ts`).
