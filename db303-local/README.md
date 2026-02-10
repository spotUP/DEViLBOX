# DB303.pages.dev Downloaded Resources

## Overview
This directory contains resources downloaded from https://db303.pages.dev/ for reference and learning purposes.

**Downloaded:** 2026-02-07
**Source:** https://db303.pages.dev/
**GitHub:** https://github.com/dfl/lowenlabs-audio
**Author:** David Lowenfels (Löwen Labs)

## Files

### WASM Binaries
- **db303.wasm** (73KB) - Main DB303 WebAssembly module
- **open303.wasm** (73KB) - Open303 baseline (identical size to db303)
- Both files are identical in size, suggesting db303 is a variant/fork of Open303

### JavaScript
- **db303-index.js** (80KB) - Main application bundle (Vite-built, minified)
- **webaudio-controls.js** (70KB) - Web Audio Controls UI library for knobs/sliders

### Configuration Files
- **default-preset.xml** (1.5KB) - Default synthesizer preset showing full parameter structure
- **default-pattern.xml** (1.4KB) - Default TB-303 pattern/sequence (16 steps)

### Analysis
- **ANALYSIS.md** - Detailed analysis of the implementation, parameters, and features

## Key Learnings

### 1. Comprehensive Parameter Set
The db303 implementation has extensive parameters beyond basic TB-303:

**Core TB-303:**
- Filter: cutoff, resonance, envMod, decay, accent
- Oscillator: waveform (saw/square)

**Extended Features (from preset XML):**
- **Oscillator:** pulseWidth, subOscGain, subOscBlend
- **Devil Fish:** 16 parameters including normalDecay, accentDecay, filterInputDrive, duffingAmount, etc.
- **LFO:** waveform, rate, contour, pitchDepth, pwmDepth, filterDepth
- **Effects:** Chorus, Phaser, Delay (all built-in)

### 2. Pattern Format
Simple XML format with per-step control:
```xml
<step index="0" key="0" octave="0" gate="true" accent="false" slide="false"/>
```

### 3. Architecture
- Single-page HTML application
- Vite-based build system
- WebAssembly audio engine (Open303-based)
- Web Audio API + AudioWorklet
- WebGL visualizer
- Web Audio Controls for UI

### 4. Comparison to Our Implementation

**What we have:**
✅ Core TB-303 parameters
✅ Basic Devil Fish parameters
✅ WASM audio engine (Open303)
✅ AudioWorklet processing
✅ Tone.js integration

**What db303.pages.dev has that we don't:**
❌ LFO system with multiple destinations
❌ Built-in effects (chorus, phaser, delay)
❌ Pulse width modulation
❌ Sub-oscillator
❌ Extended Devil Fish parameters (duffingAmount, lpBpMix, ensembleAmount, etc.)
❌ Filter mode selection
❌ Pattern sequencer with XML import/export
❌ WebGL visualizer

### 5. Notable Parameters We Should Add

**High Priority:**
1. **LFO System** - Major feature gap
   - pitchDepth, pwmDepth, filterDepth
   - waveform selection, rate, contour

2. **Extended Devil Fish:**
   - `duffingAmount` - Non-linear filter effect
   - `lpBpMix` - Lowpass/Bandpass mix
   - `resTracking` - Resonance tracking across frequency
   - `passbandCompensation` - Filter passband compensation
   - `oversamplingOrder` - Configurable oversampling

**Medium Priority:**
3. **Oscillator Enhancements:**
   - `pulseWidth` - PWM control
   - `subOscGain` / `subOscBlend` - Sub-oscillator

4. **Built-in Effects:**
   - Chorus with mode selection
   - Phaser with rate/width/feedback
   - Stereo delay with tone control

## How to Use These Resources

### For Development:
1. **Reference Implementation** - Study parameter structure and organization
2. **Feature Comparison** - Identify gaps in our implementation
3. **Preset Conversion** - Convert their XML presets to our JSON format
4. **WASM Analysis** - Compare exported functions and API surface

### For Testing:
1. **Load presets** in db303.pages.dev and compare sound to our implementation
2. **Test patterns** to validate our sequencer logic
3. **Parameter mapping** - Verify our parameters work the same way

### For Learning:
1. **Study the preset XML** to understand full Devil Fish parameter set
2. **Examine pattern format** for sequencer implementation ideas
3. **Analyze WASM size** to understand optimization opportunities

## Next Steps

1. ✅ Download and catalog resources
2. ✅ Analyze parameter structure
3. ✅ Document feature gaps
4. ⬜ Decompile/analyze WASM to understand implementation details
5. ⬜ Test parameter mapping between implementations
6. ⬜ Implement priority features (LFO, missing Devil Fish params)
7. ⬜ Convert XML presets to our format

## Technical Notes

### WASM Module Analysis
- Size: 73KB (both db303.wasm and open303.wasm)
- Likely using Emscripten for compilation
- Appears to be C++ codebase (rosic/Open303 based)
- No SIMD version found (site mentions SIMD but standard build is 73KB)

### Build System
- Vite for bundling
- No source maps in production build
- Minified JavaScript (80KB bundle)
- Single HTML file with external assets

### Web Audio Implementation
- Uses AudioWorklet (modern approach)
- Web Audio Controls library for UI
- WebGL for visualization
- Direct WASM audio processing (no Tone.js layer)

## References
- Live Site: https://db303.pages.dev/
- GitHub: https://github.com/dfl/lowenlabs-audio
- Author: David Lowenfels
- Based on: Open303 (rosic library)
- Inspired by: JC-303, TB-303 hardware
