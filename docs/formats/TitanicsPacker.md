# Titanics Packer

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/TitanicsPackerParser.ts`
**Extensions:** `TITS.*` (prefix)
**UADE name:** TitanicsPacker
**Reference files:** (identified in Amiga collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/Titanics Packer_v1.asm`

---

## Overview

Titanics Packer is an Amiga music format. Detection scans a 128-word table at
offset 180 for valid non-zero even entries, terminating early on the `0xFFFF`
end-of-list marker.

---

## Detection

Based on `Titanics Packer_v1.asm`:

```
file size >= 437 bytes (180 header + 256 table bytes + 1 extra)
Scan 128 words at offset 180 (2 bytes each):
  word == 0x0000: fail
  word == 0xFFFF: success (end-of-list marker)
  word & 1 != 0 (odd): fail
  otherwise (non-zero, even): continue scan
If all 128 words pass without 0xFFFF: success
```

**Minimum file size:** 437 bytes.

The 128-word scan at offset 180 checks for a valid Amiga word-aligned pointer/offset
table; the `0xFFFF` sentinel enables early termination.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/TitanicsPackerParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/Titanics Packer_v1.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The 128-word table scan is the sole detection heuristic. UADE synthesizes audio.
