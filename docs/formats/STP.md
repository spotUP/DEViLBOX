# STP (SoundTracker Pro II)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/STPParser.ts`
**Extensions:** `.stp`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/SoundTracker Pro/`

---

## Overview

SoundTracker Pro II is an Amiga 4-channel tracker by Stefan Danes (1990). It supports
variable pattern lengths, multiple sample loops per instrument, and CIA-based tempo
control. Three format versions (0, 1, 2) exist with progressive additions.

Reference: OpenMPT `Load_stp.cpp`

---

## File Layout

### STP File Header (204 bytes)

```
Offset  Size  Description
------  ----  -----------
0       4     Magic: "STP3" (0x53 0x54 0x50 0x33)
4       2     version (u16BE): 0, 1, or 2
6       1     numOrders (u8, ≤ 128)
7       1     patternLength (u8) — default pattern length in rows
8       128   orderList[128] (u8 each, pattern indices)
136     2     speed (u16BE) — initial ticks per row
138     2     speedFrac (u16BE) — fractional speed (low byte used)
140     2     timerCount (u16BE) — CIA timer count (tempo = 125 × 3546 / timerCount)
142     2     flags (u16BE)
144     4     reserved (u32BE)
148     2     midiCount (u16BE, always 50)
150     50    midi[50]
200     2     numSamples (u16BE)
202     2     sampleStructSize (u16BE) — per-sample chunk size (v0/v1)
```

### Sample Headers

Each sample is a chunk prefixed by `actualSmp (u16BE)` (1-based index).

**Version 2:** chunk additionally has `chunkSize (u32BE)` prefix.

```
Within each chunk:
  path[31]       — disk path (v0/v1: fixed; v2: null-terminated string)
  flags (u8)     — ignored
  name[30]       — sample name (v0/v1: fixed; v2: null-terminated string)
  length (u32BE) — sample length in bytes
  volume (u8)    — 0–64
  reserved (u8)
  loopStart (u32BE)
  loopLength (u32BE)
  defaultCommand (u16BE) — ignored
  defaultPeriod (u16BE)  — v1+ only
  finetune (u8)          — v2 only
  reserved (u8)
```

**v ≥ 1:** additionally: `numLoops (u16BE)` + `numLoops × {loopStart(u32BE), loopLength(u32BE)}`

---

## Pattern Data

**Version 0:** `numPatterns (u16BE)` precedes pattern data. Patterns are fixed 4-channel ×
`patternLength` rows.

**Version 1+:** Patterns prefixed by:
```
actualPat (u16BE)   — pattern index; 0xFFFF = end of patterns
length (u16BE)      — number of rows
channels (u16BE)    — number of channels (always 4)
```

---

## Detection Algorithm

```
1. buf.byteLength >= 4
2. buf[0..3] == "STP3"
3. u16BE(4) in {0, 1, 2}  (version)
```

---

## Pattern Cell Encoding (4 bytes per cell)

```
byte 0: instr    (1-based instrument number; 0 = no instrument)
byte 1: note     (1-based note index; 0 = empty)
         XM note = NOTE_MIDDLEC - 36 + note
byte 2: command  (effect command)
byte 3: param    (effect parameter)
```

---

## Tempo

CIA timer-based tempo:
```
BPM = 125 × 3546 / timerCount   (approx)
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/STPParser.ts`
- **OpenMPT reference:** `soundlib/Load_stp.cpp`

