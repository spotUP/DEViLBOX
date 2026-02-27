# NTSP-System

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/NTSPParser.ts`
**Extensions:** `TWO.*` (prefix)
**UADE name:** NTSP-system
**Reference files:** (identified in Amiga collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/NTSP-system.asm`

---

## Overview

NTSP-system is an Amiga music format. Files use the `TWO.*` prefix convention and
are identified by the `"SPNT"` magic at offset 0 with a non-zero secondary word.

---

## Detection

Based on `NTSP-system.asm`:

```
bytes[0..3] == 0x53504E54  ("SPNT" — note: bytes are 'S','P','N','T')
u32BE(4) != 0              (non-zero secondary word)
```

**Minimum file size:** 8 bytes.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/NTSPParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/NTSP-system.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

Simple 8-byte magic + secondary word check. UADE synthesizes audio.
