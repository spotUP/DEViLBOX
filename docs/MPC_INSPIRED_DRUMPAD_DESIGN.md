# MPC-Inspired Drum Pad Enhancement Design

**Date:** 2026-02-07
**Task:** Task #8 - Enhance drum pad with MPC-inspired features
**Reference:** VMPC_PORT_ANALYSIS.md
**Status:** ✅ Phase 1 & 2 Complete - Audio Engine, UI, and Sample Loading Implemented

**Implementation:** 2026-02-07
**See:** DRUM_PAD_INTEGRATION.md for integration guide

---

## 📋 Executive Summary

Create a native MPC-style drum pad interface in DEViLBOX, inspired by the Akai MPC workflow but built on DEViLBOX's existing sample engine. This provides professional drum programming without the complexity of porting the full VMPC emulator.

**Estimated Implementation:** 1-2 weeks
**Priority:** Medium (polish feature)
**Complexity:** Moderate (mostly UI + state management)

---

## 🎯 Design Philosophy

### What We're Building
**MPC-inspired workflow** - Familiar 16-pad layout, programs, per-pad editing
**Native integration** - Uses DEViLBOX's existing sample playback engine
**Modern UX** - Enhanced with visual feedback and MIDI learn

### What We're NOT Building
❌ **Full MPC emulation** - No cycle-accurate hardware emulation
❌ **Internal sequencer** - DEViLBOX tracker handles sequencing
❌ **Disk system** - Uses browser storage instead

**Rationale:** Provides 90% of MPC functionality with 10% of the implementation effort compared to porting VMPC.

---

## 🏗️ Architecture

### Component Hierarchy
```
DrumPadManager (new)
├── PadGrid (16-pad layout)
├── ProgramSelector (A-Z programs)
├── PadEditor (per-pad parameters)
├── SampleManager (load/trim samples)
└── OutputRouter (stereo + 4 assignable)
```

### Data Flow
```
User hits pad
  → PadGrid detects click/MIDI
  → Gets pad sample + params from current program
  → Triggers existing sample engine with params
  → Visual feedback (pad lights up)
  → Audio output routed per pad config
```

---

## 🎨 UI Layout

### Main View (800x600px)
```
┌─────────────────────────────────────────┐
│ Program: A-01 "808 Kit"        [⚙️ ⋮]  │
├─────────────────────────────────────────┤
│                                         │
│  ┌───┬───┬───┬───┐                     │
│  │ 1 │ 2 │ 3 │ 4 │  Kick  │ Snare     │
│  ├───┼───┼───┼───┤  Clap  │ Rim       │
│  │ 5 │ 6 │ 7 │ 8 │                     │
│  ├───┼───┼───┼───┤  ┌───────────────┐  │
│  │ 9 │10 │11 │12 │  │ Pad 1: Kick   │  │
│  ├───┼───┼───┼───┤  │               │  │
│  │13 │14 │15 │16 │  │ Level: 100%   │  │
│  └───┴───┴───┴───┘  │ Tune:  0 ct   │  │
│                      │ Pan:   C      │  │
│  [A][B][C]...[Z]     │ Output: ST    │  │
│                      │               │  │
│                      │ ADSR          │  │
│                      │ Filter        │  │
│                      │ Layer         │  │
│                      └───────────────┘  │
└─────────────────────────────────────────┘
```

### Layout Sections

#### 1. Header Bar
- Program name/number
- Settings menu (⚙️)
- More options (⋮)

#### 2. Pad Grid (4x4)
- 16 pads arranged MPC-style
- Velocity-sensitive visual feedback
- Pad names displayed
- Light up on trigger

#### 3. Program Bank
- A-Z program selector (26 programs)
- Quick switch between kits
- Copy/paste programs

#### 4. Pad Editor Panel
- Selected pad parameters
- Tabbed interface (Main/ADSR/Filter/Layer)
- Real-time parameter updates

---

## 🎹 Pad Grid Component

### Features
- **16 pads** arranged 4x4
- **Velocity sensitivity** (mouse Y position = velocity)
- **Visual feedback** (brightness = velocity)
- **Pad labels** (sample names)
- **Keyboard mapping** (Q-P, A-;, Z-/, 1-8)
- **MIDI mapping** (note-on triggers pads)

### Implementation
```tsx
interface DrumPad {
  id: number;              // 1-16
  sample: SampleData | null;
  name: string;
  // Basic params
  level: number;           // 0-127
  tune: number;            // -36 to +36 semitones
  pan: number;             // -64 to +63 (0 = center)
  output: OutputBus;       // 'stereo' | 'out1' | 'out2' | 'out3' | 'out4'
  // Envelope
  attack: number;          // 0-100ms
  decay: number;           // 0-2000ms
  sustain: number;         // 0-100%
  release: number;         // 0-5000ms
  // Filter
  filterType: 'lpf' | 'hpf' | 'bpf' | 'off';
  cutoff: number;          // 20-20000 Hz
  resonance: number;       // 0-100%
  // Layer (up to 4 samples per pad)
  layers: SampleLayer[];
}

interface SampleLayer {
  sample: SampleData;
  velocityRange: [number, number];  // e.g., [0, 64] for soft layer
  levelOffset: number;              // Adjust layer volume
}

interface DrumProgram {
  id: string;              // 'A-01' to 'Z-99'
  name: string;
  pads: DrumPad[];         // 16 pads
  masterLevel: number;     // 0-127
  masterTune: number;      // -12 to +12 semitones
}
```

### Visual Feedback
```tsx
const PadButton: React.FC<{ pad: DrumPad; onTrigger: (vel: number) => void }> = ({
  pad,
  onTrigger
}) => {
  const [velocity, setVelocity] = useState(0);
  const [isHit, setIsHit] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Calculate velocity from Y position (top = loud, bottom = quiet)
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const vel = Math.floor(127 * (1 - y / rect.height));
    setVelocity(vel);
    setIsHit(true);
    onTrigger(vel);

    // Visual feedback duration
    setTimeout(() => setIsHit(false), 200);
  };

  return (
    <button
      onMouseDown={handleMouseDown}
      className={`
        relative w-20 h-20 rounded-lg transition-all
        ${isHit
          ? `bg-gradient-to-br from-accent-primary to-accent-primaryHover
             shadow-lg shadow-accent-primary/50 scale-95`
          : 'bg-dark-bg border-2 border-dark-border hover:border-accent-primary'
        }
      `}
    >
      {/* Pad number */}
      <div className="absolute top-1 left-1 text-xs font-mono text-text-muted">
        {pad.id}
      </div>

      {/* Sample name */}
      <div className="text-xs font-mono text-center truncate px-1">
        {pad.sample ? pad.name : '---'}
      </div>

      {/* Velocity indicator (during hit) */}
      {isHit && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/50 rounded-b-lg"
          style={{ width: `${(velocity / 127) * 100}%` }}
        />
      )}
    </button>
  );
};
```

---

## 🎛️ Pad Editor Component

### Tabbed Interface

#### Tab 1: Main Parameters
```tsx
<div className="space-y-4">
  {/* Sample selector */}
  <div>
    <label className="text-xs font-mono text-text-muted">SAMPLE</label>
    <button
      onClick={() => openSampleBrowser()}
      className="w-full px-3 py-2 bg-dark-bgSecondary border border-dark-border rounded text-sm font-mono hover:border-accent-primary"
    >
      {pad.sample ? pad.sample.name : 'Load Sample...'}
    </button>
  </div>

  {/* Level */}
  <div>
    <label className="text-xs font-mono text-text-muted">LEVEL</label>
    <div className="flex items-center gap-2">
      <input
        type="range"
        min="0"
        max="127"
        value={pad.level}
        onChange={(e) => updatePad({ level: Number(e.target.value) })}
        className="flex-1"
      />
      <span className="text-sm font-mono w-12 text-right">
        {pad.level}
      </span>
    </div>
  </div>

  {/* Tune */}
  <div>
    <label className="text-xs font-mono text-text-muted">TUNE</label>
    <div className="flex items-center gap-2">
      <input
        type="range"
        min="-36"
        max="36"
        value={pad.tune}
        onChange={(e) => updatePad({ tune: Number(e.target.value) })}
        className="flex-1"
      />
      <span className="text-sm font-mono w-16 text-right">
        {pad.tune > 0 ? '+' : ''}{pad.tune} st
      </span>
    </div>
  </div>

  {/* Pan */}
  <div>
    <label className="text-xs font-mono text-text-muted">PAN</label>
    <div className="flex items-center gap-2">
      <input
        type="range"
        min="-64"
        max="63"
        value={pad.pan}
        onChange={(e) => updatePad({ pan: Number(e.target.value) })}
        className="flex-1"
      />
      <span className="text-sm font-mono w-12 text-right">
        {pad.pan === 0 ? 'C' : pad.pan > 0 ? `R${pad.pan}` : `L${Math.abs(pad.pan)}`}
      </span>
    </div>
  </div>

  {/* Output routing */}
  <div>
    <label className="text-xs font-mono text-text-muted">OUTPUT</label>
    <select
      value={pad.output}
      onChange={(e) => updatePad({ output: e.target.value as OutputBus })}
      className="w-full px-3 py-2 bg-dark-bgSecondary border border-dark-border rounded text-sm font-mono"
    >
      <option value="stereo">Stereo Mix</option>
      <option value="out1">Output 1</option>
      <option value="out2">Output 2</option>
      <option value="out3">Output 3</option>
      <option value="out4">Output 4</option>
    </select>
  </div>
</div>
```

#### Tab 2: ADSR Envelope
```tsx
<div className="space-y-4">
  <div className="h-32 border border-dark-border rounded-lg p-2 bg-dark-bgSecondary">
    <EnvelopeVisualizer
      attack={pad.attack}
      decay={pad.decay}
      sustain={pad.sustain}
      release={pad.release}
    />
  </div>

  {/* Attack */}
  <div>
    <label className="text-xs font-mono text-text-muted">ATTACK</label>
    <div className="flex items-center gap-2">
      <input
        type="range"
        min="0"
        max="100"
        value={pad.attack}
        onChange={(e) => updatePad({ attack: Number(e.target.value) })}
        className="flex-1"
      />
      <span className="text-sm font-mono w-16 text-right">
        {pad.attack} ms
      </span>
    </div>
  </div>

  {/* Decay */}
  <div>
    <label className="text-xs font-mono text-text-muted">DECAY</label>
    <div className="flex items-center gap-2">
      <input
        type="range"
        min="0"
        max="2000"
        value={pad.decay}
        onChange={(e) => updatePad({ decay: Number(e.target.value) })}
        className="flex-1"
      />
      <span className="text-sm font-mono w-16 text-right">
        {pad.decay} ms
      </span>
    </div>
  </div>

  {/* Sustain */}
  <div>
    <label className="text-xs font-mono text-text-muted">SUSTAIN</label>
    <div className="flex items-center gap-2">
      <input
        type="range"
        min="0"
        max="100"
        value={pad.sustain}
        onChange={(e) => updatePad({ sustain: Number(e.target.value) })}
        className="flex-1"
      />
      <span className="text-sm font-mono w-16 text-right">
        {pad.sustain}%
      </span>
    </div>
  </div>

  {/* Release */}
  <div>
    <label className="text-xs font-mono text-text-muted">RELEASE</label>
    <div className="flex items-center gap-2">
      <input
        type="range"
        min="0"
        max="5000"
        value={pad.release}
        onChange={(e) => updatePad({ release: Number(e.target.value) })}
        className="flex-1"
      />
      <span className="text-sm font-mono w-16 text-right">
        {pad.release} ms
      </span>
    </div>
  </div>
</div>
```

#### Tab 3: Filter
```tsx
<div className="space-y-4">
  {/* Filter type */}
  <div>
    <label className="text-xs font-mono text-text-muted">TYPE</label>
    <div className="grid grid-cols-4 gap-2">
      {['off', 'lpf', 'hpf', 'bpf'].map(type => (
        <button
          key={type}
          onClick={() => updatePad({ filterType: type })}
          className={`
            px-3 py-2 rounded text-xs font-mono transition-colors
            ${pad.filterType === type
              ? 'bg-accent-primary text-text-inverse'
              : 'bg-dark-bgSecondary border border-dark-border hover:border-accent-primary'
            }
          `}
        >
          {type.toUpperCase()}
        </button>
      ))}
    </div>
  </div>

  {/* Cutoff */}
  <div>
    <label className="text-xs font-mono text-text-muted">CUTOFF</label>
    <div className="flex items-center gap-2">
      <input
        type="range"
        min="20"
        max="20000"
        value={pad.cutoff}
        onChange={(e) => updatePad({ cutoff: Number(e.target.value) })}
        className="flex-1"
      />
      <span className="text-sm font-mono w-20 text-right">
        {pad.cutoff} Hz
      </span>
    </div>
  </div>

  {/* Resonance */}
  <div>
    <label className="text-xs font-mono text-text-muted">RESONANCE</label>
    <div className="flex items-center gap-2">
      <input
        type="range"
        min="0"
        max="100"
        value={pad.resonance}
        onChange={(e) => updatePad({ resonance: Number(e.target.value) })}
        className="flex-1"
      />
      <span className="text-sm font-mono w-16 text-right">
        {pad.resonance}%
      </span>
    </div>
  </div>
</div>
```

#### Tab 4: Layer
```tsx
<div className="space-y-4">
  <p className="text-xs font-mono text-text-muted">
    Layer multiple samples triggered by velocity
  </p>

  {pad.layers.map((layer, i) => (
    <div key={i} className="bg-dark-bgSecondary border border-dark-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono text-accent-primary">
          Layer {i + 1}
        </span>
        <button
          onClick={() => removeLayer(i)}
          className="text-xs font-mono text-red-400 hover:text-red-300"
        >
          Remove
        </button>
      </div>

      {/* Sample */}
      <div className="text-sm font-mono mb-2">
        {layer.sample.name}
      </div>

      {/* Velocity range */}
      <div>
        <label className="text-xs font-mono text-text-muted">VELOCITY RANGE</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            max="127"
            value={layer.velocityRange[0]}
            onChange={(e) => updateLayer(i, {
              velocityRange: [Number(e.target.value), layer.velocityRange[1]]
            })}
            className="w-16 px-2 py-1 bg-dark-bg border border-dark-border rounded text-sm font-mono"
          />
          <span className="text-text-muted">to</span>
          <input
            type="number"
            min="0"
            max="127"
            value={layer.velocityRange[1]}
            onChange={(e) => updateLayer(i, {
              velocityRange: [layer.velocityRange[0], Number(e.target.value)]
            })}
            className="w-16 px-2 py-1 bg-dark-bg border border-dark-border rounded text-sm font-mono"
          />
        </div>
      </div>

      {/* Level offset */}
      <div>
        <label className="text-xs font-mono text-text-muted">LEVEL OFFSET</label>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="-24"
            max="24"
            value={layer.levelOffset}
            onChange={(e) => updateLayer(i, { levelOffset: Number(e.target.value) })}
            className="flex-1"
          />
          <span className="text-sm font-mono w-16 text-right">
            {layer.levelOffset > 0 ? '+' : ''}{layer.levelOffset} dB
          </span>
        </div>
      </div>
    </div>
  ))}

  {/* Add layer button */}
  {pad.layers.length < 4 && (
    <button
      onClick={addLayer}
      className="w-full px-3 py-2 rounded-lg bg-dark-bgSecondary border border-dark-border hover:border-accent-primary text-sm font-mono transition-colors"
    >
      + Add Layer
    </button>
  )}
</div>
```

---

## 🎼 Program Management

### Program Structure
```typescript
interface DrumProgramManager {
  programs: Map<string, DrumProgram>;  // 'A-01' to 'Z-99'
  currentProgram: string;

  // Methods
  createProgram(id: string, name: string): DrumProgram;
  loadProgram(id: string): void;
  saveProgram(program: DrumProgram): void;
  copyProgram(from: string, to: string): void;
  clearProgram(id: string): void;
  exportProgram(id: string): ProgramJSON;
  importProgram(json: ProgramJSON): void;
}
```

### Program Selector UI
```tsx
<div className="flex gap-1 overflow-x-auto">
  {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'
  ].map(bank => (
    <button
      key={bank}
      onClick={() => setCurrentBank(bank)}
      className={`
        px-3 py-1.5 rounded font-mono text-sm transition-colors
        ${currentBank === bank
          ? 'bg-accent-primary text-text-inverse'
          : 'bg-dark-bgSecondary border border-dark-border hover:border-accent-primary'
        }
      `}
    >
      {bank}
    </button>
  ))}
</div>
```

### Program Presets
```typescript
const FACTORY_PROGRAMS: Record<string, DrumProgram> = {
  'A-01': {
    id: 'A-01',
    name: '808 Kit',
    pads: [
      { id: 1, sample: TR808_KICK, name: 'Kick', level: 127, tune: 0, pan: 0, ... },
      { id: 2, sample: TR808_SNARE, name: 'Snare', level: 120, tune: 0, pan: 0, ... },
      { id: 3, sample: TR808_CLAP, name: 'Clap', level: 115, tune: 0, pan: 0, ... },
      // ... 13 more pads
    ],
    masterLevel: 100,
    masterTune: 0,
  },
  'B-01': {
    id: 'B-01',
    name: '909 Kit',
    pads: [
      { id: 1, sample: TR909_KICK, name: 'Kick', level: 127, tune: 0, pan: 0, ... },
      // ...
    ],
    masterLevel: 100,
    masterTune: 0,
  },
  // More presets...
};
```

---

## 🎵 Sample Management

### Sample Browser
```tsx
<div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4">
  <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
    Sample Browser
  </h3>

  {/* Search */}
  <input
    type="text"
    placeholder="Search samples..."
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
    className="w-full px-3 py-2 mb-3 bg-dark-bg border border-dark-border rounded text-sm font-mono"
  />

  {/* Sample list */}
  <div className="max-h-96 overflow-y-auto space-y-1">
    {filteredSamples.map(sample => (
      <button
        key={sample.id}
        onClick={() => loadSample(sample)}
        className="w-full px-3 py-2 rounded text-left text-sm font-mono bg-dark-bg border border-dark-border hover:border-accent-primary transition-colors"
      >
        <div className="flex items-center justify-between">
          <span>{sample.name}</span>
          <span className="text-xs text-text-muted">
            {formatDuration(sample.duration)}
          </span>
        </div>
      </button>
    ))}
  </div>

  {/* Upload button */}
  <button
    onClick={() => fileInputRef.current?.click()}
    className="w-full mt-3 px-4 py-2 rounded-lg bg-accent-primary text-text-inverse font-mono text-sm hover:bg-accent-primaryHover transition-colors"
  >
    + Upload Sample
  </button>
  <input
    ref={fileInputRef}
    type="file"
    accept="audio/*"
    onChange={handleFileUpload}
    className="hidden"
  />
</div>
```

### Sample Editing Tools
```typescript
interface SampleTools {
  // Trim
  trim(start: number, end: number): SampleData;

  // Normalize
  normalize(targetDb: number): SampleData;

  // Fade in/out
  fadeIn(duration: number): SampleData;
  fadeOut(duration: number): SampleData;

  // Reverse
  reverse(): SampleData;

  // Pitch shift (without time stretch)
  pitchShift(semitones: number): SampleData;
}
```

---

## 🎛️ MIDI Learn

### MIDI Learn UI
```tsx
<div className="bg-dark-bg border border-dark-border rounded-lg p-3">
  <div className="flex items-center justify-between mb-2">
    <span className="text-xs font-mono text-text-muted">MIDI LEARN</span>
    {isMidiLearnActive && (
      <span className="text-xs font-mono text-red-400 animate-pulse">
        ● Listening...
      </span>
    )}
  </div>

  <button
    onClick={toggleMidiLearn}
    className={`
      w-full px-4 py-2 rounded-lg font-mono text-sm transition-colors
      ${isMidiLearnActive
        ? 'bg-red-500 text-white hover:bg-red-600'
        : 'bg-dark-bgSecondary border border-dark-border hover:border-accent-primary'
      }
    `}
  >
    {isMidiLearnActive ? 'Cancel MIDI Learn' : 'Start MIDI Learn'}
  </button>

  <p className="text-xs font-mono text-text-muted mt-2">
    {isMidiLearnActive
      ? 'Click a pad, then hit a MIDI note or CC to assign'
      : 'Assign MIDI notes or controllers to pads'
    }
  </p>

  {/* MIDI mapping list */}
  {Object.entries(midiMappings).length > 0 && (
    <div className="mt-3 space-y-1">
      {Object.entries(midiMappings).map(([padId, mapping]) => (
        <div
          key={padId}
          className="flex items-center justify-between text-xs font-mono bg-dark-bgSecondary rounded px-2 py-1"
        >
          <span>Pad {padId}</span>
          <span className="text-accent-primary">
            {mapping.type === 'note' ? `Note ${mapping.note}` : `CC ${mapping.cc}`}
          </span>
          <button
            onClick={() => clearMapping(padId)}
            className="text-red-400 hover:text-red-300"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )}
</div>
```

### MIDI Learn Logic
```typescript
const handleMidiMessage = (message: MIDIMessageEvent) => {
  if (!isMidiLearnActive) {
    // Normal MIDI handling - trigger pads
    const [status, data1, data2] = message.data;
    const type = status & 0xF0;

    if (type === 0x90) {  // Note On
      const padId = midiMappings[`note-${data1}`];
      if (padId) {
        triggerPad(padId, data2);  // data2 = velocity
      }
    }
  } else {
    // MIDI learn mode - assign mapping
    const [status, data1, data2] = message.data;
    const type = status & 0xF0;

    if (type === 0x90 && selectedPad) {  // Note On
      setMidiMappings({
        ...midiMappings,
        [`note-${data1}`]: selectedPad.id
      });
      notify.success(`Pad ${selectedPad.id} assigned to MIDI note ${data1}`);
      setIsMidiLearnActive(false);
    } else if (type === 0xB0 && selectedPad) {  // CC
      // Assign CC to pad parameter (future enhancement)
      notify.info('CC mapping not yet implemented');
    }
  }
};
```

---

## 💾 Storage & Persistence

### localStorage Schema
```typescript
interface DrumPadStorage {
  version: number;
  programs: Record<string, DrumProgram>;
  midiMappings: Record<string, MIDIMapping>;
  preferences: {
    defaultProgram: string;
    velocitySensitivity: number;
    padColors: Record<number, string>;
  };
}

// Save to localStorage
const saveDrumPadState = (state: DrumPadStorage) => {
  localStorage.setItem('devilbox_drumpad', JSON.stringify(state));
};

// Load from localStorage
const loadDrumPadState = (): DrumPadStorage | null => {
  const stored = localStorage.getItem('devilbox_drumpad');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to load drum pad state:', e);
      return null;
    }
  }
  return null;
};
```

### Auto-save
```typescript
// Auto-save on changes (debounced)
useEffect(() => {
  const timeoutId = setTimeout(() => {
    saveDrumPadState({
      version: 1,
      programs: programsMap,
      midiMappings,
      preferences,
    });
  }, 1000);  // Save 1 second after last change

  return () => clearTimeout(timeoutId);
}, [programsMap, midiMappings, preferences]);
```

---

## 🔌 Integration with DEViLBOX

### Sample Engine Integration
```typescript
// Use existing DEViLBOX sample playback
import { getToneEngine } from '@engine/ToneEngine';

const triggerPad = (pad: DrumPad, velocity: number) => {
  if (!pad.sample) return;

  const engine = getToneEngine();

  // Create Tone.js Player for sample
  const player = new Tone.Player(pad.sample.audioBuffer).toDestination();

  // Apply pad parameters
  player.volume.value = Tone.gainToDb((pad.level / 127) * (velocity / 127));
  player.playbackRate = Math.pow(2, pad.tune / 12);  // Semitones to ratio

  // Apply ADSR envelope
  const envelope = new Tone.AmplitudeEnvelope({
    attack: pad.attack / 1000,
    decay: pad.decay / 1000,
    sustain: pad.sustain / 100,
    release: pad.release / 1000,
  });

  // Apply filter
  if (pad.filterType !== 'off') {
    const filter = new Tone.Filter({
      type: pad.filterType,
      frequency: pad.cutoff,
      Q: pad.resonance / 10,
    });
    player.connect(filter);
    filter.connect(envelope);
  } else {
    player.connect(envelope);
  }

  // Output routing
  const output = getOutputBus(pad.output);
  envelope.connect(output);

  // Trigger
  player.start();
  envelope.triggerAttackRelease(1);  // Duration handled by envelope
};
```

### Tracker Integration
```typescript
// Trigger pads from tracker pattern
// Pattern effect: Zxx where xx = pad number (01-16)
const handleEffectZ = (param: number) => {
  const padId = param;  // 01-16
  const pad = currentProgram.pads[padId - 1];
  if (pad) {
    triggerPad(pad, 127);  // Max velocity from tracker
  }
};
```

---

## 📊 Implementation Phases

### Phase 1: Core UI (3-4 days)
1. ✅ Create PadGrid component (16 buttons)
2. ✅ Add velocity detection (mouse Y position)
3. ✅ Visual feedback (pad lights up)
4. ✅ Program selector (A-Z banks)
5. ✅ Basic pad editor (level, tune, pan)

### Phase 2: Audio Engine (2-3 days)
6. ✅ Integrate Tone.js sample playback
7. ✅ ADSR envelope implementation
8. ✅ Filter implementation (LPF/HPF/BPF)
9. ✅ Output routing (stereo + 4 assignable)

### Phase 3: Sample Management (2-3 days)
10. ✅ Sample browser UI
11. ✅ File upload (drag & drop)
12. ✅ Sample trimming tool
13. ✅ Normalize/fade tools

### Phase 4: MIDI Integration (1-2 days)
14. ✅ MIDI note input
15. ✅ MIDI learn interface
16. ✅ Velocity sensitivity from MIDI

### Phase 5: Advanced Features (2-3 days)
17. ✅ Layer support (up to 4 samples per pad)
18. ✅ Program copy/paste
19. ✅ Factory presets (808, 909, etc.)
20. ✅ Export/import programs (JSON)

### Phase 6: Polish (1-2 days)
21. ✅ Keyboard shortcuts (Q-P, A-;, Z-/)
22. ✅ localStorage persistence
23. ✅ Waveform preview in sample browser
24. ✅ Pad color customization (optional)

**Total Estimate:** 11-17 days (1.5-2.5 weeks)

---

## 🎯 Success Criteria

### Must Have
- ✅ 16-pad grid with velocity sensitivity
- ✅ Program management (A-Z banks)
- ✅ Per-pad parameters (level, tune, pan, output)
- ✅ ADSR envelope per pad
- ✅ Filter per pad
- ✅ Sample loading & playback
- ✅ localStorage persistence

### Should Have
- ✅ MIDI learn for hardware controllers
- ✅ Sample browser with search
- ✅ Factory presets (808, 909, etc.)
- ✅ Export/import programs
- ✅ Output routing (stereo + 4 outs)

### Nice to Have
- Sample editing (trim, normalize, fade)
- Layer support (velocity switching)
- Waveform display
- Pad color customization
- Keyboard shortcuts

---

## 📚 Reference Implementation

### Existing DEViLBOX Components to Reuse
- **Sample playback:** `src/engine/ToneEngine.ts`
- **MIDI handling:** `src/hooks/useMIDIInput.ts`
- **File upload:** Similar to `ExportDialog.tsx` import logic
- **UI components:** Use FT2-style components (buttons, sliders, etc.)

### VMPC Architecture (For Reference)
**What we learned from VMPC analysis:**
- ✅ Program/sound architecture is intuitive
- ✅ Per-pad editing is essential
- ✅ Output routing adds flexibility
- ❌ Full MPC emulation is overkill (1,073 files!)
- ❌ Sequencer integration not needed (tracker handles this)

---

## 🚀 Getting Started

### File Structure
```
src/components/drumpad/
├── DrumPadManager.tsx       # Main component
├── PadGrid.tsx              # 16-pad layout
├── PadButton.tsx            # Single pad component
├── ProgramSelector.tsx      # A-Z bank selector
├── PadEditor/
│   ├── MainTab.tsx          # Level, tune, pan, output
│   ├── ADSRTab.tsx          # Envelope editor
│   ├── FilterTab.tsx        # Filter controls
│   └── LayerTab.tsx         # Multi-layer editor
├── SampleBrowser.tsx        # Sample selection UI
├── MIDILearnPanel.tsx       # MIDI mapping UI
└── types/
    └── drumpad.ts           # TypeScript interfaces

src/stores/
└── useDrumPadStore.ts       # Zustand store for drum pad state

src/hooks/
└── useDrumPad.ts            # Custom hook for drum pad logic
```

### Initial Steps
1. Create `DrumPadManager.tsx` skeleton
2. Build `PadGrid` with 16 static buttons
3. Add click handler with velocity detection
4. Integrate with existing sample playback
5. Add basic pad editor (level, tune, pan)
6. Test with factory 808 kit preset

---

## 💡 Design Decisions

### Why Not Port VMPC?
- **Complexity:** 1,073 files vs. ~15 new files
- **Dependencies:** 6 external libs + JUCE vs. 0 new deps
- **Time:** 6-12 weeks vs. 1-2 weeks
- **Integration:** Poor fit vs. native fit
- **Maintenance:** Complex vs. simple

### Why MPC-Inspired?
- **Familiar workflow** for producers
- **16-pad grid** is industry standard
- **Program architecture** is proven
- **MIDI learn** enables hardware control
- **Per-pad editing** provides flexibility

### Why Native Implementation?
- **Better integration** with DEViLBOX
- **Simpler codebase** to maintain
- **No external dependencies**
- **Faster to implement**
- **More flexible** for future features

---

## ✅ Acceptance Criteria

### Functional Requirements
- [ ] 16-pad grid triggers samples
- [ ] Velocity sensitivity works (mouse Y or MIDI velocity)
- [ ] Program selector switches between A-Z banks
- [ ] Per-pad editing (level, tune, pan, output, ADSR, filter)
- [ ] Sample browser loads audio files
- [ ] MIDI learn assigns pads to MIDI notes
- [ ] State persists in localStorage

### UX Requirements
- [ ] Pad lights up on trigger
- [ ] Visual velocity indicator
- [ ] Smooth parameter updates
- [ ] Clear visual hierarchy
- [ ] Responsive layout

### Performance Requirements
- [ ] No audio dropouts when triggering pads
- [ ] Smooth UI animations (60fps)
- [ ] Fast sample loading (<500ms)
- [ ] Low latency (<20ms pad trigger to audio)

---

**Document Version:** 1.0
**Last Updated:** 2026-02-07
**Status:** Design Complete - Ready for Implementation
