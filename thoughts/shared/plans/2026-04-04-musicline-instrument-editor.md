---
date: 2026-04-04
topic: musicline-instrument-editor
tags: [musicline, instrument-editor, wasm, ui]
status: draft
---

# MusicLine Full Instrument Editor

## Goal
Replicate the Amiga MusicLine instrument editor (ml.spe screenshot) in DEViLBOX, with factory wavesamples/instruments bundled.

## Current State
- MusicLine WASM API only supports binary blob loading (`ml_preview_load`)
- Current editor (`MusicLineControls.tsx`) shows only waveform type + volume (read-only)
- No individual parameter setters in WASM
- Factory content available at `/Users/spot/Downloads/mline115/mline/musiclineeditor/`

## Architecture

### Approach: TypeScript-side binary editing + WASM reload

Since the WASM doesn't expose per-parameter setters, we:
1. Parse the full .ml file binary in TypeScript to extract instrument structs (206 bytes each)
2. Present editable UI for all fields
3. On change: patch the binary, re-upload to WASM via `ml_preview_load`, re-trigger note

Alternatively (better long-term): add `ml_set_inst_field(instIdx, offset, size, value)` to the WASM wrapper
that writes directly into the loaded Inst struct. This avoids full reload on every knob turn.

### Instrument Struct (206 bytes, from defines.h)

| Offset | Size | Field | UI Control |
|--------|------|-------|------------|
| 0-31 | 32 | Title | Text input |
| 32 | 1 | SmplNumber | Wavesample selector |
| 33 | 1 | SmplType | Wave length selector (0=PCM, 1-5=16/32/64/128/256) |
| 58-59 | 2 | Volume | Slider 0-64 |
| 46-47 | 2 | FineTune | Slider (signed) |
| 48-49 | 2 | SemiTone | Slider (signed) |
| 60 | 1 | Transpose | Checkbox/toggle |
| 61 | 1 | SlideSpeed | Slider (glide) |
| 62-63 | 2 | Effects1/2 | Toggle buttons for each FX |

**ADSR Envelope (offset 64-87, iEnv):**
| Offset | Field | UI |
|--------|-------|----|
| 64-65 | AttLen | Slider |
| 66-67 | DecLen | Slider |
| 68-69 | SusLen | Slider |
| 70-71 | RelLen | Slider |
| 72-73 | AttSpd | Slider |
| 74-75 | DecSpd | Slider |
| 76-77 | SusSpd | Slider |
| 78-79 | RelSpd | Slider |
| 80-81 | AttVol | Slider |
| 82-83 | DecVol | Slider |
| 84-85 | SusVol | Slider |
| 86-87 | RelVol | Slider |

**Vibrato (offset 88-99, iVib):**
| Offset | Field | UI |
|--------|-------|----|
| 88 | Dir | Toggle |
| 89 | WaveNum | Selector |
| 90-91 | Speed | Slider |
| 92-93 | Delay | Slider |
| 94-95 | AtkSpd | Slider |
| 96-97 | Attack | Slider |
| 98-99 | Depth | Slider |

**Tremolo (offset 100-111, iTre):** Same layout as Vibrato

**Arpeggio (offset 112-115, iArp):**
| Offset | Field |
|--------|-------|
| 112-113 | Table |
| 114 | Speed |
| 115 | Groove |

**Transform, Phase, Mix, Resonance, Filter, Loop** follow at higher offsets.

### FX Toggle Bits (Effects1/Effects2 at offset 62-63)
- Effects1 bit 0: Envelope (ADSR)
- Effects1 bit 1: Vibrato
- Effects1 bit 2: Tremolo
- Effects1 bit 3: Arpeggio
- Effects1 bit 4: Loop
- Effects1 bit 5: LoopStop
- Effects2 bit 0: Transform
- Effects2 bit 1: Phase
- Effects2 bit 2: Mix
- Effects2 bit 3: Resonance
- Effects2 bit 4: Filter

## Implementation Phases

### Phase 1: WASM API + TypeScript Parser
1. Add `ml_set_inst_field(instIdx, offset, size, value)` to MusicLineWrapper.cpp
2. Add `ml_get_inst_field(instIdx, offset, size)` to read current values
3. Add worklet message handlers for `set-inst-field` and `get-inst-field`
4. Add TypeScript MusicLineInstrumentParser to extract all fields from binary
5. Rebuild WASM

### Phase 2: Factory Content Bundle
1. Copy waves/, instruments/, samples/ to `public/musicline/factory/`
2. Create manifest JSON listing all factory content
3. Add TypeScript loader to fetch and parse factory content
4. Wire into preset system (factory instruments as presets, wavesamples as loadable)

### Phase 3: DOM Instrument Editor
Match the Amiga layout:
- Left column: Instrument Parameters (Wave Length, Volume, Finetune, Semitone, Glide, Transposable)
- Center column: Instrument F/X toggle buttons (Envelope, Vibrato, Tremolo, Arpeggio, Transform, Phase, Mix, Resonance, Filter, PlayLoop)
- Right column: Envelope Generator (ADSR Vol + Len sliders)
- Bottom: Instrument list, Wavesample list, Wavesample parameters

### Phase 4: Pixi/GL Editor
Mirror DOM editor 1:1 using Pixi components.

### Phase 5: Per-FX Detail Panels
When an FX toggle is selected (e.g., Vibrato), show its detailed parameters
(Speed, Depth, Delay, Attack, WaveNum) in the right panel area.

## Success Criteria
- All instrument parameters from the Amiga editor are editable
- Changes are audible in real-time (re-trigger preview note)
- Factory wavesamples and instruments are loadable
- Both DOM and Pixi versions
- `npm run type-check` passes

## Files to Create/Modify
- `musicline-wasm/common/MusicLineWrapper.cpp` — add field getter/setter
- `public/musicline/MusicLine.worklet.js` — add message handlers
- `src/engine/musicline/MusicLineEngine.ts` — add sendMessage wrappers
- `src/engine/musicline/MusicLineSynth.ts` — add parameter API
- `src/lib/musicline/MusicLineInstrumentParser.ts` — NEW: binary parser
- `src/components/instruments/controls/MusicLineControls.tsx` — full rewrite
- `src/pixi/instruments/PixiMusicLineControls.tsx` — NEW: GL version
- `public/musicline/factory/` — NEW: bundled factory content
