/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-26T07:30:17.081Z
 *
 * DO NOT EDIT MANUALLY - This file is regenerated on build
 * To add changelog entries, use conventional commit messages:
 *   feat: Add new feature
 *   fix: Fix a bug
 *   perf: Improve performance
 */

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: {
    type: 'feature' | 'fix' | 'improvement';
    description: string;
  }[];
}

// Build info
export const BUILD_VERSION = '1.0.1286';
export const BUILD_NUMBER = '1286';
export const BUILD_HASH = '31562c67';
export const BUILD_DATE = '2026-02-26';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1286',
    date: '2026-02-26',
    changes: [
      {
        type: 'improvement',
        "description": "Chore(furnace-insed): bump WASM cache-bust version to 3"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog"
      },
      {
        type: 'fix',
        "description": "Remove unused fields and dead header reads (TS6133)"
      },
      {
        type: 'feature',
        "description": "Add sample preview playback to FurnaceInsEd hardware UI"
      },
      {
        type: 'feature',
        "description": "Implement full multi-subsong support with in-editor switching"
      },
      {
        type: 'fix',
        "description": "SoundMon synth loop covers full ADSR expansion not base cycle"
      },
      {
        type: 'feature',
        "description": "Add sample playback — PLAY/STOP buttons + Web Audio API"
      },
      {
        type: 'fix',
        "description": "Resolve all TypeScript TS6133/TS2345/TS18047 errors"
      },
      {
        type: 'feature',
        "description": "FurnaceInsEd WASM module + import dialogs + TFMX parser"
      },
      {
        type: 'improvement',
        "description": "Chore: changelog update, FT2 WASM patches, FT2Hardware volume/pan edit, cleanup"
      },
      {
        type: 'feature',
        "description": "FileBrowser previews, Modland API, UIStore imports, Pixi fixes"
      },
      {
        type: 'fix',
        "description": "WASM config polling, Retina canvas, and Hively layout fixes"
      },
      {
        type: 'feature',
        "description": "Per-format import dialogs in TrackerView and FT2Toolbar"
      },
      {
        type: 'feature',
        "description": "TFMX format routing, MIDI options, and multi-effect slots 3-8"
      },
      {
        type: 'fix',
        "description": "ToneEngine Sampler reload decode and looped Player stop"
      },
      {
        type: 'feature',
        "description": "Expand FurnaceEffectRouter platform family coverage"
      },
      {
        type: 'feature',
        "description": "Implement all 5 remaining gap fixes for UADE enhanced imports"
      },
      {
        type: 'fix',
        "description": "Native parser playback — period-based audio, volume, stereo, portamento"
      },
      {
        type: 'fix',
        "description": "Remove per-note console.log flood from FurnaceSynth and RegisterMapper"
      },
      {
        type: 'fix',
        "description": "Close AudioContext on unmount (parity with FT2)"
      },
      {
        type: 'fix',
        "description": "Fix false arpeggio, clean up feature blocks, add groove parsing"
      },
      {
        type: 'fix',
        "description": "Implement 15 outstanding stubs from FIXES.md"
      },
      {
        type: 'fix',
        "description": "Fix SDL_CreateMutex stub allocation size warning"
      },
      {
        type: 'feature',
        "description": "Button press animation and sample playback in hardware UI"
      },
      {
        type: 'fix',
        "description": "Resolve four outstanding TODOs (Furnace order editing, modular port hover, drum pad comment, BD loop detection)"
      },
      {
        type: 'feature',
        "description": "Preview dialogs for .dbx projects and .dbi instruments"
      },
      {
        type: 'feature',
        "description": "Extract real metadata for all 11 native tracker formats"
      },
      {
        type: 'feature',
        "description": "Add Amiga IFF/8SVX sample import support"
      },
      {
        type: 'fix',
        "description": "Correct MOD native parser pitch — remove erroneous +24 octave shift"
      }
    ]
  },
  {
    version: '2026-02-25',
    date: '2026-02-25',
    changes: [
      {
        type: 'fix',
        "description": "2× Retina scale for PSG/Macro editors + wheel scroll fix"
      },
      {
        type: 'fix',
        "description": "2x Retina rendering via SDL logical size"
      },
      {
        type: 'fix',
        "description": "Smooth canvas scaling for ImGui SDL modules"
      },
      {
        type: 'fix',
        "description": "RAF loop + full-width SDL canvas"
      },
      {
        type: 'fix',
        "description": "Fix PSGHardware showing VERA for C64 instruments"
      },
      {
        type: 'fix',
        "description": "Restore C64/SID to PSGHardware by inverting renderFurnaceHardware priority"
      },
      {
        type: 'fix',
        "description": "Call updateSampleEditorSample() after loading PCM to show waveform"
      },
      {
        type: 'fix',
        "description": "Expand SYNTH_TO_DIV_INS_TYPE to cover all chip families"
      },
      {
        type: 'fix',
        "description": "Chip type routing, rawBinaryData flow, div-by-zero, log flood"
      },
      {
        type: 'fix',
        "description": "Instrument/sample audit round 2 fixes"
      },
      {
        type: 'fix',
        "description": "Correct note mapping and panning in all Amiga format parsers"
      },
      {
        type: 'fix',
        "description": "Correct note octave and channel panning in FCParser"
      },
      {
        type: 'fix',
        "description": "Correct note indices, playback pitch, and add scan cancel"
      },
      {
        type: 'feature',
        "description": "Full JS↔WASM serialization protocol"
      },
      {
        type: 'feature',
        "description": "5 UADE production-readiness fixes"
      },
      {
        type: 'feature',
        "description": "Subsong selection UI and full import pipeline wiring"
      },
      {
        type: 'feature',
        "description": "Complete UADE editability — pitch fix, persistence, pre-load, multi-subsong"
      },
      {
        type: 'feature',
        "description": "Close enhanced scan gaps — loops, VBlank BPM, arpeggio, warnings, fallback"
      },
      {
        type: 'feature',
        "description": "Per-format engine selectors in import dialog"
      },
      {
        type: 'fix',
        "description": "Ft2-sampled compilation patches for Emscripten"
      }
    ]
  }
];

// Current display version
export const CURRENT_VERSION = FULL_VERSION;

// Get all changes from the last N entries
export function getRecentChanges(count: number = 10): ChangelogEntry[] {
  return CHANGELOG.slice(0, count);
}
