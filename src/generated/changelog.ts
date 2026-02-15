/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-15T11:46:19.006Z
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
export const BUILD_NUMBER = '593';
export const BUILD_HASH = '0cc8ab8';
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
