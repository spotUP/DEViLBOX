/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-07T19:52:15.336Z
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
export const BUILD_NUMBER = '308';
export const BUILD_HASH = '313c685';
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
        type: 'improvement',
        "description": "Add drum pad Phase 2 completion documentation"
      },
      {
        type: 'fix',
        "description": "Improve ROM archive ignore pattern"
      },
      {
        type: 'feature',
        "description": "Add ROM directory structure"
      },
      {
        type: 'improvement',
        "description": "Add development progress snapshots and reference images"
      },
      {
        type: 'feature',
        "description": "Add AudioContext singleton for shared audio resources"
      },
      {
        type: 'feature',
        "description": "Add drum pad engine and TR-707 ROM loader"
      },
      {
        type: 'feature',
        "description": "Add drum pad UI components"
      },
      {
        type: 'feature',
        "description": "Add DB303 compiled WASM binaries"
      },
      {
        type: 'feature',
        "description": "Add DB303 WASM source files (RoSiC library)"
      },
      {
        type: 'feature',
        "description": "Chore: add ROM and test artifact exclusions to .gitignore"
      },
      {
        type: 'improvement',
        "description": "Remove MSM5232 and TIA synth implementations"
      },
      {
        type: 'improvement',
        "description": "Build: update WASM modules and build configuration"
      },
      {
        type: 'feature',
        "description": "Add demo songs and reference images"
      },
      {
        type: 'improvement',
        "description": "Add comprehensive documentation for new features"
      },
      {
        type: 'improvement',
        "description": "Update type definitions and test infrastructure"
      },
      {
        type: 'feature',
        "description": "Enhance constants, stores, and utility functions"
      },
      {
        type: 'improvement',
        "description": "Improve UI components and tracker interface"
      },
      {
        type: 'improvement',
        "description": "Update synth engines for compatibility and consistency"
      },
      {
        type: 'feature',
        "description": "Implement DB303/JC303 synth engine with full parameter control"
      },
      {
        type: 'feature',
        "description": "Add DB303 pattern import/export and auto-load default presets"
      },
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
