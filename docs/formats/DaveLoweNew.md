# Dave Lowe New

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/DaveLoweNewParser.ts`
**Extensions:** `DLN.*` (prefix-based)
**UADE name:** Dave_Lowe_New
**Reference files:** (identified in Amiga game collections)

---

## Overview

Dave Lowe New is an Amiga music format by composer Dave Lowe, used in several Amiga games.
Detection is structural: the format is identified by a word at offset 0 that determines a
"table offset," followed by a consistency check on a 4-entry pointer/value table at that offset.

There is no magic string; detection relies entirely on numeric constraints in the first few
dozen bytes of the file.

---

## Detection Algorithm

```
1. buf.byteLength >= 32  (minimum for all checks)

2. Determine tableOffset from word at offset 0:
   - u16BE(buf, 0) == 8  → tableOffset = 8
   - u16BE(buf, 0) == 4  AND u32BE(buf, 24) != 0  → tableOffset = 4
   - else → not this format

3. FirstCheck: validate 4 entries × 4 bytes starting at tableOffset:
   For each entry i in [0..3]:
     entry = u32BE(buf, tableOffset + i * 4)
     hiWord = entry >> 16         must be 0x0000
     loWord = entry & 0xFFFF      must satisfy:
       - loWord > 0
       - loWord < 0x8000
       - loWord is even (loWord & 1 == 0)
```

---

## File Prefix

Files are distributed with the prefix `DLN.*` (e.g., `DLN.somegame`).

---

## Format Notes

- The word at offset 0 acts as a format variant indicator (value 4 or 8).
- When `word[0] == 4`, the additional guard `long[24] != 0` disambiguates from other formats
  with similar small leading values.
- The 4-entry table at the detected offset contains word-aligned, positive, below-0x8000
  values that represent internal song data offsets or lengths.
- No metadata (title, author, instrument names) is extracted by the parser.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/DaveLoweNewParser.ts`
- **UADE eagleplayer:** `Reference Code/uade-3.05/players/Dave_Lowe_New`
