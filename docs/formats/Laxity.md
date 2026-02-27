# Laxity

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/LaxityParser.ts`
**Extensions:** `powt.*`, `pt.*`, UADE eagleplayer
**UADE name:** Laxity
**Replayer reference:** UADE eagleplayer: Laxity.library

---

## Overview

Laxity is an Amiga music format. Detection relies primarily on filename prefixes,
with a disambiguation check to exclude standard ProTracker MOD files that share
the `pt.*` prefix.

---

## Detection

Prefix-based detection (from `eagleplayer.conf: Laxity  prefixes=powt,pt`):

- `powt.*` prefix: unambiguous — accept directly.
- `pt.*` prefix: ambiguous with ProTracker MOD. **Exclude** if offset 0x438 (1080)
  contains a known ProTracker magic tag:

```
ProTracker exclusion tags at offset 0x438:
  "M.K.", "M!K!", "FLT4", "FLT8", "4CHN", "6CHN", "8CHN"
```

If a `pt.*` file has a ProTracker tag, it is a standard MOD file — not Laxity.
If no ProTracker tag is found, it is treated as a Laxity module.

---

## UADE Configuration

```
eagleplayer.conf:
  Laxity  prefixes=powt,pt
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/LaxityParser.ts`
- **UADE player:** `Laxity.library`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The `pt.*` / ProTracker disambiguation is a common pattern for Amiga formats that
borrowed the ProTracker naming convention for their modules. The check at offset
0x438 is where ProTracker stores the 4-byte format identifier (e.g., "M.K.").

UADE handles all audio synthesis. The parser creates a minimal stub song.
