# XMF (Astroidea / Imperium Galactica)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/XMFParser.ts`
**Extensions:** `.xmf`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/XMF/`

---

## Overview

XMF is a DOS tracker format used in the game "Imperium Galactica" and various Astroidea
demos. **Note:** This has no relation to the MIDI XMF format. The format stores 256 sample
headers in a fixed array at offset 1, with an order list, channel panning, and packed
6-byte pattern cells. Three file types exist (2, 3, 4) with different finetune handling
and portamento behavior.

Reference: OpenMPT `soundlib/Load_xmf.cpp`

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0       1     type (u8): 2, 3, or 4
              Type 2: Old UltraTracker finetune, automatic tone portamento
              Type 3: Normal finetune, automatic tone portamento (Imperium Galactica)
              Type 4: Normal finetune, manual tone portamento (MOD-like)
1       4096  sampleHeaders[256] — 256 × XMFSampleHeader (16 bytes each)
4097    256   orders[256] — u8 order list (0xFF = end of list)
4353    1     lastChannel (u8, 0-based index of last active channel; max 31)
4354    1     lastPattern (u8, 0-based; numPatterns = lastPattern + 1)
4355    ...   channelPans[numChannels] — u8 per channel (0–255, × 0x11 = XM pan 0–255)
...     ...   Pattern data: numPatterns × numChannels × 64 rows × 6 bytes
...     ...   Sample PCM: raw signed 8-bit or 16-bit LE (per sample flags)
```

---

## Detection Algorithm

```
1. buf.byteLength >= 4355 + some patterns
2. buf[0] in {2, 3, 4}  (type byte)
3. (Heuristic: check that order list and sample data consistency pass)
```

---

## XMF Sample Header (16 bytes, all little-endian)

```
Offset  Size  Description
------  ----  -----------
0       3     loopStart (u24LE)
3       3     loopEnd (u24LE)
6       3     dataStart (u24LE, absolute file offset)
9       3     dataEnd (u24LE, absolute file offset)
12      1     defaultVolume (u8, 0–64)
13      1     flags (u8): bit2=16-bit, bit3=loop, bit4=bidi-loop
14      2     sampleRate (u16LE, Hz at base pitch)
```

Sample PCM data is located at the absolute file offsets in `dataStart`/`dataEnd`.

---

## Pattern Cell Encoding (6 bytes per cell, channel-major order)

```
byte 0: note    — 0=empty; 1–77 → XM note = NOTE_MIN + 35 + note
byte 1: instr   — sample number (1-based; 0 = no change)
byte 2: eff1    — effect command 1
byte 3: eff2    — effect command 2
byte 4: param2  — parameter for eff2
byte 5: param1  — parameter for eff1
```

Pattern data iterates: for each pattern, channels outer, rows inner.

---

## Effect Translation

| XMF | Description |
|-----|-------------|
| 0x0B | Position jump; param < 0xFF → param+1 (1-based) |
| 0x10 | Extended effect (E-style): maps to 0x8x |
| 0x11 | Extended effect: maps to 0x9x |
| 0x12 | Ignored (ULT cmd5 translator artifact) |
| >0x12 | Invalid |

**Type-specific:**
- Type 4, CMD_VOLUME: param conversion `(param+3)/4` unless `param&3` or `param==0xFF`
- Type 2/3, CMD_TEMPO with param=0x20 → treat as CMD_SPEED

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/XMFParser.ts`
- **OpenMPT reference:** `soundlib/Load_xmf.cpp`
