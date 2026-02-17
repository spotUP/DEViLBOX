/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-17T00:20:53.712Z
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
export const BUILD_VERSION = '1.0.782';
export const BUILD_NUMBER = '782';
export const BUILD_HASH = '03e5bb40';
export const BUILD_DATE = '2026-02-17';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.782',
    date: '2026-02-17',
    changes: [
      {
        type: 'fix',
        "description": "Furnace 2nd effect column + scheduler BPM timing"
      },
      {
        type: 'fix',
        "description": "Pattern break 0Dxx uses hex for XM/Furnace, BCD only for MOD"
      },
      {
        type: 'fix',
        "description": "Implement Furnace speed1/speed2 alternation for correct timing"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog"
      },
      {
        type: 'fix',
        "description": "Sync normalDecay with filterEnvelope.decay across all TB-303 presets"
      },
      {
        type: 'fix',
        "description": "All knobs now responsive - use refs to prevent stale closures in effect/TB303 knob handlers"
      },
      {
        type: 'fix',
        "description": "TB-303 Decay knob now updates devilFish.normalDecay"
      }
    ]
  },
  {
    version: '2026-02-16',
    date: '2026-02-16',
    changes: [
      {
        type: 'fix',
        "description": "Correct parameter ranges to 0-1 normalized values matching DB303 site rip. All knobs were using Hz/ms/% ranges instead of 0-1, causing values to clamp at 1.0. Decay knob now syncs devilFish.normalDecay to prevent applyConfig() from overriding it. Added auto-instrument detection and dropdown for multiple 303s."
      },
      {
        type: 'fix',
        "description": "Use Zustand selectors to properly track pattern changes in piano roll"
      },
      {
        type: 'fix',
        "description": "Debug: add comprehensive logging to diagnose piano roll interaction issues"
      },
      {
        type: 'fix',
        "description": "Velocity lane now shows full width with helpful empty state"
      },
      {
        type: 'feature',
        "description": "Improve piano roll velocity lane and multi-channel UX"
      },
      {
        type: 'improvement',
        "description": "Improve piano roll tool button tooltips"
      },
      {
        type: 'feature',
        "description": "Color code notes by instrument in piano roll"
      },
      {
        type: 'feature',
        "description": "Ensure piano keys trigger on note edges during playback"
      },
      {
        type: 'improvement',
        "description": "Improve piano roll smooth scrolling with ease-out-cubic"
      },
      {
        type: 'fix',
        "description": "Piano roll initialization error and improve default zoom"
      },
      {
        type: 'feature',
        "description": "Seamless wrap-around scrolling for piano roll playback"
      },
      {
        type: 'feature',
        "description": "Remove playhead line from piano roll during playback"
      },
      {
        type: 'feature',
        "description": "Add smooth RAF-based scrolling to piano roll playback"
      },
      {
        type: 'improvement',
        "description": "Revert: back to scrollLeft for proper viewport scrolling"
      },
      {
        type: 'fix',
        "description": "Remove unused variables and fix duplicate grid declaration"
      },
      {
        type: 'feature',
        "description": "Use CSS transform for GPU-accelerated smooth scrolling"
      },
      {
        type: 'improvement',
        "description": "Remove smooth marker functionality, keep discrete mode with trails"
      },
      {
        type: 'feature',
        "description": "Add animated gradient overlay for smooth visual flow effect"
      },
      {
        type: 'fix',
        "description": "Fix smooth marker vertical alignment with notes"
      },
      {
        type: 'improvement',
        "description": "Make viewport scrolling perfectly smooth - sync with marker animation"
      },
      {
        type: 'fix',
        "description": "Fix beat marker sizing - apply to cell button not wrapper"
      },
      {
        type: 'improvement',
        "description": "Simplify beat markers - just color every 4th cell background"
      },
      {
        type: 'improvement',
        "description": "Make beat markers appear IN FRONT of notes with full-height columns"
      },
      {
        type: 'fix',
        "description": "Fix smooth marker alignment and beat marker visibility"
      },
      {
        type: 'fix',
        "description": "Fix beat marker styling - lighter color, correct sizing, z-index"
      },
      {
        type: 'fix',
        "description": "Fix jerky smooth marker - use state instead of forceUpdate"
      },
      {
        type: 'feature',
        "description": "Make smooth marker truly smooth - add per-row sliding overlays"
      },
      {
        type: 'improvement',
        "description": "Remove unused useTrackerStore destructuring"
      },
      {
        type: 'improvement',
        "description": "Remove unused channel variable"
      },
      {
        type: 'fix',
        "description": "Fix jerky smooth marker animation - force 60fps re-renders"
      },
      {
        type: 'improvement',
        "description": "Remove per-step instrument color coding from grid markers"
      },
      {
        type: 'feature',
        "description": "Add smooth marker scrolling mode to grid view"
      },
      {
        type: 'fix',
        "description": "Fix note colors using inline hex values instead of Tailwind classes"
      },
      {
        type: 'improvement',
        "description": "Remove borders from grid note cells"
      },
      {
        type: 'improvement',
        "description": "Use per-step instrument colors for trails and markers"
      },
      {
        type: 'fix',
        "description": "Fix instrument color: scan channel cells for actual instrument ID"
      },
      {
        type: 'fix',
        "description": "Fix invisible markers: use inline hex colors instead of dynamic Tailwind classes"
      },
      {
        type: 'improvement',
        "description": "Color trail and play markers with instrument color"
      },
      {
        type: 'fix',
        "description": "Fix header position marker alignment and remove transition"
      },
      {
        type: 'improvement',
        "description": "Make trail and play marker overlays exactly match cell size"
      },
      {
        type: 'fix',
        "description": "Fix play marker flickering by limiting CSS transitions"
      },
      {
        type: 'fix',
        "description": "Fix flickering play marker by removing duplicate trail effects"
      },
      {
        type: 'fix',
        "description": "Fix trail effect to render on top of active cell backgrounds"
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
