/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-13T09:28:52.993Z
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
export const BUILD_NUMBER = '483';
export const BUILD_HASH = 'f50e3b8';
export const BUILD_DATE = '2026-02-13';

// Full semantic version with build number
export const FULL_VERSION = `${BUILD_VERSION}.${BUILD_NUMBER}`;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1',
    date: '2026-02-13',
    changes: [
      {
        type: 'fix',
        "description": "Suppress InvalidStateError in global handler"
      },
      {
        type: 'fix',
        "description": "Fix duplicate IDs in FT2Toolbar import path"
      },
      {
        type: 'fix',
        "description": "Ensure audio context is running before loading instruments"
      },
      {
        type: 'fix',
        "description": "Prevent duplicate instrument IDs and stale instrument warnings"
      },
      {
        type: 'fix',
        "description": "Resolve Web Audio API type compatibility issue"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript buffer type error"
      },
      {
        type: 'fix',
        "description": "Fix critical game logic bugs preventing game start"
      },
      {
        type: 'fix',
        "description": "Handle InvalidStateError when loading worklet on suspended context"
      },
      {
        type: 'fix',
        "description": "Match visualizer sizing (200x120 default)"
      },
      {
        type: 'fix',
        "description": "Set larger initial canvas size (800x600)"
      },
      {
        type: 'fix',
        "description": "Increase default height from 100px to 400px"
      },
      {
        type: 'fix',
        "description": "Disable frequency-based worm colors for visibility"
      },
      {
        type: 'fix',
        "description": "Disable background tile animation"
      },
      {
        type: 'fix',
        "description": "Properly setup native AnalyserNode from Tone.js"
      },
      {
        type: 'feature',
        "description": "Complete music-reactive implementation"
      },
      {
        type: 'improvement',
        "description": "Document background tile rendering optimizations"
      },
      {
        type: 'feature',
        "description": "Add music reactivity toggle in settings"
      },
      {
        type: 'feature',
        "description": "Add frequency-based worm segment colors"
      },
      {
        type: 'feature',
        "description": "Add particle trail effects"
      },
      {
        type: 'feature',
        "description": "Add music-reactive speed modulation"
      },
      {
        type: 'feature',
        "description": "Add beat-synced score multiplier"
      },
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
