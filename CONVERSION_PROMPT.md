# Comprehensive Conversion Prompt: Scribbleton Live to React/Tailwind with FastTracker II-Style Interface

## Project Overview

Convert **Scribbleton Live** - a browser-based Digital Audio Workstation (DAW) - from Vue.js/Nuxt.js/Buefy to **React 18+ with Tailwind CSS**, while adding a professional **FastTracker II-style tracker interface** as the primary composition method.

### Current Stack → Target Stack

| Current | Target |
|---------|--------|
| Vue.js 2/3 | React 18+ with Hooks |
| Nuxt.js (SSR disabled) | Vite + React |
| Buefy (Bulma components) | Custom components + Tailwind CSS |
| vue-codemirror | @uiw/react-codemirror |
| vue-p5 | react-p5 or @p5-wrapper/react |
| Vuex-style state in components | Zustand or React Context + useReducer |
| YAML config editing | YAML + Visual Tracker Grid |

---

## Part 1: React/Tailwind Conversion

### 1.1 Project Setup

```bash
# Initialize new React project with Vite
npm create vite@latest scribbleton-react -- --template react-ts
cd scribbleton-react

# Install core dependencies
npm install tone@14.7.39 scribbletune@4.0.0 yaml file-saver

# Install UI dependencies
npm install tailwindcss postcss autoprefixer @headlessui/react lucide-react clsx tailwind-merge

# Install editor dependencies
npm install @uiw/react-codemirror @codemirror/lang-yaml

# Install visualization
npm install @p5-wrapper/react

# Install state management
npm install zustand immer

# Initialize Tailwind
npx tailwindcss init -p
```

### 1.2 Tailwind Configuration

Create `tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // FastTracker II inspired palette
        tracker: {
          bg: '#000080',        // Classic blue background
          row: '#0000AA',       // Row background
          rowAlt: '#000066',    // Alternating row
          rowHighlight: '#0000CC', // Beat highlight (every 4th)
          rowCurrent: '#4444FF', // Current playing row
          text: '#AAAAAA',      // Default text
          textBright: '#FFFFFF', // Active/selected text
          note: '#FFFF00',      // Note column (yellow)
          instrument: '#00FFFF', // Instrument column (cyan)
          volume: '#00FF00',    // Volume column (green)
          effect: '#FF00FF',    // Effect column (magenta)
          border: '#5555AA',    // Panel borders
          header: '#AA00AA',    // Header background
        },
        // DAW-style colors
        daw: {
          dark: '#1a1a2e',
          darker: '#16162a',
          accent: '#4a90d9',
          success: '#10b981',
          warning: '#f59e0b',
          danger: '#ef4444',
          muted: '#6b7280',
        }
      },
      fontFamily: {
        // Authentic tracker fonts
        tracker: ['"Perfect DOS VGA 437"', '"Px437 IBM VGA8"', '"Fixedsys"', 'Consolas', 'monospace'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      fontSize: {
        'tracker-sm': ['12px', { lineHeight: '14px' }],
        'tracker-base': ['14px', { lineHeight: '16px' }],
        'tracker-lg': ['16px', { lineHeight: '18px' }],
      },
      spacing: {
        'tracker-row': '16px',
        'tracker-cell': '32px',
      }
    },
  },
  plugins: [],
}
```

### 1.3 Project Structure

```
src/
├── components/
│   ├── common/
│   │   ├── Button.tsx
│   │   ├── Dropdown.tsx
│   │   ├── Modal.tsx
│   │   ├── Toggle.tsx
│   │   └── Tooltip.tsx
│   │
│   ├── layout/
│   │   ├── NavBar.tsx
│   │   ├── MainControls.tsx
│   │   ├── StatusBar.tsx
│   │   └── Sidebar.tsx
│   │
│   ├── tracker/
│   │   ├── TrackerView.tsx        # Main tracker container
│   │   ├── PatternEditor.tsx      # Pattern grid editor
│   │   ├── RowNumber.tsx          # Row number column
│   │   ├── NoteColumn.tsx         # Note entry column
│   │   ├── InstrumentColumn.tsx   # Instrument number column
│   │   ├── VolumeColumn.tsx       # Volume column
│   │   ├── EffectColumn.tsx       # Effect command column
│   │   ├── TrackerCell.tsx        # Individual cell component
│   │   ├── PatternList.tsx        # Pattern sequence list
│   │   ├── InstrumentList.tsx     # Instrument browser
│   │   └── SampleList.tsx         # Sample browser
│   │
│   ├── channel/
│   │   ├── ChannelStrip.tsx       # Mixer channel strip
│   │   ├── ChannelHeader.tsx      # Channel name, mute, solo
│   │   ├── VUMeter.tsx            # Volume meter
│   │   └── PanKnob.tsx            # Panning control
│   │
│   ├── instruments/
│   │   ├── InstrumentEditor.tsx   # Instrument parameter editor
│   │   ├── EnvelopeEditor.tsx     # ADSR envelope visual editor
│   │   ├── OscillatorEditor.tsx   # Oscillator waveform selector
│   │   └── EffectChain.tsx        # Effect chain editor
│   │
│   ├── visualization/
│   │   ├── Oscilloscope.tsx       # Waveform display
│   │   ├── SpectrumAnalyzer.tsx   # FFT spectrum
│   │   ├── PatternVisualizer.tsx  # Pattern overview
│   │   └── PianoRoll.tsx          # Optional piano roll view
│   │
│   └── editors/
│       ├── YamlEditor.tsx         # CodeMirror YAML editor
│       ├── ClipEditor.tsx         # Clip pattern editor
│       └── SampleEditor.tsx       # Sample waveform editor
│
├── stores/
│   ├── useTrackerStore.ts         # Tracker state (Zustand)
│   ├── useAudioStore.ts           # Audio engine state
│   ├── useProjectStore.ts         # Project/song state
│   ├── useUIStore.ts              # UI preferences
│   └── useKeyboardStore.ts        # Keyboard shortcuts state
│
├── hooks/
│   ├── useAudioEngine.ts          # Tone.js integration
│   ├── useScribbletune.ts         # Scribbletune session
│   ├── useTrackerNavigation.ts    # Keyboard navigation
│   ├── useTrackerInput.ts         # Note input handling
│   ├── useClipboard.ts            # Copy/paste patterns
│   ├── useUndo.ts                 # Undo/redo history
│   └── useKeyboardShortcuts.ts    # Global shortcuts
│
├── utils/
│   ├── noteUtils.ts               # Note conversion utilities
│   ├── patternUtils.ts            # Pattern manipulation
│   ├── midiUtils.ts               # MIDI note numbers
│   ├── effectCommands.ts          # Tracker effect commands
│   ├── fileUtils.ts               # Save/load utilities
│   └── trackerFormat.ts           # FastTracker format helpers
│
├── types/
│   ├── tracker.ts                 # Tracker data types
│   ├── audio.ts                   # Audio engine types
│   ├── project.ts                 # Project structure types
│   └── instruments.ts             # Instrument types
│
├── constants/
│   ├── notes.ts                   # Note names, octaves
│   ├── instruments.ts             # Default instrument configs
│   ├── effects.ts                 # Effect definitions
│   └── keyboardMap.ts             # Keyboard to note mapping
│
├── App.tsx
├── main.tsx
└── index.css
```

### 1.4 Component Conversion Guide

#### NavBar.vue → NavBar.tsx

```tsx
// src/components/layout/NavBar.tsx
import { useState } from 'react';
import { Menu } from '@headlessui/react';
import {
  FolderOpen, Save, Share2, HelpCircle,
  Info, Music, Settings
} from 'lucide-react';
import { Oscilloscope } from '../visualization/Oscilloscope';
import { useProjectStore } from '../../stores/useProjectStore';

export function NavBar() {
  const { loadProject, saveProject, shareProject } = useProjectStore();
  const [showHelp, setShowHelp] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  return (
    <nav className="flex items-center justify-between h-12 px-4 bg-daw-darker border-b border-daw-dark">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <Music className="w-6 h-6 text-daw-accent" />
        <span className="text-lg font-bold text-white">Scribbleton</span>
      </div>

      {/* Center - Oscilloscope */}
      <div className="flex-1 mx-8 max-w-md">
        <Oscilloscope width={260} height={50} />
      </div>

      {/* Right - Menus */}
      <div className="flex items-center gap-2">
        {/* File Menu */}
        <Menu as="div" className="relative">
          <Menu.Button className="px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-daw-dark rounded">
            File
          </Menu.Button>
          <Menu.Items className="absolute right-0 mt-1 w-48 bg-daw-darker border border-daw-dark rounded shadow-lg z-50">
            <Menu.Item>
              {({ active }) => (
                <button
                  onClick={() => document.getElementById('file-input')?.click()}
                  className={`${active ? 'bg-daw-dark' : ''} flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300`}
                >
                  <FolderOpen className="w-4 h-4" />
                  Open Project
                </button>
              )}
            </Menu.Item>
            <Menu.Item>
              {({ active }) => (
                <button
                  onClick={saveProject}
                  className={`${active ? 'bg-daw-dark' : ''} flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300`}
                >
                  <Save className="w-4 h-4" />
                  Save Project
                </button>
              )}
            </Menu.Item>
            <Menu.Item>
              {({ active }) => (
                <button
                  onClick={shareProject}
                  className={`${active ? 'bg-daw-dark' : ''} flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300`}
                >
                  <Share2 className="w-4 h-4" />
                  Share Link
                </button>
              )}
            </Menu.Item>
          </Menu.Items>
        </Menu>

        {/* Help Menu */}
        <Menu as="div" className="relative">
          <Menu.Button className="px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-daw-dark rounded">
            Help
          </Menu.Button>
          <Menu.Items className="absolute right-0 mt-1 w-48 bg-daw-darker border border-daw-dark rounded shadow-lg z-50">
            <Menu.Item>
              {({ active }) => (
                <button
                  onClick={() => setShowHelp(true)}
                  className={`${active ? 'bg-daw-dark' : ''} flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300`}
                >
                  <HelpCircle className="w-4 h-4" />
                  Documentation
                </button>
              )}
            </Menu.Item>
            <Menu.Item>
              {({ active }) => (
                <button
                  onClick={() => setShowAbout(true)}
                  className={`${active ? 'bg-daw-dark' : ''} flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300`}
                >
                  <Info className="w-4 h-4" />
                  About
                </button>
              )}
            </Menu.Item>
          </Menu.Items>
        </Menu>
      </div>

      {/* Hidden file input */}
      <input
        id="file-input"
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) loadProject(file);
        }}
      />
    </nav>
  );
}
```

#### Channel.vue → ChannelStrip.tsx

```tsx
// src/components/channel/ChannelStrip.tsx
import { useState } from 'react';
import { X, Volume2, VolumeX, Headphones } from 'lucide-react';
import { VUMeter } from './VUMeter';
import { PanKnob } from './PanKnob';
import { useAudioStore } from '../../stores/useAudioStore';
import { cn } from '../../utils/cn';

interface ChannelStripProps {
  channelId: string;
  name: string;
  isActive: boolean;
  isSolo: boolean;
  instrument: string;
  onRemove: () => void;
}

export function ChannelStrip({
  channelId,
  name,
  isActive,
  isSolo,
  instrument,
  onRemove
}: ChannelStripProps) {
  const { toggleMute, toggleSolo, setVolume, setPan } = useAudioStore();
  const [volume, setLocalVolume] = useState(0.8);
  const [pan, setLocalPan] = useState(0);

  return (
    <div className={cn(
      "flex flex-col w-20 bg-daw-dark border border-daw-darker rounded",
      !isActive && "opacity-50"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 bg-daw-darker">
        <span className="text-xs text-gray-400 truncate">{name}</span>
        <button
          onClick={onRemove}
          className="text-gray-500 hover:text-red-500"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* VU Meter */}
      <div className="flex-1 px-2 py-2">
        <VUMeter channelId={channelId} />
      </div>

      {/* Pan Knob */}
      <div className="flex justify-center py-2">
        <PanKnob
          value={pan}
          onChange={(v) => {
            setLocalPan(v);
            setPan(channelId, v);
          }}
        />
      </div>

      {/* Volume Fader */}
      <div className="px-2 py-2">
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setLocalVolume(v);
            setVolume(channelId, v);
          }}
          className="w-full h-24 appearance-none bg-transparent cursor-pointer [writing-mode:vertical-lr] [direction:rtl]"
        />
      </div>

      {/* Controls */}
      <div className="flex justify-center gap-1 px-2 py-2 border-t border-daw-darker">
        <button
          onClick={() => toggleMute(channelId)}
          className={cn(
            "p-1 rounded",
            !isActive ? "bg-red-600 text-white" : "bg-daw-darker text-gray-400 hover:text-white"
          )}
        >
          {isActive ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>
        <button
          onClick={() => toggleSolo(channelId)}
          className={cn(
            "p-1 rounded",
            isSolo ? "bg-yellow-600 text-white" : "bg-daw-darker text-gray-400 hover:text-white"
          )}
        >
          <Headphones className="w-4 h-4" />
        </button>
      </div>

      {/* Instrument Label */}
      <div className="px-2 py-1 text-center bg-daw-accent/20 text-daw-accent text-xs truncate">
        {instrument}
      </div>
    </div>
  );
}
```

#### Oscilloscope.vue → Oscilloscope.tsx

```tsx
// src/components/visualization/Oscilloscope.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { ReactP5Wrapper } from '@p5-wrapper/react';
import type { P5CanvasInstance } from '@p5-wrapper/react';
import * as Tone from 'tone';

interface OscilloscopeProps {
  width?: number;
  height?: number;
}

export function Oscilloscope({ width = 260, height = 50 }: OscilloscopeProps) {
  const [isEnabled, setIsEnabled] = useState(true);
  const analyzerRef = useRef<Tone.Analyser | null>(null);
  const fftRef = useRef<Tone.FFT | null>(null);

  useEffect(() => {
    // Create analyzers
    analyzerRef.current = new Tone.Analyser('waveform', 256);
    fftRef.current = new Tone.FFT(256);

    // Connect to master output
    Tone.Destination.connect(analyzerRef.current);
    Tone.Destination.connect(fftRef.current);

    return () => {
      analyzerRef.current?.dispose();
      fftRef.current?.dispose();
    };
  }, []);

  const sketch = useCallback((p5: P5CanvasInstance) => {
    p5.setup = () => {
      p5.createCanvas(width, height);
      p5.noFill();
    };

    p5.draw = () => {
      if (!isEnabled || !analyzerRef.current || !fftRef.current) return;

      p5.background(26, 26, 46); // daw-dark color

      const waveform = analyzerRef.current.getValue() as Float32Array;
      const spectrum = fftRef.current.getValue() as Float32Array;

      // Draw waveform (top half)
      p5.stroke(74, 144, 217); // daw-accent
      p5.strokeWeight(1);
      p5.beginShape();
      for (let i = 0; i < waveform.length; i++) {
        const x = p5.map(i, 0, waveform.length, 0, width);
        const y = p5.map(waveform[i], -1, 1, height * 0.5, 0);
        p5.vertex(x, y);
      }
      p5.endShape();

      // Draw spectrum (bottom half, filled)
      p5.fill(74, 144, 217, 100);
      p5.beginShape();
      p5.vertex(0, height);
      for (let i = 0; i < spectrum.length; i++) {
        const x = p5.map(i, 0, spectrum.length, 0, width);
        const y = p5.map(spectrum[i], -100, 0, height, height * 0.5);
        p5.vertex(x, y);
      }
      p5.vertex(width, height);
      p5.endShape(p5.CLOSE);
    };
  }, [width, height, isEnabled]);

  return (
    <div
      className="border border-daw-dark rounded overflow-hidden cursor-pointer"
      onClick={() => setIsEnabled(!isEnabled)}
      title={isEnabled ? "Click to disable" : "Click to enable"}
    >
      <ReactP5Wrapper sketch={sketch} />
    </div>
  );
}
```

### 1.5 State Management with Zustand

```typescript
// src/stores/useTrackerStore.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface TrackerCell {
  note: string | null;      // e.g., "C-4", "D#5"
  instrument: number | null; // 00-FF
  volume: number | null;     // 00-40 (0-64)
  effect: string | null;     // e.g., "A0F" (arpeggio)
}

interface Pattern {
  id: string;
  name: string;
  length: number;           // Default 64 rows
  channels: TrackerCell[][]; // [channelIndex][rowIndex]
}

interface TrackerState {
  // Pattern data
  patterns: Pattern[];
  currentPatternId: string;
  patternSequence: string[]; // Order of patterns in song

  // Cursor position
  cursorRow: number;
  cursorChannel: number;
  cursorColumn: 'note' | 'instrument' | 'volume' | 'effect';

  // Selection
  selectionStart: { row: number; channel: number } | null;
  selectionEnd: { row: number; channel: number } | null;

  // Playback
  isPlaying: boolean;
  currentPlayRow: number;
  bpm: number;
  speed: number;           // Rows per beat

  // Edit settings
  editStep: number;        // Rows to advance after note entry
  octave: number;          // Current octave (0-9)
  instrument: number;      // Current instrument
  isRecording: boolean;    // Record mode enabled

  // Actions
  setCell: (patternId: string, channel: number, row: number, cell: Partial<TrackerCell>) => void;
  setCursor: (row: number, channel: number, column?: string) => void;
  moveCursor: (direction: 'up' | 'down' | 'left' | 'right') => void;
  setSelection: (start: { row: number; channel: number } | null, end?: { row: number; channel: number } | null) => void;
  copySelection: () => TrackerCell[][];
  pasteSelection: (data: TrackerCell[][], row: number, channel: number) => void;
  clearSelection: () => void;
  insertRow: (patternId: string, row: number) => void;
  deleteRow: (patternId: string, row: number) => void;
  createPattern: (name?: string, length?: number) => string;
  deletePattern: (patternId: string) => void;
  duplicatePattern: (patternId: string) => string;
  setPatternLength: (patternId: string, length: number) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  setBpm: (bpm: number) => void;
  setEditStep: (step: number) => void;
  setOctave: (octave: number) => void;
  setInstrument: (instrument: number) => void;
}

export const useTrackerStore = create<TrackerState>()(
  immer((set, get) => ({
    // Initial state
    patterns: [{
      id: 'pattern-0',
      name: 'Pattern 00',
      length: 64,
      channels: Array(4).fill(null).map(() =>
        Array(64).fill(null).map(() => ({
          note: null,
          instrument: null,
          volume: null,
          effect: null,
        }))
      ),
    }],
    currentPatternId: 'pattern-0',
    patternSequence: ['pattern-0'],
    cursorRow: 0,
    cursorChannel: 0,
    cursorColumn: 'note',
    selectionStart: null,
    selectionEnd: null,
    isPlaying: false,
    currentPlayRow: 0,
    bpm: 125,
    speed: 6,
    editStep: 1,
    octave: 4,
    instrument: 0,
    isRecording: false,

    // Actions
    setCell: (patternId, channel, row, cellData) => {
      set((state) => {
        const pattern = state.patterns.find(p => p.id === patternId);
        if (pattern && pattern.channels[channel]?.[row]) {
          Object.assign(pattern.channels[channel][row], cellData);
        }
      });
    },

    setCursor: (row, channel, column) => {
      set((state) => {
        state.cursorRow = row;
        state.cursorChannel = channel;
        if (column) state.cursorColumn = column as any;
      });
    },

    moveCursor: (direction) => {
      set((state) => {
        const pattern = state.patterns.find(p => p.id === state.currentPatternId);
        if (!pattern) return;

        const maxChannels = pattern.channels.length;
        const maxRows = pattern.length;
        const columns = ['note', 'instrument', 'volume', 'effect'];
        const colIndex = columns.indexOf(state.cursorColumn);

        switch (direction) {
          case 'up':
            state.cursorRow = Math.max(0, state.cursorRow - 1);
            break;
          case 'down':
            state.cursorRow = Math.min(maxRows - 1, state.cursorRow + 1);
            break;
          case 'left':
            if (colIndex > 0) {
              state.cursorColumn = columns[colIndex - 1] as any;
            } else if (state.cursorChannel > 0) {
              state.cursorChannel--;
              state.cursorColumn = 'effect';
            }
            break;
          case 'right':
            if (colIndex < columns.length - 1) {
              state.cursorColumn = columns[colIndex + 1] as any;
            } else if (state.cursorChannel < maxChannels - 1) {
              state.cursorChannel++;
              state.cursorColumn = 'note';
            }
            break;
        }
      });
    },

    // ... more actions
    setSelection: () => {},
    copySelection: () => [],
    pasteSelection: () => {},
    clearSelection: () => {},
    insertRow: () => {},
    deleteRow: () => {},
    createPattern: () => '',
    deletePattern: () => {},
    duplicatePattern: () => '',
    setPatternLength: () => {},
    play: () => {},
    pause: () => {},
    stop: () => {},
    setBpm: () => {},
    setEditStep: () => {},
    setOctave: () => {},
    setInstrument: () => {},
  }))
);
```

---

## Part 2: FastTracker II-Style Tracker Interface

### 2.1 FastTracker II UI Reference

FastTracker II (FT2) is a legendary DOS-based music tracker from 1994. Key visual and functional elements:

#### Visual Characteristics
- **Color scheme**: Blue backgrounds (#000080), with colored columns
- **Font**: Fixed-width DOS font (8x16 pixels)
- **Pattern grid**: Rows numbered 00-3F (hex), columns per channel
- **Column layout per channel**: `NNN II VV EEE` (Note, Instrument, Volume, Effect)
- **Row highlighting**: Every 4th/16th row highlighted
- **Current row indicator**: Bright highlight on playing row

#### Column Format
```
C-4 01 40 000   (Full entry)
--- -- -- ---   (Empty row)
^^^ ^^ ^^ ^^^
│   │  │  └── Effect command (3 hex digits)
│   │  └───── Volume (2 hex digits, 00-40)
│   └──────── Instrument number (2 hex digits)
└───────────── Note (C-4, D#5, etc.) or --- for empty
```

#### Keyboard Shortcuts (FT2 Style)
| Key | Action |
|-----|--------|
| Space | Toggle play/stop |
| Enter | Play from current row |
| Scroll Lock | Toggle recording mode |
| Tab | Jump to next channel |
| F1-F8 | Set octave 1-8 |
| Numpad +/- | Change instrument |
| Ctrl+Up/Down | Pattern jump (skip 16 rows) |
| Alt+Up/Down | Change pattern in sequence |
| Home/End | Jump to start/end of pattern |
| Page Up/Down | Jump 16 rows |
| Insert | Insert row |
| Backspace | Delete row |
| Ctrl+C/V/X | Copy/Paste/Cut selection |
| F9 | Go to row 00 |
| F10 | Go to row 10 (16) |
| F11 | Go to row 20 (32) |
| F12 | Go to row 30 (48) |

#### Keyboard Note Entry (FT2 Layout)
```
 2 3   5 6 7   9 0   =
Q W E R T Y U I O P [ ]   (Upper octave)
 S D   G H J   L ;        (Lower octave sharps)
Z X C V B N M , . /       (Lower octave)
```

### 2.2 Tracker Component Implementation

```tsx
// src/components/tracker/TrackerView.tsx
import { useEffect, useRef, useCallback } from 'react';
import { PatternEditor } from './PatternEditor';
import { PatternList } from './PatternList';
import { InstrumentList } from './InstrumentList';
import { TrackerControls } from './TrackerControls';
import { useTrackerStore } from '../../stores/useTrackerStore';
import { useTrackerNavigation } from '../../hooks/useTrackerNavigation';
import { useTrackerInput } from '../../hooks/useTrackerInput';

export function TrackerView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    currentPatternId,
    patterns,
    cursorRow,
    cursorChannel,
    isPlaying,
    currentPlayRow
  } = useTrackerStore();

  // Keyboard navigation hook
  useTrackerNavigation(containerRef);

  // Note input hook
  useTrackerInput(containerRef);

  const currentPattern = patterns.find(p => p.id === currentPatternId);

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full bg-tracker-bg font-tracker text-tracker-text"
      tabIndex={0}
    >
      {/* Top: Controls Bar */}
      <TrackerControls />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Pattern List */}
        <div className="w-48 border-r border-tracker-border">
          <PatternList />
        </div>

        {/* Center: Pattern Editor */}
        <div className="flex-1 overflow-auto">
          {currentPattern && (
            <PatternEditor
              pattern={currentPattern}
              cursorRow={cursorRow}
              cursorChannel={cursorChannel}
              playingRow={isPlaying ? currentPlayRow : null}
            />
          )}
        </div>

        {/* Right: Instrument List */}
        <div className="w-56 border-l border-tracker-border">
          <InstrumentList />
        </div>
      </div>
    </div>
  );
}
```

```tsx
// src/components/tracker/PatternEditor.tsx
import { useRef, useEffect } from 'react';
import { TrackerRow } from './TrackerRow';
import { TrackerHeader } from './TrackerHeader';
import { Pattern } from '../../types/tracker';
import { cn } from '../../utils/cn';

interface PatternEditorProps {
  pattern: Pattern;
  cursorRow: number;
  cursorChannel: number;
  playingRow: number | null;
}

export function PatternEditor({
  pattern,
  cursorRow,
  cursorChannel,
  playingRow
}: PatternEditorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowHeight = 16; // pixels

  // Auto-scroll to keep cursor visible
  useEffect(() => {
    if (scrollRef.current) {
      const containerHeight = scrollRef.current.clientHeight;
      const scrollTop = scrollRef.current.scrollTop;
      const cursorTop = cursorRow * rowHeight;
      const cursorBottom = cursorTop + rowHeight;

      // Scroll if cursor is outside visible area (with margin)
      const margin = rowHeight * 4;
      if (cursorTop < scrollTop + margin) {
        scrollRef.current.scrollTop = Math.max(0, cursorTop - margin);
      } else if (cursorBottom > scrollTop + containerHeight - margin) {
        scrollRef.current.scrollTop = cursorBottom - containerHeight + margin;
      }
    }
  }, [cursorRow]);

  // Follow playback
  useEffect(() => {
    if (playingRow !== null && scrollRef.current) {
      const containerHeight = scrollRef.current.clientHeight;
      const playTop = playingRow * rowHeight;
      const centerOffset = (containerHeight / 2) - (rowHeight / 2);
      scrollRef.current.scrollTop = playTop - centerOffset;
    }
  }, [playingRow]);

  return (
    <div className="flex flex-col h-full">
      {/* Header with channel names */}
      <TrackerHeader channels={pattern.channels.length} />

      {/* Pattern grid */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-tracker-border"
      >
        <div className="inline-block min-w-full">
          {Array.from({ length: pattern.length }, (_, rowIndex) => (
            <TrackerRow
              key={rowIndex}
              rowIndex={rowIndex}
              channels={pattern.channels.map(ch => ch[rowIndex])}
              isCursor={rowIndex === cursorRow}
              cursorChannel={rowIndex === cursorRow ? cursorChannel : null}
              isPlaying={rowIndex === playingRow}
              isHighlight={rowIndex % 4 === 0}
              isBeatHighlight={rowIndex % 16 === 0}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

```tsx
// src/components/tracker/TrackerRow.tsx
import { TrackerCell, CellData } from './TrackerCell';
import { cn } from '../../utils/cn';

interface TrackerRowProps {
  rowIndex: number;
  channels: CellData[];
  isCursor: boolean;
  cursorChannel: number | null;
  isPlaying: boolean;
  isHighlight: boolean;
  isBeatHighlight: boolean;
}

export function TrackerRow({
  rowIndex,
  channels,
  isCursor,
  cursorChannel,
  isPlaying,
  isHighlight,
  isBeatHighlight,
}: TrackerRowProps) {
  // Format row number as hex
  const rowHex = rowIndex.toString(16).toUpperCase().padStart(2, '0');

  return (
    <div
      className={cn(
        "flex items-center h-4 font-tracker text-tracker-sm",
        isPlaying && "bg-tracker-rowCurrent",
        !isPlaying && isBeatHighlight && "bg-tracker-rowHighlight",
        !isPlaying && !isBeatHighlight && isHighlight && "bg-tracker-rowAlt",
        !isPlaying && !isHighlight && !isBeatHighlight && "bg-tracker-row"
      )}
    >
      {/* Row number */}
      <div className={cn(
        "w-8 text-center select-none",
        isPlaying ? "text-tracker-textBright" : "text-tracker-text"
      )}>
        {rowHex}
      </div>

      {/* Separator */}
      <div className="w-px h-full bg-tracker-border" />

      {/* Channel cells */}
      {channels.map((cell, channelIndex) => (
        <div key={channelIndex} className="flex">
          <TrackerCell
            data={cell}
            isCursor={isCursor && cursorChannel === channelIndex}
            isPlaying={isPlaying}
          />
          {/* Channel separator */}
          <div className="w-px h-full bg-tracker-border" />
        </div>
      ))}
    </div>
  );
}
```

```tsx
// src/components/tracker/TrackerCell.tsx
import { cn } from '../../utils/cn';
import { useTrackerStore } from '../../stores/useTrackerStore';

export interface CellData {
  note: string | null;
  instrument: number | null;
  volume: number | null;
  effect: string | null;
}

interface TrackerCellProps {
  data: CellData;
  isCursor: boolean;
  isPlaying: boolean;
}

export function TrackerCell({ data, isCursor, isPlaying }: TrackerCellProps) {
  const { cursorColumn } = useTrackerStore();

  // Format values
  const noteStr = data.note || '---';
  const instStr = data.instrument !== null
    ? data.instrument.toString(16).toUpperCase().padStart(2, '0')
    : '--';
  const volStr = data.volume !== null
    ? data.volume.toString(16).toUpperCase().padStart(2, '0')
    : '--';
  const effStr = data.effect || '---';

  const getCursorClass = (column: string) => {
    if (!isCursor) return '';
    if (cursorColumn === column) return 'bg-tracker-textBright text-tracker-bg';
    return '';
  };

  return (
    <div className="flex items-center px-1 gap-1 tracking-wider">
      {/* Note column - 3 chars */}
      <span className={cn(
        "w-7 text-tracker-note",
        getCursorClass('note'),
        isPlaying && data.note && "animate-pulse"
      )}>
        {noteStr}
      </span>

      {/* Instrument column - 2 chars */}
      <span className={cn(
        "w-5 text-tracker-instrument",
        getCursorClass('instrument')
      )}>
        {instStr}
      </span>

      {/* Volume column - 2 chars */}
      <span className={cn(
        "w-5 text-tracker-volume",
        getCursorClass('volume')
      )}>
        {volStr}
      </span>

      {/* Effect column - 3 chars */}
      <span className={cn(
        "w-7 text-tracker-effect",
        getCursorClass('effect')
      )}>
        {effStr}
      </span>
    </div>
  );
}
```

### 2.3 Keyboard Input Hook

```typescript
// src/hooks/useTrackerInput.ts
import { useEffect, useCallback } from 'react';
import { useTrackerStore } from '../stores/useTrackerStore';
import { useAudioStore } from '../stores/useAudioStore';

// FT2-style keyboard to note mapping
const KEY_TO_NOTE: Record<string, string> = {
  // Lower row (octave)
  'z': 'C', 's': 'C#', 'x': 'D', 'd': 'D#', 'c': 'E', 'v': 'F',
  'g': 'F#', 'b': 'G', 'h': 'G#', 'n': 'A', 'j': 'A#', 'm': 'B',
  // Upper row (octave + 1)
  'q': 'C', '2': 'C#', 'w': 'D', '3': 'D#', 'e': 'E', 'r': 'F',
  '5': 'F#', 't': 'G', '6': 'G#', 'y': 'A', '7': 'A#', 'u': 'B',
  'i': 'C', '9': 'C#', 'o': 'D', '0': 'D#', 'p': 'E',
  '[': 'F', '=': 'F#', ']': 'G',
};

const UPPER_ROW_KEYS = new Set(['q','w','e','r','t','y','u','i','o','p','[',']','2','3','5','6','7','9','0','=']);

export function useTrackerInput(containerRef: React.RefObject<HTMLDivElement>) {
  const {
    setCell,
    moveCursor,
    cursorRow,
    cursorChannel,
    cursorColumn,
    currentPatternId,
    octave,
    instrument,
    editStep,
    isRecording,
  } = useTrackerStore();

  const { playNote, stopNote } = useAudioStore();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't handle if in input field
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    const key = e.key.toLowerCase();

    // Note input
    if (cursorColumn === 'note' && KEY_TO_NOTE[key]) {
      e.preventDefault();
      const note = KEY_TO_NOTE[key];
      const noteOctave = UPPER_ROW_KEYS.has(key) ? octave + 1 : octave;
      const fullNote = `${note}${noteOctave}`;

      // Preview the note
      playNote(fullNote, instrument);

      // Enter note if in record mode or edit mode
      if (isRecording) {
        setCell(currentPatternId, cursorChannel, cursorRow, {
          note: fullNote,
          instrument: instrument,
        });

        // Advance cursor by edit step
        for (let i = 0; i < editStep; i++) {
          moveCursor('down');
        }
      }
    }

    // Delete/clear note
    if (key === 'delete' || key === 'backspace') {
      e.preventDefault();
      if (cursorColumn === 'note') {
        setCell(currentPatternId, cursorChannel, cursorRow, {
          note: null,
          instrument: null,
        });
      } else if (cursorColumn === 'instrument') {
        setCell(currentPatternId, cursorChannel, cursorRow, { instrument: null });
      } else if (cursorColumn === 'volume') {
        setCell(currentPatternId, cursorChannel, cursorRow, { volume: null });
      } else if (cursorColumn === 'effect') {
        setCell(currentPatternId, cursorChannel, cursorRow, { effect: null });
      }

      if (key === 'backspace') {
        moveCursor('up');
      } else {
        moveCursor('down');
      }
    }

    // Hex input for instrument/volume/effect columns
    if (/^[0-9a-f]$/i.test(key) && cursorColumn !== 'note') {
      e.preventDefault();
      // Handle hex input for other columns
      // ... implement hex digit accumulator
    }

    // Note off (key release handling)
    // Space bar in note column = note off (---)
    if (key === ' ' && cursorColumn === 'note') {
      e.preventDefault();
      setCell(currentPatternId, cursorChannel, cursorRow, {
        note: '===', // Note off symbol
      });
      moveCursor('down');
    }

  }, [
    cursorColumn, cursorRow, cursorChannel, currentPatternId,
    octave, instrument, editStep, isRecording,
    setCell, moveCursor, playNote
  ]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (KEY_TO_NOTE[key]) {
      stopNote();
    }
  }, [stopNote]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('keydown', handleKeyDown);
    container.addEventListener('keyup', handleKeyUp);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      container.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp, containerRef]);
}
```

### 2.4 Navigation Hook

```typescript
// src/hooks/useTrackerNavigation.ts
import { useEffect, useCallback } from 'react';
import { useTrackerStore } from '../stores/useTrackerStore';

export function useTrackerNavigation(containerRef: React.RefObject<HTMLDivElement>) {
  const {
    moveCursor,
    setCursor,
    patterns,
    currentPatternId,
    play,
    pause,
    stop,
    isPlaying,
    setOctave,
    octave,
  } = useTrackerStore();

  const currentPattern = patterns.find(p => p.id === currentPatternId);
  const patternLength = currentPattern?.length || 64;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't handle if in input field
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    // Arrow keys - navigation
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Jump 16 rows
        const { cursorRow } = useTrackerStore.getState();
        setCursor(Math.max(0, cursorRow - 16), useTrackerStore.getState().cursorChannel);
      } else {
        moveCursor('up');
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const { cursorRow } = useTrackerStore.getState();
        setCursor(Math.min(patternLength - 1, cursorRow + 16), useTrackerStore.getState().cursorChannel);
      } else {
        moveCursor('down');
      }
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveCursor('left');
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveCursor('right');
    }

    // Tab - next channel
    if (e.key === 'Tab') {
      e.preventDefault();
      const { cursorChannel, cursorRow } = useTrackerStore.getState();
      const numChannels = currentPattern?.channels.length || 4;
      if (e.shiftKey) {
        setCursor(cursorRow, (cursorChannel - 1 + numChannels) % numChannels, 'note');
      } else {
        setCursor(cursorRow, (cursorChannel + 1) % numChannels, 'note');
      }
    }

    // Home/End - jump to start/end
    if (e.key === 'Home') {
      e.preventDefault();
      const { cursorChannel } = useTrackerStore.getState();
      setCursor(0, cursorChannel);
    }

    if (e.key === 'End') {
      e.preventDefault();
      const { cursorChannel } = useTrackerStore.getState();
      setCursor(patternLength - 1, cursorChannel);
    }

    // Page Up/Down - jump 16 rows
    if (e.key === 'PageUp') {
      e.preventDefault();
      const { cursorRow, cursorChannel } = useTrackerStore.getState();
      setCursor(Math.max(0, cursorRow - 16), cursorChannel);
    }

    if (e.key === 'PageDown') {
      e.preventDefault();
      const { cursorRow, cursorChannel } = useTrackerStore.getState();
      setCursor(Math.min(patternLength - 1, cursorRow + 16), cursorChannel);
    }

    // F9-F12 - Jump to pattern positions (FT2 style)
    if (e.key === 'F9') {
      e.preventDefault();
      const { cursorChannel } = useTrackerStore.getState();
      setCursor(0, cursorChannel);
    }
    if (e.key === 'F10') {
      e.preventDefault();
      const { cursorChannel } = useTrackerStore.getState();
      setCursor(16, cursorChannel);
    }
    if (e.key === 'F11') {
      e.preventDefault();
      const { cursorChannel } = useTrackerStore.getState();
      setCursor(32, cursorChannel);
    }
    if (e.key === 'F12') {
      e.preventDefault();
      const { cursorChannel } = useTrackerStore.getState();
      setCursor(48, cursorChannel);
    }

    // F1-F8 - Set octave
    if (['F1','F2','F3','F4','F5','F6','F7','F8'].includes(e.key)) {
      e.preventDefault();
      const num = parseInt(e.key.slice(1));
      setOctave(num);
    }

    // Space - Play/Stop
    if (e.key === ' ' && e.target === containerRef.current) {
      // Only if not in note column (handled by input hook)
      const { cursorColumn } = useTrackerStore.getState();
      if (cursorColumn !== 'note') {
        e.preventDefault();
        if (isPlaying) {
          stop();
        } else {
          play();
        }
      }
    }

    // Enter - Play from current position
    if (e.key === 'Enter') {
      e.preventDefault();
      const { cursorRow } = useTrackerStore.getState();
      // playFromRow(cursorRow);
    }

    // Escape - Stop
    if (e.key === 'Escape') {
      e.preventDefault();
      stop();
    }

  }, [moveCursor, setCursor, currentPattern, patternLength, play, pause, stop, isPlaying, setOctave, containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, containerRef]);
}
```

### 2.5 Audio Engine Hook (Tone.js Integration)

```typescript
// src/hooks/useAudioEngine.ts
import { useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import { useTrackerStore } from '../stores/useTrackerStore';
import { useAudioStore } from '../stores/useAudioStore';

export function useAudioEngine() {
  const instrumentsRef = useRef<Map<number, Tone.PolySynth>>(new Map());
  const sequenceRef = useRef<Tone.Sequence | null>(null);

  const {
    patterns,
    currentPatternId,
    patternSequence,
    bpm,
    speed,
    isPlaying,
  } = useTrackerStore();

  const { instruments } = useAudioStore();

  // Initialize Tone.js
  useEffect(() => {
    Tone.Transport.bpm.value = bpm;
  }, [bpm]);

  // Create instruments
  useEffect(() => {
    instruments.forEach((inst, index) => {
      if (!instrumentsRef.current.has(index)) {
        const synth = new Tone.PolySynth(Tone.Synth, inst.params).toDestination();
        instrumentsRef.current.set(index, synth);
      }
    });

    return () => {
      instrumentsRef.current.forEach(synth => synth.dispose());
      instrumentsRef.current.clear();
    };
  }, [instruments]);

  // Build and play sequence
  const buildSequence = useCallback(() => {
    const pattern = patterns.find(p => p.id === currentPatternId);
    if (!pattern) return;

    // Clean up previous sequence
    if (sequenceRef.current) {
      sequenceRef.current.dispose();
    }

    // Calculate timing
    const stepDuration = `${speed}n`; // e.g., "6n" for speed 6

    // Build note events for each row
    const events = Array.from({ length: pattern.length }, (_, rowIndex) => {
      return pattern.channels.map((channel, channelIndex) => {
        const cell = channel[rowIndex];
        if (cell.note && cell.note !== '---' && cell.note !== '===') {
          return {
            note: cell.note,
            instrument: cell.instrument ?? 0,
            volume: cell.volume !== null ? cell.volume / 64 : 1,
            effect: cell.effect,
          };
        }
        if (cell.note === '===') {
          return { noteOff: true, instrument: cell.instrument ?? 0 };
        }
        return null;
      });
    });

    // Create Tone.js Sequence
    sequenceRef.current = new Tone.Sequence(
      (time, rowEvents) => {
        const rowIndex = events.indexOf(rowEvents);

        // Update UI to show current playing row
        useTrackerStore.setState({ currentPlayRow: rowIndex });

        rowEvents.forEach((event, channelIndex) => {
          if (!event) return;

          const synth = instrumentsRef.current.get(event.instrument || 0);
          if (!synth) return;

          if (event.noteOff) {
            synth.triggerRelease(time);
          } else if (event.note) {
            // Apply volume
            const vol = event.volume ?? 1;
            synth.triggerAttackRelease(event.note, stepDuration, time, vol);

            // Handle effects (basic implementation)
            if (event.effect) {
              handleEffect(event.effect, synth, time);
            }
          }
        });
      },
      events,
      stepDuration
    );

    return sequenceRef.current;
  }, [patterns, currentPatternId, speed]);

  // Handle tracker effects (simplified)
  const handleEffect = useCallback((effect: string, synth: Tone.PolySynth, time: number) => {
    const cmd = effect[0];
    const val = parseInt(effect.slice(1), 16);

    switch (cmd) {
      case '0': // Arpeggio
        // Implement arpeggio
        break;
      case '1': // Portamento up
        // synth.frequency.rampTo(...)
        break;
      case '2': // Portamento down
        break;
      case 'A': // Volume slide
        break;
      case 'C': // Volume
        synth.volume.setValueAtTime(Tone.gainToDb(val / 64), time);
        break;
      case 'F': // Set speed/tempo
        if (val < 32) {
          Tone.Transport.bpm.value = val;
        }
        break;
      // ... more effect commands
    }
  }, []);

  // Play control
  useEffect(() => {
    if (isPlaying) {
      const seq = buildSequence();
      if (seq) {
        Tone.Transport.start();
        seq.start(0);
      }
    } else {
      Tone.Transport.stop();
      if (sequenceRef.current) {
        sequenceRef.current.stop();
      }
    }
  }, [isPlaying, buildSequence]);

  // Preview note function
  const playNote = useCallback((note: string, instrumentIndex: number) => {
    const synth = instrumentsRef.current.get(instrumentIndex);
    if (synth) {
      synth.triggerAttackRelease(note, '8n');
    }
  }, []);

  const stopNote = useCallback(() => {
    instrumentsRef.current.forEach(synth => {
      synth.releaseAll();
    });
  }, []);

  return { playNote, stopNote };
}
```

### 2.6 Main App Component

```tsx
// src/App.tsx
import { useEffect } from 'react';
import { NavBar } from './components/layout/NavBar';
import { MainControls } from './components/layout/MainControls';
import { TrackerView } from './components/tracker/TrackerView';
import { ChannelMixer } from './components/channel/ChannelMixer';
import { InstrumentEditor } from './components/instruments/InstrumentEditor';
import { StatusBar } from './components/layout/StatusBar';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useUIStore } from './stores/useUIStore';
import * as Tone from 'tone';

function App() {
  const { activeView, showMixer, showInstrumentEditor } = useUIStore();

  // Initialize audio engine
  useAudioEngine();

  // Initialize Tone.js on first user interaction
  useEffect(() => {
    const initAudio = async () => {
      await Tone.start();
      console.log('Audio context started');
    };

    document.addEventListener('click', initAudio, { once: true });
    document.addEventListener('keydown', initAudio, { once: true });

    return () => {
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-daw-darker text-gray-100">
      {/* Navigation Bar */}
      <NavBar />

      {/* Main Controls */}
      <MainControls />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Tracker View (main) */}
        <div className="flex-1 overflow-hidden">
          <TrackerView />
        </div>

        {/* Optional Mixer Panel */}
        {showMixer && (
          <div className="w-80 border-l border-daw-dark overflow-y-auto">
            <ChannelMixer />
          </div>
        )}

        {/* Optional Instrument Editor Panel */}
        {showInstrumentEditor && (
          <div className="w-96 border-l border-daw-dark overflow-y-auto">
            <InstrumentEditor />
          </div>
        )}
      </div>

      {/* Status Bar */}
      <StatusBar />
    </div>
  );
}

export default App;
```

---

## Part 3: Effect Commands Reference (FT2 Compatible)

Implement these classic tracker effect commands:

| Cmd | Name | Description |
|-----|------|-------------|
| 0xy | Arpeggio | Cycle between note, note+x, note+y semitones |
| 1xx | Portamento Up | Slide pitch up by xx units per tick |
| 2xx | Portamento Down | Slide pitch down by xx units per tick |
| 3xx | Tone Portamento | Slide to note at speed xx |
| 4xy | Vibrato | Oscillate pitch (x=speed, y=depth) |
| 5xy | Tone Porta + Vol Slide | Combination of 3 and A |
| 6xy | Vibrato + Vol Slide | Combination of 4 and A |
| 7xy | Tremolo | Oscillate volume (x=speed, y=depth) |
| 8xx | Set Panning | Set stereo position (00=left, 80=center, FF=right) |
| 9xx | Sample Offset | Start sample at offset xx * 256 |
| Axy | Volume Slide | Slide volume up (x) or down (y) |
| Bxx | Position Jump | Jump to pattern position xx |
| Cxx | Set Volume | Set volume to xx (00-40) |
| Dxx | Pattern Break | Jump to next pattern at row xx |
| E1x | Fine Porta Up | Fine pitch slide up |
| E2x | Fine Porta Down | Fine pitch slide down |
| E9x | Retrigger Note | Retrigger every x ticks |
| EAx | Fine Vol Slide Up | Fine volume slide up |
| EBx | Fine Vol Slide Down | Fine volume slide down |
| ECx | Note Cut | Cut note after x ticks |
| EDx | Note Delay | Delay note by x ticks |
| Fxx | Set Speed/Tempo | If xx < 20: speed, else: BPM |

---

## Part 4: Styling Guide

### 4.1 CSS Variables for Theming

```css
/* src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* FastTracker II Blue Theme */
    --tracker-bg: #000080;
    --tracker-row: #0000AA;
    --tracker-row-alt: #000066;
    --tracker-row-highlight: #0000CC;
    --tracker-row-current: #4444FF;
    --tracker-text: #AAAAAA;
    --tracker-text-bright: #FFFFFF;
    --tracker-note: #FFFF00;
    --tracker-instrument: #00FFFF;
    --tracker-volume: #00FF00;
    --tracker-effect: #FF00FF;
    --tracker-border: #5555AA;
    --tracker-header: #AA00AA;
  }

  /* Dark Theme Alternative */
  .theme-dark {
    --tracker-bg: #1a1a2e;
    --tracker-row: #16162a;
    --tracker-row-alt: #1e1e3f;
    --tracker-row-highlight: #252550;
    --tracker-row-current: #3d3d7a;
    --tracker-text: #8888aa;
    --tracker-text-bright: #ffffff;
    --tracker-note: #ffcc00;
    --tracker-instrument: #00ccff;
    --tracker-volume: #00ff88;
    --tracker-effect: #ff66cc;
    --tracker-border: #333366;
    --tracker-header: #442266;
  }
}

/* DOS-style font (include via @font-face or Google Fonts) */
@font-face {
  font-family: 'Perfect DOS VGA 437';
  src: url('/fonts/Perfect DOS VGA 437.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
}

/* Tracker-specific utilities */
@layer components {
  .tracker-cell {
    @apply font-tracker text-tracker-base tracking-wider;
  }

  .tracker-row {
    @apply h-4 leading-4;
  }

  .tracker-cursor {
    @apply bg-white text-black;
  }

  .tracker-playing {
    @apply bg-tracker-rowCurrent;
  }
}

/* Custom scrollbar for tracker */
@layer utilities {
  .scrollbar-tracker {
    scrollbar-width: thin;
    scrollbar-color: var(--tracker-border) var(--tracker-bg);
  }

  .scrollbar-tracker::-webkit-scrollbar {
    width: 12px;
    height: 12px;
  }

  .scrollbar-tracker::-webkit-scrollbar-track {
    background: var(--tracker-bg);
  }

  .scrollbar-tracker::-webkit-scrollbar-thumb {
    background: var(--tracker-border);
    border: 2px solid var(--tracker-bg);
  }

  .scrollbar-tracker::-webkit-scrollbar-corner {
    background: var(--tracker-bg);
  }
}
```

### 4.2 Component Style Examples

```tsx
// Tracker header with FT2 styling
<div className="flex items-center h-6 bg-tracker-header border-b-2 border-tracker-border">
  <div className="w-8 text-center text-tracker-text text-xs">Row</div>
  <div className="w-px h-full bg-tracker-border" />
  {channels.map((_, i) => (
    <div key={i} className="flex-1 text-center text-tracker-textBright text-xs">
      Channel {i + 1}
    </div>
  ))}
</div>

// Pattern list item
<div className={cn(
  "flex items-center gap-2 px-2 py-1 cursor-pointer",
  isSelected ? "bg-tracker-rowCurrent text-white" : "hover:bg-tracker-row"
)}>
  <span className="text-tracker-instrument">{index.toString(16).padStart(2, '0').toUpperCase()}</span>
  <span className="text-tracker-text">{pattern.name}</span>
</div>
```

---

## Part 5: Migration Checklist

### Phase 1: Project Setup
- [ ] Create new Vite + React + TypeScript project
- [ ] Configure Tailwind CSS with tracker colors
- [ ] Install all dependencies
- [ ] Set up folder structure
- [ ] Configure ESLint and Prettier

### Phase 2: Core Infrastructure
- [ ] Create Zustand stores (tracker, audio, project, UI)
- [ ] Implement type definitions
- [ ] Create utility functions
- [ ] Set up Tone.js integration hook

### Phase 3: Layout Components
- [ ] Convert NavBar
- [ ] Create MainControls
- [ ] Implement StatusBar
- [ ] Build Modal system

### Phase 4: Tracker Interface
- [ ] Implement TrackerView container
- [ ] Build PatternEditor grid
- [ ] Create TrackerRow component
- [ ] Create TrackerCell component
- [ ] Implement TrackerHeader
- [ ] Build PatternList sidebar
- [ ] Create InstrumentList sidebar

### Phase 5: Keyboard System
- [ ] Implement navigation hook
- [ ] Implement note input hook
- [ ] Add hex input for columns
- [ ] Set up global shortcuts
- [ ] Add copy/paste functionality

### Phase 6: Audio Engine
- [ ] Connect Tone.js instruments
- [ ] Implement pattern sequencing
- [ ] Add effect command handling
- [ ] Create preview note system
- [ ] Implement transport controls

### Phase 7: Channel System
- [ ] Convert Channel component to ChannelStrip
- [ ] Implement VU meters
- [ ] Add pan knobs
- [ ] Create volume faders
- [ ] Implement mute/solo

### Phase 8: Instrument Editor
- [ ] Create YAML editor with CodeMirror
- [ ] Build envelope visual editor
- [ ] Add oscillator selector
- [ ] Implement effect chain editor

### Phase 9: Visualization
- [ ] Convert Oscilloscope to React
- [ ] Add spectrum analyzer
- [ ] Create pattern overview display

### Phase 10: File Management
- [ ] Implement save/load JSON
- [ ] Add URL sharing
- [ ] Create export functions
- [ ] Support XM/MOD import (optional)

### Phase 11: Polish
- [ ] Add loading states
- [ ] Implement undo/redo
- [ ] Add keyboard shortcut help
- [ ] Create onboarding tutorial
- [ ] Performance optimization
- [ ] Accessibility improvements

---

## Part 6: Advanced Features (Optional)

### 6.1 Piano Roll View
Add a graphical piano roll alongside the tracker:
- Vertical piano keyboard on left
- Horizontal note blocks
- Drag to create/resize notes
- Velocity shading

### 6.2 Sample Editor
Built-in waveform editor:
- Load WAV/MP3 files
- Cut, copy, paste regions
- Normalize, reverse, fade
- Loop point editing

### 6.3 Automation
Parameter automation lanes:
- Draw automation curves
- Per-pattern automation
- Interpolation modes

### 6.4 MIDI Support
Web MIDI API integration:
- MIDI keyboard input
- MIDI clock sync
- MIDI file import/export

### 6.5 Collaboration
Real-time collaboration:
- WebSocket sync
- Cursor presence
- Change tracking

---

---

## Part 7: Responsive Design (Mobile to Desktop)

The application must be **fully responsive** and usable on all devices from phones to desktops.

### 7.1 Breakpoints

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    screens: {
      'xs': '375px',   // Small phones
      'sm': '640px',   // Large phones / small tablets
      'md': '768px',   // Tablets
      'lg': '1024px',  // Small laptops
      'xl': '1280px',  // Desktops
      '2xl': '1536px', // Large desktops
    }
  }
}
```

### 7.2 Layout Adaptations

#### Mobile (< 640px)
```
┌─────────────────────────┐
│ Nav (hamburger menu)    │
├─────────────────────────┤
│ Transport Controls      │
│ [▶] [■] BPM: 125       │
├─────────────────────────┤
│                         │
│   PATTERN EDITOR        │
│   (2 channels visible)  │
│   (swipe for more)      │
│                         │
│   Row | Ch1   | Ch2     │
│   00  | C-4 01| --- --  │
│   01  | --- --| E-4 02  │
│   02  | D-4 01| --- --  │
│                         │
├─────────────────────────┤
│ [Pattern] [Inst] [Mix]  │  ← Bottom tab bar
└─────────────────────────┘
```

**Mobile Adaptations:**
- Single column layout
- Bottom tab navigation (Pattern / Instruments / Mixer)
- Swipeable channels (show 2 at a time)
- Simplified effect column (tap to edit in modal)
- Larger touch targets (44px minimum)
- On-screen piano keyboard for note entry
- Collapsible sections

#### Tablet (640px - 1024px)
```
┌─────────────────────────────────────────┐
│ Nav Bar                    [≡] Menu    │
├─────────────────────────────────────────┤
│ Transport: [▶][■][●] BPM:125 Oct:4     │
├───────────────────────┬─────────────────┤
│                       │                 │
│   PATTERN EDITOR      │  INSTRUMENT     │
│   (4 channels)        │  LIST           │
│                       │                 │
│                       │  01 Bass        │
│                       │  02 Lead        │
│                       │  03 Drums       │
│                       │                 │
├───────────────────────┴─────────────────┤
│ Instrument Editor (collapsible)         │
└─────────────────────────────────────────┘
```

**Tablet Adaptations:**
- Side-by-side pattern + instrument list
- 4 channels visible
- Collapsible instrument editor panel
- Touch-friendly controls
- Optional external keyboard support

#### Desktop (1024px+)
```
┌─────────────────────────────────────────────────────────────────┐
│ Nav Bar                              [Oscilloscope]    Menu    │
├─────────────────────────────────────────────────────────────────┤
│ Transport: [▶][■][●] Song: [________] BPM:125 Spd:6 Oct:4     │
├────────────┬────────────────────────────────────┬───────────────┤
│            │                                    │               │
│  PATTERNS  │      PATTERN EDITOR                │  INSTRUMENTS  │
│            │      (8+ channels)                 │               │
│  00 Intro  │                                    │  01 Bass      │
│  01 Verse  │  Row | Ch1     | Ch2     | Ch3    │  02 Lead      │
│  02 Chorus │  00  | C-4 01  | --- --  | E-4 03 │  03 Drums     │
│  03 Break  │  01  | --- --  | G-4 02  | --- -- │  04 Pad       │
│            │  02  | D-4 01  | --- --  | F-4 03 │               │
│            │                                    │  [+ Add]      │
│            │                                    │               │
├────────────┴────────────────────────────────────┴───────────────┤
│ INSTRUMENT EDITOR                                               │
│ [Osc] [Filter] [Envelope] [Effects]                            │
└─────────────────────────────────────────────────────────────────┘
```

**Desktop Adaptations:**
- Three-column layout
- All channels visible (scrollable)
- Full instrument editor always visible
- Keyboard shortcuts fully active
- Oscilloscope in nav bar
- Resizable panels

### 7.3 Component Responsive Behavior

#### Pattern Editor
```tsx
// Responsive channel count
const visibleChannels = {
  'xs': 2,
  'sm': 2,
  'md': 4,
  'lg': 6,
  'xl': 8,
  '2xl': 12
};

// Mobile: swipe gestures
<div className="
  overflow-x-auto
  snap-x snap-mandatory
  md:overflow-visible md:snap-none
">
  {channels.map(ch => (
    <div className="snap-start min-w-[50%] md:min-w-0">
      <Channel />
    </div>
  ))}
</div>
```

#### Tracker Row (Responsive Columns)
```tsx
// Full desktop view
<div className="hidden lg:flex">
  <NoteColumn />      {/* C-4 */}
  <InstrumentColumn /> {/* 01 */}
  <VolumeColumn />     {/* 40 */}
  <EffectColumn />     {/* 486 */}
</div>

// Tablet view (hide volume)
<div className="hidden md:flex lg:hidden">
  <NoteColumn />
  <InstrumentColumn />
  <EffectColumn />
</div>

// Mobile view (note + instrument only)
<div className="flex md:hidden">
  <NoteColumn />
  <InstrumentColumn />
  <button onClick={openEffectModal}>fx</button>
</div>
```

#### Instrument Editor
```tsx
// Desktop: inline panels
<div className="hidden lg:grid grid-cols-4 gap-4">
  <OscillatorPanel />
  <FilterPanel />
  <EnvelopePanel />
  <EffectsPanel />
</div>

// Tablet/Mobile: tabbed interface
<div className="lg:hidden">
  <Tabs>
    <Tab label="Osc"><OscillatorPanel /></Tab>
    <Tab label="Filter"><FilterPanel /></Tab>
    <Tab label="Env"><EnvelopePanel /></Tab>
    <Tab label="FX"><EffectsPanel /></Tab>
  </Tabs>
</div>
```

### 7.4 Mobile-Specific Features

#### On-Screen Piano Keyboard
```
┌─────────────────────────────────────────┐
│  ┌──┐┌──┐   ┌──┐┌──┐┌──┐   ┌──┐┌──┐   │
│  │C#││D#│   │F#││G#││A#│   │C#││D#│   │
│┌─┴──┴┴──┴─┬─┴──┴┴──┴┴──┴─┬─┴──┴┴──┴─┐ │
││ C │ D │ E │ F │ G │ A │ B │ C │ D │ E ││
│└───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘│
│ Octave: [◀ 4 ▶]                         │
└─────────────────────────────────────────┘
```

#### Touch Gestures
| Gesture | Action |
|---------|--------|
| Tap cell | Select cell |
| Double-tap | Edit cell (open modal) |
| Swipe left/right | Navigate channels |
| Swipe up/down | Scroll pattern |
| Pinch | Zoom pattern (optional) |
| Long press | Context menu |
| Two-finger tap | Play/Stop |

#### Bottom Tab Navigation
```tsx
<nav className="fixed bottom-0 left-0 right-0 md:hidden bg-daw-darker border-t border-daw-dark">
  <div className="flex justify-around py-2">
    <TabButton icon={<Grid />} label="Pattern" active={tab === 'pattern'} />
    <TabButton icon={<Music />} label="Instruments" active={tab === 'inst'} />
    <TabButton icon={<Sliders />} label="Mixer" active={tab === 'mixer'} />
    <TabButton icon={<Settings />} label="Settings" active={tab === 'settings'} />
  </div>
</nav>
```

### 7.5 Touch-Friendly Sizing

```css
/* Minimum touch target sizes */
.touch-target {
  min-height: 44px;
  min-width: 44px;
}

/* Mobile tracker row height */
.tracker-row-mobile {
  height: 48px; /* Larger for touch */
}

/* Desktop tracker row height */
.tracker-row-desktop {
  height: 16px; /* Compact for density */
}

/* Responsive slider/knob sizes */
.knob {
  @apply w-12 h-12 md:w-10 md:h-10 lg:w-8 lg:h-8;
}

.slider {
  @apply h-12 md:h-8;
}
```

### 7.6 Performance Considerations

```tsx
// Virtualize long pattern lists on mobile
import { useVirtualizer } from '@tanstack/react-virtual';

function PatternEditor({ pattern }) {
  const parentRef = useRef(null);

  const virtualizer = useVirtualizer({
    count: pattern.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48, // row height
    overscan: 5
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(virtualRow => (
          <TrackerRow
            key={virtualRow.key}
            index={virtualRow.index}
            style={{
              position: 'absolute',
              top: virtualRow.start,
              height: virtualRow.size
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

### 7.7 Responsive CSS Utilities

```css
/* Hide on mobile, show on desktop */
.desktop-only {
  @apply hidden lg:block;
}

/* Show on mobile, hide on desktop */
.mobile-only {
  @apply block lg:hidden;
}

/* Responsive text sizes */
.text-responsive {
  @apply text-sm md:text-base lg:text-sm;
}

/* Responsive padding */
.p-responsive {
  @apply p-4 md:p-3 lg:p-2;
}

/* Tracker-specific responsive */
.tracker-cell {
  @apply
    text-base leading-relaxed    /* Mobile: larger */
    md:text-sm md:leading-normal /* Tablet */
    lg:text-xs lg:leading-tight; /* Desktop: compact */
}
```

### 7.8 Testing Checklist

- [ ] iPhone SE (375px) - smallest target
- [ ] iPhone 14 Pro (393px)
- [ ] iPad Mini (768px)
- [ ] iPad Pro (1024px)
- [ ] Laptop (1366px)
- [ ] Desktop (1920px)
- [ ] Ultra-wide (2560px+)
- [ ] Touch input works correctly
- [ ] Keyboard input works on desktop
- [ ] All modals fit on screen
- [ ] No horizontal scroll on mobile
- [ ] Bottom nav doesn't overlap content
- [ ] Instrument editor usable on phone

---

## Summary

This conversion transforms Scribbleton Live from a Vue.js/Buefy application to a modern React/Tailwind CSS application with an authentic FastTracker II-style tracker interface. Key improvements include:

1. **Modern React patterns**: Hooks, Zustand state management, TypeScript
2. **Tailwind CSS styling**: Utility-first, customizable tracker theme
3. **FastTracker II interface**: Classic 4-channel tracker layout with colored columns
4. **Full keyboard support**: FT2-compatible navigation and note entry
5. **Effect commands**: Classic tracker effects (arpeggio, portamento, etc.)
6. **Improved architecture**: Clean separation of concerns, reusable components
7. **Fully responsive**: Works on phones, tablets, and desktops with adaptive layouts

The result is a professional-grade browser-based tracker that pays homage to the legendary FastTracker II while leveraging modern web technologies for performance and maintainability.
