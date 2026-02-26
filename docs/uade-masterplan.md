---
date: 2026-02-26
topic: uade-format-synths
tags: [uade, amiga, synth, wasm, architecture]
status: mostly-complete
---

# UADE Format-Specific Synth Architecture — Living Masterplan

## Status Summary

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Architecture & Types | ✅ Complete |
| 1 | SoundMon pilot | ✅ Complete |
| 2 | SidMon II + Digital Mugician | ✅ Complete |
| 2b | OctaMED synth instruments | ⚠️ Partial — waveform extracted as Sampler; no real-time synthesis |
| 3 | Future Composer (FC13/FC14) | ✅ Complete |
| 4 | TFMX — Jochen Hippel | ✅ Complete |
| 5 | Fred Editor | ✅ Complete |
| 6 | PCM format instrument naming | ⚠️ Partial — SA, SFX, JamCracker, TCB, EMOD, ABK done; binaries not parseable |
| 7 | Instrument editor UI | ✅ Complete |

---

## Context & Problem

**Original problem ("the ugly hack"):**
UADE import stored the entire raw file in `UADEConfig.fileData` and played it as one opaque audio stream. Users couldn't edit, export, or interact with individual instruments. Import was playback-only.

**Goal achieved:**
Every format import produces a `TrackerSong` where each instrument slot has a real, format-specific synth config. The instrument editor shows format-specific parameters. Notes can be triggered individually per instrument.

---

## Architecture Blueprint

```
Format DSP Source → thin WASM wrapper → TypeScript engine → TypeScript synth class
       ↓                                       ↓                      ↓
 hvl_replay.c  →   Hively.wasm      →   HivelyEngine    →   HivelySynth    ✅
 soundmon_synth.c → SoundMon.wasm   →   SoundMonEngine  →   SoundMonSynth  ✅
 sidmon_synth.c →  SidMon.wasm      →   SidMonEngine    →   SidMonSynth    ✅
 digmug_synth.c →  DigMug.wasm      →   DigMugEngine    →   DigMugSynth    ✅
 fc_synth.c    →   FC.wasm          →   FCEngine        →   FCSynth        ✅
 tfmx_synth.cpp →  TFMX.wasm        →   TFMXEngine      →   TFMXSynth      ✅
 fred_synth.c  →   Fred.wasm        →   FredEngine      →   FredSynth      ✅
```

**WASM C API contract:** `soundmon-wasm/include/format_synth_api.h`

---

## Format Family Catalog

### Group 1: AHX / HivelyTracker — ✅ COMPLETE

**Formats:** `.ahx`, `.hvl`, `.thx`
**WASM:** `public/hively/Hively.wasm`
**Engine:** `src/engine/hively/HivelyEngine.ts`
**Synth:** `src/engine/hively/HivelySynth.ts`
**Parser:** `src/lib/import/formats/HivelyParser.ts`
**UI:** `src/components/instruments/hardware/HivelyHardware.tsx`

---

### Group 2: SoundMon II / Brian Postma — ✅ COMPLETE

**Formats:** `.bp`, `.bp3`, `.sndmon`
**WASM source:** `soundmon-wasm/src/soundmon_synth.c`
**WASM:** `public/soundmon/SoundMon.wasm`
**Worklet:** `public/soundmon/SoundMon.worklet.js`
**Engine:** `src/engine/soundmon/SoundMonEngine.ts`
**Synth:** `src/engine/soundmon/SoundMonSynth.ts`
**Parser:** `src/lib/import/formats/SoundMonParser.ts` — emits `SoundMonConfig`
**UI:** `src/components/instruments/controls/SoundMonControls.tsx`
**Type:** `SoundMonConfig` in `src/types/instrument.ts:710`

---

### Group 3: SidMon II — ✅ COMPLETE

**Formats:** `.sid`, `.sid2`, `.smn`
**WASM source:** `sidmon-wasm/src/sidmon_synth.c`
**WASM:** `public/sidmon/SidMon.wasm`
**Worklet:** `public/sidmon/SidMon.worklet.js`
**Engine:** `src/engine/sidmon/SidMonEngine.ts`
**Synth:** `src/engine/sidmon/SidMonSynth.ts`
**Parser:** `src/lib/import/formats/SidMon2Parser.ts` — emits `SidMonConfig`
**UI:** `src/components/instruments/controls/SidMonControls.tsx`
**Type:** `SidMonConfig` in `src/types/instrument.ts:762`

---

### Group 4: Digital Mugician — ✅ COMPLETE

**Formats:** `.dmu`, `.dmu2`, `.mug`, `.mug2`
**WASM source:** `digmug-wasm/src/digmug_synth.c`
**WASM:** `public/digmug/DigMug.wasm`
**Worklet:** `public/digmug/DigMug.worklet.js`
**Engine:** `src/engine/digmug/DigMugEngine.ts`
**Synth:** `src/engine/digmug/DigMugSynth.ts`
**Parser:** `src/lib/import/formats/DigitalMugicianParser.ts` — emits `DigMugConfig`
**UI:** `src/components/instruments/controls/DigMugControls.tsx`
**Type:** `DigMugConfig` in `src/types/instrument.ts:808`
**Note:** `.dmu`/`.dmu2`/`.mug`/`.mug2` added to `SYNTHESIS_FORMATS` in `UADEParser.ts` (2026-02-26)

---

### Group 5: Future Composer (FC13/FC14) — ✅ COMPLETE

**Formats:** `.fc`, `.fc13`, `.fc14`, `.smod`, `.bsi`
**WASM source:** `fc-wasm/src/fc_synth.c`
**WASM:** `public/fc/FC.wasm`
**Worklet:** `public/fc/FC.worklet.js`
**Engine:** `src/engine/fc/FCEngine.ts`
**Synth:** `src/engine/fc/FCSynth.ts`
**Parser:** `src/lib/import/formats/FCParser.ts` — emits `FCConfig`
**UI:** `src/components/instruments/controls/FCControls.tsx`
**Type:** `FCConfig` in `src/types/instrument.ts:840`

---

### Group 6: Fred Editor — ✅ COMPLETE

**Formats:** `.fred`
**WASM source:** `fred-wasm/src/fred_synth.c`
**WASM:** `public/fred/Fred.wasm`
**Worklet:** `public/fred/Fred.worklet.js`
**Engine:** `src/engine/fred/FredEngine.ts`
**Synth:** `src/engine/fred/FredSynth.ts`
**Parser:** `src/lib/import/formats/FredEditorParser.ts` — emits `FredConfig`
**UI:** `src/components/instruments/controls/FredControls.tsx`
**Type:** `FredConfig` in `src/types/instrument.ts:910`

---

### Group 7: TFMX — Jochen Hippel — ✅ COMPLETE

**Formats:** `.tfmx`, `.mdat`, `.tfmx1.5`, `.tfmx7v`, `.tfmxpro`, `.tfhd1.5`
**WASM source:** `tfmx-wasm/src/tfmx_synth.cpp` (C++ wrapper over `Reference Code/libtfmxaudiodecoder-main/`)
**WASM:** `public/tfmx/TFMX.wasm`
**Worklet:** `public/tfmx/TFMX.worklet.js`
**Engine:** `src/engine/tfmx/TFMXEngine.ts`
**Synth:** `src/engine/tfmx/TFMXSynth.ts`
**Parser:** `src/lib/import/formats/TFMXParser.ts` — emits `TFMXConfig`
**UI:** `src/components/instruments/controls/TFMXControls.tsx` (read-only viewer)
**Type:** `TFMXConfig` in `src/types/instrument.ts:980`

---

### Group 8: PCM Format Instrument Naming — ⚠️ PARTIAL

**Formats:** 100+ UADE formats (Richard Joseph `.rj`, Dave Lowe `.dl`, Mark Cooksey `.mc`, Delta Music `.dm`, etc.)
**Goal:** Parse format-specific header name tables so Sampler instruments get real names instead of "Instrument 1"
**Where:** `UADEParser.ts` — `tryExtractInstrumentNames()` at line ~439
**Priority:** Low (polish — playback works fine without names)

**Implemented (2026-02-26):**
- **Sonic Arranger** (`.sa`, `.sa-p`, `.sa_old`, `.sonic`, `.lion`) — `SOAR` chunk-format files: walk `STBL→OVTB→NTBL→INST` chunks, extract 30-char names from `INST` structs at stride 152, offset +122. Old-format SA files (Amiga binary, magic `0x4EFA`) fall through to generic scanner.
- **SoundFX** (`.sfx`, `.sfx13`) — `SONG` magic at +60 (SFX 1.3, 15 instruments) or +124 (SFX 2.0, 31 instruments); 22-byte names, 30-byte stride.
- **JamCracker** (`.jam`, `.jc`) — `BeEp` magic; 31-byte names in sample header entries at stride 40, offset +6.
- **TCB Tracker** (`.tcb`) — `AN COO` prefix magic; 16 × 8-byte names at fixed offset +0x92.
- **Quadra Composer** (`.emod`, `.qc`) — IFF `FORM/EMOD/EMIC` format; 20-byte names in EMIC sample entries at stride 34, offset +4 within entry.
- **AMOS Music Bank** (`.abk`) — `AmBk` magic; 16-byte names in instrument entries at offset +0x10 within each 32-byte entry; instrument section located via main header pointer.
- **Delta Music 2** (`.dm2`) — `DM2!` magic case retained but NOTE: real-world `.dm2` files are compiled Amiga binaries without this magic; this case is effectively dead code.

**Not parseable (compiled Amiga binaries — no static name table):**
- Richard Joseph (`.rjp`, `.rj`) — loadseg binary; names come from IFF sample headers loaded at runtime
- Dave Lowe (`.dl`) — compiled binary
- Mark Cooksey (`.mc`) — compiled binary
- Delta Music 1 (`.dm`) — compiled binary, no name table

**Generic fallback** (already in place): MOD-style 22-byte ASCII name block scanner catches ProTracker-derived formats.

---

### Group 9: OctaMED Synth Instruments — ⚠️ PARTIAL

**Formats:** `.med`, `.mmd0`, `.mmd1`, `.mmd2`, `.mmd3`
**Parser:** `src/lib/import/formats/MEDParser.ts`
**Current state (2026-02-26):** `SynthInstr` binary block is now parsed — the first waveform (256-byte signed PCM at offset `+0x114`) is extracted as a `Sampler` instrument with correct loop points. `samplePos` is advanced by `synthLen` so subsequent PCM instruments load at correct offsets.
**Gap:** No `OctaMEDConfig` type, no real-time synthesis — instruments play the captured waveform rather than the full 10-waveform oscillator + 32-step ADSR table
**Priority:** Low — the waveform extraction gives a usable (if approximate) sound

---

## Implementation Phases

### Phase 0 — Architecture & Types ✅ COMPLETE

- [x] `docs/uade-masterplan.md` — this document
- [x] `SoundMonConfig`, `SidMonConfig`, `DigMugConfig`, `FCConfig`, `FredConfig`, `TFMXConfig` in `src/types/instrument.ts`
- [x] SynthType values: `'SoundMonSynth'`, `'SidMonSynth'`, `'DigMugSynth'`, `'FCSynth'`, `'FredSynth'`, `'TFMXSynth'`
- [x] `soundmon-wasm/include/format_synth_api.h` — C API contract

### Phase 1 — SoundMon Pilot ✅ COMPLETE

- [x] `soundmon-wasm/src/soundmon_synth.c` — wavetable + ADSR + LFO + arpeggio
- [x] `public/soundmon/SoundMon.wasm` — compiled
- [x] `public/soundmon/SoundMon.worklet.js`
- [x] `src/engine/soundmon/SoundMonEngine.ts`
- [x] `src/engine/soundmon/SoundMonSynth.ts`
- [x] `SoundMonParser.ts` emits `SoundMonConfig`
- [x] ToneEngine + InstrumentFactory registered

### Phase 2 — SidMon + DigMug ✅ COMPLETE

- [x] SidMon: WASM + engine + worklet + synth + parser
- [x] Digital Mugician: WASM + engine + worklet + synth + parser
- [x] Both registered in ToneEngine + InstrumentFactory

### Phase 3 — FC Synthesis Engine ✅ COMPLETE

- [x] `fc-wasm/src/fc_synth.c` — 47 waveforms + synth macro sequencer + ADSR + vibrato + arpeggio
- [x] `public/fc/FC.wasm` — compiled
- [x] `src/engine/fc/FCEngine.ts` + `FCSynth.ts`
- [x] `FCParser.ts` emits `FCConfig`
- [x] Registered in ToneEngine + InstrumentFactory

### Phase 4 — TFMX Synthesis Engine ✅ COMPLETE

- [x] `tfmx-wasm/src/tfmx_synth.cpp` — C++ wrapper over libtfmxaudiodecoder
- [x] `public/tfmx/TFMX.wasm` — compiled
- [x] `src/engine/tfmx/TFMXEngine.ts` + `TFMXSynth.ts`
- [x] `TFMXParser.ts` emits `TFMXConfig`
- [x] Registered in ToneEngine + InstrumentFactory

### Phase 5 — Fred Editor Synthesis Engine ✅ COMPLETE

- [x] `fred-wasm/src/fred_synth.c` — waveform + per-tick macro sequencer
- [x] `public/fred/Fred.wasm` — compiled
- [x] `src/engine/fred/FredEngine.ts` + `FredSynth.ts`
- [x] `FredEditorParser.ts` emits `FredConfig`
- [x] Registered in ToneEngine + InstrumentFactory

### Phase 6 — PCM Format Instrument Naming ⚠️ PARTIAL

- [x] SonicArranger, SoundFX, JamCracker, TCB, EMOD/Quadra Composer, AMOS Music Bank — name extractors in `UADEParser.ts::tryExtractInstrumentNames()`
- [x] `buildEnhancedSong()` already uses extracted names to label Sampler instruments
- [ ] Delta Music 2 (`.dm2`) — `DM2!` magic case present but dead code (real `.dm2` are binaries)
- [ ] Richard Joseph, Dave Lowe, Mark Cooksey, Delta Music 1 — compiled Amiga binaries; not parseable

### Phase B — Native Full Parsers (post-Phase 6 extension)

- [x] **B1 JamCracker** (`.jam`, `.jc`) — `src/lib/import/formats/JamCrackerParser.ts` ✅ 2026-02-26
  - 4-channel, PCM+AM instruments, Fxx/arpeggio/vibrato/portamento effects
- [x] **B2 Quadra Composer** (`.emod`, `.qc`) — `src/lib/import/formats/QuadraComposerParser.ts` ✅ 2026-02-26
  - IFF FORM/EMOD; EMIC chunk for instruments+patterns+song order; PATT chunk; 8SMP chunk
- [x] **B3 AMOS Music Bank** (`.abk`) — `src/lib/import/formats/AMOSMusicBankParser.ts` ✅ 2026-02-26
  - `AmBk` magic; command-based per-channel patterns decoded to TrackerCell rows
- [x] **B4 TCB Tracker** (`.tcb`) — `src/lib/import/formats/TCBTrackerParser.ts` ✅ 2026-02-26
  - "AN COOL." / "AN COOL!" magic; 4ch / 16 instruments / 64 rows; unsigned PCM converted to signed

### Phase 7 — Instrument Editor UI ✅ COMPLETE

- [x] `src/components/instruments/controls/SoundMonControls.tsx`
- [x] `src/components/instruments/controls/SidMonControls.tsx`
- [x] `src/components/instruments/controls/DigMugControls.tsx`
- [x] `src/components/instruments/controls/FCControls.tsx`
- [x] `src/components/instruments/controls/FredControls.tsx`
- [x] `src/components/instruments/controls/TFMXControls.tsx`
- [x] All registered in `src/components/instruments/editors/UnifiedInstrumentEditor.tsx`

---

## Remaining Work

### High value
- **Phase B2** — Quadra Composer native parser (IFF-based, well-documented)
- **Phase B3** — AMOS Music Bank native parser
- **Phase B4** — TCB Tracker native parser (Atari ST)

### Low priority / future
- **OctaMED real-time synthesis** — Add `OctaMEDConfig` type, 10-waveform oscillator + 32-step ADSR table; would require an `octamed-wasm/` build
- **TFMX UI** — `TFMXControls.tsx` is currently read-only (VolModSeq/SndModSeq hex viewer); editable controls would require reverse-engineering the macro format further

---

## Critical Files Reference

| File | Role |
|------|------|
| `src/types/instrument.ts` | All format config types + SynthType values |
| `src/engine/ToneEngine.ts` | Synth type registration |
| `src/engine/InstrumentFactory.ts` | Synth instantiation |
| `src/engine/hively/HivelySynth.ts` | **Reference implementation** — pattern for all synths |
| `public/hively/Hively.worklet.js` | **Reference worklet** — ring buffer + player pattern |
| `soundmon-wasm/include/format_synth_api.h` | C API contract for all WASM wrappers |
| `Reference Code/libtfmxaudiodecoder-main/` | TFMX C++ source (already compiled to TFMX.wasm) |
