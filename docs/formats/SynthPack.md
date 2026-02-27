# SynthPack

**Status:** DETECTION_ONLY — parser detects format; UADE synthesizes audio
**Parser:** `src/lib/import/formats/SynthPackParser.ts`
**Extensions:** `osp.*` (prefix)
**UADE name:** SynthPack
**Reference files:** (identified in Amiga collections)
**Replayer reference:** UADE eagleplayer `SynthPack`

---

## Overview

SynthPack is an Amiga music format. Files begin with the 12-byte ASCII magic
`OBISYNTHPACK`. Files are prefixed `osp.*`.

---

## Detection Algorithm

```
1. buf.length >= 12
2. buf[0..11] == "OBISYNTHPACK"   (primary check)
   OR filename starts with "osp." (case-insensitive fallback)
```

**Minimum file size:** 12 bytes (magic string length).

---

## Format Notes

- 4-channel Amiga audio (LRRL panning)
- Song name suffix: `[SynthPack]`; `osp.` prefix stripped from module name

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/SynthPackParser.ts`
- **UADE eagleplayer.conf:** `SynthPack  prefixes=osp`
