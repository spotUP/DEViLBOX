/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-08T23:17:46.751Z
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
export const BUILD_NUMBER = '333';
export const BUILD_HASH = '7a9a4ed';
export const BUILD_DATE = '2026-02-08';

// Full semantic version with build number
export const FULL_VERSION = `${BUILD_VERSION}.${BUILD_NUMBER}`;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1',
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
  },
  {
    version: '2026-02-07',
    date: '2026-02-07',
    changes: [
      {
        type: 'improvement',
        "description": "Chore: update song files with latest format and improvements"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog and Open303 worklet"
      },
      {
        type: 'improvement',
        "description": "Improve engine systems and pattern handling"
      },
      {
        type: 'improvement',
        "description": "Consolidate tracker cells into unified FlagCell component"
      },
      {
        type: 'feature',
        "description": "Enhance DB303/TB303 pattern system with XML patterns and improved conversion"
      },
      {
        type: 'feature',
        "description": "Complete drum pad system Phase 3 & 4 improvements"
      },
      {
        type: 'feature',
        "description": "Refactor drum pad kit loading to integrate with instrument system"
      },
      {
        type: 'improvement',
        "description": "Add drum pad Phase 2 completion documentation"
      },
      {
        type: 'fix',
        "description": "Improve ROM archive ignore pattern"
      },
      {
        type: 'feature',
        "description": "Add ROM directory structure"
      },
      {
        type: 'improvement',
        "description": "Add development progress snapshots and reference images"
      },
      {
        type: 'feature',
        "description": "Add AudioContext singleton for shared audio resources"
      },
      {
        type: 'feature',
        "description": "Add drum pad engine and TR-707 ROM loader"
      },
      {
        type: 'feature',
        "description": "Add drum pad UI components"
      },
      {
        type: 'feature',
        "description": "Add DB303 compiled WASM binaries"
      },
      {
        type: 'feature',
        "description": "Add DB303 WASM source files (RoSiC library)"
      },
      {
        type: 'feature',
        "description": "Chore: add ROM and test artifact exclusions to .gitignore"
      },
      {
        type: 'improvement',
        "description": "Remove MSM5232 and TIA synth implementations"
      },
      {
        type: 'improvement',
        "description": "Build: update WASM modules and build configuration"
      },
      {
        type: 'feature',
        "description": "Add demo songs and reference images"
      },
      {
        type: 'improvement',
        "description": "Add comprehensive documentation for new features"
      },
      {
        type: 'improvement',
        "description": "Update type definitions and test infrastructure"
      },
      {
        type: 'feature',
        "description": "Enhance constants, stores, and utility functions"
      },
      {
        type: 'improvement',
        "description": "Improve UI components and tracker interface"
      },
      {
        type: 'improvement',
        "description": "Update synth engines for compatibility and consistency"
      },
      {
        type: 'feature',
        "description": "Implement DB303/JC303 synth engine with full parameter control"
      },
      {
        type: 'feature',
        "description": "Add DB303 pattern import/export and auto-load default presets"
      },
      {
        type: 'fix',
        "description": "Add hardware UI toggle to generic editor for DrumMachine"
      },
      {
        type: 'improvement',
        "description": "Rename Drum Machine to Roland TR-808/909 in UI"
      },
      {
        type: 'improvement',
        "description": "Rename TR-808 UI to TR-808/909 to reflect support for both machines"
      },
      {
        type: 'feature',
        "description": "Add authentic TR-808 hardware UI based on io-808 design"
      },
      {
        type: 'feature',
        "description": "Make hardware UI default for synths with hardware UI available"
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
