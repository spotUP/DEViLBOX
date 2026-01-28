/**
 * Auto-generated changelog from git commits
 * Generated: 2026-01-28T02:22:22.396Z
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
export const BUILD_NUMBER = '126';
export const BUILD_HASH = 'cd2e4a1';
export const BUILD_DATE = '2026-01-28';
export const FULL_VERSION = `${BUILD_VERSION}+${BUILD_NUMBER}`;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1',
    date: '2026-01-28',
    changes: [
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
    version: '1.0.1-1',
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
      },
      {
        type: 'fix',
        description: 'Fix .dbox module loading path'
      },
      {
        type: 'fix',
        description: 'Add Furnace and DefleMask module import support, fix AudioWorklet issues'
      },
      {
        type: 'fix',
        description: 'Add voice debug logging'
      },
      {
        type: 'fix',
        description: 'Fix Cxx volume command to update active voice gains'
      },
      {
        type: 'fix',
        description: 'Add ToneEngine volume debug logging'
      },
      {
        type: 'fix',
        description: 'Add debug logging for effect parsing in TrackerReplayer'
      },
      {
        type: 'fix',
        description: 'Fix MOD instrument ID mapping during import'
      },
      {
        type: 'improvement',
        description: 'Update generated changelog'
      },
      {
        type: 'fix',
        description: 'Fix AmigaFilter by deferring worklet init until context running'
      },
      {
        type: 'fix',
        description: 'Fix sample URLs not surviving page refresh'
      },
      {
        type: 'fix',
        description: 'Fix AmigaFilter AudioWorkletNode context detection'
      },
      {
        type: 'feature',
        description: 'Add velocity modulation, loop points, and performance optimizations'
      },
      {
        type: 'improvement',
        description: 'Furnace integration phases 3-5: chip export + macro system'
      },
      {
        type: 'improvement',
        description: 'Refactor duplicated effect logic into BaseFormatHandler'
      },
      {
        type: 'fix',
        description: 'Fix MOD arpeggio wraparound at period table boundaries'
      },
      {
        type: 'fix',
        description: 'Fix format-aware period conversion and IT auto-vibrato'
      },
      {
        type: 'feature',
        description: 'Update changelog and add Serena config'
      },
      {
        type: 'improvement',
        description: 'Update documentation and handoff files'
      },
      {
        type: 'improvement',
        description: 'Update dependencies'
      },
      {
        type: 'feature',
        description: 'Update presets and add master presets'
      },
      {
        type: 'feature',
        description: 'Add audio processing utilities and update exporters'
      },
      {
        type: 'improvement',
        description: 'Update UI components for Furnace and effects'
      },
      {
        type: 'improvement',
        description: 'Extend types and stores for Furnace integration'
      },
      {
        type: 'feature',
        description: 'Add Furnace format support and FM presets'
      },
      {
        type: 'feature',
        description: 'Add Furnace chip engine (WASM-based emulation)'
      },
      {
        type: 'improvement',
        description: 'Update core engine with multi-format support'
      },
      {
        type: 'feature',
        description: 'Add effect compliance test suite'
      },
      {
        type: 'improvement',
        description: 'Refactor effect system with format-specific handlers'
      },
      {
        type: 'feature',
        description: 'Add chip music exporters (VGM, ZSM, SAP, TIunA) and DefleMask parser'
      }
    ]
  },
  {
    version: '1.0.1-2',
    date: '2026-01-26',
    changes: [
      {
        type: 'improvement',
        description: 'Audit and strict ProTracker effect alignment'
      },
      {
        type: 'fix',
        description: 'Fix Tremolo (7xy) effect accuracy'
      },
      {
        type: 'fix',
        description: 'Fix smooth scrolling jumpiness'
      },
      {
        type: 'fix',
        description: 'Fix MOD pitch shift logic'
      },
      {
        type: 'fix',
        description: 'Fix MOD octave pitch mapping'
      },
      {
        type: 'improvement',
        description: 'Prevent MOD export from overwriting source files'
      },
      {
        type: 'improvement',
        description: 'MOD Import: Extend supported note range to C-0 to B-5'
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
