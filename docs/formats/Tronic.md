# Tronic

**Status:** DETECTION_ONLY — extension-based routing; UADE synthesizes audio
**Parser:** `src/lib/import/formats/TronicParser.ts`
**Extensions:** `.trc`, `.dp`, `.tro`
**UADE name:** Tronic
**Reference files:** `Reference Music/Tronic/`
**Replayer reference:** `Reference Code/uade-3.05/players/Tronic`

---

## Overview

Tronic is an Amiga tracker format by Stefan Hartmann (the same author as PumaTracker).
It shares structural DNA with PumaTracker but uses a different file header layout.
Files may carry extensions `.trc`, `.dp`, or `.tro`; UADE supports all three via the
eagleplayer configuration (`prefixes=dp,trc,tro,tronic`).

No reliable format specification or magic byte sequence is publicly documented for
Tronic. No OpenMPT loader exists. Detection is extension-based only.

---

## Detection Algorithm

```
Extension-only: .trc | .dp | .tro
No magic byte check — any non-empty file with these extensions is routed to UADE.
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/TronicParser.ts`
- **UADE player:** `Reference Code/uade-3.05/players/Tronic`
- **Related format:** `PumaTracker.md` (structural cousin)

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser always delegates to UADE for Tronic playback. No instrument data is
extracted. Placeholder instruments are emitted.

**Related to PumaTracker:** Both formats were authored by Stefan Hartmann for the
Amiga. PumaTracker has a documented format spec; Tronic does not.

