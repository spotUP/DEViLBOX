/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-07T15:58:22.282Z
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
export const BUILD_VERSION = '1.0.1';
export const BUILD_NUMBER = '288';
export const BUILD_HASH = '23882bb';
export const BUILD_DATE = '2026-02-07';

// Full semantic version with build number
export const FULL_VERSION = `${BUILD_VERSION}.${BUILD_NUMBER}`;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1',
    date: '2026-02-07',
    changes: [
      {
        type: 'fix',
        "description": "Add hardware UI toggle to generic editor for DrumMachine"
      },
      {
        type: 'improvement',
        "description": "Rename Drum Machine to Roland TR-808/909 in UI"
      },
      {
        type: 'improvement',
        "description": "Rename TR-808 UI to TR-808/909 to reflect support for both machines"
      },
      {
        type: 'feature',
        "description": "Add authentic TR-808 hardware UI based on io-808 design"
      },
      {
        type: 'feature',
        "description": "Make hardware UI default for synths with hardware UI available"
      },
      {
        type: 'feature',
        "description": "Add drum machine auto-population to drumpad editor"
      },
      {
        type: 'fix',
        "description": "Replace isDark references with fixed colors in hardware UIs"
      },
      {
        type: 'fix',
        "description": "Remove unused isDark variables from hardware UIs"
      },
      {
        type: 'fix',
        "description": "Add NaN guards to Knob component SVG rendering"
      },
      {
        type: 'feature',
        "description": "Add DX7 and OBXd hardware UIs for iconic synthesizers"
      },
      {
        type: 'feature',
        "description": "Add hardware UIs for TB-303, D-50, CZ-101, and VFX synthesizers"
      },
      {
        type: 'feature',
        "description": "Expand FurnaceDispatch platform support and effect routing"
      },
      {
        type: 'fix',
        "description": "Add missing methods to FurnaceChipEngine and FurnaceRegisterMapper"
      },
      {
        type: 'fix',
        "description": "Update FurnaceSynth and FurnaceDispatchSynth with public API methods"
      },
      {
        type: 'feature',
        "description": "Add MAME chip infrastructure and hardware UI system"
      },
      {
        type: 'improvement',
        "description": "Update WASM build configurations and source files"
      },
      {
        type: 'improvement',
        "description": "Build: rebuild WASM binaries for all synth engines"
      },
      {
        type: 'fix',
        "description": "Initialize TR-707 parameters after ROM load for sound output"
      },
      {
        type: 'fix',
        "description": "Prevent per-channel instance creation for MAME/Furnace/Buzz synths"
      },
      {
        type: 'feature',
        "description": "Add TR-707 hardware UI with authentic Roland panel design"
      }
    ]
  },
  {
    version: '2026-02-04',
    date: '2026-02-04',
    changes: [
      {
        type: 'improvement',
        "description": "Merge Presets into Modules menu and remove Presets dropdown"
      },
      {
        type: 'feature',
        "description": "Wire SpaceyDelayer and RETapeEcho WASM effects to UI"
      },
      {
        type: 'fix',
        "description": "Resolve 38 failing effect tests (neural + sidechain)"
      },
      {
        type: 'fix',
        "description": "Calibrate volume normalization for all synths and add ensureInitialized"
      },
      {
        type: 'feature',
        "description": "Wire 26 new synths to UI, rebuild buzzmachines with MDK fix, add Makk M4"
      },
      {
        type: 'feature',
        "description": "Add WASM synth engines, MAME chip ports, new controls, and test infrastructure"
      },
      {
        type: 'improvement',
        "description": "Chore: gitignore juce-wasm build artifacts"
      },
      {
        type: 'improvement',
        "description": "Chore: remove unused K051649Synth.ts"
      },
      {
        type: 'fix',
        "description": "Align VU meters to channels and improve sync"
      },
      {
        type: 'improvement',
        "description": "Clean up TrackerReplayer types, dead code, and duplication"
      },
      {
        type: 'improvement',
        "description": "Refactor TrackerReplayer to use player-pool instead of per-note allocation"
      },
      {
        type: 'fix',
        "description": "Resolve AudioWorkletNode context mismatch across all synth engines"
      }
    ]
  },
  {
    version: '2026-02-03',
    date: '2026-02-03',
    changes: [
      {
        type: 'fix',
        "description": "Resolve 13 bugs in synths, stores, and components"
      },
      {
        type: 'fix',
        "description": "Properly handle apostrophes in changelog descriptions and add terser"
      },
      {
        type: 'fix',
        "description": "Escape nested single quotes in changelog description string"
      },
      {
        type: 'fix',
        "description": "Remove problematic single quotes from changelog entry"
      },
      {
        type: 'fix',
        "description": "Resolve nested quote syntax error in changelog"
      },
      {
        type: 'fix',
        "description": "Correctly handle nested quotes in changelog"
      },
      {
        type: 'feature',
        "description": "Add 'Convert to Phonemes' button to SAM synth UI using authentic reciter algorithm"
      },
      {
        type: 'fix',
        "description": "Resolve all TypeScript errors and finalize SAM/V2 Speech integration with UI improvements"
      },
      {
        type: 'feature',
        "description": "Improve SAM synth with XY pad, phoneme guide, and melodic note tracking"
      },
      {
        type: 'feature',
        "description": "Implement Commodore SAM speech synth with dedicated UI and presets"
      },
      {
        type: 'feature',
        "description": "Implement V2 Speech synth UI and wire Nano binary export to UI"
      },
      {
        type: 'feature',
        "description": "Integrate 128 authentic Farbrausch V2 factory presets extracted from presets.v2b"
      },
      {
        type: 'feature',
        "description": "Implement full V2 synth controls with multi-oscillator, dual filter, and modulation support"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript errors related to missing imports and unused variables"
      },
      {
        type: 'fix',
        "description": "Resolve off-key chip loops and RangeErrors by using original sample rate for loop points and robust clamping"
      },
      {
        type: 'feature',
        "description": "Add preview/jam to LoadPresetModal and fix missing presets in specialized synth editors"
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
