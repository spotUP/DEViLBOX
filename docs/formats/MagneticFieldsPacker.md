# Magnetic Fields Packer

**Status:** NATIVE_SAMPLER — PCM extracted (from companion smp.* file), plays via Sampler engine
**Parser:** `src/lib/import/formats/MFPParser.ts`
**Extensions:** `mfp.*` (prefix at basename index 3: `mfp.songname`)
**UADE name:** MagneticFieldsPacker
**Reference files:** `Reference Music/Magnetic Fields Packer/` (Amiga game music)
**Reference:** `Reference Code/libxmp-master/src/loaders/mfp_load.c`
           `http://www.exotica.org.uk/wiki/Magnetic_Fields_Packer`

---

## Overview

Magnetic Fields Packer is a 4-channel Amiga module packer created by Shaun Southern.
It uses a **two-file format**: song data lives in a file prefixed `mfp.*` (e.g.
`mfp.songname`), and PCM sample data lives in a companion `smp.*` file that is not
parsed by the DEViLBOX parser.

Detection is **filename-based** (no magic bytes): the basename's 4th character (index 3)
must be `'.'`. A structural header validation confirms the format.

---

## File Layout

```
Offset   Size   Description
-------  -----  -----------
0        248    31 instrument headers × 8 bytes each:
                  len(u16BE), finetune(u8), volume(u8),
                  loopStart(u16BE), loopSize(u16BE)
248      1      Number of patterns / song length (uint8)
249      1      Restart byte (always 0x7F)
250      128    128-entry order table (uint8 each)
378      2      size1: entries in pattern table (u16BE)
380      2      size2: same as size1 (u16BE, cross-check)
382      ...    Pattern table: size1 × 4 channels × u16BE channel offsets
patAddr  ...    Per-channel pattern data blocks
```

---

## Pattern Encoding

Each channel block holds up to 1024 bytes. The 64 rows are addressed via a
**4-level indirect lookup** (k, x, y each in [0..3]):

```
l1 = k
l2 = chanBuf[l1] + x
l3 = chanBuf[l2] + y
eventBase = chanBuf[l3] × 2
→ 4-byte ProTracker event at chanBuf[eventBase]
```

Pattern cells follow the standard 4-byte ProTracker format (period, instrument, effect).

---

## Detection Algorithm

```
1. Filename: basename[3] === '.'       → prefix check
2. u16BE(buf, 378) == u16BE(buf, 380) → size1 == size2 cross-check
3. numPatterns = buf[248]; require > 0 → non-empty song
4. Restart byte = buf[249] == 0x7F    → format marker
```

---

## Sample File

PCM sample data lives in a companion `smp.*` file (same directory as the `mfp.*` file).
Instruments reference samples by index. The MFP parser creates placeholder instruments
with metadata (length, finetune, volume, loop points); actual PCM loading requires
the companion sample file.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/MFPParser.ts`
- **libxmp loader:** `Reference Code/libxmp-master/src/loaders/mfp_load.c`

---

## Implementation Notes

**Current status:** NATIVE_SAMPLER

The parser extracts instrument metadata and pattern data. PCM samples from the
companion `smp.*` file are played via the Sampler engine when available.

The `mfp.*` filename convention (period at index 3) is the primary detection signal;
no magic bytes are present at offset 0. Header validation (size1/size2 cross-check,
restart byte) provides additional confidence.
