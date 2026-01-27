/**
 * Auto-generated changelog from git commits
 * Generated: 2026-01-27T14:55:49.322Z
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
export const BUILD_NUMBER = '83';
export const BUILD_HASH = 'b2cdfca';
export const BUILD_DATE = '2026-01-27';
export const FULL_VERSION = `${BUILD_VERSION}+${BUILD_NUMBER}`;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1',
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
    version: '1.0.1-1',
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
    version: '1.0.1-2',
    date: '2026-01-24',
    changes: [
      {
        type: 'improvement',
        description: 'Fix FPS fluctuation and improve audio timing stability'
      }
    ]
  },
  {
    version: '1.0.1-3',
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
    version: '1.0.1-4',
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
      },
      {
        type: 'feature',
        description: 'Expand FT2 toolbar by default for better UX'
      },
      {
        type: 'feature',
        description: 'Add automated Electron app release workflow'
      },
      {
        type: 'fix',
        description: 'Use design system Button component for Desktop App button'
      },
      {
        type: 'feature',
        description: 'Wire up Desktop App button to show download modal with Electron binaries'
      },
      {
        type: 'feature',
        description: 'Make startup.sh non-interactive with CLI arguments'
      },
      {
        type: 'fix',
        description: 'Add missing source files and fix all demo files for CI/CD deployment'
      },
      {
        type: 'feature',
        description: 'Add automatic version check and update notifications'
      },
      {
        type: 'improvement',
        description: 'Chore: Update build number to 46'
      },
      {
        type: 'improvement',
        description: 'Chore: Update changelog for build 45'
      },
      {
        type: 'improvement',
        description: 'Chore: Configure GitHub Pages deployment'
      },
      {
        type: 'fix',
        description: 'Pattern editor layout with custom scrollbar and mobile fixes'
      }
    ]
  },
  {
    version: '1.0.1-5',
    date: '2026-01-21',
    changes: [
      {
        type: 'feature',
        description: 'Song format documentation, error handling, and volume normalization'
      },
      {
        type: 'feature',
        description: 'Add TB-303 preset dropdown and vegDecay migration'
      },
      {
        type: 'fix',
        description: 'Separate filter and VCA envelope decay controls'
      },
      {
        type: 'fix',
        description: 'Correct Devil Fish default vegDecay to prevent clicks'
      },
      {
        type: 'improvement',
        description: 'Improve EnvelopeVisualizer size and theme integration'
      }
    ]
  },
  {
    version: '1.0.1-6',
    date: '2026-01-20',
    changes: [
      {
        type: 'improvement',
        description: 'Update summary with Acid Sequencer information'
      },
      {
        type: 'feature',
        description: 'Add Acid Sequencer for TB-303 Pattern Sequencing'
      },
      {
        type: 'feature',
        description: 'Add GuitarML Neural Network Overdrive to TB-303 Engine'
      },
      {
        type: 'feature',
        description: 'Implement 1:1 accurate TB-303 emulation with Open303 DSP engine'
      },
      {
        type: 'feature',
        description: 'Add dynamic version handling for export/import system (#10)'
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
