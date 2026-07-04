---
date: 2026-04-12
topic: AudioWorklet SID migration + unified SID editor scaffolding
tags: [sid, audioworklet, synth-editor, cheesecutter, goattracker, sidmon]
status: final
---

# Session Handoff: AudioWorklet SID + Unified Editor

## Completed

### 1. DeepSID AudioWorklet Migration (TESTED, WORKING)

Eliminated ScriptProcessorNode clicks for all SID backends by routing audio through AudioWorklet.

**Files created:**
- `public/deepsid/SID.worklet.js` — ring-buffer AudioWorklet processor (32K samples ≈ 743ms)

**Files modified:**
- `src/engine/deepsid/engines/ScriptNodePlayerEngine.ts` — ScriptNodePlayer's SPN still drives emulation + resampling, but its audio output goes to a zero-gain sink. The filled output buffers are captured in `onaudioprocess` and forwarded to the worklet ring buffer.
- `src/engine/deepsid/engines/JSIDPlay2Engine.ts` — Worker SAMPLES events forwarded to AudioWorklet instead of ScriptProcessorNode
- `src/engine/C64SIDEngine.ts` — comment update only

**How it works:**
- ScriptNodePlayer runs normally (computeAudioSamples + resampling)
- SPN output disconnected from destination, connected to gain=0 sink (keeps SPN alive)
- `onaudioprocess` wrapper captures output buffers → transfers to worklet
- Worklet outputs from ring buffer on audio thread — smooth even during main-thread jank

**Key lesson from debugging:**
- First attempt: bypassed ScriptNodePlayer's resampler, called computeAudioSamples directly from timer → glitchy (sample rate mismatch between WASM native rate and AudioContext rate)
- Second attempt: let ScriptNodePlayer handle everything, just intercept its output → works perfectly
- The "instruments fighting each other" sound was double audio: both SPN output AND worklet output playing simultaneously

**Tested with:** HVSC Last Ninja 1 Remix (websid backend), GoatTracker .sng files. Both confirmed working.

### 2. Unified SID Editor — Scaffolding (NOT WIRED UP YET)

Created shared SID instrument components and adapter interface for a unified editor across GoatTracker Ultra, CheeseCutter, and SidMon II.

**Files created:**
- `src/lib/sid/sidConstants.ts` — ATTACK_MS, DECAY_MS, waveform/register constants, hex formatting
- `src/components/instruments/sid/SIDInstrumentAdapter.ts` — adapter interface (ADSR, waveform, filter, vibrato, tables, arpeggio, SID registers, feature flags)
- `src/components/instruments/sid/SIDEnvelopeSection.tsx` — reusable ADSR slider + envelope visualization
- `src/components/instruments/sid/SIDWaveformSection.tsx` — TRI/SAW/PUL/NOI toggles + gate/sync/ring/test
- `src/components/instruments/sid/SIDRegisterMonitor.tsx` — live SID register display (3 voices + filter)
- `src/components/instruments/sid/UnifiedSIDEditor.tsx` — unified editor shell with tabs (Instrument, Tables, SID Monitor)
- `src/components/instruments/sid/adapters/CheeseCutterAdapter.ts` — read-only adapter from useCheeseCutterStore

## Not Yet Wired Up

The unified SID editor components exist but aren't connected to the app's instrument editing flow yet.

### How Instrument Editing Works

1. User clicks "Edit" on an instrument in the instrument list
2. `UnifiedInstrumentEditor.tsx` calls `getEditorMode(synthType)` → returns editor mode string
3. `SynthTypeDispatcher.tsx` renders the appropriate control component based on editor mode
4. For `C64SID` synthType → falls through to `'layout'` mode (generic declarative layout)

### Current State Per Format

| Format | synthType | Editor Mode | Controls Component | Status |
|--------|-----------|-------------|-------------------|--------|
| GoatTracker Ultra | `GTUltraSynth` | `gtultra` | `GTUltraControls.tsx` | Full editor (4 tabs, tables, SID monitor) |
| SidMon II | `SidMonSynth` | `sidmon` | `SidMonControls.tsx` | Good editor (waveform, ADSR, filter, arpeggio, PCM) |
| CheeseCutter | `C64SID` | `layout` | Generic layout | Basic SID layout, no tables/wavetable views |
| Plain .sid | `C64SID` | `layout` | Generic layout | Same as CheeseCutter |

### What Needs Doing (Next Session)

**Option A: Quick win — CheeseCutter-specific editor mode**
1. In `UnifiedInstrumentEditor.tsx`: detect CheeseCutter format (check `useCheeseCutterStore.getState().loaded`) and return `'cheesecutter'` editor mode
2. In `SynthTypeDispatcher.tsx`: add `if (editorMode === 'cheesecutter')` branch that renders `<UnifiedSIDEditor adapter={new CheeseCutterAdapter()} />`
3. This gives CheeseCutter instruments ADSR display + table viewers immediately

**Option B: Full unified approach**
1. Create `CheeseCutterControls.tsx` wrapper that instantiates CheeseCutterAdapter and renders UnifiedSIDEditor
2. Create `GTUltraUnifiedControls.tsx` wrapper with GTUltraAdapter
3. Create `SidMonUnifiedControls.tsx` wrapper with SidMonAdapter
4. Gradually migrate all three to use the shared components

**Option C: Enhance existing C64SID layout**
1. Add table viewers to the C64SID layout descriptor (if the layout system supports custom sections)
2. Least disruptive but limited flexibility

### CheeseCutter WASM Bridge Gap

CheeseCutter instruments are **read-only** because the WASM bridge only exposes:
- `cc_load()` — load 64KB RAM image
- `cc_render()` — render audio
- `cc_get_sid_regs()` — read SID registers (exists but not wired to engine)

Missing (needed for editing):
- `cc_set_instrument_byte(inst, byteIdx, value)` — write to instrument data in RAM
- `cc_set_wave_table(row, val1, val2)` — edit wavetable
- `cc_set_pulse_table(row, value)` — edit pulse table
- `cc_set_filter_table(row, value)` — edit filter table

These would write directly to the 64KB RAM image at the correct offsets. Source: `cheesecutter-wasm/src/cc_bridge.cpp`

## Critical References

- Research: `thoughts/shared/research/2026-04-12_unified-sid-editor.md`
- Plan: `thoughts/shared/plans/2026-04-12-unified-sid-editor.md`
- Instrument routing: `src/components/instruments/editors/UnifiedInstrumentEditor.tsx:147-216` (getEditorMode)
- Synth dispatcher: `src/components/instruments/editors/SynthTypeDispatcher.tsx` (conditional rendering)
- GTUltra reference: `src/components/instruments/controls/GTUltraControls.tsx` (most advanced SID editor)
- CC parser instruments: `src/lib/import/formats/CheeseCutterParser.ts:464` (synthType: 'C64SID')

## Other Notes

- CheeseCutter WASM playback confirmed working (first real test this session)
- GoatTracker Ultra playback confirmed working through AudioWorklet path
- The `workletModuleLoaded` flag in both ScriptNodePlayerEngine and JSIDPlay2Engine is module-scoped — calling addModule twice on same URL is harmless
- Dead code: `WebSIDEngine.ts`, `TinyRSIDEngine.ts`, `WebSIDPlayEngine.ts` — old standalone engines, nothing imports them
