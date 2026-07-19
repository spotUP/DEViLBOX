---
date: 2026-04-06
topic: furnace-editor-parameter-parity
tags: [furnace, editor, instruments, ui]
status: draft
---

# Plan: Furnace Editor Parameter Parity

## Goal
Add all missing instrument parameters to the DEViLBOX Furnace editor so it matches upstream Furnace's insEdit.cpp.

## Phase 1: FM Operator Parameters (FurnaceEditor.tsx)

### 1a. SSG Envelope (SSG-EG) — OPN/OPM chips
- Add `ssg` field to FurnaceOperatorConfig (0-15)
- Add knob to FM operator panel, gated by `paramRanges.hasSSG`
- Chips: YM2612 (0), OPNA (13), OPNB (14)

### 1b. OPL Waveform (WS) — OPL chips
- Add `ws` field to FurnaceOperatorConfig (0-7) 
- Add dropdown to FM operator panel, gated by `paramRanges.hasWS`
- Chips: OPL3 (2), OPL2 variants
- Waveform names: Sine, Half-Sine, Abs-Sine, Quarter-Sine, Alt-Sine, Camel-Sine, Square, Ln-Sine

### 1c. OPZ-specific: EGSHIFT, REV
- Add `egShift` (0-3) and `rev` (boolean) to FurnaceOperatorConfig
- Gate by `paramRanges.isOPZ`

## Phase 2: C64/SID Panel Flags (C64Panel in FurnaceEditor.tsx)

- Add `resetDuty` toggle (Reset Duty on Note)
- Add `initFilter` toggle (Initialize Filter)
- Add `noTest` toggle (Don't Test Before New Note)
- These are boolean fields on the c64 sub-config

## Phase 3: Game Boy Hardware Sequence (GBPanel)

- Add basic hwSeq editor: list of commands
- Commands: ENVELOPE(vol,len,soundLen,dir), SWEEP(shift,speed,dir), WAIT, WAIT_REL, LOOP, LOOP_REL
- This is complex — show as a simple command list with add/remove

## Phase 4: N163 Per-Channel Tables (N163Panel)

- Add per-channel wave position (0-255) × 8 channels
- Add per-channel wave length (0-252) × 8 channels  
- Show as editable table/grid when "Per-Channel" is enabled

## Phase 5: ESFM Improvements (ESFMPanel)

- Add `fixed` boolean toggle per operator (fixed frequency mode)
- Add `outLvlL` / `outLvlR` boolean per operator (channel output)

## Phase 6: FDS Compatibility Mode (FDSPanel)

- Add `compat` boolean toggle

## Phase 7: FM Macros (MacroEditor integration)

- Add macro types: Algorithm, Feedback, FMS, AMS
- These use the existing macro editor infrastructure
- Need to add entries to the macro type list for FM instruments

## Phase 8: Wavetable Synthesizer

- DEFERRED — this is a major new feature requiring its own design session
- Upstream Furnace has a complex wave synth with blend/morph/phase modes
- Not a simple parameter addition

## Files to Modify
- `src/components/instruments/editors/FurnaceEditor.tsx` — FM ops, C64Panel, GBPanel, N163Panel, ESFMPanel, FDSPanel
- `src/types/instrument/base.ts` or furnace types — add missing fields to FurnaceOperatorConfig, FurnaceC64Config
- `src/components/instruments/editors/MacroEditor.tsx` — add FM macro types
