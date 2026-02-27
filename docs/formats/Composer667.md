# Composer 669 / UNIS 669 (.669)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/Composer667Parser.ts`
**Extensions:** `.669`
**UADE name:** N/A (native sampler — DOS PC format)
**Reference files:** `Reference Music/669/`
**Reference:** `Reference Code/openmpt-master/soundlib/Load_669.cpp`

---

## Overview

Despite the filename `Composer667Parser.ts`, this parser handles the **Composer 669 / UNIS 669**
format (`.669` files) — a PC DOS 8-channel tracker. The format name refers to Composer 669 by
Renaissance, with an extended "JN" variant from UNIS. This is a separate implementation from
`Format669Parser.ts`, which handles the same format.

See also `docs/formats/Format669.md` for the format specification.

---

## Detection

```
buf.byteLength >= 497  (HEADER_SIZE)
buf[0..1] == "if" (0x69 0x66)  — Composer 669
  OR
buf[0..1] == "JN" (0x4A 0x4E)  — UNIS 669 extended

Additional validation:
  numSamples (buf[110]) <= 64
  numPatterns (buf[111]) <= 128
  restartPos (buf[112]) valid
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/Composer667Parser.ts`
- **Format spec:** `docs/formats/Format669.md`
- **OpenMPT reference:** `soundlib/Load_669.cpp`
