# Digital Sonix & Chrome

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/DigitalSonixChromeParser.ts`
**Extensions:** `DSC.*` (prefix-based)
**UADE name:** DigitalSonixChrome
**Reference files:** `Reference Music/Digital Sonix And Chrome/` (13 files)
**Replayer reference:** `Reference Code/uade-3.05/players/DigitalSonixChrome`

---

## Overview

Digital Sonix & Chrome is a 4-channel Amiga music format by Andrew E. Bailey &
David M. Hanlon (c) 1990, used in the game *Dragon's Breath*. Files use the `DSC.*`
filename prefix.

Detection is ported 1:1 from the `DTP_Check2` routine in the Wanted Team eagleplayer
`DigitalSonixChrome_v1.asm`. The format has a structured header with sample and
sequence descriptors at fixed offsets.

---

## File Layout

```
Offset                 Size         Description
------                 ----         -----------
0x00                   2            headerWord: non-zero word (arbitrary non-zero)
0x02                   1            seqLenCount (D0): count of sequence length entries; must be > 0
0x03                   1            sampleCount (D1): number of samples; must be >= 2
0x04                   4            songDataSize (D2): song data size in bytes;
                                    must be even, non-zero, <= 0x80000, < fileSize
0x08                   4            sequenceCount (D3): number of sequences;
                                    must be non-zero, <= 0x20000
0x0C                   (D1−1) × 6  Instrument entries:
                                    [u32BE length][u16BE extra]
                                    (D1−1 because first sample is built-in)
?                      4            Must be zero (long == 0)
?                      2            Must be zero (word == 0)
?                      D3 × 4      Sequence table
?                      D0 × 18     Sample info records (18 bytes each)
```

**Minimum file size:** 14 bytes (header through the start of instrument entries).

---

## Detection Algorithm

```
1. buf.length >= 14
2. u16BE(0) != 0                          → non-zero header word
3. D0 = buf[2]; require D0 > 0            → seqLenCount
4. D1 = buf[3]; require D1 >= 2           → sampleCount
5. D2 = u32BE(4); require:
     D2 != 0, D2 & 1 == 0                → even
     D2 <= 0x80000                        → sanity upper bound
     D2 < buf.length                      → within file
6. D3 = u32BE(8); require:
     D3 != 0                              → non-zero
     D3 <= 0x20000                        → sanity upper bound
7. instrTableEnd = 0x0C + (D1 − 1) × 6
   Require buf.length >= instrTableEnd + 6
8. u32BE(instrTableEnd) == 0              → zero long after instrument table
9. u16BE(instrTableEnd + 4) == 0         → zero word after zero long
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/DigitalSonixChromeParser.ts`
- **Wanted Team asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/DigitalSonixChrome/src/DigitalSonixChrome_v1.asm`
- **UADE player:** `Reference Code/uade-3.05/players/DigitalSonixChrome`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser validates the Digital Sonix & Chrome header structure and routes playback
to UADE. The `DSC.*` prefix is the primary routing key. Instrument names are extracted
as placeholder entries.

The "non-zero header word" at offset 0 distinguishes this format from zero-initialized
or raw PCM data, but the real fingerprint is the instrument table stride + sentinel
zero long/word sequence.
