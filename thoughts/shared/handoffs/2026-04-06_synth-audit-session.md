---
date: 2026-04-06
topic: synth-audit-and-v2-preset-extraction
tags: [synths, audit, v2, presets, wasm]
status: draft
---

# Handoff: Synth Audit Session (April 5-6)

## Session Summary

Massive synth audit session covering 22+ synths. Fixed systemic issues across all WASM synths, deep-audited Monique and ZynAddSubFX parameter mappings, fixed V2 Farbrausch synth byte alignment.

## Synths Verified Working (21)

MdaEPiano, MdaJX10, MdaDX10, DX7, Amsynth, RaffoSynth, SetBfree, SynthV1, TalNoizeMaker, FluidSynth, Monique, VL1, ZynAddSubFX, CalfMono, Aeolus, PinkTrombone, DECtalk, SAM, TR808, TR909, V2 (partial — see below)

## V2 Synth — Needs Real Presets (NEXT SESSION PRIORITY)

### What Works
- WASM loads, noteOn produces audio, noteOff releases (allNotesOff on mono path)
- oscsync byte alignment fixed (was shifting all subsequent bytes by 1, maxpoly read as 0)
- WASM fetch paths fixed (`/v2/V2Synth.wasm` not `/V2Synth.wasm`)
- Store routing: `updateComplexSynthParameters` instead of no-op `updateV2Parameters`
- `loadPatch` no longer calls `synthInit` (was wiping gain state, CC values, filter coeffs)
- `toUnsigned(v + 64)` correctly converts signed transpose/detune to unsigned bytes
- CC7=127 sent after every loadPatch to restore channel volume
- Presets DO change patch bytes (verified in console)

### What's Broken: Presets Sound Wrong/Quiet
- Current presets in `src/constants/v2Presets.ts` are hand-crafted guesses, NOT real V2 patches
- Most presets have very low filter cutoffs (20-50/127) making them inaudible at mid-range notes
- Volume normalization boosted to +12dB as band-aid but doesn't fix the root cause

### Fix: Extract Real Patches from V2M Files
The V2M files contain actual Farbrausch demo patches with correct byte data:
- `src/engine/v2/v2m/pzero_new.v2m` — Farbrausch "pzero" demo
- `src/engine/v2/v2m/v2_zeitmaschine_new.v2m` — Farbrausch "Zeitmaschine" demo

**Strategy:**
1. Parse the V2M file format to extract the patch bank (each V2M has 128 patches)
2. The V2M format starts with a patch bank: `numPatches × patchSize` bytes
3. Each patch is a `V2Sound` struct: `voice[59] + chan[29] + maxpoly + modnum + mods[]`
4. Convert each non-empty patch to a `V2InstrumentConfig` object (reverse of `v2ConfigToBytes`)
5. Name them based on the demo they came from
6. Replace the hand-crafted presets in `v2Presets.ts`

**Reference for V2M format:**
- `src/engine/v2/synth_core.cpp` — V2Sound struct at line 2560
- `v2-synth-wasm/src/sounddef.h:203` — v2initsnd reference bytes
- V2M format: header + patch bank + global params + speech data + note data

### WASM Debug Prints Still Present
The WASM binary in `public/v2/` still has debug printf calls in `synth_core.cpp`:
- `[V2 render]`, `[V2 copy]`, `[V2 core]` spam in console
- Need to remove ALL printf calls from `synth_core.cpp` and rebuild
- Build: `cd v2-synth-wasm/build && emmake make -j4 && cp V2Synth.{js,wasm} ../../public/v2/`

### Linter Keeps Reverting Changes
A linter/agent is actively reverting changes in:
- `src/types/v2Instrument.ts` — `toUnsigned` function gets reverted to broken version
- `src/engine/v2/V2Synth.ts` — fetch paths and triggerRelease get reverted
- `src/stores/useInstrumentStore.ts` — V2 handler reverts to `updateV2Parameters`

**Critical changes that MUST be preserved:**
1. `v2Instrument.ts:751`: `return Math.max(0, Math.min(127, v + 64))` — NO `if (v >= 0 && v <= 127) return v` shortcut
2. `V2Synth.ts:57-58`: fetch paths must include `v2/` subdirectory
3. `V2Synth.ts:169-178`: triggerRelease must send `allNotesOff` for numeric args (mono path)
4. `useInstrumentStore.ts:528`: must use `updateComplexSynthParameters` not `updateV2Parameters`

## Other Fixes Applied This Session

### Systemic: diff-only applyConfig (15 synths)
All WASM synths now only send changed params instead of flooding ALL params on every knob change. Files: MdaEPiano, MdaJX10, MdaDX10, Raffo, AMSynth, VL1, Aeolus, FluidSynth, TalNoizeMaker, Sfizz, ZynAddSubFX, SynthV1, Monique + inner sendConfig methods.

### Systemic: stuck first note prevention (13 synths)
When `triggerRelease` is called before WASM init, the matching pending note is cleared instead of silently dropped. All Zynthian WASM synths fixed.

### Monique — Full PARAM_INDEX Rewrite
- Deleted dead MoniqueParam enum (wrong 0-99 indices, never referenced)
- Rewrote PARAM_INDEX to match C++ MoniqueParams enum exactly (0-119)
- Fixed critical bug: index 4 was `speed: 4` but C++ has `PARAM_SYNC` — was sending BPM 120 to a 0/1 toggle
- Renamed: fmMulti→fmFreq, fmPhase→fmShape, env*Retrigger→env*SusTime
- Removed phantom knobs (no C++ param): env*Velocity, reverbWidth, chorusPan, glideTime
- Added 27 missing params: MFO 1-4, Morph 1-4, Arp, EQ bands
- DEFAULT_MONIQUE rewritten to match C++ PARAM_DEFAULTS exactly
- MoniqueControls.tsx rewritten with correct param names and MFO section
- Hardware UI editorMode fix: `getEditorMode('Monique')` now returns `'moniqueSynth'`

### ZynAddSubFX — Envelope + NoteOff Fix
- Mapped envelope ADSR to correct WASM indices (80-83 amp, 90-93 filter) — were `null`
- Removed phantom effect knobs (reverb damp, chorus depth, distortion type, EQ)
- Fixed noteOff: rebuilt WASM bridge to use `Part::cleanup()` instead of broken `Part::NoteOff(note)`
- diff-only applyConfig to prevent param flooding

### PinkTrombone — eSpeak Freeze Fix
- Root cause: `preloadEspeak()` in constructor triggered synchronous WASM compilation on main thread
- Fix: removed eager preload, eSpeak loads lazily on first speech request
- Fixed noteOff: mono path sends `allNotesOff` instead of misinterpreting time as MIDI note

### Other Fixes
- Global `<select>` auto-blur (97 files, 183 instances) — prevents keyboard focus theft
- Fuzzy instrument browser search — "am synth" finds "amsynth"
- AudioContext cross-context fix — UADE→MOD transitions no longer throw InvalidAccessError
- ImportModuleDialog crash fix — `isPlaying` stub for removed preview feature
- SAM/V2Speech default `singMode: false` — one-shot speech instead of infinite loop
- Amsynth `editorMode` fix — was falling through to vstbridge, losing dedicated controls
- InstrumentList context menu prevention — `onContextMenu={(e) => e.preventDefault()}`

## Broken (Known)
- **Sfizz** — WASM crashes with pthread error, needs rebuild with `-sUSE_PTHREADS=0`
- **Amsynth hardware UI** — WASM knobs don't respond (C++ component tree issue, needs rebuild)
- **CalfMono** — was broken, now working (user verified)

## Not Yet Tested
- C64SID
- V2Speech (fixed default text, untested)
- All Tone.js synths, custom synths, DrumMachine, etc.

## Key Files Modified
| File | Changes |
|------|---------|
| `src/stores/useInstrumentStore.ts` | Amsynth key fix, applyConfig safety guard, V2 routing |
| `src/engine/monique/MoniqueSynth.ts` | Full PARAM_INDEX rewrite, diff-only applyConfig |
| `src/engine/zynaddsubfx/ZynAddSubFXSynth.ts` | diff-only applyConfig, noteOff fix |
| `src/engine/v2/V2Synth.ts` | fetch paths, triggerRelease, applyConfig CC7 |
| `src/types/v2Instrument.ts` | oscsync alignment, toUnsigned, channelVolume |
| `src/engine/pinktrombone/PinkTromboneSynth.ts` | eSpeak preload removal, noteOff fix |
| `src/main.tsx` | Global select auto-blur |
| `public/zynaddsubfx/ZynAddSubFX.worklet.js` | Envelope PARAM_MAP fix |
| `public/zynaddsubfx/ZynAddSubFX.wasm` | Part::cleanup() noteOff |
| `zynaddsubfx-wasm/zasfx_bridge.cpp` | Part::cleanup() for noteOff |
| `v2-synth-wasm/src/v2synth_wasm.cpp` | Removed synthInit from loadPatch, debug prints |
| `v2-synth-wasm/src/synth_core.cpp` | Removed debug printf spam |
| 13 WASM synth engine files | diff-only applyConfig + pending noteOff fix |
| `CLAUDE.md` | Added "Always Fix the Root Cause" rule |
