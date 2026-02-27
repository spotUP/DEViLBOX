# Nick Pelling Packer

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/NickPellingPackerParser.ts`
**Extensions:** `NPP.*` (prefix)
**UADE name:** NickPellingPacker
**Reference files:** (identified in Amiga collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/NickPellingPacker/Nick Pelling Packer_v1.asm`

---

## Overview

Nick Pelling Packer is a Wanted Team Amiga packed music format. Files use the `NPP.*`
prefix and contain a `"COMP"` header followed by compressed payload size metadata.

---

## Detection

Based on `Nick Pelling Packer_v1.asm Check2`:

```
bytes[0..3] == "COMP"  (0x434F4D50)
u16BE(4) == 0           (reserved word must be zero)
size = u16BE(6): >= 16, <= 272, 4-byte aligned
decompSize = u32BE(6 + size - 10): must be <= file length
```

**Minimum file size:** 10 bytes.

The `"COMP"` magic, zero reserved word, and aligned header block size provide
reliable detection. The decompressed size sanity check prevents false positives.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/NickPellingPackerParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/NickPellingPacker/Nick Pelling Packer_v1.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The `"COMP"` magic + size validation identifies the format. UADE synthesizes audio.
