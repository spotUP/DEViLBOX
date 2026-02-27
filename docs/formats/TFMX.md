# TFMX (The Final Music eXpander)

**Status:** FULLY_NATIVE — custom TFMXSynth WASM engine
**Parser:** `src/lib/import/formats/TFMXParser.ts`
**Extensions:** `mdat.*`, `tfmx.*`, `tfhd.*`, UADE eagleplayer
**UADE name:** TFMX Professional
**Reference files:** `Reference Music/TFMX/` (738 files)
**Reference source:** Jonathan H. Pickard, "TFMX Professional 2.0 Song File Format" (1993–1998)

---

## Overview

TFMX (The Final Music eXpander) was created by Jochen Hippel for the Amiga.
TFMX Professional is the flagship variant — a sophisticated macro-driven synthesis
system where "macros" are small interpreted programs that run each tick to control
Paula DMA registers, enabling complex FM-like sound effects from PCM samples.

**Format variants:**
- `"TFMX-SONG "` — TFMX Professional (most common; `mdat.*` prefix)
- `"TFMX_SONG"` — Underscore separator variant
- `"tfmxsong"` — Lowercase variant
- `"TFMX "` (old) — TFMX 1.5 / early format (4 bytes + space)
- `"TFHD"` — Single-file TFHD wrapper (combines `mdat` + `smpl` in one file)

All variants are handled by a single WASM engine (`TFMXSynth`).

**Related:** TFMX also appears embedded in Jochen Hippel `.hip` files — see `JochenHippel.md`.

---

## File Layout

TFMX Professional typically ships as two files: `mdat.*` (song data) and `smpl.*`
(PCM sample data). DEViLBOX loads both when present.

```
Offset  Size  Description
------  ----  -----------
0x000   10    Magic: "TFMX-SONG " (note trailing space)
0x00A   2     Reserved word
0x00C   4     Reserved long
0x010   240   Text area (40 × 6 lines, null-padded ASCII)
0x100   64    Song start positions (32 × uint16BE)
0x140   64    Song end positions (32 × uint16BE)
0x180   64    Song tempo values (32 × uint16BE)
0x1C0   16    Padding / reserved
0x1D0   12    Packed-module offsets (3 × uint32BE):
                [0] trackstep ptr  (0 → use fixed 0x600)
                [1] pattern ptr    (0 → use fixed 0x200... wait, pattern at 0x200?)
                [2] macro ptr      (0 → use fixed 0x400)
0x1DC   ...   Remaining header space
0x200   ...   (fixed) Pattern data
0x400   ...   (fixed) Macro data
0x600   ...   (fixed) Trackstep data
  ...   ...   Sample data (in .smpl file or after trackstep data)
```

**Fixed offsets for unpacked modules:** When the offset array at 0x1D0 is zero,
the player uses:
- Trackstep data at `0x600`
- Pattern data at `0x200`
- Macro data at `0x400`

---

## Song Data (32 subsong slots)

```
Song start table (at 0x100): 32 × uint16BE starting trackstep index
Song end table (at 0x140):   32 × uint16BE ending trackstep index
Song tempo table (at 0x180): 32 × uint16BE tempo/speed values
```

Unused subsong slots are marked with 0xFFFF or 0.

---

## Trackstep Data

Each trackstep entry is 16 bytes:
```
8 voices × 2 bytes per voice:
  high byte: pattern command (0xFF = end-all, 0x80 = hold-previous)
  low byte:  transpose
```

Trackstep is the highest-level song sequencer. The player advances one trackstep
per tempo period, triggering patterns on each voice.

---

## Pattern Data

Variable-length event streams. Each pattern runs on one voice until complete.
Pattern events reference macro numbers (the macro system handles PCM playback
and all hardware register updates).

---

## Macro Data

Macros are the core of TFMX synthesis. Each macro is a small interpreted program
(variable length, terminated by a `STOP` opcode) that:
- Sets up Paula DMA registers (`$DFF0A0`–`$DFF0D0`)
- Controls pitch (period register), volume, and loop points
- Chains to other macros for complex multi-stage sounds

TFMX macros enable FM-like timbre evolution, echo effects, and dynamic sample
manipulation without any additional hardware.

---

## Text Area

The 240-byte text area at offset 0x010 contains 6 lines × 40 characters. Typically
includes the song title, composer name, and copyright information.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/TFMXParser.ts`
- **Format spec:** Jonathan H. Pickard, "TFMX Professional 2.0 Song File Format"
- **NostalgicPlayer:** `Reference Code/NostalgicPlayer/Source/Agents/Players/Tfmx/`
- **libxmp docs:** `Reference Code/libxmp/docs/formats/tfmx-format.txt`
- **UADE player:** `Reference Code/uade-3.05/players/TFMX-Pro`

---

## Implementation Notes

**Current status:** FULLY_NATIVE — `TFMXSynth` WASM engine handles synthesis.

At the parser level, TFMX song patterns are converted to empty TrackerCells (no
instrument parameters are extractable without running the macro engine). The WASM
synth receives the full file buffer and handles all macro interpretation and PCM
playback internally.

**Instrument metadata:** TFMX has no text instrument names. Instrument slots are
identified by macro number only.

**TFHD variant:** `"TFHD"` files bundle the `mdat` and `smpl` data in a single
file with an internal offset table, eliminating the need for separate `.smpl` files.
