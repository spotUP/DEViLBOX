# Thomas Hermann

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/ThomasHermannParser.ts`
**Extensions:** `THM.*` (prefix)
**UADE name:** ThomasHermann
**Reference files:** (identified in Amiga demo/game collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/ThomasHermann/src/Thomas Hermann_v2.asm`

---

## Overview

Thomas Hermann composed music for various Amiga demos and games. The format stores
music data as a structured binary file beginning with a pointer table of absolute
Amiga memory addresses. Detection recovers the load-time base address from offset 46
and validates eight fixed pointer offsets.

---

## Detection

Based on `Thomas Hermann_v2.asm DTP_Check2`:

```
file size > 6848 (>= 6849)
origin = u32BE(46): non-zero, bit 31 clear (positive), bit 0 clear (even)
Eight pointer checks:
  (u32BE( 0) - origin) == 64
  (u32BE( 4) - origin) == 1088
  (u32BE( 8) - origin) == 2112
  (u32BE(12) - origin) == 3136
  (u32BE(16) - origin) == 4160
  (u32BE(20) - origin) == 4416
  (u32BE(24) - origin) == 4672
  (u32BE(28) - origin) == 4928
```

The differences from `origin` are fixed constants that reflect the format's internal
layout: voice data, pattern data, and sample data at deterministic offsets regardless
of where the module was loaded in Amiga memory.

**Minimum file size:** 6849 bytes.

---

## Layout Constants

| Offset from origin | Section |
|---------------------|---------|
| 64                  | Voice/channel table start |
| 1088                | Pattern data section 2 |
| 2112                | Pattern data section 3 |
| 3136                | Pattern data section 4 |
| 4160                | Pattern data section 5 |
| 4416                | Sample metadata start |
| 4672                | Sample data section 2 |
| 4928                | Sample data section 3 |

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/ThomasHermannParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/ThomasHermann/src/Thomas Hermann_v2.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The base-address recovery + 8-pointer arithmetic check is unique and highly reliable.
UADE synthesizes audio via its Thomas Hermann eagleplayer.
