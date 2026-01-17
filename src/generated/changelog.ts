/**
 * Auto-generated changelog from git commits
 * Generated: 2026-01-17T21:06:14.412Z
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
export const BUILD_VERSION = '1.0.0';
export const BUILD_NUMBER = '28';
export const BUILD_HASH = '51b647d';
export const BUILD_DATE = '2026-01-17';
export const FULL_VERSION = `${BUILD_VERSION}+${BUILD_NUMBER}`;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.0',
    date: '2026-01-17',
    changes: [
      {
        type: 'fix',
        description: 'Fix TypeScript build errors for deployment'
      },
      {
        type: 'fix',
        description: 'Fix FT2 toolbar arrow buttons and add speed commands to demo songs'
      },
      {
        type: 'improvement',
        description: 'Refactor components for consistency and reusability'
      }
    ]
  },
  {
    version: '1.0.0-1',
    date: '2026-01-16',
    changes: [
      {
        type: 'improvement',
        description: 'Redesign CreateInstrumentModal for better space efficiency'
      },
      {
        type: 'fix',
        description: 'Fix Tone.js cancelAndHoldAtTime null error'
      },
      {
        type: 'feature',
        description: 'Improve instrument creation and add reset button'
      },
      {
        type: 'feature',
        description: 'Add visual VST-style instrument editors'
      },
      {
        type: 'feature',
        description: 'Add FT2-style instrument list panel with create workflow'
      },
      {
        type: 'fix',
        description: 'Fix unused imports'
      },
      {
        type: 'improvement',
        description: 'Redesign instrument panel for intuitive UX'
      },
      {
        type: 'improvement',
        description: 'Show all 22 synths with search field'
      },
      {
        type: 'fix',
        description: 'Fix cursor visibility during playback'
      },
      {
        type: 'fix',
        description: 'Fix duplicate Live button and cursor advancement after note entry'
      },
      {
        type: 'fix',
        description: 'Fix TestKeyboard responsiveness and keyboard event handling'
      },
      {
        type: 'feature',
        description: 'Add awesome sample editor with full waveform visualization'
      },
      {
        type: 'fix',
        description: 'UI improvements: Download button, start page update, live mode fix'
      },
      {
        type: 'fix',
        description: 'Fix slider track visibility'
      },
      {
        type: 'feature',
        description: 'Add 8 new synthesizer types'
      },
      {
        type: 'feature',
        description: 'Complete Live Mode features and add GranularSynth'
      },
      {
        type: 'improvement',
        description: 'Record while playing: enter notes at playback position'
      },
      {
        type: 'feature',
        description: 'Add record mode feature'
      },
      {
        type: 'fix',
        description: 'Fix save button feedback and auto-collapse automation panel'
      },
      {
        type: 'feature',
        description: 'Add Demo Songs dropdown to load example songs'
      },
      {
        type: 'fix',
        description: 'Fix TypeScript build errors for GitHub Pages deployment'
      },
      {
        type: 'feature',
        description: 'Add GitHub Pages deployment'
      },
      {
        type: 'improvement',
        description: 'Rename from Scribbleton to DEViLBOX'
      },
      {
        type: 'feature',
        description: 'Add Live Performance Mode, context menus, and multi-tab support'
      }
    ]
  },
  {
    version: '1.0.0-2',
    date: '2026-01-15',
    changes: [
      {
        type: 'improvement',
        description: 'Initial commit: DEViLBOX - TB-303 Acid Tracker'
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
