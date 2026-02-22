/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-22T12:31:07.791Z
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
export const BUILD_VERSION = '1.0.1086';
export const BUILD_NUMBER = '1086';
export const BUILD_HASH = '0152e32f';
export const BUILD_DATE = '2026-02-22';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1086',
    date: '2026-02-21',
    changes: [
      {
        type: 'feature',
        "description": "Add UADE playback layer and Amiga format parsers/exporters"
      },
      {
        type: 'feature',
        "description": "Add Furnace order matrix Pixi view component"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog"
      },
      {
        type: 'fix',
        "description": "FT2 toolbar visibility and modal z-index layering"
      },
      {
        type: 'feature',
        "description": "Expand Pixi views with full DOM overlay implementations"
      },
      {
        type: 'feature',
        "description": "Add PatternAccessor, Furnace subsong support, and replayer improvements"
      },
      {
        type: 'feature',
        "description": "Enhance pad editor with note repeat and improved pad controls"
      },
      {
        type: 'feature',
        "description": "Integrate HivelyTracker into instrument factory and import pipeline"
      },
      {
        type: 'feature',
        "description": "Add HivelyTracker WASM engine, synth, and hardware controls"
      },
      {
        type: 'fix',
        "description": "Resolve all pre-existing TypeScript errors and code quality issues"
      },
      {
        type: 'fix',
        "description": "Complete instrument support — operator macros, wavetable/sample upload, old format parsing"
      },
      {
        type: 'feature',
        "description": "Add ModPlug stereo separation mode toggle and slider to Settings"
      },
      {
        type: 'feature',
        "description": "Insert StereoSeparationNode into audio chain; add ModPlug mode"
      },
      {
        type: 'feature',
        "description": "Add stereoSeparationMode and modplugSeparation fields"
      },
      {
        type: 'fix',
        "description": "Remove unnecessary casts, expand clamp tests, add gain-boost warning"
      },
      {
        type: 'feature',
        "description": "Add StereoSeparationNode (OpenMPT M-S algorithm)"
      },
      {
        type: 'feature',
        "description": "Close compatibility gaps — compat flags, macro gating, chip mode flags"
      },
      {
        type: 'feature',
        "description": "Extend drum pad engine with note repeat and pixi UI improvements"
      },
      {
        type: 'feature',
        "description": "Add self-view toggle to video chat window"
      },
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
