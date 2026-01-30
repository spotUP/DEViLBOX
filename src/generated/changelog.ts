/**
 * Auto-generated changelog from git commits
 * Generated: 2026-01-30T22:50:03.471Z
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
export const BUILD_NUMBER = '162';
export const BUILD_HASH = '8a4055e';
export const BUILD_DATE = '2026-01-30';
export const FULL_VERSION = `${BUILD_VERSION}+${BUILD_NUMBER}`;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1',
    date: '2026-01-30',
    changes: [
      {
        type: 'feature',
        description: 'Add CRITICAL git safety rules to CLAUDE.md'
      },
      {
        type: 'feature',
        description: 'Add deploy.sh script for quick commit/push/deploy'
      },
      {
        type: 'improvement',
        description: 'Update generated changelog'
      },
      {
        type: 'improvement',
        description: 'Update synth categories and organization'
      },
      {
        type: 'improvement',
        description: 'Enhance audio engine and synth handling'
      },
      {
        type: 'improvement',
        description: 'Improve module and instrument import handling'
      },
      {
        type: 'improvement',
        description: 'Improve file browser and file system access'
      },
      {
        type: 'improvement',
        description: 'Enhance tracker input handling and FT2 toolbar'
      },
      {
        type: 'improvement',
        description: 'Improve MIDI handling and settings management'
      },
      {
        type: 'improvement',
        description: 'Enhance instrument visualization components'
      },
      {
        type: 'improvement',
        description: 'Refactor Furnace and synth editors for unified architecture'
      },
      {
        type: 'improvement',
        description: 'Improve TestKeyboard and InstrumentList collapsible behavior'
      },
      {
        type: 'improvement',
        description: 'Update FurnaceChips WASM build with improved chip emulation'
      },
      {
        type: 'improvement',
        description: 'Unify instrument editor architecture with common template'
      },
      {
        type: 'improvement',
        description: 'Make TestKeyboard and InstrumentList collapsible, collapsed by default'
      },
      {
        type: 'improvement',
        description: 'Scroll to selected synth when opening instrument selector'
      },
      {
        type: 'improvement',
        description: 'Remember instrument selector filter and scroll position'
      },
      {
        type: 'fix',
        description: 'Fix Buzzmachine paths for GitHub Pages deployment'
      },
      {
        type: 'fix',
        description: 'Add All Furnace Chips category and fix Buzzmachine null time error'
      },
      {
        type: 'fix',
        description: 'Fix unused variable TypeScript errors'
      },
      {
        type: 'improvement',
        description: 'Update instrument editors'
      },
      {
        type: 'feature',
        description: 'Add project documentation and handover guides'
      },
      {
        type: 'improvement',
        description: 'Update AudioWorklets and project configuration'
      },
      {
        type: 'feature',
        description: 'Update hooks, types, and stores for new features'
      },
      {
        type: 'improvement',
        description: 'Update UI components for improved editing experience'
      },
      {
        type: 'improvement',
        description: 'Improve import/export with format handlers and tests'
      },
      {
        type: 'feature',
        description: 'Expand synth presets and add Furnace wavetable support'
      },
      {
        type: 'improvement',
        description: 'Improve audio engine with Furnace synth enhancements'
      },
      {
        type: 'feature',
        description: 'Add visualization components for instrument editors'
      },
      {
        type: 'feature',
        description: 'Add Buzzmachines WASM effect plugins'
      },
      {
        type: 'improvement',
        description: 'Reorganize instrument components into subdirectories'
      },
      {
        type: 'fix',
        description: 'Fix Furnace chip emulators: 8 broken chips, ESFM, minor issues'
      }
    ]
  },
  {
    version: '1.0.1-1',
    date: '2026-01-28',
    changes: [
      {
        type: 'fix',
        description: 'Fix Furnace instrument parsing and register mapping'
      },
      {
        type: 'improvement',
        description: 'Expand Furnace instrument types with comprehensive chip support'
      },
      {
        type: 'improvement',
        description: 'Retry WASM init on note trigger'
      },
      {
        type: 'improvement',
        description: 'Simplify Furnace WASM AudioContext detection'
      },
      {
        type: 'fix',
        description: 'Add debug logging for Furnace WASM initialization'
      },
      {
        type: 'fix',
        description: 'Fix DrumMachine Tone.Param error breaking 909 drums'
      },
      {
        type: 'fix',
        description: 'Fix Furnace synth fallback to use actual instrument parameters'
      },
      {
        type: 'feature',
        description: 'Add Behringer TD-3 pattern presets'
      },
      {
        type: 'improvement',
        description: 'Update instrument system and engine improvements'
      },
      {
        type: 'improvement',
        description: 'Move Mute/Smooth/Groove controls to tracker header'
      },
      {
        type: 'feature',
        description: 'Implement tab-based synth editors for no-scroll UI'
      },
      {
        type: 'feature',
        description: 'Add synth editing enhancements and new engine components'
      },
      {
        type: 'feature',
        description: 'Add real-time visualization components for instruments'
      },
      {
        type: 'feature',
        description: 'Add Furnace chip instrument presets'
      },
      {
        type: 'improvement',
        description: 'Move documentation files to docs/ directory'
      }
    ]
  },
  {
    version: '1.0.1-2',
    date: '2026-01-27',
    changes: [
      {
        type: 'feature',
        description: 'Add .fur and .dmf to file browser accept filter'
      },
      {
        type: 'feature',
        description: 'Add MIDI CC output to TD-3-MO'
      },
      {
        type: 'fix',
        description: 'Fix TD-3 MIDI CC mappings and add debug logging'
      }
    ]
  }
];

// Get the latest version
export const CURRENT_VERSION = CHANGELOG[0]?.version || BUILD_VERSION;

// Get all changes from the last N entries
export function getRecentChanges(count: number = 10): ChangelogEntry[] {
  return CHANGELOG.slice(0, count);
}
