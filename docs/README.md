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

## Development

### Design System

**IMPORTANT:** This project uses a strict design system. Before writing any UI code:

1. Read [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md)
2. Use existing components from `src/components/ui/`
3. **Never** create custom buttons or inline-styled elements
4. **Always** use CSS variables for colors
5. **Always** add accessibility (ARIA labels, keyboard support)

#### Quick Reference

```tsx
// ✅ DO: Use Button component
<Button variant="primary">Save</Button>

// ❌ DON'T: Create inline-styled buttons
<button className="px-4 py-2 bg-red-500">Save</button>

// ✅ DO: Use CSS variables
style={{ color: 'var(--color-accent)' }}

// ❌ DON'T: Hardcode colors
style={{ color: '#ef4444' }}
```

See [`.clauderules`](./.clauderules) for complete project rules.

### Versioning

DEViLBOX uses **automatic build number incrementation**. Every git commit increases the build number:

```
v1.0.0+42 → v1.0.0+43 → v1.0.0+44
```

- Version format: `MAJOR.MINOR.PATCH+BUILD`
- Build number = total git commit count
- Displayed in navbar with build details on hover
- Auto-generated before every build

See [`docs/VERSIONING.md`](./docs/VERSIONING.md) for complete details.

**Quick commands:**
```bash
# Check current version info
npm run version:info

# Force regenerate changelog/version
npm run changelog
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
