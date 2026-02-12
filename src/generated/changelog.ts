/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-12T23:23:02.718Z
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
export const BUILD_NUMBER = '462';
export const BUILD_HASH = 'fe3dab5';
export const BUILD_DATE = '2026-02-12';

// Full semantic version with build number
export const FULL_VERSION = `${BUILD_VERSION}.${BUILD_NUMBER}`;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1',
    date: '2026-02-13',
    changes: [
      {
        type: 'feature',
        "description": "Add beat-synced food spawning"
      },
      {
        type: 'feature',
        "description": "Add beat-synced grid glow and worm pulse"
      },
      {
        type: 'feature',
        "description": "Add music-reactive background tiles"
      },
      {
        type: 'feature',
        "description": "Add audio analysis infrastructure"
      }
    ]
  },
  {
    version: '2026-02-12',
    date: '2026-02-12',
    changes: [
      {
        type: 'fix',
        "description": "Replace browser prompt with custom React component"
      },
      {
        type: 'fix',
        "description": "Change alignItems to stretch for full-height glass overlay"
      },
      {
        type: 'fix',
        "description": "Fix collision detection to check from current position"
      },
      {
        type: 'fix',
        "description": "Ensure visualizer container has full height"
      },
      {
        type: 'fix',
        "description": "Scale playfield to fit visible canvas area"
      },
      {
        type: 'fix',
        "description": "Fill entire visualizer height and track container size"
      },
      {
        type: 'fix',
        "description": "Make viz-frame fill parent container height"
      },
      {
        type: 'fix',
        "description": "Make game fill entire visualizer area"
      },
      {
        type: 'fix',
        "description": "Remove glass and vignette overlays from compact visualizers"
      },
      {
        type: 'fix',
        "description": "Draw border inside canvas and double cell size"
      },
      {
        type: 'fix',
        "description": "Remove visualizer margin and make food more visible"
      },
      {
        type: 'fix',
        "description": "Fix game logic bugs preventing startup and gameplay"
      },
      {
        type: 'fix',
        "description": "Revert buttons to toggle, keep hotkeys as restart"
      },
      {
        type: 'fix',
        "description": "Make play hotkeys restart playback like buttons"
      },
      {
        type: 'fix',
        "description": "Make play buttons restart playback instead of toggling"
      },
      {
        type: 'fix',
        "description": "Add 60fps to remaining visualizers"
      },
      {
        type: 'fix',
        "description": "Increase frame rate from 30fps to 60fps"
      },
      {
        type: 'fix',
        "description": "Add author email to package.json for Linux .deb builds"
      },
      {
        type: 'feature',
        "description": "Add playback visual feedback to clips"
      },
      {
        type: 'fix',
        "description": "Widen zoom level display to prevent text squishing"
      },
      {
        type: 'feature',
        "description": "Add transport controls (Play/Stop) to toolbar"
      },
      {
        type: 'fix',
        "description": "Remove unused addPattern and deletePattern variables"
      },
      {
        type: 'fix',
        "description": "Replace require() with async import() in ToneEngine"
      },
      {
        type: 'fix',
        "description": "Song length should use patternOrder.length not patterns.length"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript errors in import/export and stores"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript errors in hooks and utilities"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript errors in UI components"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript errors in synth implementations"
      },
      {
        type: 'fix',
        "description": "Resolve 363 TypeScript errors in InstrumentFactory and ToneEngine"
      },
      {
        type: 'feature',
        "description": "Arrangement view, piano roll canvas engine, DB303 param wiring fixes"
      },
      {
        type: 'feature',
        "description": "ROM auto-load status + upload dialog for MAME synths"
      },
      {
        type: 'fix',
        "description": "Route TrackerReplayer through master effects chain"
      },
      {
        type: 'fix',
        "description": "Misc engine, store, and UI improvements"
      },
      {
        type: 'feature',
        "description": "Tabbed MOJO/DevilFish/Korg/LFO/FX UI, always-active filter params"
      },
      {
        type: 'feature',
        "description": "Add Speak & Spell ROM data and fix TTS voice activation"
      },
      {
        type: 'improvement',
        "description": "Reorganize NKS into performance module"
      },
      {
        type: 'improvement',
        "description": "Chore: remove old song data files and unused hardware images"
      }
    ]
  },
  {
    version: '2026-02-11',
    date: '2026-02-11',
    changes: [
      {
        type: 'fix',
        "description": "Eliminate crackles from parameter changes"
      },
      {
        type: 'fix',
        "description": "Clean up MIDI double-trigger diagnostics after confirming fix"
      },
      {
        type: 'feature',
        "description": "Diag: add comprehensive MIDI double-trigger diagnostics"
      },
      {
        type: 'fix',
        "description": "Filter non-automatable params from knob pages, clean up TS errors, add speech engine"
      },
      {
        type: 'fix',
        "description": "Use stored type instead of minified constructor name for stale instrument check"
      },
      {
        type: 'fix',
        "description": "Break circular import between VotraxSynth and votraxPhonemeMap"
      },
      {
        type: 'fix',
        "description": "Prevent stale preview instrument causing double-trigger on MIDI playback"
      },
      {
        type: 'feature',
        "description": "Split WAM plugins into effects and synths, add effect search, fix bugs"
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
