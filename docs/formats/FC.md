# Future Composer 1.3 / 1.4 (FC)

**Status:** FULLY_NATIVE — macro engine simulated at import; FCSynth synthesis
**Parser:** `src/lib/import/formats/FCParser.ts`
**Extensions:** `fc.*, fc13.*, fc14.*, SMOD.*` (prefix-based; no standard extension)
**UADE name:** FutureComposer13, FutureComposer14
**Reference files:** (identified in Amiga game/demo collections)
**Reference:** FlodJS FCPlayer by Christian Corti; `Reference Code/furnace-master/src/engine/fileOps/fc.cpp`

---

## Overview

Future Composer 1.3 and 1.4 are wavetable/macro-based synthesizer formats for the
Amiga. They differ from the ProTracker-based `FutureComposer.md` (FC 1.0–1.4 overview)
in that `FCParser.ts` implements a **native parser with full macro simulation** — the
FC macro engine is ticked step-by-step at import time, converting the macro-driven
instrument data into static TrackerSong events for the `FCSynth` WASM engine.

Two sub-variants:

- **FC 1.3** — magic `"FC13"` (or alternative `"SMOD"`); 47 fixed preset wavetables
- **FC 1.4** — magic `"FC14"`; adds 80 custom wavetable slots for user-defined waveforms

---

## File Layout

### FC 1.3 Header

```
Offset  Size  Description
------  ----  -----------
0x00    4     Magic: "FC13" or "SMOD"
0x04    ...   Instrument/macro table
              47 preset wavetables (built-in, not stored in file)
              Song data, pattern data, sequence data
```

### FC 1.4 Header

```
Offset  Size  Description
------  ----  -----------
0x00    4     Magic: "FC14"
0x04    ...   80 custom wavetable slots (each: waveform data)
              Instrument/macro table
              Song data, pattern data, sequence data
```

---

## Macro Engine

Future Composer instruments are defined as **macro programs** — small command lists that
run concurrently with note playback:

- **Volume envelopes** — per-frame volume ramp commands
- **Waveform switching** — switch between wavetable entries mid-note
- **Vibrato** — period oscillation (depth + speed)
- **Pitch bends** — linear or exponential pitch changes
- **Portamento** — glide between notes

`FCParser.ts` simulates the macro engine tick-by-tick at import time, capturing the
resulting note/volume/pitch state as static `TrackerCell` events. The macro playback
is consumed at parse time; the output `TrackerSong` contains only the expanded events.

---

## Period Table

FC uses the standard Amiga Paula period table. Note conversion:

```
note = (periodIdx & 0x7F) + 13
```

where `periodIdx` indexes into the FC period table (sourced from FlodJS FCPlayer).
Valid period range maps to MIDI notes 13–96+ (approx. C0–C8).

---

## Wavetables

**FC 1.3** — 47 built-in preset wavetables (sine, triangle, square variants, etc.).
These are hardcoded in the player and not stored in the file.

**FC 1.4** — Adds 80 custom wavetable slots. Each slot contains raw 8-bit signed PCM
waveform data defining the oscillator shape for that wavetable index.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/FCParser.ts`
- **FlodJS:** `FCPlayer` by Christian Corti — JavaScript FC replayer (period table, macro logic)
- **Furnace reference:** `Reference Code/furnace-master/src/engine/fileOps/fc.cpp`

---

## Implementation Notes

**Current status:** FULLY_NATIVE

The `FCParser.ts` simulates the full FC macro engine during parsing. The resulting
`TrackerSong` contains statically expanded note/volume/pitch events — no runtime macro
interpretation is needed during playback.

The `FCSynth` WASM engine handles synthesis from the expanded TrackerSong data.

**FC 1.3 vs 1.4 distinction:** Detected by the 4-byte magic (`FC13`/`SMOD` vs `FC14`).
The `SMOD` variant is an alternate header used by some earlier FC 1.3 composers.

**Relation to FutureComposer.md:** `FutureComposer.md` covers the broader FC 1.0–1.4
format family. `FCParser.ts` is the native implementation targeting FC 1.3/1.4 specifically,
while `FutureComposerParser.ts` covers the full range including FC 1.0/1.1/1.2.
