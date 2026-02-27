# Furnace Wavetable (.fuw)

**Status:** FULLY_NATIVE — parsed wavetable data used by Furnace chip synthesizer
**Parser:** `src/lib/import/formats/FurnaceWavetableParser.ts`
**Extensions:** `.fuw`
**UADE name:** N/A (native Furnace synth)
**Reference files:** `Reference Music/Furnace/`

---

## Overview

A standalone Furnace Tracker wavetable file. Each `.fuw` contains a single wavetable
(arbitrary-length signed integer array) that can be loaded into a Furnace instrument
and used by wavetable-capable chips (Game Boy, PC Engine, Namco 163, Konami SCC, etc.).

See `docs/formats/Furnace.md` for the complete wavetable binary layout.

---

## Detection

```
buf[0..15] == "-Furnace waveta-"
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/FurnaceWavetableParser.ts`
- **Full layout:** `docs/formats/Furnace.md`
