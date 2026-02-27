# Rob Hubbard

**Status:** FULLY_NATIVE — custom RobHubbardSynth WASM engine
**Parser:** `src/lib/import/formats/RobHubbardParser.ts`
**Extensions:** `rh.*`, UADE eagleplayer
**UADE name:** RobHubbard
**Reference files:** (files ripped from Amiga games; no dedicated ref directory)
**Replayer references:**
  `Reference Code/uade-3.05/amigasrc/players/wanted_team/RobHubbard/src/Rob Hubbard_v7.asm`
  `Reference Code/uade-3.05/amigasrc/players/wanted_team/RobHubbard/src/Rob Hubbard.s`

---

## Overview

Rob Hubbard composed music for many classic Amiga and C64 games. His Amiga music
player is a compiled 68k executable combining player code and music data in a single
file. Unlike pure PCM-based formats, Rob Hubbard's player implements a **soft synth
layer** — per-instrument vibrato and wobble tables modify the Paula DMA period
register dynamically, enabling FM-like timbral variation from simple PCM samples.

DEViLBOX implements **FULLY_NATIVE** synthesis via `RobHubbardSynth`, extracting
samples and their modulation parameters directly from the binary.

---

## Detection

Based on UADE `Rob Hubbard_v7.asm` `DTP_Check2` — seven fixed-offset checks:

```
word  at offset  0 == 0x6000  (BRA — unconditional branch)
word  at offset  4 == 0x6000
word  at offset  8 == 0x6000
word  at offset 12 == 0x6000
word  at offset 16 == 0x6000
word  at offset 20 == 0x41FA  (LEA d16(PC), An)
u32BE at offset 28 == 0x4E7541FA  (RTS followed by LEA pc-relative)
```

Five consecutive BRA instructions (the player's dispatch table) followed by a
specific LEA instruction and RTS+LEA sequence at offsets 20 and 28 form the
reliable fingerprint. File must be at least 32 bytes.

---

## Sample Table Extraction

The parser locates the embedded sample table by scanning for 68k instruction signatures
(mirroring the UADE EagleRipper logic):

**Step 1 — Find sample count:**
```
Scan from offset 64 for word 0x2418 (MOVE.B (A0)+, D4).
When found at offset F:
  sample count = byte at F-1
```

**Step 2 — Find sample table start:**
```
Scan from offset 54 for word 0x41FA (LEA d16(PC), An).
When found at offset F:
  displacement d16 = sign_extend(word at F+2)
  if word at F+4 == 0xD1FC (ADD.L #imm, A0): apply 0x40-byte variant skip
  sample table start = (F+2 [+0x40]) + d16
```
This is standard 68k PC-relative address computation. The optional `ADD.L` variant
accounts for an alternate initialization path in some module versions.

**Step 3 — Parse sample blobs:**
```
Each blob:
  u32BE  pcmLen       (PCM data length in bytes; max 0x10000)
  2 bytes header      (volume + modulation parameters)
  pcmLen bytes        signed 8-bit PCM data (raw, Amiga format)

End marker: word 0x4E71 (NOP)
```

---

## Instrument Parameters (`RobHubbardConfig`)

Each instrument carries:

| Field | Type | Description |
|-------|------|-------------|
| `sampleLen` | uint | PCM data length in bytes |
| `loopOffset` | int | Loop start offset from sample start; `<0` = no loop |
| `sampleVolume` | uint | Amiga volume 0–64 |
| `relative` | int | `3579545 / freqHz` — period scaling factor |
| `divider` | int | Vibrato depth divisor; `0` = no vibrato |
| `vibratoIdx` | int | Starting index within vibrato table |
| `hiPos` | int | Wobble upper bound; `0` = no wobble |
| `loPos` | int | Wobble lower bound |
| `vibTable` | int8[] | Per-instrument vibrato waveform table |
| `sampleData` | int8[] | PCM data (signed 8-bit) |

---

## Synthesis

Rob Hubbard instruments combine:
- **PCM playback:** Raw signed 8-bit sample data played via Paula DMA
- **Vibrato:** Per-instrument waveform table modulates the period register each tick;
  `divider` controls depth, `vibratoIdx` sets the starting phase
- **Wobble:** Oscillates the period between `loPos` and `hiPos` bounds — a distinctive
  effect producing the "wah" timbre characteristic of Rob Hubbard's Amiga compositions
- **Volume:** Fixed per-instrument Amiga volume (0–64)

The vibrato + wobble layer is what distinguishes this from a plain PCM sampler;
it enables complex pitch-modulated timbres from otherwise simple waveforms.

---

## UADE Configuration

```
eagleplayer.conf:
  RobHubbard  prefixes=rh
MI_MaxSamples = 13
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/RobHubbardParser.ts`
- **Instrument config:** `RobHubbardConfig` in `src/types/instrument.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/RobHubbard/`
- **Related parsers:** `JeroenTelParser.ts`, `JasonPageParser.ts`

---

## Implementation Notes

**Current status:** FULLY_NATIVE — `RobHubbardSynth` handles synthesis.

The parser extracts up to 13 sample instruments (`MI_MaxSamples`) from the binary,
along with their vibrato tables and wobble parameters. The `RobHubbardSynth` WASM
engine performs period-register-level modulation to reproduce the Rob Hubbard
characteristic sound from the extracted PCM data.

**Rob Hubbard ST:** A separate Atari ST variant (`RobHubbardSTParser.ts`) handles
the ST port of the player. See `RobHubbardST.md` if documented.
