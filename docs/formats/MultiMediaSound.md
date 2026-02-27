# MultiMedia Sound (MMS)

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/MultiMediaSoundParser.ts`
**Extensions:** `MMS.*`, `SFX20.*` (prefixes)
**UADE name:** MultiMediaSound
**Reference files:** (identified in Amiga collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/MultiMedia_Sound/MultiMedia Sound_V1.asm`

---

## Overview

MultiMedia Sound (MMS) is an Amiga music format by Christian Haller and Christian A.
Weber (1991–93), adapted by Wanted Team. Files use `MMS.` or `SFX20.` prefixes and
are identified by a 31-longword scan followed by the `"SO31"` magic tag.

---

## Detection

Based on `MultiMedia Sound_V1.asm DTP_Check2`:

```
First 31 longwords (bytes 0..123):
  each must be:
    even (bit 0 == 0)
    <= 0x20000
bytes[124..127] == "SO31"  (0x53, 0x4F, 0x33, 0x31)
u16BE(128) != 0             (channel/voice count non-zero)
```

The 31 initial longwords function as sample offset/length table entries whose values
must all fit within a 128 KB limit (≤ 0x20000) and be even (word-aligned). The
`"SO31"` tag confirms the MMS format version.

**Minimum file size:** 130 bytes.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/MultiMediaSoundParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/MultiMedia_Sound/MultiMedia Sound_V1.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The 31-longword scan + `"SO31"` magic is sufficient for unambiguous detection. UADE synthesizes audio.
