/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-16T17:23:02.394Z
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
export const BUILD_NUMBER = '704';
export const BUILD_HASH = '891f989';
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
        "description": "Stop playback keeps current position instead of resetting to start"
      },
      {
        type: 'fix',
        "description": "SID notes hanging forever - release hook passed time as note param, panic/ESC now silence audio"
      },
      {
        type: 'fix',
        "description": "Chip creation promise race - multiple synths sharing one platform no longer hang"
      },
      {
        type: 'fix',
        "description": "Seamless position change during playback (no audio pause)"
      },
      {
        type: 'fix',
        "description": "Retry Furnace WASM init on page reload when AudioContext was suspended"
      },
      {
        type: 'fix',
        "description": "Pass scheduled time to stopChannel for correct note-off timing"
      },
      {
        type: 'fix',
        "description": "Sample-accurate timing for Furnace dispatch commands - queue timestamped NOTE_ON/OFF in worklet, matching Furnace nextBuf() pattern"
      },
      {
        type: 'fix',
        "description": "Resolve 5 TypeScript errors (systemId type, systems nullability)"
      },
      {
        type: 'fix',
        "description": "Resolve 22 TypeScript errors - add furnaceData to types, fix channelMeta"
      },
      {
        type: 'fix',
        "description": "Furnace instrument upload race condition - await uploads before playback"
      },
      {
        type: 'fix',
        "description": "Await FurnaceDispatch synth initialization before triggering notes"
      },
      {
        type: 'feature',
        "description": "Add detailed logging for instrument/macro debugging"
      },
      {
        type: 'fix',
        "description": "Revert: roll back to start-of-day state (b04b8a4) to fix SID audio regression"
      },
      {
        type: 'fix',
        "description": "Use macro.code instead of macro.type for macro type lookup"
      },
      {
        type: 'improvement',
        "description": "Wip: save state before SID audio regression audit"
      },
      {
        type: 'fix',
        "description": "Resolve format ReferenceError in ModuleLoader fallback path"
      },
      {
        type: 'fix',
        "description": "Eliminate playback break during natural position transitions"
      },
      {
        type: 'fix',
        "description": "Debug(furnace): enhanced logging for import and playback transitions"
      },
      {
        type: 'fix',
        "description": "Ensure Furnace and WAM synths are ready before playback starts"
      },
      {
        type: 'fix',
        "description": "Resolve JSX syntax errors and improve scrollbar layout"
      },
      {
        type: 'improvement',
        "description": "Clean up FurnaceDispatchEngine and wire up compat flags"
      },
      {
        type: 'fix',
        "description": "Resolve 1-frame position revert during playback navigation"
      },
      {
        type: 'feature',
        "description": "Enhance Furnace .fur parser with subsong and compat flag support"
      },
      {
        type: 'feature',
        "description": "Enhance ImportMetadata with Furnace-specific technical fingerprints"
      },
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
