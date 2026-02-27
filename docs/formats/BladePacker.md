# Blade Packer

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/BladePackerParser.ts`
**Extensions:** `UDS.*` (prefix)
**UADE name:** BladePacker
**Reference files:** (identified in Amiga collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/BladePacker/src/Blade Packer_v2.asm`

---

## Overview

Blade Packer is an Amiga 8-voice music format by Tord 'Blade' Jansson (1991–96).
Files use the `UDS.*` UADE prefix and are identified by a 5-byte magic at the start.

---

## Detection

Based on `Blade Packer_v2.asm DTP_Check2`:

```
u32BE(0) == 0x538F4E47      (bytes: 0x53, 0x8F, 0x4E, 0x47)
buf[4] == 0x2E              (ASCII '.')
```

**Minimum file size:** 5 bytes.

The 4-byte magic `0x538F4E47` followed by `'.'` is the complete detection signature.
The format supports 8 voices (channels) beyond the standard 4-channel Amiga Paula limit.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/BladePackerParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/BladePacker/src/Blade Packer_v2.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

Simple 5-byte magic detection. UADE synthesizes audio using its Blade Packer eagleplayer.
