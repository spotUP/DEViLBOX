# Magnetic Fields Packer (.mfp)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/MFPParser.ts`
**Extensions:** `mfp.*` (prefix-based)
**UADE name:** Magnetic_Fields_Packer
**Reference files:** `Reference Music/Magnetic Fields Packer/`
**Reference:** `Reference Code/libxmp-master/src/loaders/mfp_load.c`

---

## Overview

Magnetic Fields Packer is a 4-channel Amiga module packer created by Shaun Southern.
The song data lives in an `mfp.*` file; companion `smp.*` files contain the raw PCM sample
data (not parsed here). Detection is filename-based (prefix `mfp.`) combined with structural
header validation.

Unlike ProTracker, MFP uses a 4-level indirect lookup table to address pattern rows, allowing
compact reuse of melodic fragments across the song.

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0       248   31 × 8-byte instrument headers
248     1     numPatterns (u8) — also equals size1 at offset 378
249     1     Restart byte (always 0x7F)
250     128   Order table (u8 each, 128 entries)
378     2     size1 (u16BE) — number of pattern table entries (== numPatterns)
380     2     size2 (u16BE) — must equal size1 (cross-check)
382     ...   Pattern table: size1 × 4 channels × u16BE channel offsets
...     ...   Per-channel pattern data blocks (up to 1024 bytes each)
...     ...   [Sample PCM is in companion smp.* file]
```

---

## Detection Algorithm

```
1. Filename basename[3] == '.'  (e.g. "mfp.songname")
2. buf.byteLength >= 384
3. buf[249] == 0x7F  (restart byte)
4. For each of 31 instrument headers (i*8):
   - u16BE(i*8) <= 0x7FFF  (length sane)
   - buf[i*8+2] & 0xF0 == 0  (finetune high nibble must be zero)
   - buf[i*8+3] <= 0x40  (volume 0–64)
   - loopStart <= length; loopStart+loopLen-1 <= length
   - if length > 0: loopLen != 0
5. buf[248] == u16BE(378) == u16BE(380)  (pattern count cross-check)
```

---

## Instrument Header (8 bytes each, offsets 0–247)

```
Offset  Size  Description
------  ----  -----------
0       2     length (u16BE, in words; ×2 = bytes)
2       1     finetune (u8, low nibble; high nibble must be 0)
3       1     volume (u8, 0–64)
4       2     loopStart (u16BE, in words)
6       2     loopSize (u16BE, in words; >1 = active loop)
```

Finetune is stored in the low nibble only; the parser shifts left by 4 to produce a signed
int8 value matching the libxmp convention.

---

## Pattern Encoding — 4-Level Indirect Lookup

Each channel has a block of up to 1024 bytes. The 64 rows of each pattern are addressed via
a 4-level indirect lookup (k, x, y each in 0–3):

```
l1 = k
l2 = chanBuf[l1] + x
l3 = chanBuf[l2] + y
eventBase = chanBuf[l3] * 2
→ 4-byte ProTracker event at chanBuf[eventBase]
```

Each 4-byte event uses standard ProTracker MOD encoding:
```
byte0: [instHi(4)][periodHi(4)]
byte1: [periodLo(8)]
byte2: [instLo(4)][effectType(4)]
byte3: [effectParam(8)]
```

---

## Channel Configuration

- 4 channels total
- LRRL Amiga panning: `[-50, +50, +50, -50]`
- Sample rate base: Amiga PAL clock / period
- Initial speed: 6, initial BPM: 125

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/MFPParser.ts`
- **libxmp reference:** `Reference Code/libxmp-master/src/loaders/mfp_load.c`
