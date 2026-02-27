# Maximum Effect / MaxTrax

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/MaximumEffectParser.ts`
**Extensions:** `MAX.*`, `*.mxtx`, UADE eagleplayer
**UADE name:** MaximumEffect, Maximum_Effect
**Reference files:** `Reference Music/MaxTrax/` (82 files)
**Replayer reference:**
  `Reference Code/uade-3.05/amigasrc/players/wanted_team/MaximumEffect/src/Maximum Effect_v1.asm`

---

## Overview

Maximum Effect is an Amiga music format used in various games. Files come in two
variants: **original Maximum Effect** (identified by structural checks) and
**MaxTrax** (identified by `'MXTX'` magic). Both are handled by the same parser
and routed to UADE for audio synthesis.

---

## Detection

### MaxTrax variant (fast-accept)
```
u32BE at offset 0 == 0x4D585458  ('MXTX')
```
Any file starting with `MXTX` is immediately accepted as MaxTrax.

### Maximum Effect variant (structural)

Based on `Maximum Effect_v1.asm` `DTP_Check2` routine:

```
long[0]: 1–15 (number of sub-songs; 0 = fail, > 15 = fail)

long[4]: 0 (allowed) OR:
  positive (not negative)
  even (bit 0 clear)
  ≤ fileSize
  (long[4] - 2) divisible by 18  ← each entry is 18 bytes
  and long[4] - 2 != 0

Then loop 3 times (longs at offsets 8, 12, 16):
  each long: 0 (allowed) OR:
    positive
    even
    ≤ fileSize
    6 bytes before end of data are zero:  long at (fileStart + val - 6) == 0
  At least one of the three longs must be non-zero.
```

**Constraints:**
- `long[0]`: sub-song count 1–15
- `long[4]`: sample table pointer — if non-zero, (val−2) divisible by 18
  (each sample entry is 18 bytes)
- Longs at offsets 8–16: up to three data-section pointers; at least one must be valid

---

## File Structure (Maximum Effect)

```
Offset  Size  Description
------  ----  -----------
0x00    4     Sub-song count (u32BE, 1–15)
0x04    4     Sample table pointer (u32BE; 0 = no samples)
0x08    4     Data section pointer 1 (u32BE)
0x0C    4     Data section pointer 2 (u32BE)
0x10    4     Data section pointer 3 (u32BE)
...     ...   Player code + music data + sample PCM
```

**Sample table:** Each entry is 18 bytes (stride derived from `(val-2) ÷ 18`).

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/MaximumEffectParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/MaximumEffect/`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser creates placeholder instrument slots from the sample count. UADE
handles all audio synthesis for both the Maximum Effect and MaxTrax variants.

The `MXTX` fast-accept path makes the MaxTrax variant trivially detectable;
the structural path for Maximum Effect mirrors the UADE ripper logic.
