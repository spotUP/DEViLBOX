# DEViLBOX

A TB-303 Acid Tracker with Devil Fish Mod - create authentic acid basslines in your browser.

## Features

### TB-303 Emulation
- Authentic TB-303 sound engine with cascaded filters
- Classic acid parameters: Cutoff, Resonance, Env Mod, Decay, Accent
- Per-step slide and accent controls
- Overdrive/distortion

### Devil Fish Mod
Robin Whittle's famous TB-303 modification, faithfully recreated:
- **Normal/Accent Decay** - Independent decay controls
- **VEG (Volume Envelope Generator)** - Separate volume envelope with decay and sustain
- **Soft Attack** - Variable attack time
- **Filter Tracking** - Filter follows pitch
- **Filter FM** - Oscillator modulates filter
- **Sweep Speed** - Fast/Normal/Slow accent sweep modes
- **Muffler** - Soft/Hard output limiting
- **High Resonance** - Extended resonance range

### Tracker Interface
- FT2/ProTracker-style pattern editor
- Multiple channels with independent instruments
- Pattern sequencing and song arrangement
- Keyboard shortcuts for fast editing

### Automation
- Per-parameter automation curves
- Smooth interpolation
- Preset shapes (sine, ramp, triangle, saw, random)
- Visual feedback on knobs during playback

### Audio Engine
- Built on Tone.js and Web Audio API
- Real-time parameter changes
- Master effects (delay, reverb)
- Export to WAV

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Tech Stack

- React 19
- TypeScript
- Tone.js
- Zustand (state management)
- Tailwind CSS
- Vite

## License

MIT
