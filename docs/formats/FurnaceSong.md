# Furnace Tracker Song (.fur)

**Status:** FULLY_NATIVE — routes to Furnace chip synthesizer
**Parser:** `src/lib/import/formats/FurnaceSongParser.ts`
**Extensions:** `.fur`
**UADE name:** N/A (native Furnace synth)
**Reference files:** `Reference Music/Furnace/`
**Reference:** `Reference Code/furnace-master/src/engine/fileOps/fur.cpp`

---

## Overview

Furnace Tracker Song files (`.fur`) contain full multi-chip chiptune compositions.
The format supports formats versions 12–228+ (Furnace 0.2 to 0.6.8.1) and may be
zlib-compressed. Songs contain instruments, samples, wavetables, and pattern data for
dozens of supported chip types.

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0       16    Magic: "-Furnace module-" (ASCII, 16 bytes)
16      2     version (u16LE, 12–231+)
18      2     reserved
20      4     infoPtr (u32LE) — offset to INFO/INF2 block
```

If the first 2 bytes are `0x1F 0x8B` (gzip magic), the file body is zlib-compressed.
After decompression, the layout above applies.

### INFO Block (old, version < 119)

```
"INFO" magic (4)
block size (4)
ticks per second hz (u16LE)
pattern length in rows (u16LE)
song length in orders (u16LE)
loop position (u16LE)
virtual tempo numerator / denominator (u16LE each)
speed1, speed2 (u8 each)
chip count (u8)
chips[32] (u8 each — chip type IDs)
instrument count (u16LE)
wavetable count (u16LE)
sample count (u16LE)
pattern count (u32LE)
chip volumes, panning, flags (arrays)
instrument name strings (null-terminated)
wavetable pointers (u32LE array)
sample pointers (u32LE array)
pattern pointers (u32LE array)
order matrix (chip_count × song_length u8 entries)
```

### INF2 Block (new, version ≥ 119)

Same fields as INFO but with subsong support and additional chip configuration.

---

## Pattern Formats

### PATR (old pattern, version < 119)

```
Per row, per channel:
  note (u8):  1=C#, 2=D, ..., 11=B, 12=C(next octave), 100=off, 101=release, 102=macro release
  octave (i8): signed (-1=255, -2=254, etc.)
  instrument (u8): 0=none
  volume (u8): 0=none (maps via volMax)
  effect[N] command (u8) + value (u8) pairs
```

### PATN (new pattern, version ≥ 119)

```
Per row:
  note (u16LE): 0=C-(-5) up to 179=B-9; 180=note off, 181=note release, 182=macro release
  instrument (u16LE)
  volume (u16LE)
  effect[N] command (u16LE) + value (u16LE) pairs
```

---

## Timing Formula

```
BPM = 2.5 × hz / speed × (virtualTempo / virtualTempoD)
```

Where `hz` is ticks per second (50 = PAL, 60 = NTSC) and `speed` is ticks per row.

---

## Instrument Type → SynthType Mapping

| Furnace Type | Chip | DEViLBOX SynthType |
|---|---|---|
| 0 (STD) | Generic | ChipSynth |
| 1 (FM) | YM2612 / Genesis | FurnaceOPN |
| 2 (GB) | Game Boy DMG | FurnaceGB |
| 3 (C64) | SID | FurnaceC64 |
| 4 (AMIGA) | Amiga PCM | Sampler |
| 5 (PCE) | HuC6280 | FurnacePCE |
| 6/7 (AY) | AY-3-8910 | FurnaceAY |
| 13 (OPLL) | YM2413 | FurnaceOPLL |
| 14 (OPL) | OPL2/OPL3 | FurnaceOPL |
| 33 (OPM) | YM2151 | FurnaceOPM |
| 34 (NES) | 2A03 | FurnaceNES |
| ... | ... | ... |

Full mapping: `FURNACE_TYPE_MAP` in `FurnaceSongParser.ts`.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/FurnaceSongParser.ts`
- **Furnace source:** `Reference Code/furnace-master/src/engine/fileOps/fur.cpp`
- **Instrument parser:** `src/lib/import/formats/FurnaceParser.ts`
