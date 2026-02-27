# Mosh Packer

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/MoshPackerParser.ts`
**Extensions:** `MOSH.*` (prefix)
**UADE name:** MoshPacker
**Reference files:** (identified in Amiga collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/Mosh Packer_v1.asm`

---

## Overview

Mosh Packer is an Amiga music format. Detection validates 31 MOD-style sample headers
at the start of the file, then confirms the ProTracker `'M.K.'` signature at offset 378.
The format is closely related to the ProTracker MOD structure.

---

## Detection

Based on `Mosh Packer_v1.asm`:

```
file size >= 382 bytes
For each of 31 sample headers at offset i×8 (0 ≤ i < 31):
  word[i*8+0] as i16 >= 0      (bit 15 clear)
  word[i*8+2] as i16 >= 0      (bit 15 clear)
  word[i*8+4] <= 0x40           (volume 0–64; bit 15 clear)
  word[i*8+6] as i16 >= 0      (bit 15 clear)
u32BE(378) == 0x4D2E4B2E        ('M.K.' — ProTracker signature)
```

**Minimum file size:** 382 bytes.

The 31 × 8-byte sample header scan validates the MOD-style instrument table (length,
loop, volume fields all non-negative and in range), followed by the standard ProTracker
channel-count tag at offset 378.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/MoshPackerParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/Mosh Packer_v1.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The 31-header scan + `'M.K.'` confirmation provides reliable detection without a
unique magic tag. UADE synthesizes audio.
