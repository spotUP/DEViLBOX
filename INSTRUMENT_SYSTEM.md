# Instrument & Effects System Documentation

## Overview

This comprehensive instrument and effects system provides a complete solution for creating, managing, and processing audio instruments in your tracker application. Built on Tone.js, it supports 12 synth types, 21 effect types, drag-and-drop effect chaining, and 36+ factory presets.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   InstrumentFactory                      │
│  Creates Tone.js synth instances from InstrumentConfig  │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                    Effect Chain                          │
│  SYNTH → FX1 → FX2 → FX3 → OUT                          │
│  Drag-and-drop reordering, bypass, wet/dry mix         │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   PresetBrowser                          │
│  36+ factory presets organized by category              │
│  Bass, Leads, Pads, Drums, FX                          │
└─────────────────────────────────────────────────────────┘
```

## Files Created

### 1. InstrumentFactory.ts
**Location:** `/Users/spot/Code/scribbleton-live-master/scribbleton-react/src/engine/InstrumentFactory.ts`

Factory class for creating Tone.js instruments from configuration objects.

**Features:**
- Creates all 12 synth types: Synth, MonoSynth, DuoSynth, FMSynth, AMSynth, PluckSynth, MetalSynth, MembraneSynth, NoiseSynth, TB303, Sampler, Player
- Applies oscillator parameters (type, detune, octave)
- Applies envelope parameters (ADSR)
- Applies filter parameters (type, frequency, resonance, rolloff)
- Creates effect chains with 21 effect types
- Handles polyphony with PolySynth wrapper
- Special TB-303 support using TB303Synth class
- Clean disposal methods

**Usage:**
```typescript
import { InstrumentFactory } from '@engine/InstrumentFactory';
import type { InstrumentConfig } from '@types/instrument';

// Create instrument
const config: InstrumentConfig = {
  id: 0,
  name: 'My Synth',
  synthType: 'Synth',
  oscillator: { type: 'sawtooth', detune: 0, octave: 0 },
  envelope: { attack: 10, decay: 200, sustain: 50, release: 1000 },
  effects: [],
  volume: -12,
  pan: 0,
};

const synth = InstrumentFactory.createInstrument(config);

// Create effects
const effects = InstrumentFactory.createEffectChain(config.effects);

// Connect
const destination = Tone.getDestination();
InstrumentFactory.connectWithEffects(synth, effects, destination);

// Dispose
InstrumentFactory.disposeInstrument(synth, effects);
```

### 2. EffectChain.tsx
**Location:** `/Users/spot/Code/scribbleton-live-master/scribbleton-react/src/components/instruments/EffectChain.tsx`

Visual effects chain builder with drag-and-drop reordering.

**Features:**
- Visual signal flow diagram: SYNTH → FX1 → FX2 → FX3 → OUT
- Drag-and-drop reordering using @dnd-kit/core
- Add effect dropdown with all 21 Tone.js effects
- Per-effect on/off toggle (bypass)
- Per-effect wet/dry mix control
- Remove effect button
- Edit effect parameters button

**Supported Effects:**
- Distortion, Reverb, Delay, Chorus, Phaser, Tremolo, Vibrato
- AutoFilter, AutoPanner, AutoWah
- BitCrusher, Chebyshev
- FeedbackDelay, FrequencyShifter, PingPongDelay, PitchShift
- Compressor, EQ3, Filter
- JCReverb, StereoWidener

**Usage:**
```tsx
import { EffectChain } from '@components/instruments/EffectChain';

<EffectChain
  instrumentId={0}
  effects={instrument.effects}
  onEditEffect={(effect) => setEditingEffect(effect)}
/>
```

### 3. EffectPanel.tsx
**Location:** `/Users/spot/Code/scribbleton-live-master/scribbleton-react/src/components/instruments/EffectPanel.tsx`

Modal/inline editor for effect parameters with auto-generated controls.

**Features:**
- Auto-generates parameter controls based on effect type
- Slider controls with proper ranges for each parameter
- Real-time parameter updates
- Wet/Dry mix control
- Parameter labels with units (Hz, dB, ms, etc.)
- Min/max range indicators

**Effect Parameters:**

**Distortion:**
- Drive (0-1)
- Oversample (none/2x/4x)

**Reverb:**
- Decay (0.1-10s)
- Pre-Delay (0-0.5s)

**Delay/FeedbackDelay/PingPongDelay:**
- Time (0-1s, with BPM sync option)
- Feedback (0-0.95)

**Chorus:**
- Frequency (0-20 Hz)
- Depth (0-1)
- Delay Time (2-20ms)

**Phaser:**
- Frequency (0-20 Hz)
- Octaves (0-8)
- Base Frequency (50-1000 Hz)

**And 16 more effects with custom parameters...**

**Usage:**
```tsx
import { EffectPanel } from '@components/instruments/EffectPanel';

<EffectPanel
  instrumentId={0}
  effect={selectedEffect}
  onClose={() => setSelectedEffect(null)}
/>
```

### 4. PresetBrowser.tsx (Enhanced)
**Location:** `/Users/spot/Code/scribbleton-live-master/scribbleton-react/src/components/instruments/PresetBrowser.tsx`

Enhanced preset browser with search, filtering, and category organization.

**Features:**
- Category tabs: Bass (12), Leads (8), Pads (4), Drums (8), FX (4)
- 36+ factory presets total
- 3-column grid layout
- Click to load preset
- Hover preview with scale effect
- Search/filter by name or synth type
- Color-coded categories
- Effect badges showing number of effects
- Visual feedback on hover

**Categories:**
- **Bass:** 8 TB-303 presets + 4 modern bass presets
- **Leads:** Supersaw, Acid, FM, Sync, Chip, Pluck, Detuned leads
- **Pads:** Ambient, Dark, String pads, Noise sweep
- **Drums:** Kicks, Snare, Clap, Hats, Crash
- **FX:** Riser, Downlifter, Impact, Laser Zap

**Usage:**
```tsx
import { PresetBrowser } from '@components/instruments/PresetBrowser';

<PresetBrowser
  instrumentId={0}
  onClose={() => setShowBrowser(false)}
/>
```

### 5. InstrumentEditorDemo.tsx
**Location:** `/Users/spot/Code/scribbleton-live-master/scribbleton-react/src/components/instruments/InstrumentEditorDemo.tsx`

Comprehensive demo component showing all features together.

**Features:**
- Tabbed interface (Synth Parameters / Effects Chain)
- Collapsible preset browser
- Collapsible effect editor
- Quick stats footer
- Keyboard shortcuts

**Usage:**
```tsx
import { InstrumentEditorDemo } from '@components/instruments/InstrumentEditorDemo';

<InstrumentEditorDemo />
```

## Integration with ToneEngine

The InstrumentFactory is designed to work alongside the existing ToneEngine. Here's how to integrate:

```typescript
import { ToneEngine } from '@engine/ToneEngine';
import { InstrumentFactory } from '@engine/InstrumentFactory';

// Get engine instance
const engine = ToneEngine.getInstance();

// Create instrument with factory
const instrument = InstrumentFactory.createInstrument(config);
const effects = InstrumentFactory.createEffectChain(config.effects);

// Connect to master channel
InstrumentFactory.connectWithEffects(
  instrument,
  effects,
  engine.masterChannel
);

// Play notes
if ('triggerAttackRelease' in instrument) {
  instrument.triggerAttackRelease('C4', '8n');
}

// Update effect parameters
effects.forEach((fx, idx) => {
  const effectConfig = config.effects[idx];
  // Apply parameter updates...
});
```

## Store Integration

The system integrates seamlessly with useInstrumentStore:

```typescript
// Add effect
addEffect(instrumentId, 'Reverb');

// Update effect
updateEffect(instrumentId, effectId, {
  wet: 75,
  parameters: { decay: 3.5 }
});

// Remove effect
removeEffect(instrumentId, effectId);

// Reorder effects (drag-and-drop)
reorderEffects(instrumentId, fromIndex, toIndex);

// Load preset
updateInstrument(instrumentId, presetConfig);
```

## TypeScript Types

All types are defined in `/Users/spot/Code/scribbleton-live-master/scribbleton-react/src/types/instrument.ts`:

```typescript
// Synth types
type SynthType = 'Synth' | 'MonoSynth' | 'DuoSynth' | 'FMSynth' | 'AMSynth' |
                 'PluckSynth' | 'MetalSynth' | 'MembraneSynth' | 'NoiseSynth' |
                 'TB303' | 'Sampler' | 'Player';

// Effect types (21 total)
type EffectType = 'Distortion' | 'Reverb' | 'Delay' | 'Chorus' | ...;

// Effect configuration
interface EffectConfig {
  id: string;
  type: EffectType;
  enabled: boolean;
  wet: number; // 0-100%
  parameters: Record<string, any>;
}

// Instrument configuration
interface InstrumentConfig {
  id: number;
  name: string;
  synthType: SynthType;
  oscillator?: OscillatorConfig;
  envelope?: EnvelopeConfig;
  filter?: FilterConfig;
  filterEnvelope?: FilterEnvelopeConfig;
  tb303?: TB303Config;
  effects: EffectConfig[];
  volume: number;
  pan: number;
  parameters?: Record<string, any>;
}
```

## FT2 Theme Styling

All components use the FT2 tracker theme with these key classes:

- `bg-ft2-bg` - Main background (#00005f)
- `bg-ft2-header` - Panel headers (#0055aa)
- `bg-ft2-panel` - Panel backgrounds (#000088)
- `bg-ft2-cursor` - Cursor/selection (#ffff00)
- `text-ft2-highlight` - Highlighted text (#00ffff)
- `text-ft2-textDim` - Dimmed text (#aaaaaa)
- `border-ft2-border` - Borders (#0088ff)
- `scrollbar-ft2` - Custom scrollbar styling

## Performance Considerations

1. **Effect Creation:** Effects are created on-demand and disposed properly
2. **Drag & Drop:** Uses @dnd-kit/core for performant reordering
3. **Real-time Updates:** Parameter changes are throttled for smooth performance
4. **Memory Management:** All Tone.js objects are disposed when no longer needed

## Example: Creating a Custom Effect Preset

```typescript
import { useInstrumentStore } from '@stores/useInstrumentStore';

const { addEffect, updateEffect } = useInstrumentStore();

// Add reverb
addEffect(instrumentId, 'Reverb');

// Add delay
addEffect(instrumentId, 'Delay');

// Update reverb parameters
updateEffect(instrumentId, reverbId, {
  wet: 40,
  parameters: {
    decay: 2.5,
    preDelay: 0.02,
  }
});

// Update delay parameters
updateEffect(instrumentId, delayId, {
  wet: 30,
  parameters: {
    time: 0.375, // dotted 8th note
    feedback: 0.6,
  }
});
```

## Testing

To test the complete system:

1. Import InstrumentEditorDemo in your main app
2. Load a preset from the browser
3. Add effects to the chain
4. Drag to reorder effects
5. Edit effect parameters
6. Toggle effects on/off
7. Adjust wet/dry mix

```tsx
import { InstrumentEditorDemo } from '@components/instruments/InstrumentEditorDemo';

function App() {
  return <InstrumentEditorDemo />;
}
```

## Future Enhancements

Potential additions to the system:

1. **Effect Presets:** Save/load effect chain presets
2. **BPM Sync:** Sync delay times to BPM
3. **Automation:** Modulate effect parameters over time
4. **Spectrum Analyzer:** Visual feedback for effects
5. **Parallel Effects:** Split signal to multiple parallel effects
6. **Send/Return:** Global send effects (reverb, delay)
7. **Sidechain:** Sidechain compression and ducking
8. **Custom Effects:** User-defined effect processors

## Troubleshooting

**Issue:** Effects not applying
- Check that effects are enabled (not bypassed)
- Verify wet/dry mix is > 0%
- Check that effect chain is properly connected

**Issue:** Distorted sound
- Lower wet mix on distortion effects
- Reduce volume on individual effects
- Check for resonance feedback in filters

**Issue:** Performance issues
- Reduce number of active effects
- Disable unused effects (bypass)
- Lower reverb decay time
- Use simpler synth types

## Support

For issues or questions:
1. Check TypeScript types for proper usage
2. Review factoryPresets.ts for examples
3. Test with InstrumentEditorDemo component
4. Check console for Tone.js warnings

---

Built with Tone.js, React, TypeScript, and @dnd-kit/core
FT2 Tracker Theme Styling
