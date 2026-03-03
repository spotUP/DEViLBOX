/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-03T00:58:01.930Z
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
export const BUILD_VERSION = '1.0.2008';
export const BUILD_NUMBER = '2008';
export const BUILD_HASH = '0d71ca89';
export const BUILD_DATE = '2026-03-03';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2008',
    date: '2026-03-03',
    changes: [
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
      },
      {
        type: 'improvement',
        "description": "Chore: Update generated changelog (post-push)"
      },
      {
        type: 'improvement',
        "description": "Add scroll performance tracking"
      },
      {
        type: 'improvement',
        "description": "Chore: Update asm68k instruction map"
      },
      {
        type: 'improvement',
        "description": "Add Modland server deployment documentation"
      },
      {
        type: 'improvement',
        "description": "Remove client-side Modland database (645MB reduction)"
      },
      {
        type: 'feature',
        "description": "Integrate server-side Modland hash API"
      },
      {
        type: 'feature',
        "description": "Add Modland hash database API endpoints"
      },
      {
        type: 'feature',
        "description": "Add Modland browser for 727K+ tracker module discovery"
      },
      {
        type: 'improvement',
        "description": "Reorder status bar metadata"
      },
      {
        type: 'improvement',
        "description": "Enhance(songdb): enrich status bar metadata display"
      },
      {
        type: 'fix',
        "description": "Fix Sonix SMUS playback — tempo, companion files, register 0"
      },
      {
        type: 'fix',
        "description": "Remove unused INSTRUMENTS_DIR variable in SonixMusicDriverParser test"
      },
      {
        type: 'fix',
        "description": "Resolve type errors in modern shell components"
      },
      {
        type: 'feature',
        "description": "Load Sonix companion .ss sample files into instruments"
      },
      {
        type: 'improvement',
        "description": "Merge: resolve PixiNavBar conflict in favor of modern rewrite"
      },
      {
        type: 'feature',
        "description": "Modern fixed-zone shell with Ableton-inspired design"
      },
      {
        type: 'feature',
        "description": "Multi-file/folder support for Amiga formats needing companion files"
      },
      {
        type: 'feature',
        "description": "Add Master FX GL window"
      },
      {
        type: 'improvement',
        "description": "Move frame-rate updates from React state to imperative PixiJS mutations"
      },
      {
        type: 'feature',
        "description": "Per-channel FX slots with GL dropdown selector"
      },
      {
        type: 'feature',
        "description": "Convert clip/empty-area context menus to GL dropdown"
      },
      {
        type: 'feature',
        "description": "Add octave control to FT2 toolbar transport row"
      },
      {
        type: 'fix',
        "description": "Always draw item hit rect in dropdown panel to eliminate shaky clicks"
      },
      {
        type: 'feature',
        "description": "Right-click GL context menu (quantize, transpose, delete)"
      },
      {
        type: 'fix',
        "description": "Fix dropdown item selection by replacing DOM-capture close with PixiJS backdrop"
      },
      {
        type: 'feature',
        "description": "Instrument names, VU peak hold, dB level readout in GL mixer"
      },
      {
        type: 'feature',
        "description": "Follow-playback auto-scroll + ctrl+wheel zoom"
      },
      {
        type: 'feature',
        "description": "Remove channel in GL context menu"
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
