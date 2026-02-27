# Anders 0land

**Status:** DETECTION_ONLY — parser detects format; UADE synthesizes audio
**Parser:** `src/lib/import/formats/Anders0landParser.ts`
**Extensions:** `hot.*` (prefix)
**UADE name:** Anders0land
**Reference files:** (identified in Amiga demo collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/Anders0land/SRC_Anders0land/Anders 0land_v1.asm`

---

## Overview

Anders 0land (Anders Öland) is a 4-channel Amiga tracker format using a multi-chunk
binary structure with 3-byte ASCII tag identifiers. Files are prefixed `hot.*`.

---

## Detection Algorithm

Based on `DTP_Check2` from `Anders 0land_v1.asm`:

Three consecutive variable-length chunks, each 8 bytes minimum:
- **Tag bytes** at chunk offset 0–2 (ASCII)
- **Chunk size** u32BE at chunk offset 4
- Each chunk size must be even
- Chunk sizes must fit within the file

```
Chunk 1: tag[0..2] == "mpl" (0x6D, 0x70, 0x6C)
Chunk 2: tag[0..2] == "mdt" (0x6D, 0x64, 0x74)
Chunk 3: tag[0..2] == "msm" (0x6D, 0x73, 0x6D)
```

**Minimum file size:** 24 bytes (3 chunks × 8 bytes minimum each).

---

## Format Notes

- 4-channel Amiga audio (LRRL panning)
- Song name suffix: `[Anders 0land]`; `hot.` prefix stripped from module name

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/Anders0landParser.ts`
- **UADE eagleplayer.conf:** `Anders0land  prefixes=hot`
