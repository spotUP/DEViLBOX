# Neural Pedalboard Design Proposal

## Problem
Current implementation limits neural processing to:
- Single neural model at a time
- Binary on/off toggle
- Limited parameters (just drive and dry/wet)
- No effect chaining

## Proposed Solution: Neural Pedalboard

### Concept
Model it like a real guitar pedalboard where you can:
1. **Chain multiple effects** (distortion → amp → EQ → reverb)
2. **Adjust parameters per effect** (each model has its own knobs)
3. **Reorder effects** (drag and drop)
4. **Bypass individual effects** (without removing them)
5. **Mix neural and traditional effects**

### Type Definition

```typescript
// Individual effect/pedal in the chain
interface NeuralEffect {
  id: string;                    // Unique ID for this instance
  enabled: boolean;              // Bypass switch
  type: 'neural' | 'traditional'; // Neural model or built-in effect

  // For neural models
  modelIndex?: number;           // Which GuitarML model (0-36)
  modelName?: string;            // "Ibanez808TubeScreamer", "Marshall Plexi", etc.

  // For traditional effects
  effectType?: 'waveshaper' | 'eq' | 'filter' | 'compression';

  // Parameters (varies by model/effect type)
  parameters: {
    drive?: number;              // 0-100% (most overdrive/distortion)
    tone?: number;               // 0-100% (tone control)
    level?: number;              // 0-100% (output level)
    presence?: number;           // 0-100% (high freq boost)
    bass?: number;               // 0-100% (EQ)
    mid?: number;                // 0-100% (EQ)
    treble?: number;             // 0-100% (EQ)
    dryWet?: number;             // 0-100% (mix control)
    // ... model-specific parameters
  };
}

// Pedalboard configuration
interface NeuralPedalboard {
  enabled: boolean;              // Master bypass
  chain: NeuralEffect[];         // Ordered array of effects
  inputGain?: number;            // 0-100% (pre-gain)
  outputGain?: number;           // 0-100% (master level)
}

// Update TB303Config
export interface TB303Config {
  // ... existing properties ...

  // Replace simple overdrive with pedalboard
  pedalboard?: NeuralPedalboard;

  // Keep old overdrive for backward compatibility
  overdrive?: {
    amount: number;
  };
}
```

### UI Mockup

```
┌─────────────────────────────────────────────────────────────┐
│ 🎸 NEURAL PEDALBOARD                            [MASTER ON] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ TS808        │  │ Marshall     │  │ EQ           │ [+]  │
│  │ [✓]          │→ │ [✓]          │→ │ [✓]          │      │
│  │              │  │              │  │              │      │
│  │ Drive   ▮    │  │ Drive   ▮    │  │ Bass    ▮    │      │
│  │ Tone    ▮    │  │ Presence▮    │  │ Mid     ▮    │      │
│  │ Level   ▮    │  │ Level   ▮    │  │ Treble  ▮    │      │
│  │ Dry/Wet ▮    │  │ Dry/Wet ▮    │  │ Dry/Wet ▮    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  [Model Browser] [Preset Manager] [Save Chain]             │
└─────────────────────────────────────────────────────────────┘
```

### Features

1. **Effect Chain**
   - Drag to reorder effects
   - Click [✓] to bypass individual effects
   - Click [+] to add new effect to chain
   - Click [×] to remove effect

2. **Per-Effect Parameters**
   - Each model exposes its relevant parameters
   - Knobs adjust in real-time
   - Save/load presets per effect or entire chain

3. **Model Categories**
   ```
   📁 Overdrive/Distortion
      - TS808 Tube Screamer
      - ProCo Rat
      - Boss MT-2

   📁 Amplifiers
      - Marshall Plexi
      - Fender Twin
      - Mesa Boogie

   📁 EQ/Filters
      - Graphic EQ
      - Parametric EQ

   📁 Modulation
      - Chorus
      - Phaser
   ```

4. **Preset Management**
   - Save entire pedalboard configurations
   - Recall factory presets
   - Share with other users

### Implementation Priority

**Phase 1: Basic Chaining**
- Support 2-3 effects in series
- Fixed parameters (drive, tone, level, dry/wet)
- Simple enable/disable per effect

**Phase 2: Full Pedalboard**
- Unlimited effects in chain
- Drag-and-drop reordering
- Model-specific parameters

**Phase 3: Advanced Features**
- Parallel processing (A/B splits)
- Send/Return loops
- MIDI control per effect
- IR loader for cabinets

### Benefits

1. **More realistic** - Matches how guitarists actually use effects
2. **More flexible** - Create complex tones by stacking effects
3. **Better organization** - Clear visual feedback of signal chain
4. **Future-proof** - Easy to add new models and effect types
5. **MIDI-friendly** - Can map CCs to any parameter in the chain

### Example Use Cases

**Classic Acid:**
```
TB-303 → TS808 (light drive) → Small Amp (clean)
```

**Heavy Acid:**
```
TB-303 → ProCo Rat (high gain) → Marshall (crunch) → EQ (scoop mids)
```

**Experimental:**
```
TB-303 → Fuzz → Chorus → Amp → Reverb → Bitcrusher
```

## Questions for Implementation

1. Should we limit the max number of effects in the chain? (suggest 8)
2. Should effects process in AudioWorklet or main thread?
3. How to handle parameter automation for each effect in the chain?
4. Should we support parallel routing or keep it simple with series only?
5. IR cabinet simulation as a separate effect or built into amps?
