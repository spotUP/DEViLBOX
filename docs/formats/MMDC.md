# MMDC (MED Packer)

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/MMDCParser.ts`
**Extensions:** (no standard extension; prefix-based detection)
**UADE name:** MMDC
**Reference files:** (identified in Amiga collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/MMDC/src/MMDC_v3.asm`

---

## Overview

MMDC (also known as "MED Packer") is an Amiga music packer format created by
Antony "Ratt" Crowther. It wraps music data in a container identified by the
4-byte magic `"MMDC"` with a secondary indirect pointer validation.

---

## Detection

Based on `MMDC_v3.asm DTP_Check2`:

```
bytes[0..3] == "MMDC"  (0x4D4D4443)
u16BE(16) == 0          (reserved word must be zero)
u16BE(18) != 0, positive (signed), even (bit 0 clear)
u16BE(u16BE(18)) == 0   (word at the offset stored in bytes[18..19] must be zero)
```

The final check dereferences the pointer at offset 18, requiring the word at
that file location to also be zero — a self-referential structural validation.

**Minimum file size:** 20 bytes.

---

## Metadata Extraction

- Pattern count: `u16BE(556)` in the module data

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/MMDCParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/MMDC/src/MMDC_v3.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The `"MMDC"` magic + indirect zero-word check identifies the format. UADE synthesizes audio.
