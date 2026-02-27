# Medley (PV Synth)

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/MedleyParser.ts`
**Extensions:** `MSO.*` (prefix), `.ml`
**UADE name:** Medley
**Reference files:** (identified in Amiga demo collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/medley/Medley.s`

---

## Overview

Medley (also known as "PV Synth") is an Amiga music format by Paul van der Valk.
The UADE replay was adapted by mld (Andreas da Silva). Files begin with the 4-byte
magic `MSOB`. Files are prefixed `MSO.*`.

---

## Detection Algorithm

Based on `DTP_Check2` from `Medley.s` and UADE `amifilemagic.c`:

```
1. buf.length >= 8
2. buf[0..3] == "MSOB"  (0x4D 0x53 0x4F 0x42)
```

**Minimum file size:** 8 bytes.

---

## Metadata Extraction

Subsong count via pointer dereference from `Medley.s`:
```
relPtr = u32BE(buf, 4)
targetOffset = 4 + relPtr
subsongCount = u16BE(buf, targetOffset - 2)   (clamped 1–64)
```

---

## Format Notes

- 4-channel Amiga audio (LRRL panning)
- Variable subsong count
- Song name suffix: `[Medley]`; `MSO.`/`.ml` stripped from module name

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/MedleyParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/medley/Medley.s`
- **UADE file magic:** `Reference Code/uade-3.05/src/frontends/common/amifilemagic.c` line 83
