# Alcatraz Packer

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/AlcatrazPackerParser.ts`
**Extensions:** `ALP.*` (prefix)
**UADE name:** Alcatraz_Packer
**Reference files:** (identified in Amiga demo/game collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/Alcatraz_Packer/Alcatraz_Packer.AMP.asm`

---

## Overview

Alcatraz Packer is an Amiga music format by Alcatraz/NEO (© 1995). Files are single-file
binaries (player + music data). Prefix `ALP.`.

---

## Detection Algorithm

Based on `EP_Check5` from `Alcatraz_Packer.AMP.asm`:

```
1. buf.length >= 8
2. buf[0..3] == 0x50416E10  (magic bytes: [0x50, 0x41, 0x6E, 0x10])
3. u32BE(buf, 4) != 0       (total size must be non-zero)
4. u32BE(buf, 4) & 0x80000000 == 0  (bit 31 clear — non-negative)
```

**Minimum file size:** 8 bytes.

---

## Metadata Extraction

From `DTP_InitPlayer`:
```
sampleCount = u16BE(buf, 8) >> 4   (max 31)
songLength  = u16BE(buf, 10) >> 1  (max 128)
```

---

## Format Notes

- 4-channel Amiga audio (LRRL panning)
- Song name suffix: `[Alcatraz Packer]`; `ALP.` prefix stripped from module name

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/AlcatrazPackerParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/Alcatraz_Packer/Alcatraz_Packer.AMP.asm`
