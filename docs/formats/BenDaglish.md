---
date: 2026-02-27
topic: ben-daglish-bd-format
tags: [amiga, uade, compiled-68k, pcm-sampler, format-research]
status: analyzed-detection-only
---

# Ben Daglish — `.bd` / `.bds` Format

**Status:** Analyzed. Detection-only parser in DEViLBOX. UADE handles synthesis.

---

## Overview

Ben Daglish composed music for many classic Amiga games including *The Last Ninja* and
*Thing on a Spring*. The `.bd` format is a **self-contained compiled 68k binary** where
the player code and song data are baked into a single file. Each file contains the Amiga
replay routine, song sequence data, instrument metadata, and embedded 8-bit PCM samples.

**Extensions:** `.bd`, `.bds`
**UADE player:** `BenDaglish` — `Reference Code/uade-3.05/players/BenDaglish` (2.8 KB shim)
**Reference files:** ~45 files in `Reference Music/Ben Daglish/`
**DEViLBOX status:** `DETECTION_ONLY` — `BenDaglishParser.ts` + UADE synthesis

---

## File Layout

The file is a compiled Amiga 68k program. There is no fixed binary layout — the replayer
is compiled inline. The structure varies per file, but shares a consistent **dispatch table**
at the start.

### Dispatch Table (3 `BRA.W` instructions at offsets 0–12)

```
Offset  Bytes   Description
------  -----   -----------
0x0000  2       BRA opcode (0x6000)
0x0002  2       Offset D1 to function 1 (A0/A1 init entry point)
0x0004  2       BRA opcode (0x6000)
0x0006  2       Offset D2 to function 2
0x0008  2       (skipped — addq.l #2, A0 / no check in UADE)
0x000A  2       BRA opcode (0x6000)
0x000C  2       Offset D3 to function 3
```

**Magic bytes for detection:**
```
bytes[0..1]  = 0x6000   (BRA opcode)
bytes[2]     = non-zero, even (positive BRA displacement)
bytes[4..5]  = 0x6000   (BRA opcode)
bytes[6]     = non-zero, even
bytes[10..11] = 0x6000  (BRA opcode)
bytes[12]    = non-zero, even
```

After following the BRA at offset 0 to `target = 2 + u16(buf, 2)`:
```
u32BE(buf, target)      == 0x3F006100   (MOVE.W #xx, -(SP); BSR/BRA)
u16BE(buf, target + 6)  == 0x3D7C       (MOVE.W #xx, d16(An) — instrument table init)
u16BE(buf, target + 12) == 0x41FA       (LEA d16(PC), A0 — data pointer init)
```

### Instrument Structure (VoiceInfo, from player disassembly)

From `Reference Code/uade-3.05/amigasrc/players/wanted_team/BennDaglish/Benn Daglishv3.asm`:

```
InstrumentInfo struct (26+ bytes):
  +0   4   Offset to sample data (Amiga absolute address — NOT a file offset!)
  +4   4   Offset to loop start (Amiga absolute address)
  +8   2   Length in words (one-shot region)
  +A   2   Length of loop in words
  +C   2   Volume
  +E   2   Volume fade speed
 +10   2   Portamento duration
 +12   2   Portamento increment value
 +14   2   Vibrato depth
 +16   2   Vibrato increment value
 +18   2   Note transpose
 +1A   2   Fine tune period
```

The sample data pointers are **Amiga runtime addresses** (e.g. `0x7000 + fileOffset`). To
extract PCM samples, the load address must be computed from the player init code
(similar to ManiacsOfNoise load address recovery).

### Position List (V1 and V2 variants)

**V1 player:**
```
00–7F    = Track number
80–BF    = Loop track (effect & 0x1F times)
C0–C7 xx = Update instrument mapping at index (effect & 7) to sample xx
FE xx    = Transpose
FF       = End of position list
```

**V2 player:**
```
00–C7    = Track number
C8–EF    = Loop track (effect & 0x1F times)
F0–F7 xx = Update instrument mapping at index (effect - 0xF0) to sample xx
FD xx    = Start master volume fade
FE xx    = Transpose
FF       = End of position list
```

### Track Data Format

```
00–7E xx [yy] = Note. xx = ticks to wait. yy optional (on some players, when xx == 0)
7F xx         = Wait xx ticks
80–88         = Use instrument (effect & 7)
89–BF         = Set flag (effect & 0xF)
C0 xx yy zz   = Portamento 1 (start delay, duration, delta notes)
C1            = Stop portamento 1
C2 xx yy zz   = Volume fade (speed, duration, increment)
C3            = Stop volume fade
C4 xx         = Portamento 2 (duration)
C5            = Stop portamento 2
C6 xx yy zz   = Global volume slide (start, speed, increment)
C7            = Stop global volume slide
FF            = End of track data
```

---

## PCM Sample Data

PCM samples are 8-bit signed, stored at Amiga memory addresses pointed to by the
instrument table. The load address must be computed from init code to convert these
addresses to file offsets.

**Load address computation:** Similar to ManiacsOfNoise, scan the init code for
`LEA d16(PC), An` instructions and subtract the file offset of the target from the
stored Amiga address. From the Ben Daglish format doc, the load address is typically
around `0x7000`–`0x10000`.

---

## Why Detection-Only

A native WASM implementation requires:

1. **Load address extraction**: The PCM sample pointers in the instrument table are
   Amiga absolute memory addresses. To find them in the file, we must parse the init
   code and recover the load address.

2. **Player variant detection**: V1 and V2 players have different position list formats.
   The UADE eagleplayer assembly distinguishes them by structural checks.

3. **Variable file structure**: Each file has its own compiled replayer layout.

UADE handles playback correctly via the 68k replayer shim.

---

## What IS Extractable Statically

### ✅ Format detection
The BRA dispatch table + init body checks (`0x3F006100` at BRA target) are unique.
Current detection: `isBenDaglishFormat()` in `BenDaglishParser.ts`.

### ✅ Approximate instrument count
The number of instrument mapping table entries (typically 8) is determinable from
the init code. Default: 8 placeholder instruments.

### ❌ Instrument names
Not stored in the file. No name table in the Ben Daglish format.

### ❌ PCM samples (currently)
The sample pointers are Amiga absolute addresses. A load-address recovery pass
on the init code would make PCM extraction possible in the future.

---

## Existing DEViLBOX Support

| Feature | Status |
|---------|--------|
| Format detection | ✅ `isBenDaglishFormat()` in `BenDaglishParser.ts` |
| Instrument names | ❌ Not available (8 placeholder `'Synth'` instruments) |
| PCM extraction | ❌ Not implemented (Amiga address recovery needed) |
| Audio synthesis | UADE (via 68k eagleplayer shim) |

---

## Future Implementation Path

1. **Load address recovery**: Parse the `LEA (d16,PC), An` instruction in the init body
   to compute the Amiga load address. This allows converting absolute Amiga PCM pointers
   to file offsets.
2. **PCM extraction**: With load address known, extract each sample using the InstrumentInfo
   `sampleOffset`, `loopStart`, `sampleLength`, `loopLength` fields.
3. **Use Sampler engine**: Once PCM bytes are extracted, use `createSamplerInstrument()` —
   same approach as SoundMon, JamCracker, etc.

---

## Reference Files

| File | Composer | Size | Notes |
|------|----------|------|-------|
| Files in `Reference Music/Ben Daglish/Daglish` | Ben Daglish | ~40–280 KB | Typical range |

**UADE source:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/BennDaglish/`
- `Benn Daglishv3.asm` — UADE eagleplayer shim
- Format spec reference: `docs/formats/Ben Daglish.txt`
