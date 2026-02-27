# Digital Symphony (RISC OS / Acorn)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/DigitalSymphonyParser.ts`
**Extensions:** `.dsym`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/Digital Symphony/`

---

## Overview

Digital Symphony is an Amiga-style tracker for RISC OS (Acorn Archimedes / A3000) by
Hexadecimal Software, ca. 1993. Despite its RISC OS origins, it targets Amiga-style Paula
playback. Files use a non-printable 8-byte magic sequence and support up to 8 channels.
Sequence data and sample data can be LZW-compressed or stored in several compressed PCM
formats including µ-Law, sigma-delta, and LZW delta.

Reference: OpenMPT `soundlib/Load_dsym.cpp`

---

## File Layout

### File Header (17 bytes)

```
Offset  Size  Description
------  ----  -----------
0       8     Magic: \x02\x01\x13\x13\x14\x12\x01\x0B
8       1     version (u8, 0 or 1)
9       1     numChannels (u8, 1–8)
10      2     numOrders (u16LE, 0–4096)
12      2     numTracks (u16LE, 0–4096)
14      3     infoLen (u24LE)
```

### After Header

```
63 × u8                — sampleNameLengths: per-slot (bit7 = virtual sample)
                         If bit7=0: next 3 bytes = nLength u24LE (<<1 = byte count)
                         If bit7=1: virtual sample (no PCM data in file)

1 × length-prefixed    — song name (u8 length + ASCII)
8 bytes                — allowedCommands bitmask (which effects are valid)

Sequence chunk:        — numOrders × numChannels × u16LE (track indices)
                         May be LZW compressed

Track data:            — stored in 2000-track chunks, may be LZW compressed
                         numTracks × 256 bytes (64 rows × 4 bytes per row)

63 sample blocks:      — per real sample: name + header + PCM data
```

---

## Detection Algorithm

```
1. buf.byteLength >= 17 + 72
2. buf[0..7] == \x02\x01\x13\x13\x14\x12\x01\x0B
3. buf[8] in {0, 1}  (version)
```

---

## Track Row Encoding (4 bytes per row)

```
byte 0: bits[5:0] = note (0=none; 1–63 → XM note = rawNote + 48)
        bits[7:6] = instrument high bits
byte 1: bits[3:0] = instrument low bits (combined → 6-bit instrument index)
        bits[7:6] = command high bits
byte 2: bits[3:0] = command low bits (combined → 6-bit command)
        bits[7:4] = param high nibble
byte 3: param low byte
```

**Note mapping:**
```
XM note = rawNote + 48   (rawNote 1 → note 49 ≈ C-4)
```

---

## Sample Headers (per real sample slot)

```
name string (sampleNameLength & 0x3F bytes, may be null-terminated)
loopStart (u24LE, << 1 = byte offset)
loopLength (u24LE, << 1 = byte count; 0 = no loop)
volume (u8, 0–64)
fineTune (u8)
packingType (u8)
... sample data (packing-dependent)
```

---

## Sample Packing Types

| Type | Description |
|------|-------------|
| 0    | Modified µ-Law 8-bit → 16-bit conversion |
| 1    | LZW-compressed 8-bit delta PCM |
| 2    | 8-bit signed PCM (raw) |
| 3    | 16-bit signed PCM (raw) |
| 4    | Sigma-delta compressed → 8-bit unsigned |
| 5    | Sigma-delta compressed → µ-Law 16-bit (logarithmic) |

**µ-Law:** uses standard ITU-T G.711 decode table (255 quantisation levels → 16-bit).
**Sigma-delta:** from TimPlayer — 1-bit stream decoded with exponential accumulator.

---

## Panning

Hard Amiga-style LRRL alternating:
- Channel index where `(ch & 3) == 1` or `(ch & 3) == 2` → right (+50)
- Otherwise → left (−50)

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/DigitalSymphonyParser.ts`
- **OpenMPT reference:** `soundlib/Load_dsym.cpp`
