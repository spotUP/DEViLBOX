# Quadra Composer

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/QuadraComposerParser.ts`
**Extensions:** `*.emod`, `*.qc`
**UADE name:** QuadraComposer
**Reference files:** (identified in Amiga game/demo collections)
**Reference:** `Reference Code/libxmp-master/docs/formats/QuadraComposer.txt`
           `Reference Code/libxmp-master/src/loaders/emod_load.c`

---

## Overview

Quadra Composer is a 4-channel IFF-based Amiga tracker by Arne Johansen. Files use
the IFF `FORM`/`EMOD` structure with three sub-chunks: `EMIC` (module info), `PATT`
(pattern data), and `8SMP` (sample PCM data).

Note numbering differs from ProTracker: EMOD note byte 0–35 maps to C-1 through B-3
(zero-based octave indexing). Effects are ProTracker-compatible with minor differences.

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0x00    4     "FORM" — IFF container magic
0x04    4     Total chunk size (u32BE)
0x08    4     "EMOD" — form type
0x0C    ...   Chunk stream:
               EMIC — module info (instruments, patterns, song order)
               PATT — pattern data (4 bytes/cell, 4 channels, variable row count)
               8SMP — 8-bit PCM sample data (all samples concatenated)
```

---

## EMIC Chunk

The EMIC chunk contains:
- Module name and metadata
- Instrument list:
  - `name` (string)
  - `volume` (uint8, 0–64)
  - `length` (sample data size in bytes)
  - `hasLoop` (bit 0 of control byte)
  - `loopStart`, `loopEnd` (bytes)
- Pattern info list:
  - `origNumber` — original pattern number in EMOD file numbering
  - `rows` — number of rows (stored as `rowByte + 1`)
- Song order table

---

## Pattern Cell Format (4 bytes)

Each cell in a PATT chunk:

```
byte0  note (0–35 = C-1..B-3; 0xFF = empty)
byte1  instrument (1-based)
byte2  effect type
byte3  effect parameter
```

Note conversion: `xmNote = emodnote + 25` (offset by 25 semitones from EMOD base).

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/QuadraComposerParser.ts`
- **libxmp loader:** `Reference Code/libxmp-master/src/loaders/emod_load.c`
- **Format spec:** `Reference Code/libxmp-master/docs/formats/QuadraComposer.txt`

---

## Implementation Notes

**Current status:** NATIVE_SAMPLER

PCM samples are extracted from the `8SMP` chunk and played via the Sampler engine.
Pattern and instrument data are parsed from the `EMIC` chunk. The IFF `FORM`/`EMOD`
magic at offsets 0 and 8 provides unambiguous detection.
