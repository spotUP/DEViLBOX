# YM (Atari ST AY/YM Register Dump)

**Status:** FULLY_NATIVE — AY-3-8910/YM2149 register frame replay via FurnaceAY
**Parser:** `src/lib/import/formats/YMParser.ts`
**Extensions:** `.ym`
**UADE name:** N/A (native engine)
**Reference files:** `Reference Music/YM/`
**Synth types:** `FurnaceAY`

---

## Overview

YM is an Atari ST music format that stores a direct register-dump of the YM2149
(AY-3-8910 compatible) sound chip at 50 Hz. Files exist in several versions:
uncompressed (YM2!, YM3!, YM3b) and LZH-5 compressed (YM4!, YM5!, YM6!). DEViLBOX
decompresses and replays register frames through the FurnaceAY chip engine.

The YM chip has 3 tone channels (A, B, C), an envelope generator, and a noise
generator, identical in architecture to the AY-3-8910 used in ZX Spectrum / CPC.

---

## File Layout

### YM2! (v2, uncompressed)

```
Offset  Size  Description
------  ----  -----------
0x00    4     Magic: "YM2!" (no additional header)
0x04    ...   Register frames: 14 bytes/frame × numFrames
              Frame order: R0–R13 interleaved for all frames
```

### YM3! / YM3b (v3, uncompressed)

```
Offset  Size  Description
------  ----  -----------
0x00    4     Magic: "YM3!" or "YM3b"
0x04    ...   Register frames: 14 bytes/frame × numFrames (interleaved)
YM3b only: last 4 bytes = loop frame offset (u32BE)
```

### YM5! / YM6! (v5/v6, LZH-5 compressed)

```
Offset  Size  Description
------  ----  -----------
0x00    4     Magic: "YM5!" or "YM6!"
0x04    8     "LeOnArD!"  — LZH identification string
0x0C    4     numFrames   (u32BE)
0x10    4     songAttribs (u32BE): bit0=interlaced, bit1=timed drums, bit2=loop
0x14    2     numDigidrums (u16BE) — number of digital drum samples
0x16    4     chipClock   (u32BE) — AY clock in Hz (Atari ST = 2000000)
0x1A    2     playerRate  (u16BE) — frames per second (typically 50)
0x1C    4     loopFrame   (u32BE) — frame index for loop
0x20    2     skipFrames  (u16BE) — silence frames at start
0x22    2     songNameLen (u16BE) — 0 = no name
0x24    ...   songName    — null-terminated ASCII (songNameLen bytes)
...     ...   authorName  — null-terminated ASCII
...     ...   comment     — null-terminated ASCII
...     ...   numDigidrums × digiDrum entries (u32BE size + raw PCM)
...     ...   LZH-5 compressed register frame data
```

**YM4!** uses the same header as YM5! but without digidrum support.

---

## Register Frame Encoding

In interleaved mode (v5+, `songAttribs bit0 == 1`):
```
Frame data is stored column-major across all frames:
  Register R0 for all frames, then R1 for all, ..., then R13 for all
```

In non-interleaved mode (v2/v3):
```
Sequential: [R0..R13] for frame 0, [R0..R13] for frame 1, ...
```

**YM2149 register map (per frame, 14 bytes):**
```
R0   Channel A fine pitch (low 8 bits)
R1   Channel A coarse pitch (bits 3:0)
R2   Channel B fine pitch
R3   Channel B coarse pitch
R4   Channel C fine pitch
R5   Channel C coarse pitch
R6   Noise period (bits 4:0)
R7   Mixer control: tone enable A/B/C, noise enable A/B/C (active low)
R8   Channel A volume + envelope flag (bit4)
R9   Channel B volume + envelope flag
R10  Channel C volume + envelope flag
R11  Envelope period fine
R12  Envelope period coarse
R13  Envelope shape: hold/alt/attack/continue
```

---

## Frequency to Note

```
clock = 2000000 Hz (Atari ST)
period = (R1 & 0x0F) << 8 | R0   (12-bit, for channel A)
freq_hz = clock / (16 * period)
note = round(12 * log2(freq_hz / 440) + 69)
```

Valid period range: 1–4095. Period 0 = muted.

---

## Detection Algorithm

```
buf[0..3] in { "YM2!", "YM3!", "YM3b", "YM4!", "YM5!", "YM6!" }
```

For YM5!/YM6!, `buf[4..11] == "LeOnArD!"` is additionally verified.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/YMParser.ts`
- **Furnace AY platform:** `Reference Code/furnace-master/src/engine/platform/ay.cpp`
- **YM format spec:** `leonard.oxg.free.fr/ymformat.html`

---

## Implementation Notes

**LZH-5 decompression:** YM5!/YM6! files use LZH-5 (LZHUF) compression. DEViLBOX
implements a pure-TypeScript LZH-5 decompressor based on the public-domain LZHUF
algorithm. The dictionary size is 8192 bytes (13-bit).

**Digidrum samples** (YM5!/YM6! `numDigidrums > 0`): Raw 8-bit PCM samples used
for percussion via YM register writes to R6/R8–R10. DEViLBOX extracts these as
additional sampler instruments.

**AY clock:** The Atari ST uses 2 MHz. Other platforms that use YM format may have
different clocks (e.g., Spectrum = 1.7734475 MHz). The `chipClock` field in YM5+
overrides the default.

