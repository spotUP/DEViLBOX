# Getting Started with the Instrument & Effects System

## Quick Start (2 minutes)

### Option 1: Use the Complete Demo

The fastest way to see everything working together:

```tsx
// In your App.tsx or main component
import { InstrumentEditorDemo } from '@components/instruments/InstrumentEditorDemo';

function App() {
  return <InstrumentEditorDemo />;
}
```

This gives you:
- ✓ Preset browser (36+ presets)
- ✓ Synth parameter editor
- ✓ Effect chain with drag-and-drop
- ✓ Effect parameter editor
- ✓ Test keyboard
- ✓ All features integrated

### Option 2: Add Effects to Existing Setup

If you already have an instrument editor:

```tsx
import { EffectChain } from '@components/instruments/EffectChain';
import { EffectPanel } from '@components/instruments/EffectPanel';
import { useState } from 'react';

function YourInstrumentEditor() {
  const [editingEffect, setEditingEffect] = useState(null);
  const { currentInstrument, currentInstrumentId } = useInstrumentStore();

  return (
    <div>
      {/* Your existing instrument controls */}

      {/* Add effect chain */}
      <EffectChain
        instrumentId={currentInstrumentId}
        effects={currentInstrument.effects}
        onEditEffect={setEditingEffect}
      />

      {/* Add effect editor */}
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

### Option 3: Add Preset Browser Only

Just want to add preset browsing:

```tsx
import { PresetBrowser } from '@components/instruments/PresetBrowser';
import { useState } from 'react';

function YourComponent() {
  const [showPresets, setShowPresets] = useState(false);

  return (
    <div>
      <button onClick={() => setShowPresets(true)}>
        Browse Presets
      </button>

      {showPresets && (
        <PresetBrowser
          instrumentId={0}
          onClose={() => setShowPresets(false)}
        />
      )}
    </div>
  );
}
```

## What You Get

### 12 Synth Types
- **Synth** - Basic polyphonic synthesizer
- **MonoSynth** - Monophonic with filter envelope
- **DuoSynth** - Dual oscillator synth
- **FMSynth** - Frequency modulation
- **AMSynth** - Amplitude modulation
- **PluckSynth** - String synthesis
- **MetalSynth** - Inharmonic/metallic
- **MembraneSynth** - Drum synthesis
- **NoiseSynth** - Filtered noise
- **TB303** - Acid bass (8 presets!)
- **Sampler** - Sample playback
- **Player** - Audio file player

### 21 Effect Types
- **Time:** Delay, FeedbackDelay, PingPongDelay, Reverb, JCReverb
- **Modulation:** Chorus, Phaser, Tremolo, Vibrato
- **Auto:** AutoFilter, AutoPanner, AutoWah
- **Distortion:** Distortion, BitCrusher, Chebyshev
- **Pitch:** FrequencyShifter, PitchShift
- **Dynamics:** Compressor
- **EQ:** EQ3, Filter
- **Stereo:** StereoWidener

### 36+ Factory Presets
- **Bass (12):** TB-303 Classic, Squelchy, Deep, Square, Screamer, Bubbly, Self-Osc, Plastikman, 808 Sub, Reese Bass, House Pluck, Wobble Bass
- **Leads (8):** Supersaw, Acid, FM Stab, Sync, Chip, Trance Pluck, Detuned, Filtered
- **Pads (4):** Ambient, Dark, String, Noise Sweep
- **Drums (8):** 808/909 Kicks, Hardcore Kick, DnB Snare, Clap, Hats, Crash
- **FX (4):** Riser, Downlifter, Impact, Laser Zap

## How It Works

### Signal Flow
```
User selects preset → InstrumentFactory creates Tone.js synth
                             ↓
                      Effect 1 (Reverb)
                             ↓
                      Effect 2 (Delay)
                             ↓
                      Effect 3 (Chorus)
                             ↓
                     Master Channel → Audio Out
```

### Component Flow
```
PresetBrowser → Select preset → Updates InstrumentStore
                                        ↓
EffectChain → Add/reorder effects → Updates InstrumentStore
                                        ↓
EffectPanel → Edit parameters → Updates InstrumentStore
                                        ↓
InstrumentFactory → Creates Tone.js objects → Audio Output
```

## Common Tasks

### Add an Effect
```tsx
import { useInstrumentStore } from '@stores/useInstrumentStore';

const { addEffect } = useInstrumentStore();

// Add reverb to instrument 0
addEffect(0, 'Reverb');

// Add delay
addEffect(0, 'Delay');
```

### Update Effect Parameters
```tsx
const { updateEffect } = useInstrumentStore();

// Update reverb decay
updateEffect(0, effectId, {
  parameters: { decay: 3.5, preDelay: 0.02 }
});

// Update wet/dry mix
updateEffect(0, effectId, { wet: 75 });
```

### Load a Preset
```tsx
const { updateInstrument } = useInstrumentStore();

// Load a preset (from factoryPresets.ts)
updateInstrument(0, {
  name: '303 Classic',
  synthType: 'TB303',
  tb303: { /* ... */ },
  // ... other config
});
```

### Reorder Effects (Drag & Drop)
```tsx
const { reorderEffects } = useInstrumentStore();

// Move effect from index 0 to index 2
reorderEffects(0, 0, 2);
```

### Remove an Effect
```tsx
const { removeEffect } = useInstrumentStore();

// Remove effect by ID
removeEffect(0, effectId);
```

## Examples by Use Case

### 1. "I just want to add effects to my tracker"
→ Use EffectChain.tsx component
→ See Example 4 in `/src/examples/InstrumentSystemExample.tsx`

### 2. "I want a preset browser"
→ Use PresetBrowser.tsx component
→ See Example 3 in `/src/examples/InstrumentSystemExample.tsx`

### 3. "I want everything"
→ Use InstrumentEditorDemo.tsx
→ See Example 5 in `/src/examples/InstrumentSystemExample.tsx`

### 4. "I want to create instruments programmatically"
→ Use InstrumentFactory class
→ See Example 2 in `/src/examples/InstrumentSystemExample.tsx`

### 5. "I want custom effect chains"
→ Use addEffect() and updateEffect()
→ See Example 6 in `/src/examples/InstrumentSystemExample.tsx`

## File Locations

```
Important files you'll need:

Components:
  /src/components/instruments/EffectChain.tsx
  /src/components/instruments/EffectPanel.tsx
  /src/components/instruments/PresetBrowser.tsx
  /src/components/instruments/InstrumentEditorDemo.tsx

Engine:
  /src/engine/InstrumentFactory.ts

Examples:
  /src/examples/InstrumentSystemExample.tsx

Documentation:
  /INSTRUMENT_SYSTEM.md (comprehensive guide)
  /src/components/instruments/README.md (component reference)
  /IMPLEMENTATION_SUMMARY.md (technical summary)
```

## Styling Notes

All components use the FT2 tracker theme. Key CSS classes:

```css
/* Backgrounds */
.bg-ft2-bg          /* Main background: #00005f */
.bg-ft2-header      /* Headers: #0055aa */
.bg-ft2-panel       /* Panels: #000088 */
.bg-ft2-cursor      /* Selection: #ffff00 */

/* Text */
.text-ft2-text      /* Main text: #ffffff */
.text-ft2-textDim   /* Dimmed: #aaaaaa */
.text-ft2-highlight /* Cyan: #00ffff */

/* Borders */
.border-ft2-border  /* Borders: #0088ff */

/* Scrollbars */
.scrollbar-ft2      /* Custom FT2 scrollbar */
```

## Troubleshooting

### "Effects not playing"
1. Check effect is enabled (not bypassed)
2. Check wet/dry mix > 0%
3. Verify effect chain is connected

### "Sound is distorted"
1. Lower individual effect wet mix
2. Reduce master volume
3. Check filter resonance settings

### "Presets not loading"
1. Verify factoryPresets.ts is imported
2. Check useInstrumentStore is configured
3. Confirm instrumentId is valid

### "Drag and drop not working"
1. Verify @dnd-kit packages are installed
2. Check DndContext wrapper
3. Ensure items have unique IDs

## Performance Tips

1. **Limit active effects** - More effects = more CPU
2. **Use bypass instead of remove** - Keeps configuration
3. **Lower reverb decay times** - High decay = more CPU
4. **Dispose unused instruments** - Prevents memory leaks

## Next Steps

1. **Start simple:** Try the InstrumentEditorDemo
2. **Explore presets:** Load different categories
3. **Add effects:** Drag-and-drop reordering
4. **Edit parameters:** Tweak effect settings
5. **Read docs:** Check INSTRUMENT_SYSTEM.md for details

## Need Help?

1. **Check examples:** `/src/examples/InstrumentSystemExample.tsx`
2. **Read docs:** `/INSTRUMENT_SYSTEM.md`
3. **Component reference:** `/src/components/instruments/README.md`
4. **Type definitions:** `/src/types/instrument.ts`

## Quick Reference

### Import Statements
```tsx
// Components
import { EffectChain } from '@components/instruments/EffectChain';
import { EffectPanel } from '@components/instruments/EffectPanel';
import { PresetBrowser } from '@components/instruments/PresetBrowser';
import { InstrumentEditorDemo } from '@components/instruments/InstrumentEditorDemo';

// Engine
import { InstrumentFactory } from '@engine/InstrumentFactory';

// Store
import { useInstrumentStore } from '@stores/useInstrumentStore';

// Types
import type { EffectConfig, InstrumentConfig } from '@types/instrument';
```

### Store Actions
```tsx
const {
  addEffect,           // (instrumentId, effectType) => void
  removeEffect,        // (instrumentId, effectId) => void
  updateEffect,        // (instrumentId, effectId, updates) => void
  reorderEffects,      // (instrumentId, from, to) => void
  updateInstrument,    // (instrumentId, updates) => void
  currentInstrument,   // InstrumentConfig | null
  currentInstrumentId, // number | null
} = useInstrumentStore();
```

### Factory Methods
```tsx
// Create instrument
const synth = InstrumentFactory.createInstrument(config);

// Create effects
const effects = InstrumentFactory.createEffectChain(config.effects);

// Connect
InstrumentFactory.connectWithEffects(synth, effects, destination);

// Dispose
InstrumentFactory.disposeInstrument(synth, effects);
```

---

**Ready to get started?** Try the InstrumentEditorDemo first!

```tsx
import { InstrumentEditorDemo } from '@components/instruments/InstrumentEditorDemo';

function App() {
  return <InstrumentEditorDemo />;
}
```

Happy music making! 🎵
