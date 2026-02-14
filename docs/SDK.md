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
