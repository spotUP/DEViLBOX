# JC303 Implementation Summary

## Overview
Implemented a third TB-303 engine (`JC303`) by compiling the original C++ `Open303` code to WebAssembly using Emscripten. This ensures 1:1 fidelity with the reference C++ implementation, running at native performance in an AudioWorklet.

## Components

### 1. Build System
- **Script:** `scripts/build-jc303.sh`
- **Compiler:** Emscripten (`emcc`)
- **Source:** `Reference Code/jc303-main/src/dsp/open303/`
- **Output:** `public/jc303/JC303.wasm` and `public/jc303/JC303.js`
- **Wrapper:** `src/engine/jc303/JC303Wrapper.cpp` exposes a clean C-style API for the WASM module.

### 2. Audio Engine
- **AudioWorklet:** `public/JC303.worklet.js` runs the WASM code in the audio thread.
- **Synth Class:** `src/engine/jc303/JC303Synth.ts` wraps the worklet in a Tone.js-compatible node.
- **Integration:** Added to `InstrumentFactory.ts` and `ToneEngine.ts`.

### 3. Features
- **Core DSP:** Authentic Open303 filter, envelopes, and oscillator (Saw/Square).
- **Parameters:** Cutoff, Resonance, EnvMod, Decay, Accent, Slide Time, Tuning.
- **Overdrive:** Added Tone.js-based waveshaper overdrive (compatible with existing TB-303 controls).
- **Slide:** Implemented via portamento in Tone.js/Worklet logic.
- **Type:** Added `JC303` to `SynthType` and `SYNTH_INFO` (Bass category).

## Usage
The new engine is available as `JC-303` in the instrument browser. It uses a custom UI (`JC303StyledKnobPanel`) that replicates the original VST aesthetics while using standard web components.

## Technical Details
- **Tuning:** `setTuning` accepts cents (relative to 440Hz) to match ToneEngine automation, but converts to absolute Hz for the Open303 engine.
- **Waveform:** `setWaveform` accepts 'sawtooth'/'square' strings or 0-1 blend values for compatibility.
- **UI:** Custom panel uses absolute positioning to match the reference VST layout.

## Verification
- Build successful: `JC303.wasm` generated.
- Type check passed: Fully typed integration.
- UI: Added to `UnifiedInstrumentEditor` (uses TB-303 mode with custom `isJC303` flag).
