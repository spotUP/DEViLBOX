---
date: 2026-02-26
topic: uade-format-synths
tags: [uade, amiga, synth, wasm, architecture]
status: draft
---

# UADE Format-Specific Synth Architecture — Living Masterplan

## Context & Problem

**Current state (the "ugly hack"):**
UADE import stores the entire raw file in `UADEConfig.fileData` and plays it as one opaque audio stream. The "instruments" visible in the instrument list are either muted Samplers (display-only) or a single `UADESynth` that plays the whole song. Users cannot edit, export, or interact with individual instruments. The import is playback-only, not editable.

**Goal:**
Every UADE format import should produce a `TrackerSong` where:
- Each instrument slot is populated with a real, format-specific synth config
- The instrument editor shows that format's actual parameters (waveform, ADSR, arpeggio, etc.)
- Notes can be triggered individually per instrument (not just whole-song playback)
- The format-specific synth is 1:1 with the original hardware/software parameters
- Users can edit, transpose, re-sequence, and re-export instrument by instrument

---

## The Furnace Pattern — Architecture Blueprint

Applied to UADE format families:

```
Format DSP Source → thin WASM wrapper → TypeScript engine → TypeScript synth class
       ↓                                       ↓                      ↓
 hvl_replay.c  →   Hively.wasm      →   HivelyEngine    →   HivelySynth    ← DONE ✅
 soundmon.c    →   SoundMon.wasm    →   SoundMonEngine  →   SoundMonSynth  ← Phase 2
 tfmx_player.c →   TFMX.wasm       →   TFMXEngine      →   TFMXSynth      ← Phase 4
 fc_player.c   →   FC.wasm         →   FCEngine        →   FCSynth        ← Phase 3
```

**The WASM wrapper C API pattern** — see `soundmon-wasm/include/format_synth_api.h`:
```c
void* format_init(int sampleRate);
int   format_load_instrument(void* ctx, const uint8_t* data, int len);
void  format_note_on(void* ctx, int note, int velocity);
void  format_note_off(void* ctx);
int   format_render(void* ctx, float* outL, float* outR, int numSamples);
void  format_set_param(void* ctx, int paramId, float value);
void  format_dispose(void* ctx);
```

---

## Format Family Catalog

### Group 1: AHX / HivelyTracker — ✅ COMPLETE

**Formats:** `.ahx`, `.hvl`, `.thx`
**Source:** `Reference Code/hivelytracker-master/replayer/hvl_replay.c`
**WASM:** `public/hively/Hively.wasm` ✅
**Engine:** `src/engine/hively/HivelyEngine.ts` ✅
**Synth:** `src/engine/hively/HivelySynth.ts` ✅ (reference implementation)
**Parser:** `src/lib/import/formats/HivelyParser.ts` ✅
**Type:** `HivelyConfig` in `src/types/instrument.ts`

---

### Group 2: SoundMon II / Brian Postma — Phase 1

**Formats:** `.bp`, `.bp3`, `.sndmon`
**Parser:** `src/lib/import/formats/SoundMonParser.ts`
**Target Type:** `SoundMonConfig`
**Target Synth:** `SoundMonSynth`
**WASM Target:** `public/soundmon/SoundMon.wasm`
**Status:** Phase 1 — implementation pending

**Instrument Types:**
1. Synth: wavetable oscillator + macro-driven ADSR + arpeggio + vibrato
2. PCM: raw 8-bit signed + loop + finetune

---

### Group 3: SidMon II — Phase 2

**Formats:** `.sid`, `.sid2`, `.smn`
**Parser:** `src/lib/import/formats/SidMon2Parser.ts`
**Target Type:** `SidMonConfig`
**Target Synth:** `SidMonSynth`
**Status:** Phase 2 — type defined, implementation pending

---

### Group 4: Digital Mugician — Phase 2

**Formats:** `.dmu`, `.dmu2`, `.mug`, `.mug2`
**Parser:** `src/lib/import/formats/DigitalMugicianParser.ts`
**Target Type:** `DigMugConfig`
**Target Synth:** `DigMugSynth`
**Status:** Phase 2 — type defined, implementation pending

---

### Group 5: Future Composer (FC13/FC14) — Phase 3

**Formats:** `.fc`, `.fc13`, `.fc14`, `.smod`, `.bsi`
**Parser:** `src/lib/import/formats/FCParser.ts`
**Target Type:** `FCConfig`
**Target Synth:** `FCSynth`
**Status:** Phase 3 — type defined, implementation pending

---

### Group 6: Fred Editor — Phase 5

**Formats:** `.fred`
**Parser:** `src/lib/import/formats/FredEditorParser.ts`
**Target Type:** `FredConfig`
**Target Synth:** `FredSynth`
**Status:** Phase 5 — type defined, implementation pending

---

### Group 7: TFMX — Jochen Hippel — Phase 4

**Formats:** `.tfmx`, `.mdat`, `.tfmx1.5`, `.tfmx7v`, `.tfmxpro`, `.tfhd1.5`
**Parser:** `src/lib/import/formats/TFMXParser.ts`
**Target Type:** `TFMXConfig`
**Target Synth:** `TFMXSynth`
**Key asset:** `Reference Code/libtfmxaudiodecoder-main/` — complete standalone C++ TFMX decoder
**Status:** Phase 4 — type defined, implementation pending

---

### Group 8: PCM Format Name/Metadata Enhancement — Phase 6

**Formats:** 100+ UADE formats (Richard Joseph, Dave Lowe, Mark Cooksey, Delta Music, etc.)
**Strategy:** Better loop point detection, instrument naming, period accuracy
**Status:** Phase 6 — enhancement pending

---

### Group 9: OctaMED Synth Instruments — Phase 2

**Formats:** `.med`, `.mmd0`, `.mmd1`, `.mmd2`, `.mmd3`, `.octamed`
**Parser:** `src/lib/import/formats/MEDParser.ts`
**Target Type:** `OctaMEDConfig`
**Gap:** Synth instruments (10 built-in waveforms + ADSR table) currently skipped
**Status:** Phase 2 — enhancement pending

---

## Implementation Phases

### Phase 0 — Architecture & Living Document ✅ IN PROGRESS

- [x] Write `docs/uade-masterplan.md`
- [ ] Define `SoundMonConfig`, `SidMonConfig`, `DigMugConfig`, `FCConfig`, `FredConfig`, `TFMXConfig` in `src/types/instrument.ts`
- [ ] Add synthType values: `'SoundMonSynth'`, `'SidMonSynth'`, `'DigMugSynth'`, `'FCSynth'`, `'FredSynth'`, `'TFMXSynth'`
- [ ] Design C API header `soundmon-wasm/include/format_synth_api.h`
- [ ] `npx tsc --noEmit` — zero errors

### Phase 1 — SoundMon Pilot (Reference Implementation)

- [ ] **WASM module:** `soundmon-wasm/src/soundmon_synth.c` — wavetable + ADSR + LFO + arpeggio
- [ ] **Engine:** `src/engine/soundmon/SoundMonEngine.ts`
- [ ] **Worklet:** `public/soundmon/SoundMon.worklet.js`
- [ ] **Synth:** `src/engine/soundmon/SoundMonSynth.ts`
- [ ] **Parser:** Update `SoundMonParser.ts` to emit `SoundMonConfig` (not Sampler)
- [ ] **ToneEngine:** Register `SoundMonSynth`
- [ ] **InstrumentFactory:** Handle `synthType === 'SoundMonSynth'`
- [ ] `npx tsc --noEmit` — zero errors

### Phase 2 — Wavetable Format Suite

- [ ] SidMon II: WASM + engine + worklet + synth + parser update
- [ ] Digital Mugician: WASM + engine + worklet + synth + parser update
- [ ] OctaMED synth instruments: parser update + OctaMEDSynth
- [ ] Register all in ToneEngine + InstrumentFactory

### Phase 3 — FC Synthesis Engine

- [ ] Extract FC waveform ROM (47 built-in waveforms)
- [ ] `fc-wasm/src/fc_synth.c` — 47 waveforms + synth macro sequencer + ADSR + vibrato + arpeggio
- [ ] Build FC.wasm, create engine/worklet/synth TypeScript
- [ ] Update `FCParser.ts` to emit `FCConfig`
- [ ] Register in ToneEngine + InstrumentFactory

### Phase 4 — TFMX Synthesis Engine

- [ ] Study `Reference Code/libtfmxaudiodecoder-main/` API surface
- [ ] Write thin C wrapper: `tfmx-wasm/src/tfmx_wrapper.cpp`
- [ ] Build `TFMX.wasm`, create `TFMXEngine.ts`, `TFMX.worklet.js`, `TFMXSynth.ts`
- [ ] Update `TFMXParser.ts` to emit `TFMXConfig` per instrument
- [ ] Register in ToneEngine + InstrumentFactory

### Phase 5 — Fred Editor Synthesis Engine

- [ ] Study Fred format from `FredEditorParser.ts` + UADE eagleplayer source
- [ ] `fred-wasm/src/fred_synth.c` — waveform + per-tick macro sequencer
- [ ] Build Fred.wasm, create engine/worklet/synth
- [ ] Update `FredEditorParser.ts` to emit `FredConfig`
- [ ] Register in ToneEngine + InstrumentFactory

### Phase 6 — PCM Format Name/Metadata Enhancement

- [ ] Add format-specific header parsers in `UADEParser.ts` for major PCM formats
- [ ] Populate `instrumentNames` from format headers
- [ ] `buildEnhancedSong()` uses names to label Sampler instruments

### Phase 7 — Instrument Editor UI

- [ ] `SoundMonHardware.tsx` — wavetable + ADSR controls
- [ ] `SidMonHardware.tsx`, `DigMugHardware.tsx`, `FCHardware.tsx`, `FredHardware.tsx`, `TFMXHardware.tsx`
- [ ] Register in instrument editor routing alongside `HivelySynth` UI
- [ ] Live parameter updates: knob change → Synth.set(paramId, value) → WASM

---

## Critical Files

| File | Role |
|------|------|
| `src/types/instrument.ts` | All new config types + synthType values |
| `src/engine/ToneEngine.ts` | Register new synth types in instrument factory |
| `src/engine/InstrumentFactory.ts` | Instantiate new synths |
| `src/lib/import/formats/SoundMonParser.ts` | Emit SoundMonConfig (not Sampler) |
| `src/lib/import/formats/SidMon2Parser.ts` | Emit SidMonConfig |
| `src/lib/import/formats/DigitalMugicianParser.ts` | Emit DigMugConfig |
| `src/lib/import/formats/FCParser.ts` | Emit FCConfig |
| `src/lib/import/formats/FredEditorParser.ts` | Emit FredConfig |
| `src/lib/import/formats/TFMXParser.ts` | Emit TFMXConfig |
| `src/engine/hively/HivelySynth.ts` | **REFERENCE** — copy pattern for all new synths |
| `public/hively/Hively.worklet.js` | **REFERENCE** — copy ring buffer + player pattern |
| `Reference Code/libtfmxaudiodecoder-main/` | TFMX C++ source for WASM compilation |
| `soundmon-wasm/include/format_synth_api.h` | C API contract for all WASM wrappers |

---

## Verification Checklist (after each phase)

- [ ] `npx tsc --noEmit` — zero errors
- [ ] Load a `.bp` (SoundMon) → instrument list shows SoundMon params → play note → synthesized sound
- [ ] Load a `.hvl` (AHX) → still works (regression check)
- [ ] Load a `.tfmx` → instruments show TFMX macro parameters → play note
- [ ] Load a standard UADE exotic format (e.g. `.rj`) → PCM fallback works
- [ ] Save a SoundMon import as `.dbx` → reload → synth instruments retain parameters
- [ ] Edit a SoundMon instrument parameter → playback changes immediately
