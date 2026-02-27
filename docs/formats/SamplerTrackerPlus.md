# Sampler Tracker Plus / SoundTracker Pro II (.stp)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/SamplerTrackerPlusParser.ts` (re-exports `STPParser.ts`)
**Extensions:** `.stp`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/SamplerTrackerPlus/`

---

## Overview

SamplerTrackerPlusParser is a compatibility alias that re-exports the `isSTPFormat` detection
function from `STPParser.ts`. The canonical implementation and full binary layout documentation
are in `STPParser.ts`.

SoundTracker Pro II (STP) is an Amiga tracker by Stefan Danes (1990) identified by the `"STP3"`
magic at offset 0. It supports variable pattern lengths, multiple sample loops, and CIA-based tempo.
See `docs/formats/STP.md` for the complete format specification.

---

## Detection

```
1. buf.byteLength >= 4
2. buf[0..3] == "STP3"
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/STPParser.ts`
- **Alias source:** `src/lib/import/formats/SamplerTrackerPlusParser.ts`
- **OpenMPT reference:** `soundlib/Load_stp.cpp`
