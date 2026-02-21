/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-21T09:22:32.614Z
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
export const BUILD_VERSION = '1.0.1066';
export const BUILD_NUMBER = '1066';
export const BUILD_HASH = '38617095';
export const BUILD_DATE = '2026-02-21';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1066',
    date: '2026-02-21',
    changes: [
      {
        type: 'fix',
        "description": "Camera (mugshot) starts muted by default"
      },
      {
        type: 'fix',
        "description": "Use original slot ID for MOD instruments with empty slots"
      },
      {
        type: 'feature',
        "description": "Improve piano roll view and keyboard layout commands"
      },
      {
        type: 'fix',
        "description": "Convert drum pad view from modal to inline view"
      },
      {
        type: 'feature',
        "description": "Add drum pads to editor view tabs"
      },
      {
        type: 'improvement',
        "description": "Merge drumpad and instrument sample browsers"
      },
      {
        type: 'feature',
        "description": "Enhance engine, store, pad grid, and add persistence"
      },
      {
        type: 'feature',
        "description": "Improve WebGL views, status bar, and DJ deck rendering"
      },
      {
        type: 'feature',
        "description": "Enhance scratch engine with new patterns and fader LFO"
      },
      {
        type: 'feature',
        "description": "Add Scratch Originals sample pack"
      },
      {
        type: 'feature',
        "description": "Global SVG arrow cursor for peer mouse + fix caret offset"
      },
      {
        type: 'fix',
        "description": "Peer cursor now renders as a cell block matching local cursor shape"
      },
      {
        type: 'fix',
        "description": "Replace peer cursor full-row highlight with thin channel caret"
      },
      {
        type: 'fix',
        "description": "Achieve 100% FT2 effect command coverage"
      },
      {
        type: 'fix',
        "description": "Remove unused posJumpPos field in TrackerReplayer"
      },
      {
        type: 'fix',
        "description": "Move channelOffsetsRef sync after useMemo declaration"
      },
      {
        type: 'improvement',
        "description": "Wip: save all local changes"
      },
      {
        type: 'feature',
        "description": "Add peer mouse cursor and selection overlay"
      }
    ]
  },
  {
    version: '2026-02-20',
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
