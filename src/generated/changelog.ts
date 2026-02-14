/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-14T20:13:00.060Z
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
export const BUILD_NUMBER = '551';
export const BUILD_HASH = '250d587';
export const BUILD_DATE = '2026-02-14';

// Full semantic version with build number
export const FULL_VERSION = `${BUILD_VERSION}.${BUILD_NUMBER}`;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1',
    date: '2026-02-14',
    changes: [
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
      },
      {
        type: 'fix',
        "description": "Re-enable silent auto-preview for waveform visualization"
      },
      {
        type: 'fix',
        "description": "Wire up HarmonicSynth parameter updates"
      },
      {
        type: 'fix',
        "description": "Disable auto-preview - user triggers notes manually"
      },
      {
        type: 'fix',
        "description": "Prevent auto-preview during playback and debounce when editing"
      },
      {
        type: 'fix',
        "description": "Update instrument name when changing synth type"
      },
      {
        type: 'fix',
        "description": "Use SynthRegistry.knows() for lazy-loaded synths"
      },
      {
        type: 'fix',
        "description": "Add SynthRegistry check for HarmonicSynth and other registry synths"
      },
      {
        type: 'feature',
        "description": "Add HarmonicSynth to pads category"
      },
      {
        type: 'improvement',
        "description": "Add comprehensive Plugin SDK documentation"
      },
      {
        type: 'improvement',
        "description": "Chore: update changelog and instrument editor"
      },
      {
        type: 'feature',
        "description": "Register HarmonicSynth in SDK"
      },
      {
        type: 'feature',
        "description": "Add effect registry descriptors for all effect types"
      },
      {
        type: 'feature',
        "description": "Integrate EffectRegistry system"
      },
      {
        type: 'feature',
        "description": "Add HarmonicSynth - additive/spectral synthesis engine"
      },
      {
        type: 'improvement',
        "description": "Add comprehensive performance optimization summary"
      },
      {
        type: 'improvement',
        "description": "Integrate requestIdleCallback for idle-time auto-save"
      },
      {
        type: 'improvement',
        "description": "Comprehensive performance optimization across rendering, audio, and state management"
      },
      {
        type: 'feature',
        "description": "Make piano roll/input panel collapsible"
      },
      {
        type: 'feature',
        "description": "Add instrument selector and fix cursor bar styling"
      },
      {
        type: 'fix',
        "description": "Enable native scrolling and add clipboard actions"
      },
      {
        type: 'feature',
        "description": "Add swipe gestures for cursor movement and channel switching"
      },
      {
        type: 'fix',
        "description": "Remove unused touch variable in handleKeyTouch"
      },
      {
        type: 'fix',
        "description": "Resolve remaining TypeScript errors"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript compilation errors in mobile UX code"
      },
      {
        type: 'improvement',
        "description": "Chore: sync remaining changes from previous development"
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
