# Sound Player (Wanted Team)

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/SoundPlayerParser.ts`
**Extensions:** `SJS.*` (prefix)
**UADE name:** SoundPlayer
**Reference files:** (identified in Amiga collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/SoundPlayer/SoundPlayer_v1.asm`

---

## Overview

Sound Player is a Wanted Team Amiga 4-channel music player. Files are identified by
a structured header encoding voice counts and pattern repetition values. There are no
magic bytes — detection relies on a repeating structural pattern in the header.

---

## Detection

Based on `SoundPlayer_v1.asm Check2`:

```
buf[1] in range 0x0B–0xA0 (11–160)        → some count field
buf[2] in {7, 15}                          → voice count
buf[3] == 0
buf[4] == 0
buf[5] != 0   (call it b5)                → key repetition value
u16BE(6) == 0
buf[8] == b5
buf[9] == 0
buf[10] == 0
buf[11] == b5
u16BE(12) == 0
If buf[2] == 15: buf[14] == b5            (extended voice mode)
```

**Minimum file size:** 15 bytes.

The `b5` value repeating at offsets 5, 8, and 11 (with zeros at 6–7, 9–10, 12–13) is
the distinctive structural fingerprint. Voice count of 7 or 15 indicates 8-channel or
16-channel mode.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/SoundPlayerParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/SoundPlayer/SoundPlayer_v1.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

Header pattern detection without magic bytes. UADE synthesizes audio.
