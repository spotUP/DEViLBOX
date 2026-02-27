# Fred Gray

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/FredGrayParser.ts`
**Extensions:** `gray.*`, UADE eagleplayer
**UADE name:** FredGray
**Reference files:** (files ripped from Amiga games; prefix `gray.*`)
**Replayer reference:** UADE eagleplayer binary

---

## Overview

Fred Gray composed music for many Amiga games. The format is a compiled 68k Amiga
executable detected by a fixed magic string at offset 0x24 in the file.

---

## Detection

```
Magic: "FREDGRAY" (8 bytes) at byte offset 0x24 (36 decimal)
Minimum file size: 44 bytes (0x24 + 8)

Secondary check: filename prefix "gray.*" (for files without the magic)
```

The `"FREDGRAY"` string is embedded in the compiled player binary as a version/identity
tag. Its fixed offset at 0x24 makes detection straightforward.

---

## Format Structure

Fred Gray modules are **single-file** compiled 68k executables. Player code, music
sequence data, and PCM sample data are all embedded in a single binary file. No
separate sample companion file is required.

---

## UADE Configuration

```
eagleplayer.conf:
  FredGray  prefixes=gray
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/FredGrayParser.ts`
- **UADE player:** `Reference Code/uade-3.05/players/FredGray`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser returns a minimal metadata stub. UADE handles all audio synthesis.
The `"FREDGRAY"` magic at offset 0x24 is one of the cleaner format signatures
among the compiled-binary Amiga player formats — no instruction-pattern scanning
is required.
