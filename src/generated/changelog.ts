/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-15T03:27:00.608Z
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
export const BUILD_NUMBER = '576';
export const BUILD_HASH = '1c921b7';
export const BUILD_DATE = '2026-02-15';

// Full semantic version with build number
export const FULL_VERSION = `${BUILD_VERSION}.${BUILD_NUMBER}`;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1',
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
      },
      {
        type: 'fix',
        "description": "Correct playFromCursor to use cursor.rowIndex and stop-then-restart behavior"
      },
      {
        type: 'feature',
        "description": "Add playFromCursor command for pattern playback"
      },
      {
        type: 'fix',
        "description": "Correct modifier order and add Mac Cmd support"
      },
      {
        type: 'feature',
        "description": "Add KeyComboFormatter for standardized key combo strings"
      },
      {
        type: 'fix',
        "description": "Add validation and error handling to SchemeLoader"
      },
      {
        type: 'fix',
        "description": "Correct SchemeLoader schema to match spec (platform-first nesting)"
      },
      {
        type: 'feature',
        "description": "Add SchemeLoader for keyboard scheme files"
      },
      {
        type: 'fix',
        "description": "Improve store validation and test coverage"
      },
      {
        type: 'feature',
        "description": "Add Zustand store for keyboard preferences"
      },
      {
        type: 'feature',
        "description": "Add CommandRegistry with context awareness"
      },
      {
        type: 'feature',
        "description": "Add modifier normalization for Mac/PC"
      },
      {
        type: 'fix',
        "description": "Add TypeScript types for navigator.userAgentData"
      },
      {
        type: 'fix',
        "description": "Use modern navigator API with fallback for platform detection"
      },
      {
        type: 'feature',
        "description": "Add platform detection to KeyboardNormalizer"
      },
      {
        type: 'improvement',
        "description": "Add Phase 1 implementation plan for keyboard navigation"
      },
      {
        type: 'fix',
        "description": "Update for multi-site server deployment"
      },
      {
        type: 'improvement',
        "description": "Add comprehensive keyboard navigation design"
      },
      {
        type: 'feature',
        "description": "Complete Docker containerization"
      },
      {
        type: 'feature',
        "description": "Add backend API with auth and file management"
      },
      {
        type: 'feature',
        "description": "Add file browser Load functionality to mobile menu"
      },
      {
        type: 'fix',
        "description": "Restore /DEViLBOX/ base path to match repo name"
      },
      {
        type: 'fix',
        "description": "Use lowercase /devilbox/ base path"
      },
      {
        type: 'fix',
        "description": "Remove /DEViLBOX/ base path from URLs"
      },
      {
        type: 'fix',
        "description": "Correct GitHub Pages URLs in manifest.json"
      },
      {
        type: 'fix',
        "description": "Disable horizontal scroll and fix tap/swipe gestures"
      },
      {
        type: 'feature',
        "description": "Add PWA install-to-home-screen option"
      },
      {
        type: 'fix',
        "description": "Lock viewport and prevent unwanted scrolling behavior"
      },
      {
        type: 'fix',
        "description": "Prevent preset modal footer from causing horizontal scroll"
      },
      {
        type: 'fix',
        "description": "Improve preset modal footer visibility and usability"
      },
      {
        type: 'fix',
        "description": "Increase hamburger menu z-index to be always frontmost"
      },
      {
        type: 'fix',
        "description": "Mark isConnected param as intentionally unused"
      },
      {
        type: 'fix',
        "description": "Enable tap and swipe gestures in pattern editor"
      },
      {
        type: 'fix',
        "description": "Remove unused variables in cable routing"
      },
      {
        type: 'fix',
        "description": "Fix piano keyboard - white keys now visible"
      },
      {
        type: 'fix',
        "description": "Accept nullable ref in usePortPositions hook"
      },
      {
        type: 'feature',
        "description": "Expand mobile hamburger menu with FT2Toolbar features"
      },
      {
        type: 'fix',
        "description": "Add Safari-specific MIDI troubleshooting and debug logging"
      },
      {
        type: 'improvement',
        "description": "Optimize instrument loading and fix unused variable"
      },
      {
        type: 'fix',
        "description": "Use correct TrackerStore methods for cursor movement"
      },
      {
        type: 'feature',
        "description": "Add tap-to-cell and improve horizontal swipe gestures"
      },
      {
        type: 'feature',
        "description": "Add hamburger menu and improve MIDI support"
      },
      {
        type: 'fix',
        "description": "Convert HARMONIC_PRESETS to InstrumentPreset['config'][] format"
      },
      {
        type: 'feature',
        "description": "Mobile MIDI support, harmonic presets, and modular synth UI"
      },
      {
        type: 'fix',
        "description": "Resolve 8 type errors across modular synth and hooks"
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
