---
date: 2026-04-03
topic: pixi-instrument-editor-parity
tags: [pixi, instruments, editor, ui-parity]
status: draft
---

# Pixi Instrument Editor — DOM Parity Plan

## Completed (Session 1)
- [x] Layout descriptor routing — PixiSynthPanel used for 40+ synths with layouts
- [x] Browse Synths dialog — categorized browser instead of flat button grid
- [x] Effects panel — add/remove/wet editing functional
- [x] Content area scrollable (overflow: scroll)
- [x] Added `select` control type to declarative layout system
- [x] Expanded toneSynths.ts — Synth/MonoSynth/DuoSynth now have oscillator, filter, pitch envelope, LFO sections
- [x] TB-303 layout expanded — 6 tabs: MAIN, OSC, MOJO, LFO, DEVIL, FX (was 2 tabs)

## Remaining Layout Descriptor Expansions

### Priority 1 — Most-used synths with significant gaps

#### DubSiren (60% → target 95%)
Missing: waveform selects (osc + LFO), filter type/rolloff selects
- [ ] Add `select` for oscillator waveform (sine/square/saw/triangle)
- [ ] Add `select` for LFO waveform
- [ ] Add `select` for filter type (lowpass/highpass/bandpass/notch)
- [ ] Add `select` for filter rolloff (-12/-24/-48/-96)

#### SpaceLaser (65% → target 95%)
Missing: sweep curve select, noise type select, filter type select, reverb section
- [ ] Add `select` for sweep curve (exponential/linear)
- [ ] Add `select` for noise type (white/pink/brown)
- [ ] Add `select` for filter type
- [ ] Add reverb section (enable, decay, wet)

#### Synare (65% → target 90%)
Missing: osc type select, osc2 controls, LFO section, noise color
- [ ] Add tabs (MAIN / MOD)
- [ ] Add `select` for oscillator type (square/pulse)
- [ ] Add osc2 section (enable, mix, detune)
- [ ] Add noise color knob
- [ ] Add LFO section (enable, rate, depth, target select)

#### GranularSynth (70% → target 95%)
Missing: grain envelope, filter, random position
- [ ] Add grain envelope section (attack, release)
- [ ] Add filter section (type select, cutoff, resonance)
- [ ] Add randomPosition knob

#### Sampler (60% → target 80%)
Missing: sample loading, loop point editing
- [ ] (No layout-only fix possible — needs sample editor component)

### Priority 2 — Synths with NO layout descriptors at all

These synths have dedicated DOM controls but no Pixi layout at all:
- [x] MdaEPiano — layouts/mdaEPiano.ts (12 params, 2 tabs: TONE/MOD)
- [x] MdaJX10 — layouts/mdaJX10.ts (24 params, 3 tabs: OSC/VCF/ENV)
- [x] MdaDX10 — layouts/mdaDX10.ts (16 params, 2 tabs: CARRIER/MOD)
- [x] AMSynth (Amsynth) — layouts/amsynth.ts (41 params, 4 tabs: OSC/FILTER/AMP/FX)
- [x] RaffoSynth — layouts/raffo.ts (32 params, 3 tabs: OSC/FILTER/AMP)
- [x] CalfMono — layouts/calfMono.ts (52 params, 3 tabs: OSC/FILTER/LFO)
- [x] SetBfree — layouts/setbfree.ts (53 params, 3 tabs: UPPER/LOWER/LESLIE)
- [x] SynthV1 — layouts/synthv1.ts (100 params, 4 tabs: DCO/DCF/DCA/FX)
- [x] MoniqueSynth — layouts/monique.ts (100 params, 4 tabs: OSC/FILTER/ENV/FX)
- [x] VL1Synth — layouts/vl1.ts (15 params, flat sections)
- [x] TalNoizeMaker — layouts/talNoizeMaker.ts (80 params, 4 tabs: OSC/FILTER/MOD/FX)
- [x] Aeolus — layouts/aeolus.ts (34 params, 4 tabs: GREAT/SWELL/PEDAL/FX)
- [x] FluidSynth — layouts/fluidsynth.ts (15 params, flat sections)
- [x] Sfizz — layouts/sfizz.ts (12 params, flat sections)
- [x] ZynAddSubFX — layouts/zynaddsubfx.ts (71 params, 4 tabs: ADD/SUB/FILTER/FX)
- [x] PinkTrombone — layouts/pinkTrombone.ts (8+2 params, 2 tabs: VOICE/SPEECH)
- [x] DECtalk — layouts/dectalk.ts (4 params, flat)
- [x] SAM — layouts/sam.ts (6 params, flat)

### Priority 3 — Routing gaps

- [x] HivelySynth — added to SONG_ENGINE_SYNTH_TYPES (always routes to NativeInstrumentPanel)
- [x] SunVoxSynth — added to SONG_ENGINE_SYNTH_TYPES (always routes to NativeInstrumentPanel)
- [ ] SuperCollider — Script/Controls tabs work but Controls only shows sliders, not full SC editor (needs CodeMirror in Pixi — feature gap)

### Priority 4 — Feature gaps (not layout-only)

- [x] DX7 patch browser — PixiDX7PatchBrowser.tsx (bank/voice browser, VCED presets)
- [x] Filter visualizations — PixiFilterCurve.tsx + PixiADSRVisualizer.tsx (analytical curve + ADSR shape)
- [x] Hardware UIs — PixiHardwareUI.tsx (WASM framebuffer blit → Pixi Texture, Hardware/Simple toggle)
- [x] Test keyboard at bottom of editor — PixiTestKeyboard.tsx (interactive piano, 2-4 octaves)
- [x] Preset dropdown integrated into editor header — PixiPresetDropdown.tsx (factory presets via PixiSelect)
- [x] Dynamic param panel — PixiDynamicParamPanel.tsx (Buzz, MAME, VSTBridge, WAM runtime discovery)
- [x] Store dispatch fixes — volume, pan, pinkTrombone, dectalk, lfo wiring gaps fixed
- [x] Routing gaps — 5 more synths added to NATIVE_WASM_SYNTH_TYPES, isDynamicParamSynth() catches all remaining

## Approach

For each missing layout, read the DOM controls file and the engine config type to map
every parameter. Create comprehensive layout descriptors with proper sections, tabs,
selects, knobs, and toggles matching the DOM editor.

For synths without any layout, read the DEFAULT_* config from the engine to discover
parameters, then create a new layout file in `src/pixi/views/instruments/layouts/`.
