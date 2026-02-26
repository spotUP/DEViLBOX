/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-26T00:20:16.297Z
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
export const BUILD_VERSION = '1.0.1262';
export const BUILD_NUMBER = '1262';
export const BUILD_HASH = 'e3d6e331';
export const BUILD_DATE = '2026-02-26';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1262',
    date: '2026-02-26',
    changes: [
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
      },
      {
        type: 'fix',
        "description": "Correct DigitalMugician header bounds check from +20 to +24"
      },
      {
        type: 'fix',
        "description": "Add UADE fallback try-catch to all native format parsers"
      },
      {
        type: 'fix',
        "description": "FC2/unknown FC variants fall back to UADE instead of error toast"
      },
      {
        type: 'fix',
        "description": "VJView null canvas guard + changelog update"
      },
      {
        type: 'feature',
        "description": "Ft2-sampled build system overhaul and WASM bridge"
      },
      {
        type: 'fix',
        "description": "Resolve tracker scratch exit hang and re-entry oscillation"
      },
      {
        type: 'fix',
        "description": "Route module drops through WebGLModalBridge portal"
      }
    ]
  },
  {
    version: '2026-02-24',
    date: '2026-02-24',
    changes: [
      {
        type: 'fix',
        "description": "Samplepack samples have no decoded buffer for playback"
      },
      {
        type: 'fix',
        "description": "Boost 3D visualizer audio reactivity ~3x"
      },
      {
        type: 'feature',
        "description": "Add fullscreen button to VJ view, move debug meter to bottom-right"
      },
      {
        type: 'fix',
        "description": "Debug: add VJ audio level meter and boost AudioDataBus responsiveness"
      },
      {
        type: 'feature',
        "description": "Add 13 audio-reactive projectM presets"
      },
      {
        type: 'fix',
        "description": "VJ audio reactivity and zero-size WebGL textures"
      },
      {
        type: 'fix',
        "description": "TB-303 view layout — center horizontally, allow vertical scroll"
      },
      {
        type: 'fix',
        "description": "Click-to-seek works when player is stopped"
      },
      {
        type: 'fix',
        "description": "Correct 3D mixer fader rest positions"
      },
      {
        type: 'fix',
        "description": "Dedup concurrent renders of the same file in DJPipeline"
      },
      {
        type: 'feature',
        "description": "Click-to-seek on scrolling waveform"
      },
      {
        type: 'fix',
        "description": "Waveform h-full stealing visualizer space — use fixed h-16"
      },
      {
        type: 'fix',
        "description": "Add @refresh reset to R3F components for HMR stability"
      },
      {
        type: 'fix',
        "description": "Pattern overlay useMemo stale — add totalPositions to deps"
      },
      {
        type: 'fix',
        "description": "Show pattern overlay in vinyl and 3D deck view modes"
      },
      {
        type: 'fix',
        "description": "Preset scratch patterns now use audio stream in DJ mode"
      },
      {
        type: 'fix',
        "description": "Wire up all 3D mixer controls to DJ engine"
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
