# Music Maker 4V / 8V

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/MusicMakerParser.ts`
**Extensions:** `mm4.*`, `sdata.*` (4V); `mm8.*` (8V); `.mm4` (IFF 4V)
**UADE name:** MusicMaker_4V, MusicMaker_8V
**Reference files:** `Reference Music/MusicMaker/`
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/music_maker/`

---

## Overview

Music Maker is an Amiga tracker by Thomas Winischhofer. Two voice variants exist:
- **4V** — 4-channel variant (prefixes `mm4.*`, `sdata.*`)
- **8V** — 8-channel variant (prefix `mm8.*`)

Both variants support an IFF FORM container with `MMV4`/`MMV8` type tags, as well as legacy
split-file formats detected by filename prefix. Instrument names are extracted from the `INAM`
IFF chunk (Amiga library paths, e.g. `System:Instruments/egit2`).

---

## Detection Algorithm

### 4V Format

```
IFF path:
1. buf.byteLength >= 12
2. buf[0..3] == "FORM"
3. buf[8..11] == "MMV4"
   OR (buf[8..11] == "MMV8" AND filename ends with ".mm4")

Legacy prefix path:
1. filename (lowercase basename) starts with "mm4." OR "sdata."
```

### 8V Format

```
IFF path:
1. buf.byteLength >= 12
2. buf[0..3] == "FORM"
3. buf[8..11] == "MMV8"  AND NOT filename ends with ".mm4"

Legacy prefix path:
1. filename (lowercase basename) starts with "mm8."
```

---

## IFF Chunk Layout (offset 12+)

```
Chunk ID  Description
--------  -----------
SDAT      Song data: 4 bytes (internal size) + 0x5345 magic ("SE") + song name (20 bytes)
INST      Instrument data (see below)
INAM      Instrument names (library paths, 24 chars each)
```

### INST Chunk

```
Optional SEI1 header (if present):
  "SEI1" (4 bytes) + "XX" (2 bytes) + inst_count (u16BE)
  → overrides default count of 26

N × 8-byte instrument entries:
  [0..1]  sample_length_bytes  (u16BE; 0 = empty slot)
  [2..3]  repeat_length_bytes  (u16BE; 0 = one-shot, >0 = looping)
  [4..5]  loop_start_bytes     (u16BE)
  [6..7]  loop_length_words    (u16BE)

4 bytes: defsnd block (skipped)
Concatenated signed 8-bit PCM (sequential, one block per non-empty instrument)
```

### INAM Chunk

```
4-byte header:
  [0..1]  entry_size  (u16BE) — typically 60
  [2..3]  name_off    (u16BE) — typically 36 → 24-byte name field per entry

Instrument names: Amiga library paths (e.g. "System:Instruments/egit2")
First DEFAULT_INSTNUM (26) entries map 1:1 to INST instrument slots.
```

---

## Channel Configuration

- 4V: 4 channels; 8V: 8 channels
- LRRL Amiga panning for 4V; extended for 8V
- Sample rate base: 8363 Hz (C-3 at Amiga period 214, PAL)

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/MusicMakerParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/music_maker/`
