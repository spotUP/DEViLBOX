# ADPCM Mono

**Status:** DETECTION_ONLY — parser detects format; UADE synthesizes audio
**Parser:** `src/lib/import/formats/ADPCMmonoParser.ts`
**Extensions:** `.adpcm` (extension-only detection)
**UADE name:** ADPCM_mono
**Reference files:** (identified in Amiga game collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/ADPCM_mono.asm`

---

## Overview

ADPCM Mono is an Amiga ADPCM (Adaptive Differential Pulse Code Modulation) format.
Detection is purely extension-based (the UADE player's EP_Check3 routine walks the
filename backwards to check for `.adpcm`). Files whose first 4 bytes are `ADPC` are
rejected as ADPCM2 or ADPCM3 files.

---

## Detection Algorithm

Based on `EP_Check3` from `ADPCM_mono.asm`:

1. Reject if first 4 bytes == `ADPC` (excludes ADPCM2/ADPCM3 files)
2. Filename must end with `.adpcm` (case-insensitive)

**Minimum file size:** 4 bytes (for magic-exclusion check).

---

## Format Notes

- No fixed internal magic — identification relies entirely on file extension
- The player uses a 1024-byte streaming buffer
- 4-channel Amiga audio (LRRL panning)
- Song name suffix: `[ADPCM Mono]`

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/ADPCMmonoParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/ADPCM_mono.asm`
