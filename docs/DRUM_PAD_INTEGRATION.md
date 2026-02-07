# Drum Pad Integration Guide

## Overview

The MPC-inspired Drum Pad system is now fully implemented with audio engine, sample loading, and keyboard shortcuts. This guide explains how to integrate it into the DEViLBOX application.

## Architecture

### Components
```
src/components/drumpad/
├── DrumPadManager.tsx    # Main container with program management
├── PadGrid.tsx           # 4x4 pad grid with audio integration
├── PadButton.tsx         # Individual pad with velocity sensitivity
├── PadEditor.tsx         # Parameter editor (Main, ADSR, Filter, Layers)
└── SampleBrowser.tsx     # Sample loading with drag & drop
```

### Audio Engine
```
src/engine/drumpad/
└── DrumPadEngine.ts      # Web Audio-based sample playback
```

### State Management
```
src/stores/
└── useDrumPadStore.ts    # Zustand store with localStorage persistence
```

### Types
```
src/types/
└── drumpad.ts            # Type definitions and factory presets
```

## Quick Start

### 1. Add to Your UI

```tsx
import { useState } from 'react';
import { DrumPadManager } from './components/drumpad';

function YourComponent() {
  const [showDrumPad, setShowDrumPad] = useState(false);

  return (
    <>
      <button onClick={() => setShowDrumPad(true)}>
        Open Drum Pad
      </button>

      {showDrumPad && (
        <DrumPadManager onClose={() => setShowDrumPad(false)} />
      )}
    </>
  );
}
```

### 2. Load Samples

The Drum Pad system supports multiple ways to load samples:

**Via UI:**
- Select a pad (Shift+Click)
- Click "Load Sample" button
- Upload audio file or drag & drop

**Programmatically:**
```tsx
import { useDrumPadStore } from './stores/useDrumPadStore';

function loadSampleExample() {
  const { loadSampleToPad } = useDrumPadStore();

  // Load sample data
  const sample: SampleData = {
    id: 'kick_001',
    name: '808 Kick',
    audioBuffer: /* AudioBuffer from Web Audio API */,
    duration: 0.5,
    sampleRate: 44100,
  };

  // Load to pad 1
  loadSampleToPad(1, sample);
}
```

## Features

### ✅ Implemented

1. **16-Pad Grid**: MPC-style 4x4 layout
2. **Audio Playback**: Full Web Audio engine with:
   - Velocity sensitivity (0-127)
   - ADSR envelope
   - Multimode filter (LPF/HPF/BPF)
   - Pitch tuning (-36 to +36 semitones)
   - Stereo panning
   - Multiple output buses
3. **Sample Management**:
   - Drag & drop support
   - Audio file upload
   - Sample browser UI
4. **Program Management**:
   - Save/load programs (A-01 to Z-99)
   - Factory presets (808, 909)
   - Auto-save to localStorage
5. **Keyboard Shortcuts**:
   - Q W E R → Pads 1-4
   - A S D F → Pads 5-8
   - Z X C V → Pads 9-12
   - T G B N → Pads 13-16
   - Shift+Click → Select pad
   - Escape → Close

### 🚧 Next Steps

1. **MIDI Integration**:
   - Connect to existing MIDI system
   - MIDI learn functionality
   - Note mapping

2. **Sample Library**:
   - Pre-load factory samples (808/909 kits)
   - Browse existing sample library
   - Sample categories

3. **Layer System**:
   - Velocity-switched samples
   - Layer editor UI

4. **Audio Routing**:
   - Connect to existing mixer
   - Effect send/return
   - Multi-output routing

## API Reference

### useDrumPadStore

```typescript
interface DrumPadStore {
  // Program management
  loadProgram: (id: string) => void;
  saveProgram: (program: DrumProgram) => void;
  createProgram: (id: string, name: string) => void;
  deleteProgram: (id: string) => void;
  copyProgram: (fromId: string, toId: string) => void;

  // Pad editing
  updatePad: (padId: number, updates: Partial<DrumPad>) => void;
  loadSampleToPad: (padId: number, sample: SampleData) => void;
  clearPad: (padId: number) => void;

  // MIDI mapping (ready for integration)
  setMIDIMapping: (padId: string, mapping: MIDIMapping) => void;
  clearMIDIMapping: (padId: string) => void;
  getMIDIMapping: (note: number) => string | null;

  // Persistence
  saveToStorage: () => void;
  loadFromStorage: () => void;
}
```

### DrumPadEngine

```typescript
class DrumPadEngine {
  constructor(context: AudioContext);

  // Trigger pad with velocity
  triggerPad(pad: DrumPad, velocity: number): void;

  // Stop pad immediately
  stopPad(padId: number): void;

  // Master controls
  setMasterLevel(level: number): void;
  setOutputLevel(bus: string, level: number): void;

  // Cleanup
  stopAll(): void;
  dispose(): void;
}
```

## Audio Engine Details

The DrumPadEngine uses Web Audio API for high-quality sample playback:

### Signal Chain
```
AudioBufferSource
  → BiquadFilter (optional)
  → StereoPanner
  → GainNode (ADSR envelope)
  → Output Bus
  → Master Gain
  → Destination
```

### ADSR Envelope
- **Attack**: Linear ramp from 0 to target gain (0-100ms)
- **Decay**: Linear ramp to sustain level (0-2000ms)
- **Sustain**: Hold at sustain level until release
- **Release**: Linear ramp to 0 (0-5000ms)

### Polyphony
- One voice per pad (new trigger stops previous)
- Automatic voice cleanup after release
- Smooth envelope transitions

## Integration with Existing Systems

### 1. Connect to Project Audio System

```typescript
// If you have a global AudioContext:
import { getAudioContext } from './audio/context';

// In PadGrid.tsx, replace:
const audioContext = new AudioContext();

// With:
const audioContext = getAudioContext();
```

### 2. Connect to MIDI System

```typescript
// In your MIDI handler:
import { useDrumPadStore } from './stores/useDrumPadStore';

function handleMIDIMessage(event: MIDIMessageEvent) {
  const [status, note, velocity] = event.data;

  if (status === 0x90) { // Note On
    const { getMIDIMapping, programs, currentProgramId } = useDrumPadStore.getState();
    const padId = getMIDIMapping(note);

    if (padId) {
      const program = programs.get(currentProgramId);
      const pad = program?.pads.find(p => p.id === parseInt(padId));

      if (pad) {
        // Trigger pad via audio engine
        // (You'll need to access the engine instance)
      }
    }
  }
}
```

### 3. Connect to Sample Library

```typescript
// In SampleBrowser.tsx, add your sample library:
import { getSampleLibrary } from './lib/samples';

// Replace the empty categories with:
const [categories, setCategories] = useState<SampleCategory[]>([]);

useEffect(() => {
  const loadSamples = async () => {
    const library = await getSampleLibrary();
    setCategories(library);
  };
  loadSamples();
}, []);
```

## Performance Considerations

1. **Memory**: Each AudioBuffer is stored in memory. Monitor usage with large sample libraries.
2. **Polyphony**: Currently one voice per pad. This is efficient for drum sounds.
3. **Storage**: Programs auto-save to localStorage. Monitor localStorage size for many programs.
4. **Audio Context**: Single shared AudioContext recommended for the entire app.

## Testing

Test the drum pad system:

```bash
# Type check
npm run type-check

# Build
npm run build

# Manual testing checklist:
# ✓ Click pads to trigger
# ✓ Keyboard shortcuts work
# ✓ Load samples via upload
# ✓ Drag & drop samples
# ✓ Edit pad parameters
# ✓ ADSR envelope response
# ✓ Filter controls
# ✓ Program save/load
# ✓ localStorage persistence
```

## Troubleshooting

### No Audio
- Check AudioContext state (may need user interaction to resume)
- Verify samples are loaded with valid AudioBuffers
- Check browser console for errors

### Samples Not Loading
- Verify audio file format is supported (WAV, MP3, OGG, FLAC)
- Check file size (large files may cause memory issues)
- Ensure Web Audio API is available

### Performance Issues
- Reduce number of active voices
- Lower sample quality/size
- Check for memory leaks in voice cleanup

## Future Enhancements

1. **Sample Editor**: Trim, normalize, fade samples
2. **Velocity Curves**: Customize velocity response
3. **Choke Groups**: Mute conflicting sounds (hi-hats)
4. **Pattern Sequencer**: Built-in step sequencer
5. **Effects**: Per-pad reverb, delay, distortion
6. **Export**: Render patterns to audio files
7. **Preset Management**: Share and import preset packs
8. **Multi-timbral**: Multiple programs playing simultaneously

## Support

For issues or questions:
1. Check browser console for errors
2. Verify AudioContext state
3. Test with known-good audio files
4. Review this integration guide

---

**Status**: ✅ Phase 2 Complete - Full audio engine, sample loading, and keyboard shortcuts implemented
**Next Phase**: MIDI integration and sample library connection
