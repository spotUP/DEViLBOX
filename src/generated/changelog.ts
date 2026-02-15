/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-15T16:33:29.289Z
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
export const BUILD_NUMBER = '620';
export const BUILD_HASH = '74e40c4';
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
      },
      {
        type: 'improvement',
        "description": "Restore MIDI settings to mobile menu"
      },
      {
        type: 'fix',
        "description": "Fix mobile menu: add scrolling and remove MIDI dropdown that showed 'no options'"
      },
      {
        type: 'improvement',
        "description": "Chore: update changelog with recent mobile improvements"
      },
      {
        type: 'feature',
        "description": "Add Sign In/Sign Up to mobile hamburger menu"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript errors in gesture handling"
      },
      {
        type: 'feature',
        "description": "Enhance pattern editor navigation gestures"
      },
      {
        type: 'feature',
        "description": "Add moveCursorToChannelAndColumn atomic action"
      },
      {
        type: 'fix',
        "description": "Resolve piano keyboard layout layering issues"
      },
      {
        type: 'fix',
        "description": "Fix mobile file browser: directories open on single tap"
      },
      {
        type: 'feature',
        "description": "Add full-stack dev scripts - runs backend + frontend together"
      },
      {
        type: 'fix',
        "description": "Fix unused variable warnings"
      },
      {
        type: 'fix',
        "description": "Fix TypeScript compilation errors - add missing imports and fix hook declaration order"
      },
      {
        type: 'fix',
        "description": "UI updates and debug script for C64 instrument analysis"
      },
      {
        type: 'fix',
        "description": "Fix C64 instruments with no waveform flags - handles race condition where note-on sets wave=0 before macros process"
      },
      {
        type: 'fix',
        "description": "Fix Furnace C64/AY/OPL/OPLL core initialization - add missing setCore() calls"
      },
      {
        type: 'fix',
        "description": "Update release job dependency from 'deploy' to 'deploy-server'"
      },
      {
        type: 'improvement',
        "description": "Trigger: test deployment with fresh secret"
      },
      {
        type: 'improvement',
        "description": "Test: trigger automatic deployment"
      },
      {
        type: 'improvement',
        "description": "Chore: use existing Hetzner secrets for deployment"
      },
      {
        type: 'improvement',
        "description": "Remove GitHub Pages deployment, keep only custom server"
      },
      {
        type: 'feature',
        "description": "Automatic dual deployment to GitHub Pages and custom server"
      },
      {
        type: 'fix',
        "description": "Change base URL from /DEViLBOX/ to / for standalone server deployment"
      },
      {
        type: 'improvement',
        "description": "Update project documentation and status reports"
      },
      {
        type: 'feature',
        "description": "BD animations and command generator utilities"
      },
      {
        type: 'improvement',
        "description": "Chore: app configuration, stores, and dependency updates"
      },
      {
        type: 'improvement',
        "description": "Chore: Docker deployment configuration updates"
      },
      {
        type: 'fix',
        "description": "Furnace import improvements and C64 debugging tools"
      },
      {
        type: 'feature',
        "description": "Instrument editor improvements and DrumKitEditor"
      },
      {
        type: 'feature',
        "description": "Server-side file browser and files API"
      },
      {
        type: 'fix',
        "description": "Pattern switching during playback and tracker improvements"
      },
      {
        type: 'feature',
        "description": "Add comprehensive keyboard scheme system with multiple tracker presets"
      },
      {
        type: 'fix',
        "description": "Sync macros from DivInstrument to g_instrumentMacros for all Furnace chips"
      }
    ]
  },
  {
    version: '2026-02-14',
    date: '2026-02-14',
    changes: [
      {
        type: 'fix',
        "description": "Add status message and fix copy capitalization in clonePattern"
      },
      {
        type: 'feature',
        "description": "Add clonePattern command for pattern duplication"
      },
      {
        type: 'fix',
        "description": "Add defensive checks and use NOTE_OFF constant in playRow"
      },
      {
        type: 'fix',
        "description": "Rewrite playRow to trigger notes directly via ToneEngine"
      },
      {
        type: 'feature',
        "description": "Add playRow command for row audition"
      },
      {
        type: 'fix',
        "description": "Use setCurrentRow instead of non-existent startRow property"
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
