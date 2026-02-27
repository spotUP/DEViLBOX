# MTM (MultiTracker)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/MTMParser.ts`
**Extensions:** `.mtm`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/MultiTracker/`

---

## Overview

MultiTracker is a PC DOS tracker format by Ian Croft. It supports up to 32 channels
and uses a **shared track pool** system similar to ICE Tracker: patterns reference
tracks by index, with multiple patterns able to share the same track data. Up to 128
patterns and 32 channels are supported.

Reference: OpenMPT `Load_mtm.cpp`

---

## File Layout

### MTM File Header (66 bytes)

```
Offset  Size  Description
------  ----  -----------
0       3     Magic: "MTM" (0x4D 0x54 0x4D)
3       1     version (u8, e.g. 0x10 = v1.0; must be < 0x20)
4       20    songName (ASCIIZ)
24      2     numTracks (u16LE)
26      1     lastPattern (u8; patterns = lastPattern + 1)
27      1     lastOrder (u8; orders use [0..lastOrder], must be ≤ 127)
28      2     commentSize (u16LE)
30      1     numSamples (u8; must be ≤ 64, ≤ 32 in practice)
31      1     attribute (u8, unused)
32      1     beatsPerTrack (u8, usually 64)
33      1     numChannels (u8, 1–32)
34      32    panPos[32] (u8 each, 0–15; center = 8)
```

### Sample Headers (at offset 66)

`numSamples × 37 bytes` per header:

```
Offset  Size  Description
------  ----  -----------
0       22    sampleName (ASCIIZ)
22      4     length (u32LE, bytes)
26      4     loopStart (u32LE, bytes)
30      4     loopEnd (u32LE, bytes)
34      1     finetune (int8, -8..+7)
35      1     volume (u8, 0–64)
36      1     attribute (u8): bit0 = 16-bit sample
```

### Order Table

128 bytes at `66 + numSamples * 37`. Each byte = pattern index to play.

### Track Pool

`numTracks × 192 bytes` — each track = 64 rows × 3 bytes per row:

```
byte 0 (noteInstr): note = byte0 >> 2; instrHi = (byte0 & 0x03) << 4
byte 1 (instrCmd):  instrLo = (byte1 >> 4) & 0x0F; cmd = byte1 & 0x0F
                    instrument = (instrHi | instrLo)
byte 2 (par):       effect parameter
```

XM note: `noteInstr_note + 37` (raw note 0 = empty, 1–96 pitched)

### Pattern Table

`(lastPattern + 1) × 32 × 2 bytes` — each entry is a u16LE track index
(one per channel per pattern). Track index 0 = empty track.

### Comment

`commentSize` bytes of ASCII text.

### Sample PCM

Samples sequentially stored after the comment. Unsigned 8-bit or signed LE 16-bit
depending on the `attribute` bit.

---

## Detection Algorithm

```
1. buf.byteLength >= 66
2. buf[0..2] == "MTM"
3. version = buf[3]; require version < 0x20
4. lastOrder = buf[27]; require lastOrder <= 127
5. globalVol = buf[32]; require globalVol <= 64
6. numChannels = buf[33]; require 1 <= numChannels <= 32
```

---

## Channel Panning

From `panPos[ch]` (0–15, center = 8):
```
pan_signed = (panPos[ch] - 8) * (100 / 8)  ≈ -100..+100
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/MTMParser.ts`
- **OpenMPT reference:** `soundlib/Load_mtm.cpp`

