/**
 * Auto-generated changelog from git commits
 * Generated: 2026-01-27T17:26:27.536Z
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
export const BUILD_NUMBER = '104';
export const BUILD_HASH = 'fd6c2d4';
export const BUILD_DATE = '2026-01-27';
export const FULL_VERSION = `${BUILD_VERSION}+${BUILD_NUMBER}`;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1',
    date: '2026-01-27',
    changes: [
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
    version: '1.0.1-1',
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
      },
      {
        type: 'fix',
        description: 'Fix MOD import pitch shifting and range'
      },
      {
        type: 'fix',
        description: 'Fix MOD and XM export limitations'
      },
      {
        type: 'fix',
        description: 'Fix XM export binary compatibility: implement full instrument and sample header writing with delta encoding'
      },
      {
        type: 'improvement',
        description: 'Update project documentation and change logs'
      },
      {
        type: 'fix',
        description: 'Optimize React rendering and add visualization components'
      },
      {
        type: 'improvement',
        description: 'Optimize audio engine and playback for M1/Apple Silicon'
      },
      {
        type: 'improvement',
        description: 'Restructure public assets into data directory'
      }
    ]
  },
  {
    version: '1.0.1-2',
    date: '2026-01-25',
    changes: [
      {
        type: 'feature',
        description: 'Refactor FT2 toolbar to use design system buttons and fix UI issues'
      },
      {
        type: 'feature',
        description: 'Add TD-3 pattern import, file browser, and fix Tone.js synth handling'
      }
    ]
  },
  {
    version: '1.0.1-3',
    date: '2026-01-24',
    changes: [
      {
        type: 'improvement',
        description: 'Fix FPS fluctuation and improve audio timing stability'
      }
    ]
  },
  {
    version: '1.0.1-4',
    date: '2026-01-23',
    changes: [
      {
        type: 'improvement',
        description: 'Major playback performance optimizations and sound cleanup'
      },
      {
        type: 'fix',
        description: 'Reuse preloaded instruments instead of creating new ones per channel'
      },
      {
        type: 'improvement',
        description: 'Avoid unnecessary React state updates during playback'
      },
      {
        type: 'improvement',
        description: 'Use O(1) instrument lookup map in TrackerReplayer'
      },
      {
        type: 'improvement',
        description: 'Only create ArpeggioEngine when arpeggio is enabled'
      },
      {
        type: 'fix',
        description: 'Remove console spam from UnifiedInstrumentEditor tab validation'
      },
      {
        type: 'fix',
        description: 'Replace require() with ES import for ArpeggioEngine'
      },
      {
        type: 'feature',
        description: 'Add advanced arpeggio editor for ChipSynth with 48 presets'
      }
    ]
  },
  {
    version: '1.0.1-5',
    date: '2026-01-22',
    changes: [
      {
        type: 'fix',
        description: 'Prevent Desktop App button text from wrapping'
      },
      {
        type: 'improvement',
        description: 'Chore: Release v1.0.1'
      },
      {
        type: 'fix',
        description: 'Implement pattern sequence/order playback for proper song arrangement'
      },
      {
        type: 'feature',
        description: 'Add automated release script with version bumping'
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
