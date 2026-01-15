# Instrument Components

This directory contains the complete instrument and effects system for the Scribbleton tracker.

## Component Overview

```
┌─────────────────────────────────────────────────────────┐
│                InstrumentEditorDemo.tsx                  │
│          Main container with tabbed interface           │
│    ┌───────────────────────────────────────────┐       │
│    │   PresetBrowser.tsx                       │       │
│    │   • 36+ factory presets                   │       │
│    │   • Search & filter                       │       │
│    │   • Category tabs                         │       │
│    └───────────────────────────────────────────┘       │
│    ┌───────────────────────────────────────────┐       │
│    │   InstrumentEditor.tsx                    │       │
│    │   • Synth type selector                   │       │
│    │   • Oscillator editor                     │       │
│    │   • Envelope editor                       │       │
│    │   • Filter editor                         │       │
│    │   • TB-303 editor                         │       │
│    └───────────────────────────────────────────┘       │
│    ┌───────────────────────────────────────────┐       │
│    │   EffectChain.tsx                         │       │
│    │   • Drag & drop reordering                │       │
│    │   • Add/remove effects                    │       │
│    │   • On/off toggle                         │       │
│    │   • Wet/dry mix                           │       │
│    └───────────────────────────────────────────┘       │
│    ┌───────────────────────────────────────────┐       │
│    │   EffectPanel.tsx                         │       │
│    │   • Auto-generated parameters             │       │
│    │   • Real-time updates                     │       │
│    │   • 21 effect types                       │       │
│    └───────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

## File Structure

### Core Components

- **InstrumentEditor.tsx** - Main synth parameter editor
- **InstrumentPanel.tsx** - Container with keyboard and controls
- **SynthTypeSelector.tsx** - Synth type picker (12 types)
- **OscillatorEditor.tsx** - Oscillator controls (waveform, detune, octave)
- **EnvelopeEditor.tsx** - ADSR envelope editor
- **FilterEditor.tsx** - Filter controls (type, cutoff, resonance)
- **TB303Editor.tsx** - Specialized TB-303 acid bass editor
- **TestKeyboard.tsx** - Virtual keyboard for testing

### New Components (This System)

- **EffectChain.tsx** - Visual effect chain with drag-and-drop
- **EffectPanel.tsx** - Effect parameter editor
- **PresetBrowser.tsx** - Enhanced preset browser
- **InstrumentEditorDemo.tsx** - Complete demo integration

## Quick Start

### 1. Use the Demo Component

```tsx
import { InstrumentEditorDemo } from '@components/instruments/InstrumentEditorDemo';

function App() {
  return <InstrumentEditorDemo />;
}
```

### 2. Use Individual Components

```tsx
import { EffectChain } from '@components/instruments/EffectChain';
import { EffectPanel } from '@components/instruments/EffectPanel';
import { PresetBrowser } from '@components/instruments/PresetBrowser';

function MyEditor() {
  const { currentInstrument, currentInstrumentId } = useInstrumentStore();
  const [editingEffect, setEditingEffect] = useState(null);

  return (
    <div>
      <PresetBrowser instrumentId={currentInstrumentId} />

      <EffectChain
        instrumentId={currentInstrumentId}
        effects={currentInstrument.effects}
        onEditEffect={setEditingEffect}
      />

      {editingEffect && (
        <EffectPanel
          instrumentId={currentInstrumentId}
          effect={editingEffect}
          onClose={() => setEditingEffect(null)}
        />
      )}
    </div>
  );
}
```

## Features

### InstrumentFactory (Backend)
✓ Creates all 12 Tone.js synth types
✓ Applies oscillator, envelope, filter parameters
✓ Special TB-303 support
✓ Creates effect chains
✓ Handles polyphony
✓ Clean disposal

### EffectChain (Frontend)
✓ Visual signal flow diagram
✓ Drag-and-drop reordering (@dnd-kit)
✓ Add/remove effects
✓ On/off toggle per effect
✓ Wet/dry mix control
✓ Edit parameters button

### EffectPanel (Frontend)
✓ Auto-generated parameter controls
✓ 21 effect types supported
✓ Real-time parameter updates
✓ Proper ranges and units
✓ Wet/dry mix control

### PresetBrowser (Frontend)
✓ 36+ factory presets
✓ 5 categories (Bass, Leads, Pads, Drums, FX)
✓ Search and filter
✓ Hover preview
✓ Click to load
✓ Color-coded categories

## Supported Synth Types (12)

1. **Synth** - Basic polyphonic synthesizer
2. **MonoSynth** - Monophonic synth with filter envelope
3. **DuoSynth** - Dual oscillator synth
4. **FMSynth** - Frequency modulation synthesis
5. **AMSynth** - Amplitude modulation synthesis
6. **PluckSynth** - Karplus-Strong string synthesis
7. **MetalSynth** - Metallic/inharmonic synthesis
8. **MembraneSynth** - Drum/membrane synthesis
9. **NoiseSynth** - Filtered noise generator
10. **TB303** - Authentic acid bass synthesizer
11. **Sampler** - Sample playback
12. **Player** - Audio file player

## Supported Effect Types (21)

### Time-Based
- Delay, FeedbackDelay, PingPongDelay
- Reverb, JCReverb

### Modulation
- Chorus, Phaser, Tremolo, Vibrato
- AutoFilter, AutoPanner, AutoWah

### Distortion
- Distortion, BitCrusher, Chebyshev

### Pitch
- FrequencyShifter, PitchShift

### Dynamics
- Compressor

### EQ/Filter
- EQ3, Filter

### Stereo
- StereoWidener

## Integration with Store

All components use `useInstrumentStore` from Zustand:

```typescript
// Store actions used
addEffect(instrumentId, effectType)
removeEffect(instrumentId, effectId)
updateEffect(instrumentId, effectId, updates)
reorderEffects(instrumentId, fromIndex, toIndex)
updateInstrument(instrumentId, updates)
```

## Styling

All components use the FT2 tracker theme:
- Dark blue background (#00005f)
- Cyan highlights (#00ffff)
- Yellow cursor (#ffff00)
- Monospace fonts
- Custom scrollbars
- Border styles

## Dependencies

- **Tone.js** - Audio synthesis and effects
- **@dnd-kit/core** - Drag and drop
- **React** - UI framework
- **TypeScript** - Type safety
- **Zustand** - State management
- **Tailwind CSS** - Styling

## Related Files

### Engine
- `/src/engine/InstrumentFactory.ts` - Factory for creating instruments
- `/src/engine/ToneEngine.ts` - Tone.js wrapper
- `/src/engine/TB303Engine.ts` - TB-303 synthesizer

### Types
- `/src/types/instrument.ts` - All TypeScript types

### Data
- `/src/constants/factoryPresets.ts` - 36+ presets
- `/src/constants/tb303Presets.ts` - TB-303 presets

### Store
- `/src/stores/useInstrumentStore.ts` - Instrument state management

## Documentation

See `/INSTRUMENT_SYSTEM.md` for comprehensive documentation including:
- Architecture overview
- Integration guide
- TypeScript types
- Performance considerations
- Example code
- Troubleshooting

## Testing

Run the demo to test all features:

```tsx
import { InstrumentEditorDemo } from '@components/instruments/InstrumentEditorDemo';

// This component includes:
// - Preset browser
// - Synth editor
// - Effect chain
// - Effect parameter editor
// - Keyboard shortcuts
// - Stats display
```

## Keyboard Shortcuts (in Demo)

- **TAB** - Switch between Synth/Effects tabs
- **ESC** - Close panels
- Browser keyboard navigation for preset selection

---

Built for Scribbleton Tracker - FastTracker 2 Clone
