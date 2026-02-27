# TME (The Musical Enlightenment)

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/TMEParser.ts`
**Extensions:** `TME.*` (prefix), `.tme`
**UADE name:** TME
**Reference files:** (identified in Amiga game/demo collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/TME/src/TME_v3.s`

---

## Overview

The Musical Enlightenment is an Amiga music format created by N.J. Luuring Jr (1989–90),
adapted by the Wanted Team for EaglePlayer/DeliTracker. Files are large (≥ 7000 bytes)
single-binary formats containing embedded player code. Supports multiple subsongs.

---

## Detection Algorithm

Based on `DTP_Check2` from `TME_v3.s`:

```
1. buf.length >= 7000
2. buf[0] == 0x00   (first byte is zero)
3. One of the following structural patterns must match:

   Pattern 1:
     u32BE(0x3C) == 0x0000050F
     u32BE(0x40) == 0x0000050F

   Pattern 2:
     u32BE(0x1284) == 0x00040B11
     u32BE(0x1188) == 0x181E2329
     u32BE(0x128C) == 0x2F363C41
```

**Minimum file size:** 7000 bytes.

---

## Metadata Extraction

Subsong count from `DTP_InitPlayer`:
```
rawSubsongs = buf[5]               (byte at offset 5)
subsongCount = rawSubsongs + 1     (range 1–16)
```

31 placeholder instruments (matching MOD format slot count).

---

## Format Notes

- 4-channel Amiga audio (LRRL panning)
- Up to 16 subsongs
- Song name suffix: `[TME]`; `TME.`/`.tme` stripped from module name

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/TMEParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/TME/src/TME_v3.s`
