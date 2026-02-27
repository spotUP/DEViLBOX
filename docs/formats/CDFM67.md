# CDFM67 (Composer 670 / C67)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/CDFM67Parser.ts`
**Extensions:** `.c67`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/CDFM/`

---

## Overview

CDFM Composer (also known as Composer 670) is a PC DOS tracker by Edward Schlunder that
supports 4 PCM channels and 9 OPL FM channels (OPL2), giving 13 channels total. Files
use extension `.c67`. The format stores 32 PCM sample headers and 32 FM instrument
register dumps in a fixed 1954-byte header, followed by pattern offset/length tables and
packed pattern data.

Reference: OpenMPT `soundlib/Load_c67.cpp`

---

## File Layout

### Fixed Header (1954 bytes)

```
Offset  Size  Description
------  ----  -----------
0       1     speed (u8, initial ticks/row, 1–15)
1       1     restartPos (u8, order restart position)
2       416   sampleNames[32][13] — 32 × 13-byte null-terminated PCM sample names
418     512   samples[32] — 32 × C67SampleHeader (16 bytes each):
                {unknown(4), length(u32LE), loopStart(u32LE), loopEnd(u32LE)}
930     416   fmInstrNames[32][13] — 32 × 13-byte null-terminated FM instrument names
1346    352   fmInstr[32][11] — 32 × 11-byte OPL2 register dump
1698    256   orders[256] — order list (u8 each; 0xFF = end marker)
```

### After Fixed Header (at offset 1954)

```
patOffsets[128] × u32LE  — pattern data offsets (relative to offset 2978)
patLengths[128] × u32LE  — pattern data lengths
Pattern data at 2978 + patOffsets[i]
```

**PAT_DATA_BASE = 2978** (= 1954 + 512 + 512)

---

## Detection Algorithm

```
Extension-based: file extension is ".c67"
(No distinctive magic bytes in the header)
```

---

## Pattern Cell Encoding (command-based)

Patterns use a command-based encoding (not row-based like ProTracker):

```
cmd 0x00–0x0C: note/instrument/volume on channel (cmd = channel index)
  Two bytes follow:
    byte 0 (note):     bits[3:0] = semitone (0=C, 1=C#, ..., 11=B)
                       bits[6:4] = octave
                       bit 7     = instrument index bit 4 (high)
    byte 1 (instrVol): bits[7:4] = instrument index low nibble
                       bits[3:0] = volume (0–15)

cmd 0x20–0x2C: volume only (cmd - 0x20 = channel)
  One byte follows: bits[3:0] = volume (0–15)

cmd 0x40: delay — advance rows
  One byte follows: number of rows to advance

cmd 0x60: end of pattern
```

**Channel mapping:**
- Channels 0–3: PCM (alternating L/R panning: 64/192)
- Channels 4–12: FM/OPL2

**Defaults:**
- Default BPM: 143
- Rows per pattern: 64

---

## FM Instruments

Each of the 32 FM instruments is stored as an 11-byte OPL2 register dump, covering:
- Operator 1 and Operator 2 settings (AM, VIB, EGT, KSR, mult, KSL, vol, AR, DR, SL, RR)
- Feedback / connection byte

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/CDFM67Parser.ts`
- **OpenMPT reference:** `soundlib/Load_c67.cpp`
