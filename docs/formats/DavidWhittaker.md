# David Whittaker

**Status:** FULLY_NATIVE — custom DavidWhittakerSynth WASM engine
**Parser:** `src/lib/import/formats/DavidWhittakerParser.ts`
**Extensions:** `dw.*`, `dwold.*`, UADE eagleplayer
**Reference files:** `Reference Music/David Whittaker/` (122 files)
**Replayer reference:** FlodJS DWPlayer.js by Christian Corti (Neoart Costa Rica)

---

## Overview

David Whittaker's Amiga music system is a composer-specific format where each
module is a **relocatable 68000 machine code stub** embedding the replay routine
and song data. The player uses software-synthesised instruments with volume and
frequency sequences (volseq/frqseq) — no PCM samples.

Because the file is 68k machine code, there is no fixed binary layout to read.
The parser uses heuristic scanning (the `lea x,a3` opcode pattern) to locate the
data base, then extracts instrument parameters from the player stub.

**Primary reference:** FlodJS `DWPlayer.js` by Christian Corti, Neoart Costa Rica (2012)

---

## Detection

David Whittaker files are detected by scanning for the `0x47FA` (`lea x,a3`) opcode
within the first 2048 bytes:

```
Scan up to 2048 bytes of the file
For each aligned 2-byte position:
  if word == 0x47FA → DW-family player confirmed
  extract the 16-bit PC-relative offset that follows
  this offset + 2 + current_position = data base address
```

The `lea x,a3` instruction anchors the player's data base. All internal pointers
are computed relative to this anchor.

---

## Binary Structure (reconstructed from heuristic scan)

David Whittaker modules are relocatable code, so offsets vary per file. The key
data structures relative to the `a3` base:

### Instrument Headers

Each instrument has:
- **Volume sequence pointer** (uint32 Amiga address) — sequence of volume values
- **Frequency sequence pointer** (uint32 Amiga address) — sequence of pitch offsets
- **Tuning** — base note adjustment
- **Volume** — default volume (0–64)
- Other parameters (ADSR-like, vibrato, etc.)

### Volume Sequences (volseq)

Signed 8-bit sequences. Special sentinel values signal end-of-sequence or loop.
The player steps through the sequence each tick, updating the channel volume.

### Frequency Sequences (frqseq)

Signed 8-bit pitch-offset sequences. Applied each tick to the base note period.
Enables arpeggios, slides, and complex timbral effects.

---

## Synthesis

David Whittaker instruments are pure software synthesis:
- No PCM samples; waveforms are generated from simple waveform tables
- Volseq drives the ADSR envelope and tremolo effects
- Frqseq drives pitch modulation and vibrato

This makes the format a **FULLY_NATIVE** synthesis target: no samples to extract,
no UADE fallback needed once the WASM synth is running.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/DavidWhittakerParser.ts`
- **FlodJS reference:** `Reference Code/flodjs/` DWPlayer.js (Christian Corti)
- **UADE player:** `Reference Code/uade-3.05/players/DavidWhittaker`

---

## Implementation Notes

**Current status:** FULLY_NATIVE — `DavidWhittakerSynth` WASM engine handles synthesis.

**Heuristic extraction:** Because the file is relocatable 68k code, full parsing
requires 68000 disassembly. The parser uses the `lea x,a3` anchor to locate the
data section and extracts instrument headers using the `DWPlayer.js` scan logic.
If extraction fails or the format is ambiguous, a single default `DavidWhittakerSynth`
instrument is returned.

**`DavidWhittakerConfig` (in `src/types/instrument.ts`):**
Contains volseq data, frqseq data, tuning, and volume extracted from the player stub.
The WASM engine replays these sequences in real time.

**Variants:**
- `dw.*` — Standard David Whittaker format
- `dwold.*` — Older variant with slightly different player code; same heuristic detection
