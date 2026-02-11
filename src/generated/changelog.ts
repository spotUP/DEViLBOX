/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-11T00:48:55.462Z
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
export const BUILD_NUMBER = '365';
export const BUILD_HASH = '6453a7a';
export const BUILD_DATE = '2026-02-11';

// Full semantic version with build number
export const FULL_VERSION = `${BUILD_VERSION}.${BUILD_NUMBER}`;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1',
    date: '2026-02-11',
    changes: [
      {
        type: 'feature',
        "description": "Update editors, presets, tracker, and DB303 controls"
      },
      {
        type: 'feature',
        "description": "Improve import/export engine and song parser"
      },
      {
        type: 'feature',
        "description": "Add WAM host, VST bridge, and JUCE WASM build template"
      },
      {
        type: 'improvement',
        "description": "Introduce DevilboxSynth interface and decouple synths from Tone.js"
      }
    ]
  },
  {
    version: '2026-02-10',
    date: '2026-02-10',
    changes: [
      {
        type: 'fix',
        "description": "Chore(infra): update electron, packages, and local debug tools"
      },
      {
        type: 'improvement',
        "description": "Enhance audio engine and fix multiple stability issues"
      },
      {
        type: 'feature',
        "description": "Add new channel visualizers and standardize styling"
      },
      {
        type: 'feature',
        "description": "Implement 1:1 logic port of FT2 Nibbles"
      },
      {
        type: 'feature',
        "description": "Improve TD-3 pattern import/export and audit .seq format"
      }
    ]
  },
  {
    version: '2026-02-09',
    date: '2026-02-09',
    changes: [
      {
        type: 'fix',
        "description": "Use absolute paths for worklet/wasm loading on GitHub Pages"
      },
      {
        type: 'fix',
        "description": "Test page uses direct worklet loading + correct case-sensitive filenames"
      },
      {
        type: 'fix',
        "description": "Test page now uses direct worklet loading instead of TypeScript imports"
      },
      {
        type: 'fix',
        "description": "Tracker knobs now update live synth + improve test page tracking params"
      },
      {
        type: 'feature',
        "description": "Comprehensive parameter testing with smoothing, retrigger, and auto-setup"
      },
      {
        type: 'feature',
        "description": "Complete DB303 synth overhaul with full parameter test suite"
      },
      {
        type: 'improvement',
        "description": "Update changelog and minor UI refinements"
      },
      {
        type: 'improvement',
        "description": "303 UI improvements: full-width responsive layout with collapsible sections"
      },
      {
        type: 'fix',
        "description": "Rebrand file formats: .dbx for songs, .dbi for instruments + fix speech synth singing modes"
      },
      {
        type: 'improvement',
        "description": "Optimize engine and shared control components"
      },
      {
        type: 'improvement',
        "description": "Optimize effect and specialty synth controls"
      },
      {
        type: 'improvement',
        "description": "Add refs to high-complexity synth controls"
      },
      {
        type: 'improvement',
        "description": "Prevent knob handler re-creation with refs"
      },
      {
        type: 'fix',
        "description": "Eliminate stale state bug preventing first drag response"
      },
      {
        type: 'fix',
        "description": "Chore: Add demo channel fix script and update build"
      },
      {
        type: 'fix',
        "description": "Improve VU meter timing and visibility"
      },
      {
        type: 'feature',
        "description": "Add ProTracker-style status messages"
      },
      {
        type: 'feature',
        "description": "Add ghost patterns and automation integration"
      },
      {
        type: 'feature',
        "description": "Update visualizer integration and logo animation"
      },
      {
        type: 'feature',
        "description": "Add classic demoscene sine scroller with starfield"
      },
      {
        type: 'feature',
        "description": "Add 5 per-channel visualizers"
      },
      {
        type: 'feature',
        "description": "Add 3 new global audio visualizers"
      },
      {
        type: 'feature',
        "description": "Add mouse interaction to automation lanes"
      }
    ]
  },
  {
    version: '2026-02-08',
    date: '2026-02-08',
    changes: [
      {
        type: 'feature',
        "description": "Add automation lane to tracker channels"
      },
      {
        type: 'fix',
        "description": "Resolve WASM loading errors and update synth implementations"
      },
      {
        type: 'improvement',
        "description": "Implement authentic ProTracker status messages in pattern header"
      },
      {
        type: 'improvement',
        "description": "Implement collapsible sections for cleaner vertical layout"
      },
      {
        type: 'improvement',
        "description": "Expand TB-303 panel dimensions and optimize control spacing"
      },
      {
        type: 'fix',
        "description": "Optimize FT2 toolbar layout to prevent horizontal overflow"
      },
      {
        type: 'fix',
        "description": "Correct position and pattern order management in toolbar"
      },
      {
        type: 'improvement',
        "description": "Fix white dividers in groove settings modal"
      },
      {
        type: 'improvement',
        "description": "Move groove controls to dedicated settings modal and simplify toolbar"
      },
      {
        type: 'feature',
        "description": "Enhance groove templates with velocity dynamics"
      },
      {
        type: 'feature',
        "description": "Implement adjustable groove cycle duration and immediate re-sync"
      },
      {
        type: 'fix',
        "description": "Remove unused tickLoop property"
      },
      {
        type: 'feature',
        "description": "Add manual swing amount control to groove menu"
      },
      {
        type: 'fix',
        "description": "Implement sample-accurate groove and swing for 303 synths"
      },
      {
        type: 'improvement',
        "description": "Fix groove menu dividers and cleanup unused imports"
      },
      {
        type: 'improvement',
        "description": "Comprehensive FT2 panel cleanup and reorganization"
      },
      {
        type: 'fix',
        "description": "Resolve AmigaFilter InvalidStateError and optimize 303 timing"
      },
      {
        type: 'improvement',
        "description": "Comprehensive tracker optimization (memoization, jank fixes, and UI smoothing)"
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
