# SidMon 1.0

**Status:** FULLY_NATIVE — custom SidMon1Synth WASM engine
**Parser:** `src/lib/import/formats/SidMon1Parser.ts`
**Extensions:** `sid1.*`, `smn.*`, UADE eagleplayer
**UADE name:** SidMon 1
**Reference files:** `Reference Music/SidMon 1/` (59 files)
**Replayer reference:** FlodJS S1Player.js by Christian Corti (Neoart Costa Rica)

---

## Overview

SidMon 1.0 is an Amiga software-synthesis tracker by R.v.Vliet (1988). Like SidMon 2.0,
it uses software-synthesised instruments with waveforms, arpeggios, and ADSR envelopes —
no PCM samples. The format is a compiled relocatable binary with an embedded player
routine identified by a 32-byte signature string.

**Related format:** SidMon 2.0 (see `SidMon2.md`) — later version with additional
features including sample negation, MIDI support, and extended waveform lists.

---

## Detection

SidMon 1.0 files are detected by scanning for two markers:

```
1. The 0x41FA opcode (lea x,a2 or similar PC-relative instruction)
2. Immediately followed by the 32-byte string:
   " SID-MON BY R.v.VLIET  (c) 1988 "
```

Both markers must be present. The binary is a relocatable 68000 code stub.

---

## Binary Structure

As a relocatable binary, SidMon 1.0 has no fixed chunk offsets. The S1Player.js
`loader()` function scans relative to the identified base address to find:

### Instrument Records

Each instrument contains:
- **Waveform** (uint32 pointer) — 32-byte waveform data
- **Arpeggio table** (16 entries) — semitone sequence for chords/arpeggios
- **ADSR fields** — attack/decay/sustain/release parameters
- **Phase shift** — waveform phase offset
- Additional modulation parameters

### Waveforms

32-byte signed 8-bit waveform data stored in "mixer memory" at a fixed offset
from the identified base address. Each instrument references one waveform by index.

### Period Table

SidMon 1.0 uses a 67-entry period table (0 + 66 entries) covering ~5.5 octaves:

```
5760, 5424, 5120, 4832, 4560, 4304, 4064, 3840, 3616, 3424, 3232, 3048,
2880, 2712, 2560, 2416, 2280, 2152, 2032, 1920, 1808, 1712, 1616, 1524,
1440, 1356, 1280, 1208, 1140, 1076, 1016,  960,  904,  856,  808,  762,
...  down to 127
```

Entry 0 is reserved (0 = rest). Note 34 = period 856 = ProTracker C-1.

---

## Synthesis

SidMon 1.0 instruments are pure software synthesis:
- 32-byte waveforms cycled at the note frequency (no PCM samples)
- Arpeggio tables provide multi-note chord sequences
- ADSR drives the volume envelope
- Phase shifting creates timbral variation
- No sample negation (added in SidMon 2.0)

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/SidMon1Parser.ts`
- **FlodJS reference:** S1Player.js (Christian Corti)
- **UADE player:** `Reference Code/uade-3.05/players/SidMon 1`
- **Related:** `docs/formats/SidMon2.md` (later version)

---

## Implementation Notes

**Current status:** FULLY_NATIVE — `SidMon1Synth` WASM engine handles synthesis.

`SidMon1Config` in `src/types/instrument.ts` contains the extracted waveform,
arpeggio, and ADSR parameters.

The `SidMon1Synth` and `SidMon2Synth` use related but separate WASM builds:
SidMon 1.0 lacks the sample-negation and extended waveform list features of v2.0.

**Identification note:** The `.sid1` and `.smn` prefixes are UADE eagleplayer
conventions; files are identified by the embedded signature string, not by
file extension alone.
