---
date: 2026-04-06
topic: furnace-deferred-features
tags: [furnace, wavetable, gameboy, editor]
status: draft
---

# Plan: Furnace Deferred Features

Two features from the Furnace editor parity audit that need dedicated sessions.

## 1. Game Boy Hardware Sequence Editor

### What It Is
The GB hardware sequence is a list of commands that execute in order to control the Game Boy's hardware envelope, sweep, and timing. It's like a mini-program that runs per-note.

### Upstream Furnace Commands (from insEdit.cpp)
| Command | ID | Parameters | Description |
|---------|-----|-----------|-------------|
| Set Envelope | 0 | vol(0-15), dir(0/1), len(0-7), soundLen(0-64) | Set hardware envelope |
| Set Sweep | 1 | shift(0-7), speed(0-7), dir(0/1) | Set frequency sweep |
| Wait | 2 | ticks(1-255) | Wait N ticks |
| Wait for Release | 3 | — | Wait until note release |
| Loop | 4 | position(0-254) | Jump to position |
| Loop until Release | 5 | position(0-254) | Jump to position, stop at release |

### Current State
- `hwSeqEnabled` toggle and `hwSeqLen` knob exist
- `hwSeq` array type exists: `Array<{ cmd: number; data: number }>`
- No command editor UI — can't add/edit/remove commands

### Implementation Plan
1. **Expand the type**: `hwSeq` entries need more than just `cmd`/`data` — some commands have 4 parameters (envelope). Either pack into data bitfield (matching Furnace's format) or use a struct per command type.

2. **UI**: Add below the HW Sequence toggle when enabled:
   - List of commands with index numbers
   - Each row: command type dropdown + parameter inputs (dynamic per command type)
   - Add/Remove/Move buttons
   - Max 64 commands

3. **Data format**: Match Furnace's bitpacking:
   - Envelope: `data = (vol << 12) | (dir << 8) | (len << 4) | soundLen` (approximate — check insEdit.cpp)
   - Sweep: `data = (shift << 4) | (speed << 1) | dir`
   - Wait: `data = ticks`
   - Loop: `data = position`

### Files to Modify
- `src/components/instruments/editors/FurnaceEditor.tsx` — GBPanel, add HWSeqEditor sub-component
- `src/types/instrument/furnace.ts` — possibly expand FurnaceGBConfig.hwSeq type

### Estimated Scope
~150 lines of new UI code. Medium complexity — the command parameter packing is the tricky part.

---

## 2. Wavetable Synthesizer

### What It Is
Furnace has a built-in wavetable synthesizer that can generate and morph wavetables in real-time. It operates on the instrument's wavetable data, creating evolving timbres by blending, morphing, or modulating between two wave sources.

### Upstream Furnace Features (from insEdit.cpp)
| Feature | Description |
|---------|-------------|
| **Enable** | Toggle wavetable synth on/off |
| **Single/Dual mode** | One wave source or two (for blending) |
| **Wave 1/2 selection** | Which wavetable indices to use as sources |
| **Update speed** | How fast the synth updates the wavetable |
| **Effect** | The synthesis operation applied each update |
| **Global wave** | Write to global wavetable (affects all channels) |

### Synthesis Effects (DIV_WS_*)
| Effect | ID | Description |
|--------|-----|-------------|
| None | 0 | No effect |
| Invert | 1 | Flip wave vertically |
| Add | 2 | Add wave 2 to wave 1 |
| Subtract | 3 | Subtract wave 2 from wave 1 |
| Average | 4 | Average wave 1 and wave 2 |
| Phase | 5 | Phase modulation |
| Chorus | 6 | Chorus-like effect |
| Fade In | 7 | Gradually increase volume |
| Fade Out | 8 | Gradually decrease volume |
| Ping-Pong | 9 | Reverse wave direction at ends |
| Overlay | 10 | Overlay wave 2 on wave 1 |
| Volume Scale | 11 | Scale wave by volume |
| ... | 12-30+ | Many more effects |

### Current State
- Wavetable data (`wavetables` array) exists in FurnaceConfig
- WavetableListEditor component exists for editing raw wavetable data
- **No wavetable synthesizer UI** — can't configure wave blending/effects
- The synth parameters aren't in FurnaceConfig type

### Implementation Plan

#### Phase 1: Type definitions
Add to `FurnaceConfig`:
```typescript
waveSynth?: {
  enabled: boolean;
  dual: boolean;        // Single vs dual wave mode
  wave1: number;        // Source wavetable index 1
  wave2: number;        // Source wavetable index 2 (dual mode)
  speed: number;        // Update speed
  effect: number;       // Synthesis effect (0-30+)
  param1: number;       // Effect parameter 1
  param2: number;       // Effect parameter 2
  param3: number;       // Effect parameter 3
  param4: number;       // Effect parameter 4
  global: boolean;      // Write to global wavetable
  oneShot: boolean;     // Run effect once, not continuously
};
```

#### Phase 2: Parser support
- Read wave synth data from .fur files (feature code `WS`)
- Write wave synth data when exporting

#### Phase 3: UI
Add a "Wave Synth" panel in the FurnaceEditor when wavetable chips are detected:
- Enable toggle
- Single/Dual radio buttons
- Wave 1/2 selectors (dropdown of wavetable indices)
- Speed knob
- Effect dropdown (all DIV_WS_* effects with descriptive names)
- Param knobs (1-4, labels change per effect)
- Global / One-Shot toggles
- Preview: show the current wavetable shape updating in real-time

#### Phase 4: WASM integration
- Send wave synth parameters to the Furnace WASM dispatch
- The WASM engine already supports wavetable synthesis — just needs the params passed through

### Files to Modify
- `src/types/instrument/furnace.ts` — add FurnaceWaveSynthConfig
- `src/lib/import/FurnaceParser.ts` — parse WS feature block
- `src/components/instruments/editors/FurnaceEditor.tsx` — add WaveSynthPanel
- `src/engine/chips/FurnaceChipEngine.ts` — pass waveSynth params to WASM

### Estimated Scope
~300 lines of new code across 4 files. Medium-high complexity — the WASM integration and .fur parser changes are the hard parts.

### Reference
- Upstream Furnace: `/Users/spot/Code/Reference Code/furnace-master/src/gui/insEdit.cpp` lines ~3000-3200 (wave synth UI)
- Wave synth engine: `/Users/spot/Code/Reference Code/furnace-master/src/engine/waveSynth.cpp`
- Effect definitions: `/Users/spot/Code/Reference Code/furnace-master/src/engine/defines.h` (DIV_WS_*)
