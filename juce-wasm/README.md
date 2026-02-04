# JUCE WASM Synths for DEViLBOX

This directory contains WebAssembly builds of classic synthesizers for use in DEViLBOX.

## Included Synths

### Dexed (DX7 FM Synthesizer)
- **Source**: Based on [Dexed](https://github.com/asb2m10/dexed) by Digital Suburban
- **Engine**: msfa (Music Synthesizer For Android) by Google
- **License**: Apache 2.0 (msfa engine)
- **Features**:
  - 16-voice polyphonic FM synthesis
  - Full DX7 compatibility
  - 32 FM algorithms
  - 6 operators per voice
  - SysEx patch loading (DX7 cartridges)
  - Pitch envelope
  - LFO with 6 waveforms

### OB-Xd (Oberheim Synthesizer)
- **Source**: Based on [OB-Xd](https://github.com/reales/OB-Xd) by discoDSP
- **License**: GPL-3.0
- **Features**:
  - 8-voice polyphonic analog-modeled synthesis
  - Dual oscillators (Saw, Pulse, Triangle, Noise)
  - Hard sync and ring modulation
  - 24dB cascaded lowpass filter
  - Two ADSR envelopes (filter, amp)
  - LFO with 5 waveforms
  - Voice pan spread
  - Analog drift emulation

## Prerequisites

1. **Emscripten SDK** (for compiling C++ to WebAssembly)
   ```bash
   git clone https://github.com/emscripten-core/emsdk.git
   cd emsdk
   ./emsdk install latest
   ./emsdk activate latest
   source ./emsdk_env.sh
   ```

2. **CMake 3.20+**
   ```bash
   # macOS
   brew install cmake

   # Ubuntu/Debian
   sudo apt install cmake
   ```

## Setup

### 1. Download Source Files

For **Dexed**, you need the msfa FM engine:
```bash
# Clone Dexed temporarily
git clone https://github.com/asb2m10/dexed.git /tmp/dexed

# Copy msfa engine
cp -r /tmp/dexed/Source/msfa/* juce-wasm/dexed/msfa/

# Clean up
rm -rf /tmp/dexed
```

For **OB-Xd**, the standalone implementation is already included.
To use the original DSP (optional):
```bash
git clone https://github.com/reales/OB-Xd.git /tmp/obxd
cp -r /tmp/obxd/Source/* juce-wasm/obxd/Source/
rm -rf /tmp/obxd
```

### 2. Build WASM Modules

```bash
# Make sure Emscripten is activated
source /path/to/emsdk/emsdk_env.sh

# Run the build script
./scripts/build-juce-wasm.sh
```

Or build manually:
```bash
cd juce-wasm
mkdir build && cd build
emcmake cmake ..
cmake --build . --parallel
```

### 3. Output Files

After building, the following files are created:
- `public/dexed/Dexed.js` - JavaScript glue code
- `public/dexed/Dexed.wasm` - WebAssembly binary
- `public/obxd/OBXd.js` - JavaScript glue code
- `public/obxd/OBXd.wasm` - WebAssembly binary

The AudioWorklet processors are already in place:
- `public/dexed/Dexed.worklet.js`
- `public/obxd/OBXd.worklet.js`

## Usage in DEViLBOX

### Creating a Dexed (DX7) Synth

```typescript
import { DexedSynth, DX7Param } from '@/engine/dexed';

// Create with default settings
const dx7 = new DexedSynth();

// Or with custom config
const dx7 = new DexedSynth({
  algorithm: 5,
  feedback: 6,
});

// Play a note
dx7.triggerAttack('C4', undefined, 0.8);
dx7.triggerRelease('C4');

// Change algorithm
dx7.setAlgorithm(22);

// Set parameter
dx7.setParameter(DX7Param.FILTER_CUTOFF, 64);

// Load a preset
dx7.loadPreset('E.PIANO 1');

// Load DX7 SysEx patch
const sysexData = new Uint8Array([/* ... */]);
dx7.loadSysEx(sysexData);
```

### Creating an OB-Xd (Oberheim) Synth

```typescript
import { OBXdSynth, OBXdParam, OBXdWaveform } from '@/engine/obxd';

// Create with default settings
const obx = new OBXdSynth();

// Or with custom config
const obx = new OBXdSynth({
  osc1Waveform: OBXdWaveform.SAW,
  osc2Waveform: OBXdWaveform.PULSE,
  filterCutoff: 0.6,
  filterResonance: 0.4,
});

// Play a note
obx.triggerAttack('A3', undefined, 0.9);
obx.triggerRelease('A3');

// Adjust filter
obx.setCutoff(0.5);
obx.setResonance(0.7);

// Load a preset
obx.loadPreset('Classic Brass');

// Set any parameter
obx.setParameter(OBXdParam.LFO_RATE, 0.3);
```

### In InstrumentConfig

```typescript
const instrument: InstrumentConfig = {
  id: 1,
  name: 'DX7 Electric Piano',
  type: 'synth',
  synthType: 'Dexed',
  dexed: {
    algorithm: 5,
    feedback: 6,
    operators: [
      { level: 99, coarse: 1 },
      { level: 70, coarse: 14 },
      // ...
    ],
  },
  volume: -6,
  pan: 0,
  effects: [],
};
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DEViLBOX React UI                        │
│              (TrackerView, InstrumentEditor)                │
└───────────────────────┬─────────────────────────────────────┘
                        │ postMessage
┌───────────────────────▼─────────────────────────────────────┐
│           DexedSynth.ts / OBXdSynth.ts                      │
│   - extends Tone.ToneAudioNode                              │
│   - triggerAttack/Release interface                         │
│   - Parameter mapping to WASM engine                        │
└───────────────────────┬─────────────────────────────────────┘
                        │ AudioWorkletNode.port.postMessage
┌───────────────────────▼─────────────────────────────────────┐
│           Dexed.worklet.js / OBXd.worklet.js                │
│   - extends AudioWorkletProcessor                           │
│   - Loads WASM module                                       │
│   - process() calls WASM render function                    │
└───────────────────────┬─────────────────────────────────────┘
                        │ Emscripten bindings
┌───────────────────────▼─────────────────────────────────────┐
│              Dexed.wasm / OBXd.wasm                         │
│   - C++ synth engine compiled to WebAssembly                │
│   - FM/analog synthesis algorithms                          │
│   - Voice management, envelopes, filters                    │
└─────────────────────────────────────────────────────────────┘
```

## Troubleshooting

### WASM module not loading
- Check browser console for errors
- Ensure WASM files are being served with correct MIME type
- Verify Vite config allows WASM imports

### Audio glitches
- Increase audio buffer size in DEViLBOX settings
- Check if other audio apps are competing for resources
- Try disabling other browser tabs

### Build errors
- Ensure Emscripten is properly activated (`emcc --version`)
- Check CMake version (`cmake --version` >= 3.20)
- For Dexed, verify msfa source files are in place

## License

- **Dexed wrapper**: GPL-3.0
- **msfa engine**: Apache 2.0
- **OB-Xd**: GPL-3.0
- **Common utilities**: MIT

## Credits

- [Digital Suburban](https://asb2m10.github.io/dexed/) - Dexed DX7 plugin
- [Google](https://github.com/google/music-synthesizer-for-android) - msfa FM engine
- [discoDSP](https://www.discodsp.com/obxd/) - OB-Xd synthesizer
- [2Dat](https://obxd.wordpress.com/) - Original OB-Xd author
