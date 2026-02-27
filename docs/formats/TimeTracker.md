# TimeTracker

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/TimeTrackerParser.ts`
**Extensions:** `TMK.*` (prefix)
**UADE name:** TimeTracker
**Reference files:** (identified in Amiga demo collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/TimeTracker/src/TimeTracker_v1.asm`

---

## Overview

TimeTracker is an Amiga music format created by BrainWasher & FireBlade (1993).
Files use a `TMK.` prefix naming convention (e.g. `TMK.Tourists`). Detection is
by a simple 4-byte magic check at the start of the file.

---

## Detection

Based on `TimeTracker_v1.asm DTP_Check2`:

```
buf[0] == 'T' (0x54)
buf[1] == 'M' (0x4D)
buf[2] == 'K' (0x4B)
buf[3] != 0x00          (version/subsong byte, must be non-zero)
```

The assembly clears byte 3, compares against `'TMK\0'` (0x544D4B00), confirming
the first 3 bytes are `TMK`. Byte 3 being non-zero ensures it's a valid file.

**Minimum file size:** 10 bytes.

---

## Metadata Extraction

From `DTP_InitPlayer`:
- `buf[3]` (uint8) = subsong count
- `buf[5] & 127` (7-bit field) = sample count

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/TimeTrackerParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/TimeTracker/src/TimeTracker_v1.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The `TMK\*` magic is simple and unambiguous. UADE synthesizes audio; the parser
provides metadata (subsong count, sample count) only.
