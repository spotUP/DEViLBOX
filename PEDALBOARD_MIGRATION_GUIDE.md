# Neural Pedalboard Migration Guide

## Overview

We've replaced the simple single-effect `overdrive` system with a comprehensive **Neural Pedalboard** that supports:

- ✅ **Multiple effects in series** (chain TS808 → Marshall → EQ)
- ✅ **Per-effect parameters** (drive, tone, level, presence, bass, mid, treble, etc.)
- ✅ **Individual bypass switches** (enable/disable each effect)
- ✅ **Effect reordering** (change signal chain order)
- ✅ **Parallel routing** (Phase 3)
- ✅ **IR cabinet simulation** (Phase 3)

## What Changed

### Type Definitions

**BEFORE (`src/types/instrument.ts`):**
```typescript
export interface TB303Config {
  // ... other properties
  overdrive?: {
    amount: number; // 0-100%
    modelIndex?: number; // 0-36
    useNeural?: boolean;
    drive?: number;
    dryWet?: number;
  };
}
```

**AFTER:**
```typescript
export interface TB303Config {
  // ... other properties
  pedalboard?: NeuralPedalboard; // Import from '@typedefs/pedalboard'
}
```

### New Type System (`src/types/pedalboard.ts`)

```typescript
// Individual effect in the chain
export interface PedalboardEffect {
  id: string;                           // Unique instance ID
  enabled: boolean;                     // Bypass switch
  type: 'neural' | 'traditional';       // Effect type
  modelIndex?: number;                  // GuitarML model (0-36)
  modelName?: string;                   // Display name
  effectType?: TraditionalEffectType;   // For built-in effects
  parameters: Record<string, number>;   // Parameter values (0-100)
  collapsed?: boolean;                  // UI state
  color?: string;                       // Visual grouping
}

// Complete pedalboard configuration
export interface NeuralPedalboard {
  enabled: boolean;                     // Master bypass
  chain: PedalboardEffect[];            // Ordered effects
  inputGain: number;                    // Pre-gain (0-100)
  outputGain: number;                   // Master output (0-100)
  routing?: ParallelRouting;            // Advanced routing
  collapsed?: boolean;                  // UI state
}
```

## Migration Steps

### Step 1: Update Component Imports

**Add these imports to files using TB303 configuration:**

```typescript
import type { NeuralPedalboard, PedalboardEffect } from '@typedefs/pedalboard';
import { DEFAULT_PEDALBOARD } from '@typedefs/pedalboard';
import { GUITARML_MODEL_REGISTRY, getModelByIndex } from '@constants/guitarMLRegistry';
```

### Step 2: Migrate Component Code

#### Pattern 1: Reading Overdrive Config

**BEFORE:**
```typescript
const overdrive = currentTb303.overdrive;
const modelIndex = overdrive?.modelIndex ?? 0;
const drive = overdrive?.drive ?? 50;
const dryWet = overdrive?.dryWet ?? 100;
const enabled = overdrive?.useNeural ?? false;
```

**AFTER:**
```typescript
const pedalboard = currentTb303.pedalboard ?? DEFAULT_PEDALBOARD;
// Get first effect in chain (for backward compatibility with single-effect UI)
const firstEffect = pedalboard.chain[0];
const modelIndex = firstEffect?.modelIndex ?? 0;
const drive = firstEffect?.parameters.drive ?? 50;
const dryWet = firstEffect?.parameters.dryWet ?? 100;
const enabled = pedalboard.enabled && firstEffect?.enabled;
```

#### Pattern 2: Updating Overdrive Config

**BEFORE:**
```typescript
updateInstrument(inst.id, {
  tb303: {
    ...currentTb303,
    overdrive: {
      amount: currentTb303.overdrive?.amount ?? 0,
      modelIndex,
      useNeural: true,
      drive,
      dryWet,
    },
  },
});
```

**AFTER:**
```typescript
// Create or update first effect in chain
const updatedChain = [...(currentTb303.pedalboard?.chain ?? [])];
if (updatedChain.length === 0) {
  // Create new effect
  updatedChain.push({
    id: `effect-${Date.now()}`,
    enabled: true,
    type: 'neural',
    modelIndex,
    modelName: getModelByIndex(modelIndex)?.name,
    parameters: {
      drive,
      dryWet,
      level: 75,
    },
  });
} else {
  // Update existing first effect
  updatedChain[0] = {
    ...updatedChain[0],
    modelIndex,
    modelName: getModelByIndex(modelIndex)?.name,
    parameters: {
      ...updatedChain[0].parameters,
      drive,
      dryWet,
    },
  };
}

updateInstrument(inst.id, {
  tb303: {
    ...currentTb303,
    pedalboard: {
      ...(currentTb303.pedalboard ?? DEFAULT_PEDALBOARD),
      chain: updatedChain,
    },
  },
});
```

#### Pattern 3: Toggle Overdrive On/Off

**BEFORE:**
```typescript
const handleToggleOverdrive = () => {
  updateInstrument(inst.id, {
    tb303: {
      ...currentTb303,
      overdrive: {
        ...currentTb303.overdrive,
        useNeural: !currentTb303.overdrive?.useNeural,
      },
    },
  });
};
```

**AFTER:**
```typescript
const handleTogglePedalboard = () => {
  updateInstrument(inst.id, {
    tb303: {
      ...currentTb303,
      pedalboard: {
        ...(currentTb303.pedalboard ?? DEFAULT_PEDALBOARD),
        enabled: !currentTb303.pedalboard?.enabled,
      },
    },
  });
};
```

### Step 3: Migrate Presets

#### Factory Presets (`src/constants/factoryPresets.ts`, `src/constants/tb303Presets.ts`)

**BEFORE:**
```typescript
{
  name: 'Heavy Acid',
  tb303: {
    oscillator: { type: 'sawtooth' },
    filter: { cutoff: 1200, resonance: 80 },
    filterEnvelope: { envMod: 70, decay: 300 },
    accent: { amount: 80 },
    slide: { time: 60, mode: 'exponential' },
    overdrive: {
      amount: 60,
      modelIndex: 2, // Boss MT-2
      useNeural: true,
      drive: 75,
      dryWet: 100,
    },
  },
}
```

**AFTER:**
```typescript
{
  name: 'Heavy Acid',
  tb303: {
    oscillator: { type: 'sawtooth' },
    filter: { cutoff: 1200, resonance: 80 },
    filterEnvelope: { envMod: 70, decay: 300 },
    accent: { amount: 80 },
    slide: { time: 60, mode: 'exponential' },
    pedalboard: {
      enabled: true,
      inputGain: 100,
      outputGain: 100,
      chain: [
        {
          id: 'effect-mt2',
          enabled: true,
          type: 'neural',
          modelIndex: 2, // Boss MT-2
          modelName: 'MT-2',
          parameters: {
            drive: 75,
            tone: 50,
            level: 75,
            dryWet: 100,
          },
        },
      ],
    },
  },
}
```

#### Helper Function for Migration

Create this helper to convert old presets:

```typescript
/**
 * Convert legacy overdrive config to pedalboard
 */
function convertOverdriveToPedalboard(
  overdrive?: {
    amount?: number;
    modelIndex?: number;
    useNeural?: boolean;
    drive?: number;
    dryWet?: number;
  }
): NeuralPedalboard {
  if (!overdrive?.useNeural || overdrive.modelIndex === undefined) {
    return DEFAULT_PEDALBOARD;
  }

  return {
    enabled: true,
    inputGain: 100,
    outputGain: 100,
    chain: [
      {
        id: `effect-${Date.now()}`,
        enabled: true,
        type: 'neural',
        modelIndex: overdrive.modelIndex,
        modelName: getModelByIndex(overdrive.modelIndex)?.name ?? 'Unknown',
        parameters: {
          drive: overdrive.drive ?? 50,
          tone: 50,
          level: 75,
          dryWet: overdrive.dryWet ?? 100,
        },
      },
    ],
  };
}
```

### Step 4: Update Engine Integration

#### TB303EngineAccurate Changes

**BEFORE:**
```typescript
private guitarML: GuitarMLEngine | null = null;
private overdriveEnabled: boolean = false;

async setOverdriveEnabled(enabled: boolean): Promise<void> {
  this.overdriveEnabled = enabled;
  // ... routing logic
}

setOverdriveDrive(drive: number): void {
  if (this.guitarML) {
    this.guitarML.setGain((drive - 50) * 0.36);
    this.guitarML.setCondition(drive / 100);
  }
}
```

**AFTER:**
```typescript
private pedalboard: PedalboardEngine | null = null;

async initializePedalboard(config: NeuralPedalboard): Promise<void> {
  if (this.pedalboard) {
    this.pedalboard.dispose();
  }

  this.pedalboard = new PedalboardEngine(this.audioContext, config);
  await this.pedalboard.initialize();

  // Route signal: worklet → pedalboard → output
  if (config.enabled && config.chain.length > 0) {
    this.workletNode.connect(this.pedalboard.getInput());
    this.pedalboard.connect(this.outputGain);
  } else {
    this.workletNode.connect(this.outputGain);
  }
}

setPedalboardEnabled(enabled: boolean): void {
  if (this.pedalboard) {
    this.pedalboard.setEnabled(enabled);
  }
}

setEffectParameter(effectId: string, paramId: string, value: number): void {
  if (this.pedalboard) {
    this.pedalboard.setEffectParameter(effectId, paramId, value);
  }
}
```

## File Checklist

Update these files in order:

### Phase 1: Core Types & Constants (✅ DONE)
- [x] `src/types/pedalboard.ts` - New type system
- [x] `src/types/instrument.ts` - Remove overdrive, add pedalboard
- [x] `src/types/index.ts` - Export pedalboard types
- [x] `src/constants/guitarMLRegistry.ts` - Model registry

### Phase 2: Engine Layer
- [ ] `src/engine/TB303EngineAccurate.ts` - Replace GuitarMLEngine with PedalboardEngine
- [ ] `src/engine/TB303AccurateSynth.ts` - Update wrapper API
- [ ] `src/engine/TB303Engine.ts` - Add pedalboard support (Tone.js version)

### Phase 3: Presets & Constants
- [ ] `src/constants/factoryPresets.ts` - Convert all presets
- [ ] `src/constants/tb303Presets.ts` - Convert all presets
- [ ] `src/constants/tb303DevilFishPresets.ts` - Add pedalboard to Devil Fish presets

### Phase 4: UI Components
- [ ] `src/components/tracker/TB303KnobPanel.tsx` - Main UI update
- [ ] `src/components/instruments/TB303Editor.tsx` - Editor update
- [ ] `src/components/instruments/VisualTB303Editor.tsx` - Visual editor update
- [ ] `src/components/demo/TB303WithOverdriveDemo.tsx` - Demo update
- [ ] `src/components/demo/Complete303SequencerDemo.tsx` - Demo update

### Phase 5: New Components (Create)
- [ ] `src/components/pedalboard/PedalboardManager.tsx` - Main pedalboard UI
- [ ] `src/components/pedalboard/EffectPedal.tsx` - Individual effect UI
- [ ] `src/components/pedalboard/ModelBrowser.tsx` - Effect selector
- [ ] `src/components/pedalboard/PedalboardPresets.tsx` - Preset management

## Example: Complete Migration of TB303KnobPanel

Here's a complete example of how to update the main knob panel:

### Before (Simplified)
```typescript
// Overdrive controls
const [overdriveEnabled, setOverdriveEnabled] = useState(false);
const [modelIndex, setModelIndex] = useState(0);
const [drive, setDrive] = useState(50);

const handleToggleOverdrive = () => {
  updateInstrument(inst.id, {
    tb303: {
      ...currentTb303,
      overdrive: {
        ...currentTb303.overdrive,
        useNeural: !overdriveEnabled,
      },
    },
  });
  setOverdriveEnabled(!overdriveEnabled);
};
```

### After
```typescript
// Pedalboard controls
const [pedalboardOpen, setPedalboardOpen] = useState(false);
const pedalboard = currentTb303.pedalboard ?? DEFAULT_PEDALBOARD;

const handleTogglePedalboard = () => {
  updateInstrument(inst.id, {
    tb303: {
      ...currentTb303,
      pedalboard: {
        ...pedalboard,
        enabled: !pedalboard.enabled,
      },
    },
  });
};

const handleAddEffect = (modelIndex: number) => {
  const model = getModelByIndex(modelIndex);
  const newEffect: PedalboardEffect = {
    id: `effect-${Date.now()}`,
    enabled: true,
    type: 'neural',
    modelIndex,
    modelName: model?.name,
    parameters: {
      drive: 50,
      tone: 50,
      level: 75,
      dryWet: 100,
    },
  };

  updateInstrument(inst.id, {
    tb303: {
      ...currentTb303,
      pedalboard: {
        ...pedalboard,
        chain: [...pedalboard.chain, newEffect],
      },
    },
  });
};
```

## Testing Checklist

After migration, test:

### Basic Functionality
- [ ] Can enable/disable entire pedalboard
- [ ] Can add effects to chain
- [ ] Can remove effects from chain
- [ ] Can adjust effect parameters (drive, tone, level, dry/wet)
- [ ] Effects process audio correctly
- [ ] Multiple effects chain properly

### UI Interactions
- [ ] Pedalboard panel opens/closes
- [ ] Model browser shows all 37 models
- [ ] Parameter knobs update values
- [ ] Bypass switches work per-effect
- [ ] Effects can be reordered (drag-and-drop)

### Presets
- [ ] Factory presets load correctly
- [ ] Can save custom pedalboard chains
- [ ] Presets recall all effects and parameters
- [ ] Legacy presets (with overdrive) are converted

### Audio Quality
- [ ] No audio dropouts or clicks
- [ ] Smooth parameter changes
- [ ] Bypass doesn't cause pops
- [ ] Chain order affects tone correctly

## Migration Script

For bulk migration of presets, use this script:

```typescript
// scripts/migrate-presets.ts
import type { TB303Config } from '@typedefs/instrument';
import { getModelByIndex } from '@constants/guitarMLRegistry';

function migratePreset(oldConfig: any): TB303Config {
  const { overdrive, ...rest } = oldConfig;

  if (!overdrive?.useNeural || overdrive.modelIndex === undefined) {
    return rest;
  }

  return {
    ...rest,
    pedalboard: {
      enabled: true,
      inputGain: 100,
      outputGain: 100,
      chain: [
        {
          id: `effect-${Math.random().toString(36).substr(2, 9)}`,
          enabled: true,
          type: 'neural',
          modelIndex: overdrive.modelIndex,
          modelName: getModelByIndex(overdrive.modelIndex)?.name ?? 'Unknown',
          parameters: {
            drive: overdrive.drive ?? 50,
            tone: 50,
            level: 75,
            dryWet: overdrive.dryWet ?? 100,
          },
        },
      ],
    },
  };
}
```

## Advanced Features (Phase 2 & 3)

### Drag-and-Drop Reordering

Use `react-beautiful-dnd` or similar:

```typescript
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

const handleDragEnd = (result: DropResult) => {
  if (!result.destination) return;

  const newChain = Array.from(pedalboard.chain);
  const [removed] = newChain.splice(result.source.index, 1);
  newChain.splice(result.destination.index, 0, removed);

  updateInstrument(inst.id, {
    tb303: {
      ...currentTb303,
      pedalboard: {
        ...pedalboard,
        chain: newChain,
      },
    },
  });
};
```

### Parallel Routing (Phase 3)

```typescript
interface ParallelRouting {
  enabled: boolean;
  splits: {
    id: string;
    split: number;      // Split point (effect index)
    mixA: number;       // Mix level A (0-100)
    mixB: number;       // Mix level B (0-100)
    pathA: string[];    // Effect IDs in path A
    pathB: string[];    // Effect IDs in path B
    merge: number;      // Merge point (effect index)
  }[];
}
```

### IR Loader (Phase 3)

```typescript
interface CabinetIR {
  id: string;
  name: string;
  category: 'guitar' | 'bass' | 'custom';
  url?: string;
  buffer?: AudioBuffer;
  speaker: string;    // "4x12 Marshall"
  mic: string;        // "SM57"
  position: string;   // "On-axis"
}
```

## Getting Help

If you encounter issues:

1. Check TypeScript errors: `npm run type-check`
2. Check the model registry: All 37 models are in `guitarMLRegistry.ts`
3. Reference the design doc: `NEURAL_PEDALBOARD_DESIGN.md`
4. Look at completed code: `PedalboardEngine.ts` shows the architecture

## Summary

**Key Changes:**
- `overdrive?: {...}` → `pedalboard?: NeuralPedalboard`
- Single effect → Chain of effects
- Binary on/off → Per-effect enable/disable
- Limited parameters → Full parameter schemas per model
- No reordering → Drag-and-drop chain reordering

**Benefits:**
- Stack multiple effects (TS808 → Marshall → EQ)
- Adjust parameters per effect
- Reorder effects to shape tone
- Save complete pedalboard chains as presets
- Future: Parallel routing, IR cabinets

**Migration Priority:**
1. Engine layer (TB303EngineAccurate)
2. Presets (factory presets, tb303Presets)
3. Main UI (TB303KnobPanel)
4. Secondary UIs (editors, demos)
5. New components (PedalboardManager, etc.)
