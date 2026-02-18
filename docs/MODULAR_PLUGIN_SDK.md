# DEViLBOX Modular Plugin SDK

Build custom modules for the DEViLBOX modular synthesis system. Create oscillators, filters, effects, and more using Web Audio API and the ModuleDescriptor interface.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Module Architecture](#module-architecture)
- [Signal Types](#signal-types)
- [Voice Modes](#voice-modes)
- [Port System](#port-system)
- [Parameter System](#parameter-system)
- [Complete Example](#complete-example)
- [Built-in Modules Reference](#built-in-modules-reference)
- [Best Practices](#best-practices)
- [Debugging](#debugging)

## Overview

The DEViLBOX modular system uses a **descriptor-based plugin architecture**:

1. **ModuleDescriptor** - Blueprint/metadata for a module type
2. **ModuleInstance** - Runtime instantiation with audio nodes
3. **ModuleRegistry** - Global registry for all available modules

Modules are **pure Web Audio** - no WASM, no external dependencies required.

## Quick Start

Create a simple gain module in 5 minutes:

```typescript
// src/engine/modular/modules/MyGainModule.ts
import type { ModuleDescriptor, ModuleInstance, ModulePort } from '../../../types/modular';

export const MyGainDescriptor: ModuleDescriptor = {
  id: 'MyGain',
  name: 'My Gain',
  category: 'utility',
  voiceMode: 'per-voice',
  color: '#3b82f6', // Optional color for UI

  ports: [
    { id: 'input', name: 'Input', direction: 'input', signal: 'audio' },
    { id: 'output', name: 'Output', direction: 'output', signal: 'audio' },
  ],

  parameters: [
    { id: 'gain', name: 'Gain', min: 0, max: 2, default: 1.0, unit: 'x' },
  ],

  create: (ctx: AudioContext): ModuleInstance => {
    const input = ctx.createGain();
    const output = ctx.createGain();

    input.connect(output);
    output.gain.value = 1.0;

    const ports = new Map<string, ModulePort>([
      ['input', { id: 'input', name: 'Input', direction: 'input', signal: 'audio', node: input }],
      ['output', { id: 'output', name: 'Output', direction: 'output', signal: 'audio', node: output }],
    ]);

    return {
      descriptorId: 'MyGain',
      ports,

      setParam: (paramId: string, value: number) => {
        if (paramId === 'gain') {
          output.gain.value = value;
        }
      },

      getParam: (paramId: string) => {
        if (paramId === 'gain') return output.gain.value;
        return 0;
      },

      dispose: () => {
        input.disconnect();
        output.disconnect();
      },
    };
  },
};
```

## Module Architecture

### ModuleDescriptor (Blueprint)

The descriptor is **immutable metadata** registered once at startup:

```typescript
interface ModuleDescriptor {
  id: string;                    // Unique identifier (e.g., 'VCO', 'MyReverb')
  name: string;                  // Display name
  category: ModuleCategory;       // Source, filter, amplifier, modulator, envelope, utility, io
  voiceMode: VoiceMode;          // 'per-voice' or 'shared'
  color?: string;                // UI color (hex)
  ports: ModulePortDef[];        // Port definitions
  parameters: ModuleParamDef[];  // Parameter definitions
  create: (ctx: AudioContext) => ModuleInstance;  // Factory function
}
```

### ModuleInstance (Runtime)

The instance is **created dynamically** for each voice or shared globally:

```typescript
interface ModuleInstance {
  descriptorId: string;
  ports: Map<string, ModulePort>;
  setParam: (paramId: string, value: number) => void;
  getParam: (paramId: string) => number;
  gateOn?: (time: number, velocity: number) => void;  // Optional: for envelopes
  gateOff?: (time: number) => void;                   // Optional: for envelopes
  dispose: () => void;
}
```

## Signal Types

Four signal types for routing:

| Type | Purpose | Example |
|------|---------|---------|
| `audio` | Audio-rate signals | VCO output → VCF input |
| `cv` | Control voltage (modulation) | LFO → VCO pitch |
| `gate` | On/off triggers | ADSR gate → envelope |
| `trigger` | One-shot impulses | Clock → sequencer |

Audio and CV use `AudioNode`, gate/trigger use `AudioParam` or custom handling.

## Voice Modes

### Per-Voice Modules

Created **once per voice** (polyphonic):
- **Sources**: VCO, Noise
- **Filters**: VCF
- **Amplifiers**: VCA
- **Envelopes**: ADSR

```typescript
voiceMode: 'per-voice'
```

Each voice gets its own module instance with isolated state.

### Shared Modules

Created **once globally** (shared across all voices):
- **Modulators**: LFO
- **Effects**: Reverb, Delay
- **Utility**: Output

```typescript
voiceMode: 'shared'
```

Single instance serves all voices simultaneously.

## Port System

### Input Ports

Connect to receive signals:

```typescript
// Audio input
const input = ctx.createGain();
{
  id: 'input',
  name: 'Input',
  direction: 'input',
  signal: 'audio',
  node: input  // AudioNode to receive connections
}

// CV input (modulation)
const osc = ctx.createOscillator();
{
  id: 'pitch',
  name: 'Pitch CV',
  direction: 'input',
  signal: 'cv',
  param: osc.frequency  // AudioParam to receive modulation
}
```

### Output Ports

Connect to send signals:

```typescript
// Audio output
const output = ctx.createGain();
{
  id: 'output',
  name: 'Output',
  direction: 'output',
  signal: 'audio',
  node: output  // AudioNode that outputs signal
}

// CV output
const lfo = ctx.createOscillator();
{
  id: 'cv',
  name: 'CV Out',
  direction: 'output',
  signal: 'cv',
  node: lfo  // Sends modulation signal
}
```

## Parameter System

### Parameter Definition

Define parameters in the descriptor:

```typescript
parameters: [
  {
    id: 'cutoff',
    name: 'Cutoff',
    min: 0,           // Normalized range 0-1
    max: 1,
    default: 0.5,
    unit: 'Hz',       // Optional unit for UI
    curve: 'exponential'  // Optional: linear, exponential, logarithmic
  }
]
```

### Parameter Implementation

Implement `setParam` and `getParam`:

```typescript
setParam: (paramId: string, value: number) => {
  switch (paramId) {
    case 'cutoff':
      // Map normalized 0-1 to real frequency range
      const hz = 20 * Math.pow(1000, value); // 20Hz to 20kHz exponential
      filter.frequency.value = hz;
      break;
  }
}

getParam: (paramId: string) => {
  switch (paramId) {
    case 'cutoff':
      // Return normalized 0-1 value
      return Math.log(filter.frequency.value / 20) / Math.log(1000);
    default:
      return 0;
  }
}
```

**IMPORTANT**: Always work with **normalized 0-1 values** in setParam/getParam. Map to real ranges internally.

## Complete Example

### Custom Wavefolder Module

```typescript
import type { ModuleDescriptor, ModuleInstance, ModulePort } from '../../../types/modular';

export const WavefolderDescriptor: ModuleDescriptor = {
  id: 'Wavefolder',
  name: 'Wave Folder',
  category: 'utility',
  voiceMode: 'per-voice',
  color: '#f59e0b',

  ports: [
    { id: 'input', name: 'Input', direction: 'input', signal: 'audio' },
    { id: 'fold', name: 'Fold CV', direction: 'input', signal: 'cv' },
    { id: 'output', name: 'Output', direction: 'output', signal: 'audio' },
  ],

  parameters: [
    { id: 'amount', name: 'Amount', min: 0, max: 1, default: 0.5 },
    { id: 'symmetry', name: 'Symmetry', min: 0, max: 1, default: 0.5 },
  ],

  create: (ctx: AudioContext): ModuleInstance => {
    const input = ctx.createGain();
    const folder = ctx.createWaveShaper();
    const output = ctx.createGain();
    const foldCV = ctx.createGain();

    // Initialize
    output.gain.value = 1.0;
    foldCV.gain.value = 1.0;
    folder.oversample = '4x';

    // Create folding curve
    let foldAmount = 0.5;
    let symmetry = 0.5;

    function updateCurve() {
      const samples = 512;
      const curve = new Float32Array(samples);
      const folds = 1 + foldAmount * 8; // 1 to 9 folds

      for (let i = 0; i < samples; i++) {
        let x = (i * 2) / samples - 1;

        // Apply symmetry (bias)
        x += (symmetry - 0.5) * 0.5;

        // Wave folding formula
        let y = Math.sin(x * Math.PI * folds);

        curve[i] = y;
      }

      folder.curve = curve;
    }

    updateCurve();

    // Routing
    input.connect(folder);
    folder.connect(output);

    // CV modulation (fold amount)
    foldCV.connect(folder); // Note: WaveShaper doesn't have direct CV input
                            // In practice, you'd need more complex routing

    const ports = new Map<string, ModulePort>([
      ['input', { id: 'input', name: 'Input', direction: 'input', signal: 'audio', node: input }],
      ['fold', { id: 'fold', name: 'Fold CV', direction: 'input', signal: 'cv', node: foldCV }],
      ['output', { id: 'output', name: 'Output', direction: 'output', signal: 'audio', node: output }],
    ]);

    return {
      descriptorId: 'Wavefolder',
      ports,

      setParam: (paramId: string, value: number) => {
        switch (paramId) {
          case 'amount':
            foldAmount = value;
            updateCurve();
            break;

          case 'symmetry':
            symmetry = value;
            updateCurve();
            break;
        }
      },

      getParam: (paramId: string) => {
        switch (paramId) {
          case 'amount':
            return foldAmount;
          case 'symmetry':
            return symmetry;
          default:
            return 0;
        }
      },

      dispose: () => {
        input.disconnect();
        folder.disconnect();
        foldCV.disconnect();
        output.disconnect();
      },
    };
  },
};
```

### Register Your Module

Add to `src/engine/modular/modules/index.ts`:

```typescript
import { WavefolderDescriptor } from './WavefolderModule';

const builtInModules = [
  // ... existing modules
  WavefolderDescriptor,
];

export { WavefolderDescriptor };
```

## Built-in Modules Reference

Study these for examples:

### Basic Modules
- **VCO**: Oscillator with waveforms, detune, octave
- **VCF**: Resonant filter with cutoff and resonance
- **VCA**: Voltage-controlled amplifier
- **ADSR**: Attack-decay-sustain-release envelope

### Modulation
- **LFO**: Low-frequency oscillator
- **Arpeggiator**: MIDI arpeggiator with patterns

### Effects
- **Delay**: Simple delay line
- **Reverb**: Feedback delay network reverb
- **Waveshaper**: Saturation/distortion with curve types
- **Compressor**: Dynamics compression
- **Ring Modulator**: Ring modulation

### Utility
- **Mixer**: Multi-input mixer
- **Sample & Hold**: Sample and hold circuit

## Best Practices

### 1. Resource Management

Always disconnect nodes in `dispose()`:

```typescript
dispose: () => {
  input.disconnect();
  output.disconnect();
  // Stop any oscillators/sources
  if (osc) {
    osc.stop();
    osc.disconnect();
  }
}
```

### 2. Parameter Normalization

Use 0-1 range, map internally:

```typescript
// ❌ BAD: Exposing raw frequency
setParam: (id, value) => {
  filter.frequency.value = value; // What range? 20? 20000?
}

// ✅ GOOD: Normalized with clear mapping
setParam: (id, value) => {
  const hz = 20 * Math.pow(1000, value); // 0-1 → 20Hz-20kHz
  filter.frequency.value = hz;
}
```

### 3. Voice Mode Selection

- **Per-voice** if state must be isolated (oscillators, filters, envelopes)
- **Shared** if state is global (effects, LFOs, output)

### 4. Oversample for Distortion

Use oversampling for waveshapers to reduce aliasing:

```typescript
waveshaper.oversample = '4x'; // or '2x', 'none'
```

### 5. Exponential Scaling

Use exponential curves for frequency/time parameters:

```typescript
// Frequency (sounds exponential to our ears)
const hz = minHz * Math.pow(maxHz / minHz, value);

// Time (feels exponential)
const seconds = minSec * Math.pow(maxSec / minSec, value);
```

## Debugging

### Enable Module Logging

```typescript
create: (ctx: AudioContext): ModuleInstance => {
  console.log(`[${descriptorId}] Creating instance`);

  return {
    setParam: (id, value) => {
      console.log(`[${descriptorId}] setParam(${id}, ${value})`);
      // ...
    },
    // ...
  };
}
```

### Test in Isolation

Create test patches with minimal connections to verify module behavior.

### Check Audio Graph

Use Chrome DevTools → Media tab to inspect the audio graph.

## Advanced Topics

### Custom Gate/Trigger Handling

Implement `gateOn` and `gateOff` for envelopes:

```typescript
gateOn: (time: number, velocity: number) => {
  // Trigger attack phase
  envelope.gain.cancelScheduledValues(time);
  envelope.gain.setValueAtTime(0, time);
  envelope.gain.linearRampToValueAtTime(velocity, time + attack);
},

gateOff: (time: number) => {
  // Trigger release phase
  const current = envelope.gain.value;
  envelope.gain.cancelScheduledValues(time);
  envelope.gain.setValueAtTime(current, time);
  envelope.gain.linearRampToValueAtTime(0, time + release);
}
```

### Polyphonic Connections

Per-voice modules automatically get routed correctly. The `ModularVoice` class handles voice allocation.

### Shared Module State

Shared modules (like LFO) output to all voices simultaneously. Use `ConstantSourceNode` for CV:

```typescript
const cvOut = ctx.createConstantSource();
cvOut.start();
// All voices can connect to cvOut.offset (AudioParam)
```

## Need Help?

- **Examples**: Check `src/engine/modular/modules/` for all built-in modules
- **Types**: See `src/types/modular.ts` for complete type definitions
- **Issues**: Report bugs at [github.com/spotUP/DEViLBOX/issues](https://github.com/spotUP/DEViLBOX/issues)

---

**Happy patching! 🎛️**
