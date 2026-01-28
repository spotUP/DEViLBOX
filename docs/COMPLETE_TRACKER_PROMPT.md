# Complete Tracker Development Prompt

**Project:** FastTracker II-Style Web Tracker with Tone.js
**Target:** React 18 + Tailwind CSS + Tone.js
**Purpose:** Music and sound effects for BBS door games
**Export:** Tone.js-compatible JSON files
**Special Feature:** Authentic TB-303 acid bass emulation with accent, slide, and filter automation

---

## Table of Contents

### Part A: React/Tailwind Conversion
1. [Project Setup](#part-1-reacttailwind-conversion)
2. [Tailwind Configuration](#12-tailwind-configuration)
3. [Project Structure](#13-project-structure)
4. [Component Conversion Guide](#14-component-conversion-guide)
5. [State Management with Zustand](#15-state-management-with-zustand)

### Part B: FastTracker II Interface
1. [Tracker Interface Implementation](#part-2-fasttracker-ii-style-tracker-interface)
2. [Keyboard Input Hook](#23-keyboard-input-hook)
3. [Navigation Hook](#24-navigation-hook)
4. [Audio Engine Hook](#25-audio-engine-hook-tonejs-integration)

### Part C: Effect Commands
1. [FT2-Compatible Effects](#part-3-effect-commands-reference-ft2-compatible)

### Part D: Styling
1. [CSS Variables for Theming](#part-4-styling-guide)
2. [Component Style Examples](#42-component-style-examples)

### Part E: Migration Checklist
1. [Implementation Phases](#part-5-migration-checklist)

### Part F: Advanced Features
1. [Optional Enhancements](#part-6-advanced-features-optional)

### Part G: Responsive Design
1. [Breakpoints](#71-breakpoints)
2. [Layout Adaptations](#72-layout-adaptations)
3. [Mobile Features](#74-mobile-specific-features)
4. [Touch Gestures](#touch-gestures)

### Part H: Sound Integration
1. [Tracker to Sound Architecture](#part-1-tracker--sound-architecture)
2. [FT2 Effect Commands](#13-effect-commands-full-ft2-standard)
3. [Parameter Automation & Filter Columns](#part-7-parameter-automation--filter-columns)
4. [Automation Curve Editor](#74-automation-curve-editor-visual-mode)
5. [303-Style Acid Workflow](#79-303-style-acid-workflow)
6. [TB-303 Emulation (Authentic Acid)](#part-8-tb-303-emulation-authentic-acid)
7. [303 Tracker Columns (ACC, SLD, CUT, RES)](#83-tb-303-tracker-columns)
8. [303 Effect Commands](#811-303-effect-commands-ft2-extended)
9. [Classic 303 Patterns](#812-classic-303-patterns)

### Part I: Instrument Editor
1. [Synth Engine Selection (12 types)](#part-1-synth-engine-selection)
2. [Signal Flow View](#part-2-signal-flow-view)
3. [Oscillator Section](#part-3-oscillator-section-full-tonejs-options)
4. [Envelope Section](#part-4-envelope-section-full-adsr--curves)
5. [Filter Section](#part-5-filter-section-full-tonejs-filter)
6. [Synth-Specific Parameters](#part-6-synth-specific-parameters)
7. [Effects Section](#part-7-effects-section-all-tonejs-effects)
8. [Sampler Configuration](#part-8-sampler-configuration)
9. [Preset System](#part-10-preset-system)
10. [Factory Presets (36 Instruments)](#part-11-factory-presets-32-instruments)
11. [TB-303 Acid Synth Engine](#part-12-tb-303-acid-synth-engine)
12. [303 Presets (8 variations)](#123-tb-303-presets)

### Part J: Export Format
1. [Export Types](#part-1-export-types)
2. [Song Export Format](#part-2-song-export-format)
3. [Instrument Export Format](#part-3-instrument-export-format)
4. [Sound Effect Export Format](#part-4-sound-effect-export-format)
5. [Playback Library](#part-5-playback-library)
6. [BBS Door Integration](#52-usage-in-bbs-door)

---

# PART A: REACT/TAILWIND CONVERSION

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
│   │   ├── AutomationColumn.tsx   # Filter/param automation column
│   │   ├── TrackerCell.tsx        # Individual cell component
│   │   ├── PatternList.tsx        # Pattern sequence list
│   │   ├── InstrumentList.tsx     # Instrument browser
│   │   ├── AutomationLane.tsx     # Curve/keyframe editor
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
│   │   ├── FilterEditor.tsx       # Filter controls + visualization
│   │   └── EffectChain.tsx        # Effect chain editor
│   │
│   ├── visualization/
│   │   ├── Oscilloscope.tsx       # Waveform display
│   │   ├── SpectrumAnalyzer.tsx   # FFT spectrum
│   │   ├── PatternVisualizer.tsx  # Pattern overview
│   │   ├── FilterResponse.tsx     # Filter frequency response
│   │   └── AutomationCurve.tsx    # Automation curve display
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
│   ├── useAutomationStore.ts      # Automation/parameter state
│   ├── useUIStore.ts              # UI preferences
│   └── useKeyboardStore.ts        # Keyboard shortcuts state
│
├── hooks/
│   ├── useAudioEngine.ts          # Tone.js integration
│   ├── useScribbletune.ts         # Scribbletune session
│   ├── useTrackerNavigation.ts    # Keyboard navigation
│   ├── useTrackerInput.ts         # Note input handling
│   ├── useAutomation.ts           # Automation playback
│   ├── useClipboard.ts            # Copy/paste patterns
│   ├── useUndo.ts                 # Undo/redo history
│   └── useKeyboardShortcuts.ts    # Global shortcuts
│
├── utils/
│   ├── noteUtils.ts               # Note conversion utilities
│   ├── patternUtils.ts            # Pattern manipulation
│   ├── midiUtils.ts               # MIDI note numbers
│   ├── effectCommands.ts          # Tracker effect commands
│   ├── automationUtils.ts         # Curve interpolation
│   ├── fileUtils.ts               # Save/load utilities
│   └── trackerFormat.ts           # FastTracker format helpers
│
├── types/
│   ├── tracker.ts                 # Tracker data types
│   ├── audio.ts                   # Audio engine types
│   ├── automation.ts              # Automation types
│   ├── project.ts                 # Project structure types
│   └── instruments.ts             # Instrument types
│
├── constants/
│   ├── notes.ts                   # Note names, octaves
│   ├── instruments.ts             # Default instrument configs
│   ├── presets.ts                 # Factory presets (36)
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
      <div className="flex-1 mx-8 max-w-md hidden md:block">
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

interface AutomationData {
  mode: 'steps' | 'curve' | 'keyframes';
  values?: number[];
  points?: { row: number; value: number; curve?: string }[];
  keyframes?: { row: number; value: number; interpolation: string }[];
}

interface ChannelAutomation {
  filterCutoff?: AutomationData;
  resonance?: AutomationData;
  panning?: AutomationData;
  [key: string]: AutomationData | undefined;
}

interface Pattern {
  id: string;
  name: string;
  length: number;           // Default 64 rows
  channels: {
    notes: TrackerCell[];
    automation: ChannelAutomation;
  }[];
}

interface TrackerState {
  // Pattern data
  patterns: Pattern[];
  currentPatternId: string;
  patternSequence: string[]; // Order of patterns in song

  // Cursor position
  cursorRow: number;
  cursorChannel: number;
  cursorColumn: 'note' | 'instrument' | 'volume' | 'effect' | string;

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

  // Automation
  visibleAutomationColumns: Record<number, string[]>; // channelIndex -> column names

  // Actions
  setCell: (patternId: string, channel: number, row: number, cell: Partial<TrackerCell>) => void;
  setAutomation: (patternId: string, channel: number, param: string, data: AutomationData) => void;
  setCursor: (row: number, channel: number, column?: string) => void;
  moveCursor: (direction: 'up' | 'down' | 'left' | 'right') => void;
  // ... more actions
}

export const useTrackerStore = create<TrackerState>()(
  immer((set, get) => ({
    // Initial state
    patterns: [{
      id: 'pattern-0',
      name: 'Pattern 00',
      length: 64,
      channels: Array(4).fill(null).map(() => ({
        notes: Array(64).fill(null).map(() => ({
          note: null,
          instrument: null,
          volume: null,
          effect: null,
        })),
        automation: {},
      })),
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
    visibleAutomationColumns: {},

    // Actions
    setCell: (patternId, channel, row, cellData) => {
      set((state) => {
        const pattern = state.patterns.find(p => p.id === patternId);
        if (pattern && pattern.channels[channel]?.notes[row]) {
          Object.assign(pattern.channels[channel].notes[row], cellData);
        }
      });
    },

    setAutomation: (patternId, channel, param, data) => {
      set((state) => {
        const pattern = state.patterns.find(p => p.id === patternId);
        if (pattern && pattern.channels[channel]) {
          pattern.channels[channel].automation[param] = data;
        }
      });
    },

    setCursor: (row, channel, column) => {
      set((state) => {
        state.cursorRow = row;
        state.cursorChannel = channel;
        if (column) state.cursorColumn = column;
      });
    },

    moveCursor: (direction) => {
      set((state) => {
        const pattern = state.patterns.find(p => p.id === state.currentPatternId);
        if (!pattern) return;

        const maxChannels = pattern.channels.length;
        const maxRows = pattern.length;

        switch (direction) {
          case 'up':
            state.cursorRow = Math.max(0, state.cursorRow - 1);
            break;
          case 'down':
            state.cursorRow = Math.min(maxRows - 1, state.cursorRow + 1);
            break;
          case 'left':
            // Navigate through columns
            break;
          case 'right':
            // Navigate through columns
            break;
        }
      });
    },
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

#### Extended Columns (Automation)
```
C-4 01 40 000 | 80 60 -- --   (With automation)
              | ^^ ^^ ^^ ^^
              | │  │  │  └── Pan
              | │  │  └───── Filter Env
              | │  └──────── Resonance
              | └───────────  Filter Cutoff
```

### 2.2 Tracker Component Implementation

```tsx
// src/components/tracker/TrackerView.tsx
import { useEffect, useRef } from 'react';
import { PatternEditor } from './PatternEditor';
import { PatternList } from './PatternList';
import { InstrumentList } from './InstrumentList';
import { AutomationLane } from './AutomationLane';
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
    currentPlayRow,
    visibleAutomationColumns
  } = useTrackerStore();

  // Keyboard navigation hook
  useTrackerNavigation(containerRef);

  // Note input hook
  useTrackerInput(containerRef);

  const currentPattern = patterns.find(p => p.id === currentPatternId);
  const showAutomation = Object.keys(visibleAutomationColumns).length > 0;

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
        <div className="w-48 border-r border-tracker-border hidden lg:block">
          <PatternList />
        </div>

        {/* Center: Pattern Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
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

          {/* Automation Lane (collapsible) */}
          {showAutomation && (
            <div className="h-48 border-t border-tracker-border">
              <AutomationLane />
            </div>
          )}
        </div>

        {/* Right: Instrument List */}
        <div className="w-56 border-l border-tracker-border hidden md:block">
          <InstrumentList />
        </div>
      </div>
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

      // Enter note if in record mode
      if (isRecording) {
        setCell(currentPatternId, cursorChannel, cursorRow, {
          note: fullNote,
          instrument: instrument,
        });

        for (let i = 0; i < editStep; i++) {
          moveCursor('down');
        }
      }
    }

    // Delete/clear
    if (key === 'delete' || key === 'backspace') {
      e.preventDefault();
      if (cursorColumn === 'note') {
        setCell(currentPatternId, cursorChannel, cursorRow, {
          note: null,
          instrument: null,
        });
      }
      // ... handle other columns
    }

    // Note off
    if (key === ' ' && cursorColumn === 'note') {
      e.preventDefault();
      setCell(currentPatternId, cursorChannel, cursorRow, {
        note: '===',
      });
      moveCursor('down');
    }

    // Hex input for effect column
    if (/^[0-9a-f]$/i.test(key) && cursorColumn === 'effect') {
      e.preventDefault();
      // Handle hex digit entry
    }

  }, [cursorColumn, cursorRow, cursorChannel, currentPatternId, octave, instrument, editStep, isRecording]);

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

---

## Part 3: Effect Commands Reference (FT2 Compatible)

### Full FT2 Effect Commands

| Cmd | Effect | FT2 Behavior | Tone.js Implementation |
|-----|--------|--------------|------------------------|
| `0xy` | Arpeggio | Cycle note/+x/+y semitones | Rapid `triggerAttack` with pitch offset |
| `1xx` | Porta Up | Slide pitch up xx units/tick | `frequency.rampTo()` upward |
| `2xx` | Porta Down | Slide pitch down xx units/tick | `frequency.rampTo()` downward |
| `3xx` | Tone Porta | Slide to note at speed xx | `frequency.rampTo(targetNote)` |
| `4xy` | Vibrato | Pitch oscillation (x=speed, y=depth) | LFO on `detune` parameter |
| `5xy` | Porta + Vol Slide | Tone porta + volume slide | Combined 3xx + Axy |
| `6xy` | Vibrato + Vol Slide | Vibrato + volume slide | Combined 4xy + Axy |
| `7xy` | Tremolo | Volume oscillation (x=speed, y=depth) | LFO on `volume` parameter |
| `8xx` | Set Pan | Stereo position (00=L, 80=C, FF=R) | `panner.pan.value` |
| `9xx` | Sample Offset | Start at offset xx*256 | `sampler.start(offset)` |
| `Axy` | Vol Slide | Slide up x or down y | `volume.rampTo()` |
| `Bxx` | Position Jump | Jump to order position xx | Sequence index change |
| `Cxx` | Set Volume | Volume 00-40 (0-64 decimal) | `volume.value = xx/64` |
| `Dxx` | Pattern Break | Break to row xx of next pattern | Pattern + row change |
| `Exx` | Extended | See E-commands below | Various |
| `Fxx` | Set Speed/BPM | xx<20: speed, xx≥20: BPM | `Transport.bpm` or tick rate |

### Extended E-commands

| Cmd | Effect | Implementation |
|-----|--------|----------------|
| `E1x` | Fine Porta Up | Small pitch increase |
| `E2x` | Fine Porta Down | Small pitch decrease |
| `E3x` | Glissando Control | Quantize porta to semitones |
| `E4x` | Vibrato Waveform | 0=sine, 1=ramp, 2=square |
| `E5x` | Set Finetune | Detune instrument |
| `E6x` | Pattern Loop | Set/execute loop |
| `E7x` | Tremolo Waveform | 0=sine, 1=ramp, 2=square |
| `E8x` | Set Panning (coarse) | 16 pan positions |
| `E9x` | Retrigger | Retrigger note every x ticks |
| `EAx` | Fine Vol Slide Up | Small volume increase |
| `EBx` | Fine Vol Slide Down | Small volume decrease |
| `ECx` | Note Cut | Cut note after x ticks |
| `EDx` | Note Delay | Delay note x ticks |
| `EEx` | Pattern Delay | Delay pattern x rows |

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
}
```

---

## Part 5: Migration Checklist

### Phase 1: Core Tracker
- [ ] Pattern editor with FT2 column layout (Note/Inst/Vol/Eff)
- [ ] Standard FT2 keyboard navigation
- [ ] Hex effect entry
- [ ] Pattern sequence/order list
- [ ] Play/stop with Tone.js Transport

### Phase 2: Sound Engine
- [ ] Tone.js synth integration
- [ ] Note triggering from tracker rows
- [ ] All FT2 effect commands mapped to Tone.js
- [ ] Instrument volume and panning
- [ ] Speed/BPM control (Fxx command)

### Phase 3: Automation System
- [ ] Extended automation columns (CUT, RES, PAN, etc.)
- [ ] Automation curve editor with drawing tools
- [ ] Keyframe mode with interpolation
- [ ] Quick shape presets (ramp, triangle, sine)
- [ ] Automation playback engine

### Phase 4: Instrument Editor
- [ ] Visual synth parameter editor (F3 to open)
- [ ] Oscillator/waveform selection
- [ ] ADSR envelope with drag points
- [ ] Filter section with visualization
- [ ] Per-instrument effect chain

### Phase 5: Export System
- [ ] Export full song as .song.json
- [ ] Export sound effects as .sfx.json
- [ ] Export instrument presets as .inst.json
- [ ] Bundled Tone.js player library
- [ ] BBS door integration examples

### Phase 6: Polish
- [ ] Sample/wavetable import
- [ ] Preset library (36+ synths, drums)
- [ ] Block operations (Alt+B/E/C/P/X)
- [ ] Undo/redo
- [ ] Save/load projects
- [ ] Responsive design (mobile to desktop)

---

## Part 6: Responsive Design

### 6.1 Breakpoints

```javascript
// tailwind.config.js
screens: {
  'xs': '375px',   // Small phones
  'sm': '640px',   // Large phones / small tablets
  'md': '768px',   // Tablets
  'lg': '1024px',  // Small laptops
  'xl': '1280px',  // Desktops
  '2xl': '1536px', // Large desktops
}
```

### 6.2 Layout Adaptations

#### Mobile (< 640px)
- Single column layout
- Bottom tab navigation (Pattern / Instruments / Mixer)
- Swipeable channels (show 2 at a time)
- Simplified columns (tap for effect modal)
- On-screen piano keyboard for note entry

#### Tablet (640px - 1024px)
- Side-by-side pattern + instrument list
- 4 channels visible
- Collapsible instrument editor panel
- Tabbed synth parameter interface

#### Desktop (1024px+)
- Three-column layout
- 8+ channels visible (scrollable)
- Full instrument editor always visible
- All keyboard shortcuts active
- Oscilloscope in nav bar

### 6.3 Touch Gestures

| Gesture | Action |
|---------|--------|
| Tap cell | Select cell |
| Double-tap | Edit cell (open modal) |
| Swipe left/right | Navigate channels |
| Swipe up/down | Scroll pattern |
| Pinch | Zoom pattern (optional) |
| Long press | Context menu |
| Two-finger tap | Play/Stop |

---

# PART B: SOUND INTEGRATION

(Content from SOUND_INTEGRATION_PLAN.md follows...)

---

# PART C: INSTRUMENT EDITOR

(Content from INSTRUMENT_EDITOR_SPEC.md follows...)

---

# PART D: EXPORT FORMAT

(Content from EXPORT_FORMAT_SPEC.md follows...)

---

## Final Summary

This prompt describes a complete **FastTracker II-style web tracker** with:

1. **Authentic FT2 Interface** - Standard hex effects, keyboard layout, block operations
2. **Modern Tone.js Synthesis** - All synth types, full parameter control
3. **Visual Instrument Editor** - Oscillator, filter, envelope, effects chain
4. **Parameter Automation** - Filter columns, curve drawing, keyframes
5. **36 Factory Presets** - Bass (12 including 5 acid 303), leads, pads, drums, FX
6. **BBS Door Export** - Standalone JSON + player library
7. **Fully Responsive** - Works on phones, tablets, and desktops

Target users: Musicians who know FastTracker II, making music/SFX for BBS door games.
