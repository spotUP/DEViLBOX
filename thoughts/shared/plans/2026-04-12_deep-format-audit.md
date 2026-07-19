---
date: 2026-04-12
topic: deep-format-audit
tags: [audit, formats, editability, synths, samples]
status: in-progress
---

# Deep Format Audit Plan

## Goal
Audit all ~188 formats for deep integration quality, not just "plays audio."

## Audit Dimensions

### 1. Pattern Data Quality
- **full**: Native parser extracts real note/instrument/effect data per cell
- **stub**: Parser creates empty placeholder patterns (no note data)
- **none**: No pattern data at all (engine-driven: SID, VGM, etc.)

### 2. Synth Type
- **dedicated**: Format has its own synth (FCSynth, HivelySynth, KlysTrackSynth, etc.)
- **sampler**: Uses Sampler synth with extracted PCM samples
- **uade-generic**: Uses UADEEditableSynth (UADE handles all audio)
- **libopenmpt**: Uses libopenmpt for playback
- **wasm-engine**: Dedicated WASM engine handles audio (Organya, PxTone, etc.)

### 3. Sample/Instrument Extraction
- **full**: All instruments extracted with PCM waveforms
- **partial**: Some instruments extracted, others missing
- **names-only**: Instrument list with names but no audio data
- **none**: No instrument extraction

### 4. Editability
- **full**: Can edit cells, hear changes, export preserves edits
- **chip-ram**: UADE chip RAM patching (edit → write to emulated Amiga RAM)
- **read-only**: Pattern data visible but not editable
- **none**: No pattern editing possible

## Execution Plan

### Phase 1: Code Analysis (automated)
Scan all parsers in `src/lib/import/formats/` and `src/lib/import/parsers/` to classify each format:
- Does the parser create real pattern cells with note data?
- Does it extract instruments with sample buffers?
- Does it set uadePatternLayout for chip RAM editing?
- What synth type does NativeEngineRouting assign?

### Phase 2: Update localhost:4444
Add new fields to each format entry:
- `patternQuality`: full | stub | none
- `synthType`: dedicated | sampler | uade-generic | libopenmpt | wasm-engine
- `sampleExtraction`: full | partial | names-only | none
- `editability`: full | chip-ram | read-only | none

### Phase 3: Identify gaps and fix
For formats that SHOULD have deeper integration but don't:
- Formats with native parsers producing stub patterns → implement real pattern parsing
- Formats using UADEEditableSynth that have dedicated WASM engines → fix routing
- Formats missing sample extraction that could have it → implement extraction
