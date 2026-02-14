# DEViLBOX Plugin SDK

Guide for adding synths, effects, and UI controls to DEViLBOX.

---

## Architecture Overview

DEViLBOX uses a three-layer stack for synth/effect management:

```
SynthDescriptor / EffectDescriptor  (metadata + factory)
         |
SynthRegistry / EffectRegistry      (discovery + lazy loading)
         |
DevilboxSynth / ToneAudioNode       (runtime instances)
```

**Audio routing:** Synths either output through the Amiga-style filter chain (`masterInput`) or bypass it via `synthBus` (native Web Audio synths). Effects are inserted between the synth and the channel output.

```
Tone.js synth --> AmigaFilter --> channelGain --> masterBus
DevilboxSynth --> synthBus ----------------------> masterBus
                     |
              [effect chain]
```

---

## Quick Start: Add a Synth in 5 Steps

### 1. Implement `DevilboxSynth` (`src/types/synth.ts`)

```typescript
import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToFrequency, audioNow } from '@/utils/audio-context';

export class MySynth implements DevilboxSynth {
  readonly name = 'MySynth';
  readonly output: GainNode;

  constructor(config: MyConfig) {
    const ctx = getDevilboxAudioContext();
    this.output = ctx.createGain();
    // ... set up audio nodes
  }

  triggerAttack(note: string | number, time?: number, velocity?: number) {
    const freq = typeof note === 'string' ? noteToFrequency(note) : note;
    // ... start sound
  }

  triggerRelease(note?: string | number, time?: number) {
    // ... stop sound
  }

  set(param: string, value: number) { /* real-time parameter control */ }
  get(param: string): number | undefined { return undefined; }
  dispose() { /* clean up all AudioNodes */ }
}
```

### 2. Add to `SynthType` union (`src/types/instrument.ts`)

```typescript
export type SynthType =
  | 'Synth'
  // ...existing types...
  | 'MySynth'   // <-- add here
```

### 3. Add config type + defaults (`src/types/instrument.ts`)

```typescript
export interface MyConfig { /* ... */ }
export const DEFAULT_MY_SYNTH: MyConfig = { /* ... */ };

// In InstrumentConfig interface:
export interface InstrumentConfig {
  // ...
  mySynth?: MyConfig;
}
```

### 4. Register with SynthRegistry

Create `src/engine/registry/sdk/mysynth.ts`:

```typescript
import { SynthRegistry } from '../SynthRegistry';
import { MySynth } from '../../mysynth/MySynth';
import { DEFAULT_MY_SYNTH } from '@/types/instrument';

SynthRegistry.register({
  id: 'MySynth',
  name: 'My Synth',
  category: 'native',
  loadMode: 'lazy',
  volumeOffsetDb: 0,
  useSynthBus: true,
  create: (config) => new MySynth(config.mySynth || DEFAULT_MY_SYNTH),
});
```

Add lazy loader in `src/engine/registry/sdk/index.ts`:

```typescript
SynthRegistry.registerLazy(
  ['MySynth'],
  () => import('./mysynth').then(() => {}),
);
```

### 5. Add to `SYNTH_INFO` (`src/constants/synthCategories.ts`)

```typescript
MySynth: {
  type: 'MySynth', name: 'My Synth', shortName: 'My',
  description: 'Description here',
  bestFor: ['Use case 1', 'Use case 2'],
  icon: 'Music2', color: 'text-blue-400',
},
```

That's it! The synth will appear in the instrument dropdown, be lazy-loaded on first use, and work with the effect chain and tracker.

---

## SynthDescriptor Reference

```typescript
interface SynthDescriptor {
  id: string;              // Must match SynthType union
  name: string;            // UI display name
  category: SynthCategory; // 'tone' | 'wasm' | 'wam' | 'native'
  loadMode: LoadMode;      // 'eager' | 'lazy'

  // Factory
  create: (config: InstrumentConfig) => ToneAudioNode | DevilboxSynth;

  // Audio
  volumeOffsetDb?: number;    // dB offset for volume normalization
  useSynthBus?: boolean;      // true = bypass AmigaFilter (auto for DevilboxSynth)
  sharedInstance?: boolean;   // true = one instance across all channels

  // Trigger hooks (replace instanceof checks in ToneEngine)
  onTriggerAttack?: (synth, note, time, velocity, opts) => boolean;
  onTriggerRelease?: (synth, note, time, opts) => boolean;

  // UI
  controlsComponent?: string;    // Component name for custom editor
  hardwareComponent?: string;    // Hardware UI overlay name

  // Metadata
  parameters?: ParameterDef[];   // Declarative parameter definitions
  presetIds?: string[];
  romConfig?: RomConfig;         // ROM requirements
}
```

## SynthRegistry API

```typescript
class SynthRegistry {
  static register(desc: SynthDescriptor | SynthDescriptor[]): void;
  static registerLazy(ids: string[], loader: () => Promise<void>): void;
  static get(id: string): SynthDescriptor | undefined;        // No lazy loading
  static async ensure(id: string): Promise<SynthDescriptor | undefined>; // Triggers lazy
  static has(id: string): boolean;    // Registered only
  static knows(id: string): boolean;  // Registered OR has lazy loader
  static getAllIds(): string[];
  static getAll(): SynthDescriptor[];
}
```

---

## Integration Paths

### Tone.js Synths (category: `tone`)

Return a `Tone.PolySynth`, `Tone.MonoSynth`, etc. from `create()`. These route through the AmigaFilter.

Reference: `src/engine/registry/builtin/tone.ts`

### Native Web Audio (category: `native`)

Implement `DevilboxSynth`. Use `getDevilboxAudioContext()` for the AudioContext. These route to `synthBus` (bypass AmigaFilter).

Reference: `src/engine/DubSirenSynth.ts`, `src/engine/WavetableSynth.ts`, `src/engine/harmonic/HarmonicSynth.ts`

### WASM/AudioWorklet (category: `wasm`)

Create an `AudioWorkletNode` + load WASM binary. Typically extends `Tone.ToneAudioNode` for Tone.js graph compatibility but uses native DSP internally.

Reference: `src/engine/db303/DB303Synth.ts`, `src/engine/effects/MoogFilterEffect.ts`

### VSTBridge (category: `wasm`, zero-code)

Add an entry to `src/engine/vstbridge/synth-registry.ts`. The VSTBridge framework handles WASM loading, parameter mapping, and UI generation automatically.

```typescript
// In synth-registry.ts:
SYNTH_REGISTRY.set('MyVST', {
  synthType: 'MyVST',
  wasmPath: '/myvst/MyVST.wasm',
  workletPath: '/myvst/MyVST.worklet.js',
  // ...parameter definitions
});
```

Reference: `src/engine/vstbridge/synth-registry.ts`

### WAM 2.0 (category: `wam`)

Wrap a Web Audio Module 2.0 plugin using `WAMSynth` or `WAMEffectNode`.

Reference: `src/engine/registry/sdk/wam.ts`, `src/engine/wam/WAMSynth.ts`

---

## EffectDescriptor Reference

```typescript
interface EffectDescriptor {
  id: string;              // Must match AudioEffectType union
  name: string;            // UI display name
  category: EffectCategory; // 'tonejs' | 'wasm' | 'wam' | 'neural' | 'buzzmachine'
  group: string;           // UI group: 'Distortion', 'Filter', 'Reverb & Delay', etc.
  description?: string;
  loadMode: LoadMode;      // 'eager' | 'lazy'

  create: (config: EffectConfig) => Promise<ToneAudioNode | DevilboxSynth>;
  getDefaultParameters: () => Record<string, number | string>;

  parameters?: ParameterDef[];
  editorComponent?: string;
  bpmSyncParams?: string[];  // Keys that support BPM sync
}
```

## EffectRegistry API

```typescript
class EffectRegistry {
  static register(desc: EffectDescriptor | EffectDescriptor[]): void;
  static registerLazy(ids: string[], loader: () => Promise<void>): void;
  static get(id: string): EffectDescriptor | undefined;
  static async ensure(id: string): Promise<EffectDescriptor | undefined>;
  static has(id: string): boolean;
  static knows(id: string): boolean;
  static getAllIds(): string[];
  static getAll(): EffectDescriptor[];
  static getByGroup(group: string): EffectDescriptor[];
  static getByCategory(category: string): EffectDescriptor[];
}
```

### Adding an Effect

1. Add to `AudioEffectType` union in `src/types/instrument.ts`
2. Create a registration file in `src/engine/registry/effects/`
3. Add eager import or lazy loader in `src/engine/registry/effects/index.ts`

The registry lookup in `InstrumentFactory.createEffect()` and `getDefaultEffectParameters()` happens automatically before the switch fallback.

---

## Design System

### Core Controls

**`<Knob>`** (`src/components/controls/Knob.tsx`)

```tsx
<Knob
  value={0.5} min={0} max={1} onChange={(v) => {}}
  label="Cutoff" unit="Hz" size="sm" color="#00ffff"
  logarithmic    // frequency-like scaling
  bipolar        // center indicator at midpoint
  defaultValue={0.5} // double-click reset target
  formatValue={(v) => `${v.toFixed(1)}`}
/>
```

Props: `value`, `min`, `max`, `onChange`, `label?`, `unit?`, `size?` (`'sm'|'md'|'lg'`), `color?`, `logarithmic?`, `bipolar?`, `defaultValue?`, `formatValue?`, `disabled?`, `step?`

**`<Toggle>`** (`src/components/controls/Toggle.tsx`)

```tsx
<Toggle label="Enable" value={true} onChange={(v) => {}} color="#00ffff" />
```

**`<Switch3Way>`** (`src/components/controls/Switch3Way.tsx`)

```tsx
<Switch3Way label="Mode" value="center" options={['a', 'b', 'c']} labels={['A', 'B', 'C']} onChange={(v) => {}} />
```

### Editor Infrastructure

- **`EditorHeader`** — Common header with synth dropdown, visualization, level meter
- **`SynthEditorTabs`** — Tab bar (oscillator, envelope, filter, effects, etc.)
- **`TestKeyboard`** — Clickable keyboard for note preview
- **`EffectChain`** — Drag-and-drop effect chain editor

### Hardware UI

```tsx
import { HardwareUIWrapper, hasHardwareUI } from '../hardware/HardwareUIWrapper';

if (hasHardwareUI(synthType)) {
  return <HardwareUIWrapper synthType={synthType} instrument={instrument} onChange={onChange} />;
}
```

Add to `HARDWARE_UI_MAP` in `HardwareUIWrapper.tsx` to register a hardware UI overlay.

### Visualization

- `InstrumentOscilloscope` / `ChannelOscilloscope` — Waveform display
- `InstrumentSpectrum` — FFT spectrum
- `FilterCurve` — Filter frequency response
- `VisualizerFrame` — Container with mode switching

### Theme Awareness

```tsx
import { useThemeStore } from '@stores';

const currentThemeId = useThemeStore((s) => s.currentThemeId);
const isCyanTheme = currentThemeId === 'cyan-lineart';
const knobColor = isCyanTheme ? '#00ffff' : '#4ade80';
```

---

## Parameter System

### ParameterDef (declarative UI)

```typescript
interface ParameterDef {
  key: string;
  label: string;
  group?: string;    // Section grouping
  type: 'knob' | 'select' | 'toggle' | 'text';
  min?: number;
  max?: number;
  default: number;
  options?: { value: number; label: string }[];
}
```

**ChipSynthControls** (`src/components/instruments/controls/ChipSynthControls.tsx`) auto-renders knobs/selects/toggles from `ParameterDef[]` metadata. For MAME chip synths, define parameters in `src/constants/chipParameters.ts`.

---

## Presets

### Factory Presets

```typescript
// src/constants/myPresets.ts
import type { InstrumentPreset } from '@/types/instrument';

export const MY_PRESETS: InstrumentPreset[] = [
  {
    id: 'my-preset-1',
    name: 'Preset Name',
    synthType: 'MySynth',
    config: { mySynth: { /* ... */ } },
  },
];
```

Register in `FACTORY_PRESETS` map. The `PresetDropdown` component automatically shows presets for the current synth type.

---

## Modular Synth SDK

DEViLBOX's modular synthesis system allows plugin developers to create custom modules that can be patched together in a visual editor. Unlike traditional synths, modular synths are built from discrete processing units (VCO, VCF, VCA, ADSR, etc.) connected via virtual patch cables.

### Architecture

```
ModuleDescriptor  (metadata + port defs + factory)
       |
ModuleRegistry    (discovery)
       |
ModularSynth      (runtime engine — implements DevilboxSynth)
  ├── ModularVoice[]      (per-voice module graphs)
  ├── sharedModules       (LFO, Noise — one instance)
  └── connectionManager   (hot-swap connections)
```

**Audio routing:** Each voice's Output module → voice GainNode → ModularSynth.output → synthBus → masterBus

**Signal types:**
- `audio` — AudioNode→AudioNode (oscillators, filters, amplifiers)
- `cv` — AudioNode→AudioParam via GainNode scaler (control voltage, 0-1)
- `gate` — ConstantSource 0/1 (note on/off)
- `trigger` — One-shot pulse (for clocking/sequencing)

**Polyphony:** Per-voice graph cloning. VCO/VCF/VCA/ADSR cloned per voice (1-8 voices). LFO/Noise shared across voices.

### Creating a Module

#### 1. Define `ModuleDescriptor`

```typescript
import type { ModuleDescriptor, ModuleInstance, ModulePort } from '@/types/modular';
import { ModuleRegistry } from '@/engine/modular/ModuleRegistry';

const MyModuleDescriptor: ModuleDescriptor = {
  id: 'MyModule',
  name: 'My Module',
  category: 'filter', // 'source' | 'filter' | 'amplifier' | 'modulator' | 'envelope' | 'utility' | 'io'
  voiceMode: 'per-voice', // or 'shared' for global modules (LFO, Noise)
  color: '#4f46e5', // Optional UI accent color

  ports: [
    {
      id: 'input',
      name: 'In',
      direction: 'input',
      signal: 'audio',
    },
    {
      id: 'cutoff',
      name: 'Cutoff',
      direction: 'input',
      signal: 'cv',
    },
    {
      id: 'output',
      name: 'Out',
      direction: 'output',
      signal: 'audio',
    },
  ],

  parameters: [
    {
      id: 'frequency',
      name: 'Frequency',
      min: 20,
      max: 20000,
      default: 1000,
      unit: 'Hz',
      curve: 'exponential', // or 'linear'
    },
    {
      id: 'resonance',
      name: 'Resonance',
      min: 0,
      max: 10,
      default: 1,
    },
  ],

  create: (ctx: AudioContext) => {
    // Return ModuleInstance with ports and parameter control
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000;
    filter.Q.value = 1;

    const ports: Map<string, ModulePort> = new Map();

    // Audio input port
    ports.set('input', {
      id: 'input',
      name: 'In',
      direction: 'input',
      signal: 'audio',
      node: filter, // Connect here
    });

    // CV input port (for modulation)
    const cutoffScale = ctx.createGain();
    cutoffScale.gain.value = 10000; // Scale CV (0-1) to Hz range
    cutoffScale.connect(filter.frequency);

    ports.set('cutoff', {
      id: 'cutoff',
      name: 'Cutoff',
      direction: 'input',
      signal: 'cv',
      param: cutoffScale.gain, // CV targets AudioParam
      scaleNode: cutoffScale,
    });

    // Audio output port
    ports.set('output', {
      id: 'output',
      name: 'Out',
      direction: 'output',
      signal: 'audio',
      node: filter, // Connect from here
    });

    return {
      ports,

      setParameter: (paramId: string, value: number) => {
        if (paramId === 'frequency') {
          filter.frequency.value = value;
        } else if (paramId === 'resonance') {
          filter.Q.value = value;
        }
      },

      getParameter: (paramId: string) => {
        if (paramId === 'frequency') return filter.frequency.value;
        if (paramId === 'resonance') return filter.Q.value;
        return 0;
      },

      dispose: () => {
        cutoffScale.disconnect();
        filter.disconnect();
      },
    };
  },
};

// Register the module
ModuleRegistry.register(MyModuleDescriptor);
```

#### 2. Port Types and Routing

**Audio Ports** (signal: 'audio'):
```typescript
// Output
ports.set('output', {
  id: 'output',
  name: 'Out',
  direction: 'output',
  signal: 'audio',
  node: oscillator, // Source node
});

// Input
ports.set('input', {
  id: 'input',
  name: 'In',
  direction: 'input',
  signal: 'audio',
  node: filter, // Destination node
});

// Connection: sourcePort.node.connect(targetPort.node)
```

**CV Ports** (signal: 'cv'):
```typescript
// Output
ports.set('output', {
  id: 'output',
  name: 'Out',
  direction: 'output',
  signal: 'cv',
  node: lfo, // ConstantSource or OscillatorNode
});

// Input
const scaleGain = ctx.createGain();
scaleGain.gain.value = 100; // Scale factor
scaleGain.connect(filter.frequency); // Target AudioParam

ports.set('cutoff', {
  id: 'cutoff',
  name: 'Cutoff CV',
  direction: 'input',
  signal: 'cv',
  param: scaleGain.gain,
  scaleNode: scaleGain,
});

// Connection: sourcePort.node.connect(targetPort.scaleNode)
```

**Gate Ports** (signal: 'gate'):
```typescript
// ADSR envelope triggers on gate signal (0 = off, 1 = on)
gateOn: (time: number, velocity: number) => {
  envelope.offset.cancelScheduledValues(time);
  envelope.offset.setValueAtTime(0, time);
  envelope.offset.linearRampToValueAtTime(1, time + attack);
  envelope.offset.linearRampToValueAtTime(sustain, time + attack + decay);
}

gateOff: (time: number) => {
  envelope.offset.cancelScheduledValues(time);
  envelope.offset.setValueAtTime(envelope.offset.value, time);
  envelope.offset.linearRampToValueAtTime(0, time + release);
}
```

#### 3. Voice Modes

**Per-voice modules** (voiceMode: 'per-voice'):
- Cloned for each voice (VCO, VCF, VCA, ADSR)
- Receive note-specific pitch/gate signals
- Examples: oscillators, filters, amplifiers, envelopes

**Shared modules** (voiceMode: 'shared'):
- Single instance across all voices (LFO, Noise, Delay)
- Used for global modulation or effects
- Examples: LFOs, noise generators, global effects

#### 4. Module Categories

- `source` — Oscillators, noise generators (VCO, Noise)
- `filter` — Filters (VCF, EQ)
- `amplifier` — VCAs, mixers
- `modulator` — LFOs, S&H
- `envelope` — ADSR, AR
- `utility` — Mixers, multiples, logic
- `io` — MIDI-In, Output

#### 5. Registration

**Built-in modules** are auto-registered from `src/engine/modular/modules/index.ts`:
```typescript
import './VCOModule';
import './VCFModule';
import './VCAModule';
// ... etc
```

**Plugin modules** should register in their init file:
```typescript
import { ModuleRegistry } from '@/engine/modular/ModuleRegistry';
import { MyModuleDescriptor } from './MyModule';

ModuleRegistry.register(MyModuleDescriptor);
```

### Example: Simple VCA Module

```typescript
import type { ModuleDescriptor } from '@/types/modular';
import { ModuleRegistry } from '@/engine/modular/ModuleRegistry';

const VCADescriptor: ModuleDescriptor = {
  id: 'VCA',
  name: 'VCA',
  category: 'amplifier',
  voiceMode: 'per-voice',
  color: '#f59e0b',

  ports: [
    { id: 'input', name: 'In', direction: 'input', signal: 'audio' },
    { id: 'cv', name: 'CV', direction: 'input', signal: 'cv' },
    { id: 'output', name: 'Out', direction: 'output', signal: 'audio' },
  ],

  parameters: [
    { id: 'gain', name: 'Gain', min: 0, max: 2, default: 1 },
    { id: 'bias', name: 'Bias', min: 0, max: 1, default: 0 },
  ],

  create: (ctx) => {
    const inputGain = ctx.createGain();
    const cvGain = ctx.createGain();
    const outputGain = ctx.createGain();

    inputGain.connect(outputGain);
    cvGain.connect(outputGain.gain);

    const ports = new Map();
    ports.set('input', { id: 'input', name: 'In', direction: 'input', signal: 'audio', node: inputGain });
    ports.set('cv', { id: 'cv', name: 'CV', direction: 'input', signal: 'cv', param: cvGain.gain, scaleNode: cvGain });
    ports.set('output', { id: 'output', name: 'Out', direction: 'output', signal: 'audio', node: outputGain });

    return {
      ports,
      setParameter: (id, val) => {
        if (id === 'gain') outputGain.gain.value = val;
      },
      getParameter: (id) => id === 'gain' ? outputGain.gain.value : 0,
      dispose: () => {
        inputGain.disconnect();
        cvGain.disconnect();
        outputGain.disconnect();
      },
    };
  },
};

ModuleRegistry.register(VCADescriptor);
```

### Visual Editors

The modular synth includes three visual patch editors:

1. **Rack View** — Vertical list of horizontal module strips with drag reordering
2. **Canvas View** — Free-form 2D canvas with pan/zoom
3. **Matrix View** — Table-based connection editor (tracker-style)

All editors share the same patch data (`ModularPatchConfig`) and render identical audio graphs.

### Key Types

```typescript
// From src/types/modular.ts
export type SignalType = 'audio' | 'cv' | 'gate' | 'trigger';
export type VoiceMode = 'per-voice' | 'shared';
export type ModuleCategory = 'source' | 'filter' | 'amplifier' | 'modulator' | 'envelope' | 'utility' | 'io';

export interface ModuleDescriptor {
  id: string;
  name: string;
  category: ModuleCategory;
  voiceMode: VoiceMode;
  color?: string;
  ports: ModulePortDef[];
  parameters: ModuleParamDef[];
  create: (ctx: AudioContext) => ModuleInstance;
}

export interface ModuleInstance {
  ports: Map<string, ModulePort>;
  setParameter: (paramId: string, value: number) => void;
  getParameter: (paramId: string) => number;
  gateOn?: (time: number, velocity: number) => void;
  gateOff?: (time: number) => void;
  dispose: () => void;
}

export interface ModulePort {
  id: string;
  name: string;
  direction: 'input' | 'output';
  signal: SignalType;
  node?: AudioNode;        // For audio signals
  param?: AudioParam;      // For CV signals
  scaleNode?: GainNode;    // For CV scaling
}
```

---

## Integration Checklist

When adding a new synth:

- [ ] Add to `SynthType` union (`src/types/instrument.ts`)
- [ ] Create config interface + defaults (`src/types/instrument.ts`)
- [ ] Add config field to `InstrumentConfig` interface
- [ ] Add to `SYNTH_INFO` (`src/constants/synthCategories.ts`)
- [ ] Create synth class implementing `DevilboxSynth` or returning `ToneAudioNode`
- [ ] Create registration file (`src/engine/registry/sdk/` or `builtin/`)
- [ ] Add lazy loader to `src/engine/registry/sdk/index.ts`
- [ ] Create UI controls component (if custom editor needed)
- [ ] Add editor mode to `UnifiedInstrumentEditor.tsx` (if custom editor)
- [ ] Add factory presets (optional)
- [ ] Calibrate volume normalization (`volumeOffsetDb`)

When adding a new effect:

- [ ] Add to `AudioEffectType` union (`src/types/instrument.ts`)
- [ ] Create registration in `src/engine/registry/effects/`
- [ ] Add to eager imports or lazy loaders in `effects/index.ts`
- [ ] Defaults auto-provided via `getDefaultParameters()`

---

## Common Pitfalls

1. **Forgetting to add to `SynthType` union** — TypeScript will catch this, but it's the most common oversight.

2. **Not returning `true` from trigger hooks** — `onTriggerAttack`/`onTriggerRelease` must return `true` to indicate the hook handled the event; otherwise the engine falls through to default Tone.js behavior.

3. **Disposal leaks** — Always disconnect and stop all AudioNodes in `dispose()`. Oscillators must be `stop()`'d before disconnect. Use try/catch around disconnect calls.

4. **Using `synthBus` incorrectly** — `DevilboxSynth` instances automatically route to synthBus (detected via `isDevilboxSynth()`). Don't set `useSynthBus` for Tone.js synths.

5. **Forgetting volume normalization** — Set `volumeOffsetDb` in the descriptor to match perceived loudness with other synths. Use the test runner: `window.testAllSynths()`.

6. **Not importing registrations** — Eager registrations must be imported from `main.tsx` (synths via `./engine/registry/builtin`, effects via `./engine/registry/effects`). Lazy registrations just need the loader in `index.ts`.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/engine/registry/SynthDescriptor.ts` | Synth descriptor types |
| `src/engine/registry/SynthRegistry.ts` | Synth registry class |
| `src/engine/registry/EffectDescriptor.ts` | Effect descriptor types |
| `src/engine/registry/EffectRegistry.ts` | Effect registry class |
| `src/types/synth.ts` | `DevilboxSynth` interface + `isDevilboxSynth` |
| `src/types/instrument.ts` | `SynthType`, `AudioEffectType`, config types |
| `src/utils/audio-context.ts` | `getDevilboxAudioContext`, `noteToFrequency`, `audioNow` |
| `src/engine/InstrumentFactory.ts` | Synth/effect creation (registry + switch fallback) |
| `src/components/controls/Knob.tsx` | Core rotary control |
| `src/components/instruments/editors/UnifiedInstrumentEditor.tsx` | Editor dispatcher |
| `src/components/instruments/controls/ChipSynthControls.tsx` | Data-driven parameter UI |
| `src/engine/vstbridge/synth-registry.ts` | VSTBridge zero-code descriptors |
| `src/constants/synthCategories.ts` | `SYNTH_INFO` display metadata |
