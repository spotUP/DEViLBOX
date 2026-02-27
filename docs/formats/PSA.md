# Professional Sound Artists (PSA)

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/PSAParser.ts`
**Extensions:** (no standard prefix; identified by magic bytes)
**UADE name:** PSA
**Reference files:** (identified in Amiga collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/PSA/PSA_v2.asm`

---

## Overview

PSA is an Amiga music format created by Professional Sound Artists. The format has
a 4-byte null-terminated magic signature `"PSA\0"` at the start of the file,
enabling simple and unambiguous detection.

---

## Detection

Based on `PSA_v2.asm DTP_Check2`:

```
bytes[0..3] == "PSA\0"  (0x50, 0x53, 0x41, 0x00)
```

Single magic check — no further structural validation needed.

---

## Metadata Extraction

From `DTP_InitPlayer`:
```
dataOffset = u32BE(40)
subsongCount = (dataOffset - 56) >> 3

instrTableStart = u32BE(44)
instrTableEnd = u32BE(48)
instrumentCount = (instrTableEnd - instrTableStart) >> 6   (64 bytes per instrument)
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/PSAParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/PSA/PSA_v2.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The `"PSA\0"` magic provides unambiguous identification. Subsong count and instrument
count are computed from header offsets. UADE synthesizes audio.
