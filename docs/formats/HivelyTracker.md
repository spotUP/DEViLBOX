# Hively Tracker (HVL / AHX)

**Status:** FULLY_NATIVE — custom HivelySynth WASM engine
**Parser:** `src/lib/import/formats/HivelyParser.ts`
**Extensions:** `hvl.*`, `ahx.*`
**Reference files:** `Reference Music/HivelyTracker/` (44 files), `Reference Music/Hively Tracker/` (12 files)
**Replayer source:** `replay.c` from the HivelyTracker project (C, not Amiga assembly)

---

## Overview

Hively Tracker is a modern Amiga-inspired music format by Rez and Dexter. It is a
successor to AHX (Abyss' Highest eXperience) with extended features. Both formats
use the same `HivelySynth` WASM engine in DEViLBOX.

Two format variants exist:
- **AHX** — original 4-channel format; magic `"THX"` (0x54 0x48 0x58); version 0–2
- **HVL** — extended 4–11 channel format; magic `"HVL"` (0x48 0x56 0x4C); version 0–1

Both are **software synthesis** formats — no PCM samples, all sounds generated from
waveforms (sawtooth, square, white noise, etc.) modulated by envelopes, filters,
and performance lists.

**Primary reference:** `replay.c` (`hvl_reset()`, `hvl_load_ahx()`)

---

## Detection

```
AHX:  buf[0..2] = "THX" (0x54 0x48 0x58)  AND  buf[3] < 3
HVL:  buf[0..2] = "HVL" (0x48 0x56 0x4C)  AND  buf[3] <= 1
```

---

## AHX Header (14 bytes)

```
Offset  Size  Description
------  ----  -----------
0x00    3     Magic "THX"
0x03    1     Version (0–2)
0x04    2     Name offset (uint16BE, points to null-terminated name string)
0x06    1     Speed multiplier (bits 5:4 = ((bits>>5)&3)+1) + flags (bit7=blank track 0, bits3:0 = posn high nibble)
0x07    1     Number of positions (posn low byte; combined: ((buf[6]&0xF)<<8)|buf[7])
0x08    2     Restart position (uint16BE)
0x0A    1     Track length in rows (1–64)
0x0B    1     Number of tracks
0x0C    1     Number of instruments (1-indexed)
0x0D    1     Number of subsongs
0x0E    ...   Subsong start positions (ssn × 2 bytes)
```

AHX is always 4 channels. Default tempo: speed 6.

---

## HVL Header (16 bytes)

```
Offset  Size  Description
------  ----  -----------
0x00    3     Magic "HVL"
0x03    1     Version (0–1)
0x04    2     Name offset (uint16BE)
0x06    1     Speed multiplier + flags (same encoding as AHX)
0x07    1     Number of positions (low byte)
0x08    1     Restart + channel count: bits7:2 = (chnn−4), bits1:0 = restartPos high
0x09    1     Restart position low byte
0x0A    1     Track length in rows
0x0B    1     Number of tracks
0x0C    1     Number of instruments
0x0D    1     Number of subsongs
0x0E    2     Mix gain (uint16BE, /100 for float)
0x10    1     Stereo mode
0x11    ...   (padding)
```

HVL channels: `(buf[8] >> 2) + 4`, range 4–11.

---

## Position Table

Following the header and subsong list:

```
posn × channels × 2 bytes:
  byte 0: track number for this channel at this position
  byte 1: transpose (signed int8, −128..+127)
```

---

## Track Data

### AHX Tracks (3 bytes per row, bit-packed)

```
byte0:  bits7:2 = note (6 bits, 0=empty)
        bits1:0 = instrument high 2 bits
byte1:  bits7:4 = instrument low 4 bits
        bits3:0 = effect command
byte2:  effect parameter
```

### HVL Tracks (variable encoding)

```
0x3F (1 byte) → Empty step (compressed)
otherwise (5 bytes):
  byte0: note (0–63)
  byte1: instrument (0-based)
  byte2: bits7:4 = fx command A, bits3:0 = fx command B
  byte3: fx A parameter
  byte4: fx B parameter
```

---

## Instrument Data

All instruments appear after track data; names are stored in a separate name block.

### Instrument Header (22 bytes)

```
Offset  Size  Description
------  ----  -----------
0x00    1     Volume (0–64)
0x01    1     bits7:3 = filterSpeed, bits2:0 = waveLength (0=longest, 7=shortest)
0x02    1     aFrames (attack frames)
0x03    1     aVolume (attack volume)
0x04    1     dFrames (decay frames)
0x05    1     dVolume (decay volume)
0x06    1     sFrames (sustain frames)
0x07    1     rFrames (release frames)
0x08    1     rVolume (release volume)
0x09    3     (reserved/internal use)
0x0C    1     bits6 = filterSpeed high bit, bits6:0 = filterLowerLimit
0x0D    1     vibratoDelay
0x0E    1     bit7 = hardCutRelease, bits6:4 = hardCutReleaseFrames, bits3:0 = vibratoDepth
0x0F    1     vibratoSpeed
0x10    1     squareLowerLimit
0x11    1     squareUpperLimit
0x12    1     squareSpeed
0x13    1     bits5:0 = filterUpperLimit
0x14    1     plistSpeed (performance list advance speed)
0x15    1     plistLength (number of performance list entries)
```

### Performance List (4 bytes/entry in AHX, 5 bytes/entry in HVL)

Each entry controls one step of the instrument's "performance":

```
AHX (4 bytes per entry):
  byte0: bits7:5 = fx command B, bits4:3 = fx command A (encoded), bits2:1 = waveform high, bit0 = fixed
  byte1: bit6 = fixed note flag, bits5:0 = note (if fixed)
  byte2: fx A parameter
  byte3: fx B parameter

HVL (5 bytes per entry): similar but extended
```

Waveforms: 0=sawtooth, 1=square, 2=white noise, 3=silence, and variants.

---

## Synthesis

Both AHX and HVL are pure software synthesis:
- **Waveforms:** sawtooth, square (with upper/lower limit sweep), white noise
- **Envelope:** 7-stage (attack/decay/sustain/release with volume levels per stage)
- **Performance list:** Sequenced per-note modulation (pitch, waveform, filter, vibrato)
- **Filter:** resonant low-pass filter with upper/lower sweep limits
- **Vibrato:** delay + speed + depth envelope
- **Hard cut release:** abrupt release with optional release frames

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/HivelyParser.ts`
- **C replayer:** HivelyTracker project `replay.c`
- **UADE players:** `Reference Code/uade-3.05/players/AHX`, `HivelyTracker`

---

## Implementation Notes

**Current status:** FULLY_NATIVE

`HivelyParser.ts` implements a full byte-accurate parse of both AHX and HVL,
verified 1:1 against `replay.c`. The parsed `HivelyNativeData` structure is passed
directly to `HivelySynth` for real-time synthesis.

**AHX vs HVL differences:**
- AHX: fixed 4 channels, 3-byte track steps, 4-byte plist entries
- HVL: variable 4–11 channels, compressed 1 or 5-byte track steps, 5-byte plist
  entries, stereo mode + mix gain fields
