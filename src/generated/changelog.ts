/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-14T15:33:34.553Z
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
export const BUILD_NUMBER = '510';
export const BUILD_HASH = 'ceae8a4';
export const BUILD_DATE = '2026-02-14';

// Full semantic version with build number
export const FULL_VERSION = `${BUILD_VERSION}.${BUILD_NUMBER}`;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1',
    date: '2026-02-14',
    changes: [
      {
        type: 'improvement',
        "description": "Comprehensive performance optimization across rendering, audio, and state management"
      },
      {
        type: 'feature',
        "description": "Make piano roll/input panel collapsible"
      },
      {
        type: 'feature',
        "description": "Add instrument selector and fix cursor bar styling"
      },
      {
        type: 'fix',
        "description": "Enable native scrolling and add clipboard actions"
      },
      {
        type: 'feature',
        "description": "Add swipe gestures for cursor movement and channel switching"
      },
      {
        type: 'fix',
        "description": "Remove unused touch variable in handleKeyTouch"
      },
      {
        type: 'fix',
        "description": "Resolve remaining TypeScript errors"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript compilation errors in mobile UX code"
      },
      {
        type: 'improvement',
        "description": "Chore: sync remaining changes from previous development"
      },
      {
        type: 'improvement',
        "description": "Update project memory with mobile UX implementation"
      },
      {
        type: 'improvement',
        "description": "Add comprehensive mobile UX documentation"
      },
      {
        type: 'feature',
        "description": "Add mobile MIDI support section to settings"
      },
      {
        type: 'feature',
        "description": "Optimize drum pads and pedalboard for mobile layouts"
      },
      {
        type: 'feature',
        "description": "Optimize all instrument editors for touch devices"
      },
      {
        type: 'fix',
        "description": "Solve knob scroll conflict with touch-action CSS"
      },
      {
        type: 'feature',
        "description": "Add mobile pattern editor with context-aware input"
      },
      {
        type: 'feature',
        "description": "Add mobile UX infrastructure"
      }
    ]
  },
  {
    version: '2026-02-13',
    date: '2026-02-13',
    changes: [
      {
        type: 'fix',
        "description": "Remove URL shim that shadowed global URL constructor"
      },
      {
        type: 'fix',
        "description": "Fix WASM OOM and self-not-defined in AudioWorklet scope"
      },
      {
        type: 'improvement',
        "description": "Chore(tms5220): update C++ docs and rebuild WASM binary with index clamping"
      },
      {
        type: 'fix',
        "description": "Clamp TMS5220 table indices and clean up FurnaceDispatch naming"
      },
      {
        type: 'fix',
        "description": "Chore: update project docs, migration, nibbles fixes, and misc improvements"
      },
      {
        type: 'fix',
        "description": "Add missing parameter handlers and fix async init races"
      },
      {
        type: 'fix',
        "description": "Redesign master effects modal and fix stale closure bug"
      },
      {
        type: 'fix',
        "description": "Correct TB-303 defaults and presets from verified reference sources"
      },
      {
        type: 'feature',
        "description": "Improve TMS5220 speech synth with phoneme mapping and ROM parsing"
      },
      {
        type: 'improvement',
        "description": "Chore: remove stale DB303/open303 source copies and outdated docs"
      },
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
