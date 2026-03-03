/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-03T12:26:22.395Z
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
export const BUILD_VERSION = '1.0.2036';
export const BUILD_NUMBER = '2036';
export const BUILD_HASH = 'ef0b8c51';
export const BUILD_DATE = '2026-03-03';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2036',
    date: '2026-03-03',
    changes: [
      {
        type: 'improvement',
        "description": "Test: GTUltra test suite — 39 tests for mapping, detection, presets"
      },
      {
        type: 'feature',
        "description": "ASID hardware toggle in tracker toolbar"
      },
      {
        type: 'fix',
        "description": "SID monitor syntax error — missing y: property key"
      },
      {
        type: 'feature',
        "description": "GTUltra piano roll, preset browser, and visual mapping"
      },
      {
        type: 'feature',
        "description": "GTUltra SID presets and visual table editor"
      },
      {
        type: 'feature',
        "description": "GTUltra oscilloscope, studio mode, and visual instrument designer"
      },
      {
        type: 'feature',
        "description": "GTUltra UI enhancements and VJ component refactoring"
      },
      {
        type: 'fix',
        "description": "Use READ macros for label_ref operands in RMW ops"
      },
      {
        type: 'feature',
        "description": "Wire WASM heap data to GTUltra UI components"
      },
      {
        type: 'feature',
        "description": "GTUltra ASID hardware bridge for USB-SID-Pico"
      },
      {
        type: 'feature',
        "description": "GTUltra block operations + SID register monitor"
      },
      {
        type: 'feature',
        "description": "GoatTracker .sng file detection and loading pipeline"
      },
      {
        type: 'feature',
        "description": "GoatTracker Ultra Phase 3 — Pixi/WebGL UI components"
      },
      {
        type: 'feature',
        "description": "GoatTracker Ultra Phase 2 — DOM UI components"
      },
      {
        type: 'feature',
        "description": "GoatTracker Ultra WASM engine — Phase 1 complete"
      },
      {
        type: 'feature',
        "description": "Add label destination writes, SIZE token skip, emitOperandRead"
      },
      {
        type: 'improvement',
        "description": "Revert(tracker): restore 47fps every-3rd-frame scroll baseline"
      },
      {
        type: 'improvement',
        "description": "Add ASID hardware support documentation"
      },
      {
        type: 'feature',
        "description": "Add ASID status tracking to C64SIDEngine"
      },
      {
        type: 'feature',
        "description": "Wire ASID protocol into jsSID engine"
      },
      {
        type: 'feature',
        "description": "Add ASID hardware protocol and settings UI"
      },
      {
        type: 'improvement',
        "description": "Note that HVSC browser requires backend server"
      },
      {
        type: 'fix',
        "description": "Improve HVSC error messages and remove broken CORS fallback"
      },
      {
        type: 'improvement',
        "description": "Revert(tracker): restore pre-tile-shift scroll (every-3rd-frame RAF)"
      },
      {
        type: 'fix',
        "description": "Debug(vj): add preset selection logging in VJView"
      },
      {
        type: 'improvement',
        "description": "Revert(tracker): restore overlay inside scroll container for 46fps scroll"
      },
      {
        type: 'fix',
        "description": "Encode preset paths and add error logging in ProjectMCanvas"
      },
      {
        type: 'fix',
        "description": "Show import dialog for SID files on drag-and-drop"
      },
      {
        type: 'fix',
        "description": "Clean up engine constructor syntax errors"
      },
      {
        type: 'fix',
        "description": "Never fall back to UADE for C64 SID files"
      },
      {
        type: 'improvement',
        "description": "Verify SID file routing path"
      },
      {
        type: 'feature',
        "description": "Add HVSC API endpoints"
      },
      {
        type: 'feature',
        "description": "Add HVSC browser tab to FileBrowser"
      },
      {
        type: 'feature',
        "description": "Implement STIL parser for SID tune metadata"
      },
      {
        type: 'feature',
        "description": "Add pattern match floating button"
      },
      {
        type: 'feature',
        "description": "Add pattern match UI foundation"
      },
      {
        type: 'feature',
        "description": "Integrate C64 SID engines into playback system"
      },
      {
        type: 'feature',
        "description": "Add SID engine selector to Settings"
      },
      {
        type: 'feature',
        "description": "Add SID engine preference to settings"
      },
      {
        type: 'feature',
        "description": "Add 4 more SID engine wrappers"
      },
      {
        type: 'feature',
        "description": "Add engine manager and jsSID wrapper"
      },
      {
        type: 'feature',
        "description": "Add all 5 SID emulation engines"
      },
      {
        type: 'fix',
        "description": "Fix .mus file format collision (Karl Morton vs UFO/MicroProse)"
      },
      {
        type: 'fix',
        "description": "Fix .sid file format detection (C64 vs SidMon1 Amiga)"
      }
    ]
  },
  {
    version: '2026-03-02',
    date: '2026-03-02',
    changes: [
      {
        type: 'improvement',
        "description": "Update status doc with dismissal feature"
      },
      {
        type: 'feature',
        "description": "Add 'Don't show again' option to Modland contribution modal"
      },
      {
        type: 'feature',
        "description": "Implement Modland pattern hash computation (FNV-1a)"
      },
      {
        type: 'improvement',
        "description": "Add Modland pattern hash algorithm implementation"
      },
      {
        type: 'feature',
        "description": "Add Modland contribution prompt for unknown modules"
      },
      {
        type: 'fix',
        "description": "Lazy-initialize songdb prepared statements"
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
