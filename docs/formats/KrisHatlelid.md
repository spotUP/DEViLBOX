# Kris Hatlelid

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/KrisHatlelidParser.ts`
**Extensions:** `KH.*`, UADE eagleplayer
**UADE name:** KrisHatlelid
**Reference files:** `Reference Music/Kris Hatlelid/` (18 files)
**Replayer reference:**
  `Reference Code/uade-3.05/amigasrc/players/wanted_team/KrisHatlelid/src/Kris Hatlelid_v1.asm`

---

## Overview

Kris Hatlelid is an Amiga composer. The format is a compiled 68k Amiga executable
detected by multiple fixed-offset word/longword checks mirroring the Wanted Team
`DTP_Check2` routine.

Two variants exist: a **single-file** module (player + data in one file) and a
**two-file** module (data file + separate sample/instrument file), distinguished
by the value at offset 44 in the data file.

---

## Detection

Based on `Kris Hatlelid_v1.asm`, multiple big-endian word/longword checks at fixed
offsets verify specific 68k machine code patterns in the player binary:

- Minimum file size: 68 bytes
- Multiple u16BE and u32BE checks at specific offsets (exact values in the assembly
  source's `DTP_Check2` routine)
- Offset 44 distinguishes single-file vs two-file variant

---

## Format Variants

### Single-File
Player code, music data, and PCM samples all in one binary file. No separate
companion file needed.

### Two-File
Music data and samples stored in separate files. The data file at offset 44 signals
this variant; UADE loads both files for complete playback.

---

## UADE Configuration

```
eagleplayer.conf:
  KrisHatlelid  prefixes=KH
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/KrisHatlelidParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/KrisHatlelid/`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser creates placeholder instrument slots and identifies the file variant.
UADE handles all audio synthesis. The two-file variant requires UADE to locate
and load the companion sample file alongside the music data file.
