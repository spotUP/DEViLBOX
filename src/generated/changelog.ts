/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-15T22:57:59.041Z
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
export const BUILD_NUMBER = '658';
export const BUILD_HASH = '8f77811';
export const BUILD_DATE = '2026-02-15';

// Full semantic version with build number
export const FULL_VERSION = `${BUILD_VERSION}.${BUILD_NUMBER}`;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1',
    date: '2026-02-15',
    changes: [
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
      },
      {
        type: 'improvement',
        "description": "Disable global text selection for native app feel"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript unused import errors"
      },
      {
        type: 'fix',
        "description": "Route FurnaceDispatchSynth notes to correct chip channels"
      },
      {
        type: 'improvement',
        "description": "Add iOS PWA restriction note to MIDI settings"
      },
      {
        type: 'fix',
        "description": "Add detailed diagnostics for iOS MIDI support"
      },
      {
        type: 'fix',
        "description": "Unify keyboard component height across modes"
      },
      {
        type: 'fix',
        "description": "Chore: transport fixes, test updates, and enhanced furnace debugging"
      },
      {
        type: 'improvement',
        "description": "Unify command input and streamline tabs"
      },
      {
        type: 'fix',
        "description": "Restore correct horizontal gesture directions"
      },
      {
        type: 'fix',
        "description": "Invert horizontal swipe and scroll directions"
      },
      {
        type: 'fix',
        "description": "Chore: restore debug script and ensure all fixes are pushed"
      },
      {
        type: 'fix',
        "description": "Chore: update debug script to use require instead of import"
      },
      {
        type: 'fix',
        "description": "Implement iOS safe area support for notch and home indicator"
      },
      {
        type: 'feature',
        "description": "Add WASM auto-rebuild to dev startup scripts"
      },
      {
        type: 'fix',
        "description": "Force base path to / for subdomain deployment"
      },
      {
        type: 'fix',
        "description": "Add jsondiffpatch dependency to server package.json"
      },
      {
        type: 'fix',
        "description": "Import missing DEFAULT constants for createInstrumentsForModule"
      },
      {
        type: 'fix',
        "description": "Add createInstrumentsForModule helper and null check for module song data"
      },
      {
        type: 'fix',
        "description": "Correct module import types and conversion in App.tsx FileBrowser"
      },
      {
        type: 'fix',
        "description": "Add onLoadTrackerModule handler to FileBrowser for .fur file support"
      },
      {
        type: 'fix',
        "description": "Move transport controls to avoid hamburger menu overlap"
      },
      {
        type: 'feature',
        "description": "Add inline mode to MIDI dropdown to work properly in mobile menu"
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
