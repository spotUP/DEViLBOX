# Hippel CoSo (Jochen Hippel Cosmetic Synthesizer)

**Status:** FULLY_NATIVE — custom HippelCoSoSynth WASM engine
**Parser:** `src/lib/import/formats/HippelCoSoParser.ts`
**Extensions:** `coso.*`, UADE eagleplayer
**UADE names:** Hippel-COSO, Hippel-ST-COSO
**Reference files:** `Reference Music/Hippel COSO/` (93 files), `Reference Music/Hippel ST COSO/` (98 files)
**Replayer reference:** FlodJS JHPlayer.js by Christian Corti (Neoart Costa Rica)

---

## Overview

Hippel CoSo (short for "Cosmetic Synthesizer") is a software-synthesis music format
by Jochen Hippel for the Amiga. Like David Whittaker's format, it uses pure soft
synth — no PCM samples. Instruments are built from volume sequences (volseq) and
frequency sequences (frqseq) with vibrato parameters.

Unlike the compiled-binary formats (DavidWhittaker, JeroenTel), CoSo modules use a
**structured binary layout** with a `"COSO"` magic identifier and a 8-offset header,
making them parseable without 68k disassembly.

**Primary reference:** FlodJS `JHPlayer.js` by Christian Corti, Neoart Costa Rica (2012)

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0x00    4     Magic: "COSO"
0x04    4     frqseqs offset (uint32BE, from file start)
0x08    4     volseqs offset (uint32BE)
0x0C    4     patterns offset (uint32BE)
0x10    4     tracks offset (uint32BE)
0x14    4     songsData offset (uint32BE)
0x18    4     headers offset (uint32BE)
0x1C    4     samplesData offset (uint32BE)
```

Total header size: 32 bytes (8 × uint32BE offsets, after 4-byte magic).

---

## Data Structures

### Volume Sequences (at volseqs offset)

The volseqs block starts with a table of uint16 pointers (one per sequence), each
pointing to a volseq header within the same block.

**Per volseq header:**
```
Offset  Size  Description
------  ----  -----------
0x00    1     volSpeed (uint8) — speed multiplier for the sequence
0x01    1     frqseq index (signed int8) — which frqseq this instrument uses
0x02    1     vibSpeed (signed int8) — vibrato speed
0x03    1     vibDepth (signed int8) — vibrato depth (0 = off)
0x04    1     vibDelay (uint8) — frames before vibrato starts
0x05    ...   vseq data (signed int8 values until sentinel)
```

The `vseq` data drives the volume envelope. Negative special codes signal
loop/end markers. Each step advances by 1 each `volSpeed` frames.

### Frequency Sequences (at frqseqs offset)

Table of uint16 pointers, each pointing to a frqseq (signed int8 sequence).

Special codes in frqseq data:
- `-32` — End/loop back to beginning
- `-31` — Stop (hold at current pitch)
- `-24` — Jump / next-segment marker

Each entry is a signed pitch-offset applied to the base note period.

### Songs Data (at songsData offset)

Each song entry is 6 bytes:

```
Offset  Size  Description
------  ----  -----------
0x00    2     First track index (uint16BE pointer)
0x02    2     Last track index (uint16BE pointer)
0x04    2     Speed (uint16BE) — ticks per row
```

### Tracks (at tracks offset)

Each track row is 12 bytes, covering all 4 voices:

```
4 × 3 bytes per voice (total 12 bytes per track row):
  byte 0: patternIndex
  byte 1: transpose (semitone offset)
  byte 2: volTranspose (volume offset into volseq table)
```

For CoSo variant 4+, the high byte can encode track commands.

### Patterns (at patterns offset)

Table of uint16 pointer pairs; each pair `[patternPtr, nextPtr]` addresses the
pattern event stream.

**Pattern event encoding:**
```
Each event starts with a signed int8 note byte:
  -1  → Advance to next track row (end of this pattern step)
  -2  → Repeat previous note (sustain)
  -3  → Loop marker
  ≥ 0 → Play note; followed by 1 info byte
          info & 0x1F = volseq index (instrument)
```

---

## Synthesis

CoSo is a pure soft-synth format:
- Waveforms are simple shapes (triangle, sawtooth) modulated by frqseq
- Volume envelope from volseq (ADSR-like)
- Vibrato from volseq header params (speed/depth/delay)
- No PCM data; `samplesData` is unused or empty in most modules

---

## Amiga ST (CoSo ST) Variant

The `Hippel ST COSO` variant targets the Atari ST rather than the Amiga. The binary
layout is identical (`"COSO"` magic + 8 offsets). The synthesis engine differs
(Atari ST YM2149 PSG vs. Amiga Paula), but DEViLBOX uses the same `HippelCoSoSynth`
WASM engine for both, extracting the same parameter structures.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/HippelCoSoParser.ts`
- **FlodJS reference:** JHPlayer.js (Christian Corti)
- **UADE players:** `Reference Code/uade-3.05/players/Hippel-COSO`, `Hippel-ST-COSO`

---

## Implementation Notes

**Current status:** FULLY_NATIVE

The `"COSO"` magic and 8-offset header make this format straightforward to parse.
`HippelCoSoParser.ts` reads the entire structure and creates `HippelCoSoConfig`
instrument configs containing volseq and frqseq data for the WASM engine.

**Jochen Hippel also wrote:** TFMX (the most popular format), JochenHippel-7V,
and JochenHippel-ST — all handled by separate parsers. CoSo is the
simpler/earlier pure-synth variant.
