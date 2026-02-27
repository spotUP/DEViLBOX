# ULT (UltraTracker)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/ULTParser.ts`
**Extensions:** `.ult`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/UltraTracker/`

---

## Overview

UltraTracker is a PC DOS tracker by MAS. It stores samples as uncompressed PCM (8-bit
signed or 16-bit signed LE) and patterns in a channel-interleaved RLE-compressed format
with **two effects per cell**. Four format versions exist (v1–v4), with progressive
additions to sample headers and panning.

Reference: OpenMPT `Load_ult.cpp`

---

## File Layout

### ULT File Header (48 bytes)

```
Offset  Size  Description
------  ----  -----------
0       14    Signature: "MAS_UTrack_V00" (0x4D41535F55547261636B5F563030)
14      1     version (u8, ASCII '1'–'4' = 0x31–0x34)
15      32    songName[32] (space-padded ASCII)
47      1     messageLength (u8) — number of 32-byte message lines
```

### After Header

```
messageLength × 32 bytes   song message (ASCII, informational)
numSamples (u8)
numSamples × UltSample     v ≥ '4': 66 bytes; v < '4': 64 bytes
256 bytes                  order list (u8 each; 0xFF = end, 0xFE = loop)
1 byte                     numChannels - 1 (add 1 for actual channel count)
1 byte                     numPatterns - 1 (add 1 for actual pattern count)
numChannels bytes          panning:
                           v ≥ '3': per-channel nibble × 16 + 8 → XM pan
                           v < '3': LRRL alternating
pattern data               channel-interleaved RLE (see below)
sample PCM                 sequential, signed 8-bit or 16-bit LE
```

---

## ULT Sample Header

**v < '4' (64 bytes):**
```
Offset  Size  Description
------  ----  -----------
0       32    sampleName[32]
32      12    fileName[12]
44      4     loopStart (u32LE, bytes)
48      4     loopEnd (u32LE, bytes)
52      2     sizeStart (u16LE) — bytes from start before loop
54      2     sizeEnd (u16LE)   — bytes after loop
56      1     volume (u8, 0–64)
57      1     flags (u8): bit2=16-bit, bit3=loop, bit4=pingpong
58      2     speed (u16LE) — C4 speed in Hz
60      4     length (u32LE, in samples)
```

**v ≥ '4' (66 bytes):** adds 2 bytes for fine-tune at the end.

---

## Detection Algorithm

```
1. buf.byteLength >= 48
2. buf[0..13] == "MAS_UTrack_V00"
3. buf[14] in { '1', '2', '3', '4' }   (ASCII version byte)
```

---

## Pattern Encoding (RLE, channel-interleaved)

ULT patterns use run-length encoding per channel. Each channel's data for a pattern is
stored sequentially, then the next channel, etc.

**RLE byte:**
```
if byte == 0xFC: next byte = count + 1; next 6 bytes = cell to repeat
else:            read 6-byte cell directly
```

**ULT Cell (6 bytes, two effects):**
```
byte 0: note1 (0 = empty; else XM note = note1 + 36 + NOTE_MIN)
byte 1: sample1 (0 = no sample)
byte 2: eff1 (effect type 1)
byte 3: par1 (effect parameter 1)
byte 4: eff2 (effect type 2)
byte 5: par2 (effect parameter 2)
```

Two simultaneous effects per cell is a distinguishing feature of UltraTracker.

---

## Effects

UltraTracker effects map to XM effects with some differences:
- Arpeggio, portamento, vibrato, volume slide, retrig, offset: standard
- Panning: extended effect 0xE8x
- Fine porta/fine vol slide: extended 0xE1x/0xE2x/0xEAx/0xEBx
- BPM change: Fxx ≥ 0x21

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/ULTParser.ts`
- **OpenMPT reference:** `soundlib/Load_ult.cpp`

