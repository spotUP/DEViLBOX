# Cinemaware

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/CinemawareParser.ts`
**Extensions:** `CIN.*` (prefix-based)
**UADE name:** Cinemaware
**Reference files:** `Reference Music/Cinemaware/` (Amiga game music)
**Replayer reference:** `Reference Code/uade-3.05/players/Cinemaware`

---

## Overview

Cinemaware is a music format used internally by Cinemaware game titles on the Amiga
(e.g. *Defender of the Crown*, *Wings*, *It Came from the Desert*). It stores a table
of sample descriptors (`IBLK`) and a sequence structure (`ASEQ`) for song ordering.

Detection identifies the binary by the `IBLK` block marker, sample count, and the
`ASEQ` signature found at a computed offset within the file.

---

## File Layout

```
Offset           Size   Description
------           ----   -----------
0x00             4      Magic: "IBLK" (0x49 0x42 0x4C 0x4B)
0x04             1      sampleCount (uint8, valid: 1–127)
0x05             ...    Sample descriptor table: sampleCount × 138 bytes
                        (see Sample Descriptor below)
4+sampleCount×138+18   "ASEQ" — sequence marker (scanned on 2-byte boundaries
                        within +256 bytes of the sample table end)
...              ...    Sequence/pattern data
```

**Minimum file size:** 4 + 1 + (1 × 138) + 18 + 4 = ~165 bytes.

---

## Sample Descriptor (138 bytes)

Each entry in the sample descriptor table is 138 bytes. The layout references standard
Amiga PCM sample attributes (name, length, loop points, volume, finetune).

The 138-byte stride is the primary structural fingerprint used for detection validation.

---

## Detection Algorithm

```
1. bytes[0..3] == "IBLK"                     → magic check
2. sampleCount = buf[4]; require 1 ≤ n ≤ 127 → valid count
3. seqSearchBase = 4 + sampleCount × 138 + 18
4. Scan [seqSearchBase, seqSearchBase + 256) on 2-byte boundaries
   for the 4-byte tag "ASEQ"                  → sequence marker found
```

This multi-level check (magic + count bounds + stride-derived offset + ASEQ scan)
reliably distinguishes Cinemaware files from other IBLK-like formats.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/CinemawareParser.ts`
- **UADE player:** `Reference Code/uade-3.05/players/Cinemaware`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser identifies Cinemaware files and routes them to UADE for playback. The
`CIN.*` filename prefix is the primary routing key. UADE's Cinemaware eagleplayer
handles the full playback loop using Amiga PCM samples embedded in the file.
