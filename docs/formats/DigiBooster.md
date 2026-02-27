# DigiBooster / DigiBooster Pro

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/DigiBoosterParser.ts`
**Extensions:** `*.digi`, `*.dbm`, UADE eagleplayer
**UADE name:** DigiBoosterPro
**Reference files:** (files ripped from Amiga games)
**Reference:** `Reference Code/openmpt-master/soundlib/Load_dbm.cpp`

---

## Overview

DigiBooster is an 8-channel Amiga tracker by Teijo Kinnunen with an extended
effect set beyond standard ProTracker. Two format variants exist:

- **DigiBooster 1.x** — magic `"DBMX"` at offset 0 (older format)
- **DigiBooster Pro 2.x** — magic `"DBM0"` at offset 0 (newer; adds volume/panning envelopes)

Both use an **IFF-style chunk structure** (without IFF padding rules).

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0x00    4     Magic: "DBMX" (v1.x) or "DBM0" (v2.x Pro)
0x04    ...   Chunk stream until EOF (no IFF padding)
```

### Chunk Types

| ID     | Description |
|--------|-------------|
| `INFO` | General info: channels, patterns, songs, instruments, samples |
| `NAME` | Module name (44 bytes) |
| `SONG` | Song structures: name, position list, length |
| `INST` | Instrument definitions (name, sample number, volume, etc.) |
| `PATT` | Pattern data (one PATT chunk per pattern) |
| `SMPL` | Sample data (raw PCM) |
| `VENV` | Volume envelopes (DBM0 only) |
| `PENV` | Panning envelopes (DBM0 only) |

### INFO Chunk

```
Offset  Size  Description
------  ----  -----------
0x00    2     numChannels (uint16BE)
0x02    2     numPatterns (uint16BE)
0x04    2     numSongs (uint16BE)
0x06    2     numInstruments (uint16BE)
0x08    2     numSamples (uint16BE)
```

---

## Pattern Format

Patterns use a compact column-based encoding. Each cell in the pattern grid
is variable-length (note, instrument, volume, effect(s)).

DigiBooster supports more effects than standard ProTracker, including:
- Extended vibrato/tremolo
- Sample offset extensions
- Channel volume control
- Arpeggio extensions

---

## Sample Format

Samples are raw signed 8-bit or 16-bit PCM (Amiga Paula format), stored
consecutively in the `SMPL` chunk. Instrument definitions in `INST` chunks
reference samples by index.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/DigiBoosterParser.ts`
- **OpenMPT reference:** `Reference Code/openmpt-master/soundlib/Load_dbm.cpp`

---

## Implementation Notes

**Current status:** NATIVE_SAMPLER

PCM samples are extracted from the `SMPL` chunk and played via the Sampler engine.
Pattern and instrument data are parsed; volume/panning envelope support (`VENV`/`PENV`)
is available in DBM0 files.

The `"DBMX"` vs `"DBM0"` magic distinguishes the version at the first 4 bytes.
DigiBooster Pro (`DBM0`) adds envelope chunks not present in the older `DBMX` format.
