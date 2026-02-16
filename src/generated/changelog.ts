/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-16T08:07:43.219Z
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
export const BUILD_NUMBER = '680';
export const BUILD_HASH = '92cb551';
export const BUILD_DATE = '2026-02-16';

// Full semantic version with build number
export const FULL_VERSION = `${BUILD_VERSION}.${BUILD_NUMBER}`;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1',
    date: '2026-02-16',
    changes: [
      {
        type: 'fix',
        "description": "Explicitly set popout window title to prevent 'about:blank'"
      },
      {
        type: 'fix',
        "description": "Move channel scrollbar above headers"
      },
      {
        type: 'fix',
        "description": "Chore: commit pending Furnace compatibility updates and hardware preset fixes"
      },
      {
        type: 'fix',
        "description": "Add resistance to stepped horizontal scrolling"
      },
      {
        type: 'fix',
        "description": "Implement stepped horizontal scrolling (channel by channel)"
      },
      {
        type: 'fix',
        "description": "Center channel content for cleaner layout"
      },
      {
        type: 'fix',
        "description": "Skip hidden columns during cursor navigation"
      },
      {
        type: 'fix',
        "description": "Resolve ReferenceError for columnVisibility and chColor"
      },
      {
        type: 'fix',
        "description": "Stabilize channel width using column visibility settings"
      },
      {
        type: 'fix',
        "description": "Ensure channel separators are drawn on top of row backgrounds"
      },
      {
        type: 'fix',
        "description": "Remove channel header bottom border to eliminate gap"
      },
      {
        type: 'fix',
        "description": "Re-enable active channel highlight on populated rows"
      },
      {
        type: 'fix',
        "description": "Implement full-height channel backgrounds and separators"
      },
      {
        type: 'fix',
        "description": "Extend active channel highlight to full height"
      },
      {
        type: 'fix',
        "description": "Remove unused variables and add missing import"
      },
      {
        type: 'fix',
        "description": "Strictly enforce hardware channel counts in system presets"
      },
      {
        type: 'fix',
        "description": "Synchronize channel header and grid scrolling"
      },
      {
        type: 'fix',
        "description": "Increase channel width to prevent label cutoff in header"
      },
      {
        type: 'fix',
        "description": "Resolve ReferenceError and clean up unused variables in metrics refactor"
      },
      {
        type: 'fix',
        "description": "Add missing Cpu icon import in TrackerView"
      },
      {
        type: 'feature',
        "description": "Improve hardware preset visibility and add mobile support"
      }
    ]
  },
  {
    version: '2026-02-15',
    date: '2026-02-15',
    changes: [
      {
        type: 'feature',
        "description": "Implement 1:1 hardware system presets and Furnace technical parity"
      },
      {
        type: 'improvement',
        "description": "Rename command buttons to 'Reference' for clarity"
      },
      {
        type: 'feature',
        "description": "Integrate chip-specific command reference and wire up recording settings"
      },
      {
        type: 'fix',
        "description": "Resolve 'mostly black' UI issue and standardize backgrounds"
      },
      {
        type: 'improvement',
        "description": "Global audit and standardization of borders and dividers"
      },
      {
        type: 'feature',
        "description": "Add floating value tooltip to Knob control"
      },
      {
        type: 'feature',
        "description": "Enhance module panel visuals"
      },
      {
        type: 'feature',
        "description": "Enhance cable and port UX"
      },
      {
        type: 'feature',
        "description": "Add interactive zoom and view controls"
      },
      {
        type: 'feature',
        "description": "Implement standard pan/zoom navigation"
      },
      {
        type: 'feature',
        "description": "Test: add ModularSynth to volume calibration suite"
      },
      {
        type: 'fix',
        "description": "Register ModularSynth in InstrumentFactory"
      },
      {
        type: 'fix',
        "description": "Final audit and fixes for block interpolation"
      },
      {
        type: 'fix',
        "description": "Improve block interpolation logic"
      },
      {
        type: 'fix',
        "description": "Resolve stability issues and unused variables"
      },
      {
        type: 'feature',
        "description": "Advanced obstacle-aware cable routing"
      },
      {
        type: 'feature',
        "description": "Implement column-specific selection and sparse clipboard"
      },
      {
        type: 'fix',
        "description": "Comprehensive stability and type-checking fixes"
      },
      {
        type: 'fix',
        "description": "Resolve TS1128 syntax error in ChannelContextMenu"
      },
      {
        type: 'feature',
        "description": "Add effect command interpolation to block selection"
      },
      {
        type: 'fix',
        "description": "Layer patch cables behind modules"
      },
      {
        type: 'feature',
        "description": "Comprehensive UI modernization and UX enhancements"
      },
      {
        type: 'feature',
        "description": "Add B/D operations to selection context menu"
      },
      {
        type: 'fix',
        "description": "Resolve ReferenceError by moving hook initialization to top"
      },
      {
        type: 'feature',
        "description": "Enable text selection and copying for error reports"
      },
      {
        type: 'feature',
        "description": "Implement touch-based block selection"
      },
      {
        type: 'feature',
        "description": "Hook up keyboard shortcuts to block selection"
      },
      {
        type: 'feature',
        "description": "Add block selection context menu with advanced functions"
      },
      {
        type: 'feature',
        "description": "Implement mouse-based block selection and visual highlight"
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
