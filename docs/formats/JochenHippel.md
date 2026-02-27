---
date: 2026-02-27
topic: jochen-hippel-hip-format
tags: [amiga, uade, tfmx, macro-synth, compiled-binary, format-research]
status: analyzed-deferred
---

# Jochen Hippel — `.hip` / `.mcmd` / `.sog` Format

**Status:** Analyzed. Deferred — TFMX macro-synth engine requires TFMX-ST emulation.

---

## Overview

The Jochen Hippel base format (`.hip`) is a **self-contained compiled 68k binary** where
each file contains a small dispatch table, a TFMX-ST macro-synth replayer, and the song
data (patterns, macros, PCM waveforms) embedded in a single file.

This format is distinct from:
- **HippelCoSo** (`.hipc`) — ALREADY FULLY IMPLEMENTED in DEViLBOX (HippelCoSoSynth)
- **JochenHippel-7V** (`.hip7`, `.s7g`) — 7-voice variant (detection-only parser exists)
- **JochenHippel-ST** (`.sog`, `.mcmd`) — unwrapped TFMX-ST data (detection-only parser exists)

**Extensions:** `.hip`, `.mcmd`, `.sog`
**UADE Eagleplayer:** `JochenHippel` (3.2 KB — small shim only)
**Reference files:** 63 files in `Reference Music/Hippel/Jochen Hippel/`

---

## File Layout

### Dispatch Table (all `.hip` files share this pattern)

```
Offset  Bytes   Description
------  -----   -----------
0x0000  2       BRA.B +2   (6002) — jumps past interrupt pointer to init function
0x0002  2       BRA.B +N   (60xx) — interrupt/play function pointer
0x0004  4       $48E7FFFE  — MOVEM.L D0-D7/A0-A6, -(SP) — start of init function
0x0008  4       BSR +N     — call to actual init body
0x000C  4       MOVEM.L (SP)+, D0-D7/A0-A6 — restore all
0x0010  2       RTS        (4E75) — return from init
0x0012  4       $48E7FFFE  — MOVEM.L (save all) — start of play function
0x0016  4       BSR +N     — call to actual play body
0x001A  4       MOVEM.L (SP)+, ... — restore all
0x001E  2       RTS        (4E75) — return from play
0x0020  ...     Init body + Play body (68k machine code)
```

**Magic bytes for detection:**
```
[0] = 0x60          (BRA instruction)
[1] = 0x02          (short-form, displacement = 2)
[2] = 0x60          (second BRA — interrupt pointer)
[4..7] = 48 E7 FF FE (MOVEM.L save-all instruction)
```

### Embedded TFMX Block

All `.hip` files contain an embedded TFMX-ST song block. Located after the replayer code,
typically at around offset `0x900`–`0xA00` (varies per file). Detection: scan for `TFMX`
magic bytes (4 bytes) followed by a null byte (`0x00`).

```
Offset     Content
------     -------
TFMX+0     'TFMX'  (4 bytes)
TFMX+4     0x00    (null byte — distinguishes TFMX-ST from TFMX Professional)
TFMX+5..   TFMX-ST song header (see below)
```

**TFMX-ST header fields (after null byte):**

| Word | Field                   | Usage                          |
|------|-------------------------|--------------------------------|
| w0   | pattern_rows_1          | (2+w0+w1) << 6 = pattern data bytes |
| w1   | pattern_rows_2          | see above |
| w2   | num_sequences           | (w2+1) × w4 = sequence data bytes |
| w3   | num_macros              | (w3+1) × 12 = macro data bytes |
| w4   | sequence_length         | see above |
| (skip 1 word) | reserved     | |
| w5   | num_samples             | (w5+1) × 6 = sample table bytes |

**Size formula:**
```
data_size = ((2 + w0 + w1) << 6) + (w2+1)*w4 + (w3+1)*12 + (w5+1)*6 + 32
```
After `data_size` bytes (relative to TFMX tag offset + 4), validation bytes:
- Long at 0: must be 0
- Word at +4: `num_samples_final` (must be > 0)
- Long at +30: must equal `num_samples_final * 2`

**Example: `comic bakery.hip` (8,724 bytes)**
```
TFMX at offset 0x0962:
  w0=11, w1=14, w2=35, w3=103, w4=64, w5=3
  Computed size = 5,336 bytes
  TFMX block ends at 0x1E3E
```

### Post-TFMX: Instrument Names + PCM Data

After the TFMX block, the file contains:
1. **Instrument name table**: null-terminated AmigaOS device path strings + binary data
   (e.g., `D20-1:RECT_D_0.MAT\0`, `D20-1:RECT_D_1.MAT\0`)
   Each entry: name string + null + 11 bytes of binary offset/length data
2. **PCM waveform data**: 8-bit signed Amiga PCM audio (0x81/0x7F = square waves visible)

The instrument names are AmigaOS device paths (internal dev filenames), not
human-readable names. They can be extracted but are not useful for display.

---

## Subsong Support

Some `.hip` files contain **COSO+TFMX pairs** for multiple subsongs. The UADE eagleplayer
scans the entire file for `COSO`+`TFMX` pairs to count subsongs.

- 62/63 reference files: single TFMX block (single-song files)
- 1/63 (`astaroth.hip`): 3 COSO+TFMX pairs (3 subsongs)

---

## File Sizes

| Range | Type | Example |
|-------|------|---------|
| 7–8 KB | Macro-only (no PCM) | dragonflight unicorn.hip (7,818 B) |
| 8–20 KB | PCM-sampler (TFMX macros + embedded PCM) | comic bakery.hip (8,724 B) |
| 20–40 KB | Large PCM files | warp (ingame 1).hip (21,366 B) |

---

## Synthesis Architecture

The TFMX-ST synthesis engine:
1. **Macro tables**: Small code-like structures that run per-tick to control Paula hardware
2. **Paula DMA**: Macros set up Amiga custom chip registers for PCM playback
3. **PCM waveforms**: 8-bit signed audio, stored after the TFMX block
4. **Frequency control**: Period register (Amiga formula: 3,546,895 / period = Hz)

This is a **TFMX-ST macro-synth** architecture — the synthesis requires running the
TFMX macro engine, which is a specialized interpreter for Amiga hardware register sequences.

---

## UADE Player Analysis

`Reference Code/uade-3.05/amigasrc/players/hippel/hip.asm` (3.2 KB shim):

Three detection paths:
1. **checktype1**: Standard `.hip` dispatch table (`6002 600e 48E7FFFE`)
2. **checktype2**: HippelCoSo (COSO magic inside — handled by separate HippelCoSo player)
3. **checktype3**: TFMX-wrapped (`41FA` + `TFMX` magic)

The `checksubs()` function scans the whole file for TFMX/COSO tags to count subsongs.

The `patchmod()` function patches the embedded replayer to enable song-end detection.

---

## Why Deferred

A native WASM implementation requires:

1. **TFMX-ST macro engine**: The TFMX macros are interpreted per-tick to update
   Paula DMA registers. A native implementation needs a complete TFMX-ST interpreter.
   The TFMX-ST format uses 12-byte macros (vs 28-byte for TFMX-7V); different from
   the TFMX Professional format (already implemented) which has 10-byte `TFMX-SONG ` magic.

2. **Paula DMA model**: Macros set up `$DFF0xx` registers for audio DMA. These need
   emulation for correct pitch/loop behavior.

UADE handles this correctly via the 68k replayer embedded in each `.hip` file.

---

## What IS Extractable Statically

### ✅ Format detection
Bytes 0-7: `60 02 60 xx 48 E7 FF FE` pattern is unique and reliable.

### ✅ TFMX block location
Scan for `TFMX\0` sequence after offset 0x200. First occurrence = main TFMX block.

### ✅ Subsong count
Count COSO+TFMX pairs in the file (usually 1, sometimes 3).

### ✅ Approximate sample count
From TFMX header word w5: `num_samples = w5 + 1`.

### ✅ Instrument source names
AmigaOS device paths stored after TFMX block (e.g., `D20-1:RECT_D_0.MAT`).
Not human-readable, but unique and could be used as internal IDs.

### ❌ Human-readable instrument names
Not stored anywhere. The TFMX macro system has no text labels.

### ❌ Per-instrument parameters
Embedded in TFMX macro bytecode; not extractable without TFMX macro interpreter.

---

## Existing DEViLBOX Support

| Format variant | Parser | Status |
|----------------|--------|--------|
| `.hip` (base) | None | Falls through to UADE catch-all |
| `.hipc` (CoSo) | `HippelCoSoParser.ts` | **FULLY NATIVE** (HippelCoSoSynth) |
| `.hip7`/`.s7g` (7V) | `JochenHippel7VParser.ts` | Detection-only |
| `.sog`/`.mcmd` (ST) | `JochenHippelSTParser.ts` | Detection-only |

A new `JochenHippelParser.ts` could be added for the base `.hip` format with
detection-only behavior (same pattern as JochenHippelSTParser), but since UADE
already handles it and no new synthesis capability is added, this has low priority.

---

## Future Implementation Path

For eventual native synthesis:

1. **Reuse TFMX-ST engine**: The JochenHippelST format and `.hip` format share the same
   embedded TFMX-ST data. A WASM TFMX-ST engine could serve both.

2. **PCM extraction**: The PCM waveforms are accessible after the TFMX block (after
   the name table). With the TFMX header's sample count (w5+1), the PCM data can be
   sliced into per-instrument buffers. These could then use the existing Sampler engine.

3. **Macro interpreter (advanced)**: Full macro synthesis would require implementing the
   TFMX-ST macro interpreter in C (WASM). The `hipccode.asm` file in
   `Reference Code/uade-3.05/amigasrc/players/hippel-coso/` is the closest available
   reference for the macro engine architecture.

---

## Reference Files

| File | Size | Notes |
|------|------|-------|
| `comic bakery.hip` | 8,724 B | Single TFMX block (1 song) |
| `dragonflight unicorn.hip` | 7,818 B | Smallest file — macro-only? |
| `astaroth.hip` | varies | 3 COSO+TFMX pairs (3 subsongs) |
| `warp (ingame 1).hip` | 21,366 B | Large PCM file |
| `wings of death (title).hip` | varies | Typical Wings of Death soundtrack |

UADE source: `Reference Code/uade-3.05/amigasrc/players/hippel/`
- `hip.asm` — UADE eagleplayer shim (dispatch + detection)
- `hip` — compiled eagleplayer binary (3.2 KB)

---

## Related Formats

- **HippelCoSo** (`.hipc`) — CoSo macro-synth variant, FULLY NATIVE in DEViLBOX
- **TFMX Professional** (`mdat.*`, `tfmx.*`) — the full TFMX format, FULLY NATIVE
- **JochenHippel-ST** (`.sog`) — unwrapped TFMX-ST, detection-only parser
- **ManiacsOfNoise** (`.mon`) — similar architecture (compiled 68k + macro-synth), DEFERRED
