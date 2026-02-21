/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-21T00:08:58.686Z
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
export const BUILD_VERSION = '1.0.1048';
export const BUILD_NUMBER = '1048';
export const BUILD_HASH = '8f3861c2';
export const BUILD_DATE = '2026-02-21';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1048',
    date: '2026-02-20',
    changes: [
      {
        type: 'improvement',
        "description": "Remove hot-path allocations, debug logs, and redundant worker messages"
      },
      {
        type: 'improvement',
        "description": "Convert VU meters to canvas, preload fonts, group preset dropdown"
      },
      {
        type: 'fix',
        "description": "Improve signaling server error handling"
      },
      {
        type: 'improvement',
        "description": "Add fullscreen canvas CSS class"
      },
      {
        type: 'fix',
        "description": "Prevent font loading race in React Strict Mode"
      },
      {
        type: 'feature',
        "description": "Add multi-user live collaboration via WebRTC"
      },
      {
        type: 'feature',
        "description": "Complete WebGL offscreen canvas UI scaffolding"
      },
      {
        type: 'feature',
        "description": "Add UI component scaffolding"
      },
      {
        type: 'feature',
        "description": "Add audioMotion visualizer presets across DJ, tracker, and FT2 views"
      },
      {
        type: 'feature',
        "description": "Add note suppression to TrackerReplayer for scratch mode"
      },
      {
        type: 'improvement',
        "description": "Chore: update changelog and improve PatternEditorCanvas rendering"
      },
      {
        type: 'feature',
        "description": "Add MIDI DJ controller presets and auto-mapping"
      },
      {
        type: 'feature',
        "description": "Improve scratch engine for tracker and audio modes"
      },
      {
        type: 'feature',
        "description": "Add Serato metadata display — cue points, beatgrid, waveform"
      },
      {
        type: 'feature',
        "description": "Add audio file playback engine with dual tracker/audio mode"
      },
      {
        type: 'feature',
        "description": "Add stereo separation control"
      },
      {
        type: 'fix',
        "description": "Improve ToneEngine cleanup, BlepManager routing, and TrackerReplayer timing"
      },
      {
        type: 'improvement',
        "description": "Rewrite visualization store with individual selectors"
      },
      {
        type: 'improvement',
        "description": "Optimize Zustand selectors to prevent unnecessary re-renders"
      },
      {
        type: 'feature',
        "description": "Add local IndexedDB song revision history"
      },
      {
        type: 'improvement',
        "description": "Remove 30fps cap from visualization components"
      },
      {
        type: 'improvement',
        "description": "Comprehensive performance optimization across engine, React, and canvas"
      },
      {
        type: 'fix',
        "description": "Display song/pattern numbers in decimal instead of hex"
      },
      {
        type: 'improvement',
        "description": "Chore: update yarn.lock"
      },
      {
        type: 'fix',
        "description": "Debug(dj): add verbose logging to scratch playback engine"
      },
      {
        type: 'feature',
        "description": "Add stereo separation control to TrackerReplayer"
      },
      {
        type: 'fix',
        "description": "Show pattern display when loading songs from Modland"
      },
      {
        type: 'fix',
        "description": "Sync package-lock.json with @spotify/basic-pitch and tensorflow deps"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog"
      },
      {
        type: 'feature',
        "description": "Hold-to-loop, tap-once, and ignore-second scratch interaction"
      },
      {
        type: 'feature',
        "description": "Add Serato library parsers (database V2, crates, ID3 tags)"
      },
      {
        type: 'feature',
        "description": "Expand DJ controls, button mapping, controller profiles, and master FX routing"
      },
      {
        type: 'feature',
        "description": "Upgrade scratch engine with 10 patterns and indefinite fader scheduling"
      },
      {
        type: 'feature',
        "description": "Add general-purpose Randomize dialog for pattern editor"
      },
      {
        type: 'fix',
        "description": "Resolve erasableSyntaxOnly and unused import errors"
      },
      {
        type: 'feature',
        "description": "Context-aware DJ routing for knobs, pitch bend, and mod wheel"
      },
      {
        type: 'feature',
        "description": "Add per-pad DJ scratch action with editor UI"
      },
      {
        type: 'feature',
        "description": "Add scratch preset UI, fader LFO, and keyboard commands"
      },
      {
        type: 'improvement',
        "description": "Chore(keyboard-schemes): strip trailing blank lines from JSON scheme files"
      },
      {
        type: 'feature',
        "description": "Add true reverse scratch with ring-buffer AudioWorklet"
      },
      {
        type: 'fix',
        "description": "Fix instrument ID mismatch for empty module slots in DJ mode"
      },
      {
        type: 'feature',
        "description": "Add quick-nav keyboard shortcut (0-9, a-z) to file browser"
      },
      {
        type: 'feature',
        "description": "Integrate modland.com browser into main file browser"
      },
      {
        type: 'improvement',
        "description": "Extract module parser from App.tsx, improve status bar and layout"
      },
      {
        type: 'feature',
        "description": "Major DJ mode overhaul with per-deck routing, visualizers, and playlists"
      },
      {
        type: 'fix',
        "description": "Guard DB303 against redundant DSP-reinitializing param sends"
      },
      {
        type: 'feature',
        "description": "Add ToneArm vinyl simulation and instrument FX presets"
      },
      {
        type: 'feature',
        "description": "Add client-side cloud sync for presets and settings"
      },
      {
        type: 'feature',
        "description": "Add cloud sync API and modland proxy"
      },
      {
        type: 'fix',
        "description": "Use CSS zoom instead of transform:scale for WAM plugin GUIs"
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
