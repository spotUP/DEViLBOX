# Tomy Tracker

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/TomyTrackerParser.ts`
**Extensions:** `SG.*` (prefix-based)
**UADE name:** TomyTracker
**Reference files:** `Reference Music/Tomy Tracker/` (2 files)
**Replayer reference:** `Reference Code/uade-3.05/players/TomyTracker`

---

## Overview

Tomy Tracker is an Amiga music format identified by two equal longwords at offsets
0 and 4 that encode the total file size, with the difference from a 704-byte base
being evenly divisible by 1024 (the size of one pattern block).

Detection is ported from `Tomy Tracker_v2.asm DTP_Check2`.

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0x00    4     D1: file/data size. Must be >= 1, <= 0x200000, even.
0x04    4     D2: must equal D1 exactly.
0x08+   ...   Header data (704 bytes of non-pattern header)
704     ...   Pattern data: (D2 − 704) bytes, in 1024-byte blocks
```

**Pattern count:** `(D2 − 704) / 1024`
**Minimum file size:** 1728 bytes (704 base + 1024 minimum one pattern)

---

## Detection Algorithm

```
1. buf.length >= 1728
2. D1 = u32BE(0): require 1 <= D1 <= 0x200000, D1 & 1 == 0 (even)
3. D2 = u32BE(4): require D2 == D1 (exact match)
4. (D2 − 704) % 1024 == 0   → pattern data divides evenly into 1024-byte blocks
```

The equal D1/D2 longwords encode the total data size redundantly — both headers
must agree, providing a stronger fingerprint than a single value. The 1024-byte
pattern stride (64 rows × 4 channels × 4 bytes/cell) is a standard Amiga tracker
pattern size.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/TomyTrackerParser.ts`
- **Wanted Team asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/TomyTracker/src/Tomy Tracker_v2.asm`
- **UADE player:** `Reference Code/uade-3.05/players/TomyTracker`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser validates the Tomy Tracker structural layout and routes playback to UADE.
The `SG.*` prefix is the primary routing key. Placeholder instruments are emitted.
