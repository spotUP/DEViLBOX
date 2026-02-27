# EasyTrax (EarAche)

**Status:** DETECTION_ONLY — parser detects format; UADE synthesizes audio
**Parser:** `src/lib/import/formats/EasyTraxParser.ts`
**Extensions:** `ea.*`, `mg.*` (prefixes)
**UADE name:** EarAche
**Reference files:** (identified in Amiga collections)
**Replayer reference:** UADE eagleplayer `EarAche`

---

## Overview

EarAche is an Amiga 4-channel music format by Søren Andersen. Files begin with the
4-byte magic `EASO` (0x45 0x41 0x53 0x4F). Files are typically prefixed `ea.*` or `mg.*`.

---

## Detection Algorithm

```
1. buf.length >= 28
2. buf[0..3] == "EASO"
```

**Minimum file size:** 28 bytes (4-byte magic + 6 × u32BE offset pointers).

---

## Format Notes

The header contains 6 u32BE offsets after the magic:

```
Offset  Size  Description
------  ----  -----------
0       4     magic: "EASO"
4       4     offset to sequence/order data
8       4     offset to voice-1 pattern data
12      4     offset to voice-2 pattern data
16      4     offset to voice-3 pattern data
20      4     offset to voice-4 pattern data
24      4     offset to sample data
```

- 4 channels (Amiga LRRL panning: ch0/3 left, ch1/2 right)
- Song name suffix: `[EarAche]`

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/EasyTraxParser.ts`
- **UADE eagleplayer.conf:** `EarAche  prefixes=ea,mg`
