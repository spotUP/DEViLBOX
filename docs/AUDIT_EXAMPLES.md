# Audit Examples - Code Snippets

This document provides specific code examples of the hardcoded problems found in the audit.

---

## Example 1: Hardcoded Sequential IDs

**Current Code** (`src/constants/factoryPresets.ts`):
```typescript
export const BASS_PRESETS: InstrumentConfig[] = [
  {
    id: 0,
    name: '303 Classic',
    synthType: 'TB303',
    tb303: { /* ... */ },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    id: 1,
    name: '303 Squelchy',
    synthType: 'TB303',
    tb303: { /* ... */ },
    effects: [],
    volume: -12,
    pan: 0,
  },
  // ... 34 more presets with hardcoded IDs
];
```

**Proposed Solution**:
```typescript
// Define presets without IDs
const BASS_PRESET_DEFINITIONS = [
  {
    name: '303 Classic',
    synthType: 'TB303',
    tb303: { /* ... */ },
  },
  {
    name: '303 Squelchy',
    synthType: 'TB303',
    tb303: { /* ... */ },
  },
  // ...
];

// Add IDs when exporting
export const BASS_PRESETS: InstrumentConfig[] = BASS_PRESET_DEFINITIONS.map((preset, index) => ({
  ...preset,
  id: index,
  effects: preset.effects || [],
  volume: preset.volume ?? -12,
  pan: preset.pan ?? 0,
}));
```

---

## Example 2: Duplicate TB-303 Presets

**File 1** (`src/constants/tb303Presets.ts`):
```typescript
export const TB303_PRESETS: Omit<InstrumentConfig, 'id'>[] = [
  {
    name: '303 Classic',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 800, resonance: 65 },
      filterEnvelope: { envMod: 60, decay: 200 },
      accent: { amount: 70 },
      slide: { time: 60, mode: 'exponential' },
    },
    effects: [],
    volume: -12,
    pan: 0,
  },
  // ... 7 more
];
```

**File 2** (`src/constants/factoryPresets.ts`):
```typescript
export const BASS_PRESETS: InstrumentConfig[] = [
  // Same preset duplicated with ID
  {
    id: 0,
    name: '303 Classic',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 800, resonance: 65 },
      filterEnvelope: { envMod: 60, decay: 200 },
      accent: { amount: 70 },
      slide: { time: 60, mode: 'exponential' },
    },
    effects: [],
    volume: -12,
    pan: 0,
  },
  // ... 7 more duplicates
];
```

**Proposed Solution**:
```typescript
// src/constants/factoryPresets.ts
import { TB303_PRESETS } from './tb303Presets';

export const BASS_PRESETS: InstrumentConfig[] = [
  // Use TB-303 presets as base
  ...TB303_PRESETS.map((preset, index) => ({
    ...preset,
    id: index,
  })),
  // Add other bass presets
  {
    id: 8,
    name: 'Sub Bass',
    synthType: 'MonoSynth',
    // ...
  },
];
```

---

## Example 3: Magic Numbers in Audio Engine

**Current Code** (`src/engine/EffectCommands.ts`):
```typescript
case 0x8: // 8xx - Set pan position
  const panValue = (param / 255) * 2 - 1; // Map 0x00-0xFF to -1 to 1
  if (instrument.pan) {
    instrument.pan.setValueAtTime(panValue, Tone.now());
  }
  break;

case 0xc: // Cxx - Set volume
  const volume = Math.min(param, 0x40); // Clamp to 0x40
  const volumeDb = -40 + (volume / 0x40) * 40; // Map to -40dB to 0dB
  if (instrument.volume) {
    instrument.volume.setValueAtTime(volumeDb, Tone.now());
  }
  break;
```

**Current Code** (`src/engine/AutomationPlayer.ts`):
```typescript
const cutoffHz = 200 * Math.pow(100, value);
const volumeDb = -40 + value * 40;
const panValue = (rawValue / 255) * 2 - 1;
```

**Proposed Solution**:
```typescript
// src/constants/audioConstants.ts
export const AUDIO_CONSTANTS = {
  VOLUME: {
    MAX_VALUE: 0x40,
    MIN_DB: -40,
    MAX_DB: 0,
  },
  PAN: {
    MIN: -1,
    MAX: 1,
    SCALE: 255,
  },
  FILTER: {
    MIN_CUTOFF_HZ: 200,
    MAX_CUTOFF_HZ: 20000,
    EXP_BASE: 100,
  },
};

// Usage in EffectCommands.ts
import { AUDIO_CONSTANTS } from '@constants/audioConstants';

case 0x8:
  const panValue = (param / AUDIO_CONSTANTS.PAN.SCALE) * 
                   (AUDIO_CONSTANTS.PAN.MAX - AUDIO_CONSTANTS.PAN.MIN) + 
                   AUDIO_CONSTANTS.PAN.MIN;
  break;

case 0xc:
  const volume = Math.min(param, AUDIO_CONSTANTS.VOLUME.MAX_VALUE);
  const volumeDb = AUDIO_CONSTANTS.VOLUME.MIN_DB + 
                   (volume / AUDIO_CONSTANTS.VOLUME.MAX_VALUE) * 
                   (AUDIO_CONSTANTS.VOLUME.MAX_DB - AUDIO_CONSTANTS.VOLUME.MIN_DB);
  break;
```

---

## Example 4: Duplicate Instrument ID Generation

**Current Code** (`src/stores/useInstrumentStore.ts`):
```typescript
createInstrument: (config) =>
  set((state) => {
    // Find next available ID
    const existingIds = state.instruments.map((i) => i.id);
    let newId = 0;
    while (existingIds.includes(newId) && newId < 256) {
      newId++;
    }
    if (newId >= 256) {
      console.warn('Maximum number of instruments reached (256)');
      return newId;
    }
    // ...
  }),

cloneInstrument: (id) =>
  set((state) => {
    // Same code duplicated!
    const existingIds = state.instruments.map((i) => i.id);
    let newId = 0;
    while (existingIds.includes(newId) && newId < 256) {
      newId++;
    }
    if (newId >= 256) {
      console.warn('Maximum number of instruments reached (256)');
      return newId;
    }
    // ...
  }),
```

**Proposed Solution**:
```typescript
// src/constants/audioConstants.ts
export const MAX_INSTRUMENTS = 256;

// src/stores/useInstrumentStore.ts
const findNextInstrumentId = (existingIds: number[]): number | null => {
  let newId = 0;
  while (existingIds.includes(newId) && newId < MAX_INSTRUMENTS) {
    newId++;
  }
  if (newId >= MAX_INSTRUMENTS) {
    console.warn(`Maximum number of instruments reached (${MAX_INSTRUMENTS})`);
    return null;
  }
  return newId;
};

export const useInstrumentStore = create<InstrumentStore>()(
  immer((set, get) => ({
    createInstrument: (config) =>
      set((state) => {
        const existingIds = state.instruments.map((i) => i.id);
        const newId = findNextInstrumentId(existingIds);
        if (newId === null) return;
        // ...
      }),

    cloneInstrument: (id) =>
      set((state) => {
        const existingIds = state.instruments.map((i) => i.id);
        const newId = findNextInstrumentId(existingIds);
        if (newId === null) return;
        // ...
      }),
  }))
);
```

---

## Example 5: Timestamp-Based ID Generation

**Current Code** (Multiple files):
```typescript
// useProjectStore.ts
id: `project-${Date.now()}`

// useInstrumentStore.ts
id: `effect-${Date.now()}`
id: `preset-${Date.now()}`

// useTrackerStore.ts
id: `pattern-${Date.now()}`

// useAutomationStore.ts
id: `curve-${Date.now()}`

// useHistoryStore.ts
id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
```

**Proposed Solution**:
```typescript
// src/utils/idGenerator.ts
type EntityType = 'project' | 'effect' | 'preset' | 'pattern' | 'curve' | 'action';

class IdGenerator {
  private counters: Map<EntityType, number> = new Map();

  generate(type: EntityType): string {
    const counter = (this.counters.get(type) || 0) + 1;
    this.counters.set(type, counter);
    return `${type}-${Date.now()}-${counter}`;
  }

  reset(type?: EntityType): void {
    if (type) {
      this.counters.delete(type);
    } else {
      this.counters.clear();
    }
  }
}

export const idGenerator = new IdGenerator();

// Usage in stores:
import { idGenerator } from '@utils/idGenerator';

// useProjectStore.ts
id: idGenerator.generate('project')

// useInstrumentStore.ts
id: idGenerator.generate('effect')
id: idGenerator.generate('preset')
```

---

## Example 6: BPM Constants Not Imported Correctly

**Current Code** (`src/stores/useTransportStore.ts`):
```typescript
import type { TransportState, DEFAULT_BPM, MIN_BPM, MAX_BPM } from '@types/audio';
//     ^^^^ Problem: importing as type prevents using as values

export const useTransportStore = create<TransportStore>()(
  immer((set, get) => ({
    bpm: 135, // Should be DEFAULT_BPM
    
    setBPM: (bpm) =>
      set((state) => {
        state.bpm = Math.max(20, Math.min(999, bpm)); // Should use MIN_BPM, MAX_BPM
      }),
  }))
);
```

**Proposed Solution**:
```typescript
import type { TransportState } from '@types/audio';
import { DEFAULT_BPM, MIN_BPM, MAX_BPM } from '@types/audio';
//     ^^^ Remove 'type' keyword for constants

export const useTransportStore = create<TransportStore>()(
  immer((set, get) => ({
    bpm: DEFAULT_BPM,
    
    setBPM: (bpm) =>
      set((state) => {
        state.bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, bpm));
      }),
  }))
);
```

---

## Example 7: Duplicate Default Values in Presets

**Current Code** (`src/constants/factoryPresets.ts`):
```typescript
export const BASS_PRESETS: InstrumentConfig[] = [
  {
    id: 0,
    name: '303 Classic',
    // ...
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    id: 1,
    name: '303 Squelchy',
    // ...
    effects: [],
    volume: -12,
    pan: 0,
  },
  // ... repeated 34 more times
];
```

**Proposed Solution**:
```typescript
const PRESET_DEFAULTS = {
  effects: [] as EffectConfig[],
  volume: -12,
  pan: 0,
};

const createPreset = (
  id: number,
  config: Omit<InstrumentConfig, 'id' | 'effects' | 'volume' | 'pan'> & 
         Partial<Pick<InstrumentConfig, 'effects' | 'volume' | 'pan'>>
): InstrumentConfig => ({
  ...PRESET_DEFAULTS,
  ...config,
  id,
});

export const BASS_PRESETS: InstrumentConfig[] = [
  createPreset(0, {
    name: '303 Classic',
    synthType: 'TB303',
    tb303: { /* ... */ },
  }),
  createPreset(1, {
    name: '303 Squelchy',
    synthType: 'TB303',
    tb303: { /* ... */ },
  }),
  // ...
];
```

---

## Example 8: Pattern Defaults

**Current Code** (`src/stores/useTrackerStore.ts`):
```typescript
const createEmptyPattern = (length: number = 64, numChannels: number = 4): Pattern => ({
  id: `pattern-${Date.now()}`,
  length,
  rows: Array(length)
    .fill(null)
    .map(() => ({
      notes: Array(numChannels).fill({ note: null }),
    })),
});

// Later in the file:
addPattern: (length = 64) =>
  set((state) => {
    // ...
  }),
```

**Proposed Solution**:
```typescript
import { idGenerator } from '@utils/idGenerator';

const DEFAULT_PATTERN_LENGTH = 64;
const DEFAULT_NUM_CHANNELS = 4;

const createEmptyPattern = (
  length: number = DEFAULT_PATTERN_LENGTH,
  numChannels: number = DEFAULT_NUM_CHANNELS
): Pattern => ({
  id: idGenerator.generate('pattern'),
  length,
  rows: Array(length)
    .fill(null)
    .map(() => ({
      notes: Array(numChannels).fill({ note: null }),
    })),
});

// Later:
addPattern: (length = DEFAULT_PATTERN_LENGTH) =>
  set((state) => {
    // ...
  }),
```

---

## Summary Table

| Issue | Files Affected | Instances | Priority |
|-------|---------------|-----------|----------|
| Hardcoded Preset IDs | factoryPresets.ts | 36 | High |
| Duplicate TB-303 Presets | tb303Presets.ts, factoryPresets.ts | 8 | High |
| Magic Numbers | EffectCommands.ts, AutomationPlayer.ts, ToneEngine.ts | 30+ | High |
| Duplicate ID Generation | useInstrumentStore.ts | 2 | High |
| Timestamp IDs | 5 store files | 6 | Medium |
| BPM Import Issue | useTransportStore.ts | 3 | Medium |
| Duplicate Defaults | factoryPresets.ts | 88 | Medium |
| Pattern Defaults | useTrackerStore.ts | 2 | Low |

