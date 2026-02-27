# GDM (General Digital Music / BWSB 2GDM)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/GDMParser.ts`
**Extensions:** `.gdm`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/GDM/`

---

## Overview

GDM is a conversion format produced by BWSB 2GDM (Back to Warp Speed Batch tool).
It wraps MOD, S3M, FAR, ULT, STM, MED, and PSM files into a single container with
a normalised effect set. All values are little-endian. The format was used as an
intermediate for early DOS sound engines.

Reference: OpenMPT `Load_gdm.cpp`

---

## File Layout

### GDM File Header (157 bytes)

```
Offset  Size  Description
------  ----  -----------
0       4     Magic: "GDM\xFE" (0x47 0x44 0x4D 0xFE)
4       32    songTitle[32]
36      32    songMusician[32]
68      3     dosEOF: {0x0D, 0x0A, 0x1A}
71      4     Magic2: "GMFS" (0x47 0x4D 0x46 0x53)
75      1     formatMajorVer (u8, must be 1)
76      1     formatMinorVer (u8, must be 0)
77      2     trackerID (u16LE)
79      1     trackerMajorVer (u8)
80      1     trackerMinorVer (u8)
81      32    panMap[32] (u8 each: 0–15=L/R pan, 16=surround, 255=unused)
113     1     masterVol (u8, 0–64)
114     1     tempo (u8) — initial speed (ticks per row)
115     1     bpm (u8) — initial BPM
116     2     originalFormat (u16LE): 1=MOD 2=MTM 3=S3M 4=669 5=FAR 6=ULT 7=STM 8=MED 9=PSM
118     4     orderOffset (u32LE)
122     1     lastOrder (u8) → numOrders = lastOrder + 1
123     4     patternOffset (u32LE)
127     1     lastPattern (u8) → numPatterns = lastPattern + 1
128     4     sampleHeaderOffset (u32LE)
132     4     sampleDataOffset (u32LE)
136     1     lastSample (u8) → numSamples = lastSample + 1
137     4     messageTextOffset (u32LE)
141     4     messageTextLength (u32LE)
145     4     scrollyScriptOffset (u32LE)
149     2     scrollyScriptLength (u16LE)
151     4     textGraphicOffset (u32LE)
155     2     textGraphicLength (u16LE)
```

### GDM Sample Header (62 bytes each)

```
Offset  Size  Description
------  ----  -----------
0       32    name[32]
32      12    fileName[12]
44      1     emsHandle (u8, ignored)
45      4     length (u32LE, bytes)
49      4     loopBegin (u32LE, bytes)
53      4     loopEnd (u32LE, bytes; effective = loopEnd - 1)
57      1     flags (u8): bit0=loop, bit1=16-bit, bit2=hasVolume, bit3=hasPanning
58      2     c4Hertz (u16LE) — C5 playback speed in Hz
60      1     volume (u8, 0–64; only if bit2 set)
61      1     panning (u8, 0–15 / 16=surround / 255=no pan)
```

---

## Detection Algorithm

```
1. buf[0..3] == "GDM\xFE"
2. buf[71..74] == "GMFS"
3. buf[75] == 1  (formatMajorVer)
4. buf[76] == 0  (formatMinorVer)
```

---

## Pattern Encoding

GDM patterns use a compressed per-row channel encoding with a mask byte:

```
mask byte:
  bit 0 = note+instrument present
  bit 1 = volume present
  bit 2 = effect 1 present
  bit 3 = effect 2 present
  bit 4 = effect 3 present
  bit 5 = channel number present
  bits 6–7 = reserved (if mask==0xFF: end of row)

If note+instr present: note(u8) + instr(u8)
  note: 0 = empty, 1–96 = C-0..B-7, 97 = note cut
If volume present: vol(u8)
If effect N present: effType(u8) + effParam(u8)
```

Up to 3 effects per cell (GDM-specific multi-effect support).

---

## Channel Panning

From `panMap[ch]` (0–15 range):
```
pan_signed = panMap[ch] - 8   (maps 0..15 to -8..+7, center at 8)
```

---

## Original Format Field

The `originalFormat` word records the source format:
| Value | Format |
|-------|--------|
| 1     | MOD    |
| 2     | MTM    |
| 3     | S3M    |
| 4     | 669    |
| 5     | FAR    |
| 6     | ULT    |
| 7     | STM    |
| 8     | MED    |
| 9     | PSM    |

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/GDMParser.ts`
- **OpenMPT reference:** `soundlib/Load_gdm.cpp`

