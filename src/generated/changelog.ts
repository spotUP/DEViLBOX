/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-01T00:05:47.067Z
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
export const BUILD_VERSION = '1.0.3803';
export const BUILD_NUMBER = '3803';
export const BUILD_HASH = '8368f7e3b';
export const BUILD_DATE = '2026-04-01';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.3803',
    date: '2026-04-01',
    changes: [
      {
        type: 'feature',
        "description": "Add OpenWurli/OPL3/DX7 to synth browser, Oidos panel + presets"
      },
      {
        type: 'feature',
        "description": "DX7 patch bank browser with 1120 voices"
      },
      {
        type: 'feature',
        "description": "Complete parameter wiring for OPL3/DX7 synths"
      },
      {
        type: 'feature',
        "description": "Auto-load DX7 firmware ROM and voice banks"
      },
      {
        type: 'feature',
        "description": "Add Pixi panel layouts for OpenWurli, OPL3, DX7 synths"
      },
      {
        type: 'feature',
        "description": "Add DX7 WASM synth (VDX7 cycle-accurate emulation)"
      },
      {
        type: 'fix',
        "description": "Route UADE formats through render worker in DJ view"
      },
      {
        type: 'feature',
        "description": "Add OPL3 (YMF262) WASM synth — 18-channel FM, SBI patches"
      },
      {
        type: 'feature',
        "description": "Add OPL3 WASM build artifacts"
      },
      {
        type: 'fix',
        "description": "Move OPL3 forward declaration before use"
      },
      {
        type: 'feature',
        "description": "Add OPL3 JUCE-WASM bridge scaffold"
      },
      {
        type: 'improvement',
        "description": "Chore: gitignore third-party/retromulator clone"
      },
      {
        type: 'fix',
        "description": "Disable Import button while UADE engine is still loading"
      },
      {
        type: 'fix',
        "description": "Preload UADE WASM engine during import so song is ready on Play"
      },
      {
        type: 'fix',
        "description": "Import dialog blocks until song is fully ready to play"
      },
      {
        type: 'improvement',
        "description": "Double-click songs in DJ browsers to load to next free deck"
      },
      {
        type: 'fix',
        "description": "Remove aggressive API rate limiting (100 req/15min was too low for dev)"
      },
      {
        type: 'fix',
        "description": "Fix playlist sort dropdown clipped by Crate overflow"
      },
      {
        type: 'fix',
        "description": "Strip directory from UADE filename in parseUADEFile + add trigger note for compiled 68k"
      }
    ]
  },
  {
    version: '2026-03-31',
    date: '2026-03-31',
    changes: [
      {
        type: 'fix',
        "description": "Remove require() call in useNoteInput — useInstrumentStore already imported"
      },
      {
        type: 'fix',
        "description": "Force classic UADE mode for CustomMade formats (cust.*, custom.*, cm.*, rk.*)"
      },
      {
        type: 'improvement',
        "description": "Remove FX Editor button from DJ view (both DOM and GL)"
      },
      {
        type: 'improvement',
        "description": "Overlay Auto DJ panel instead of pushing content down"
      },
      {
        type: 'fix',
        "description": "Fix playlist dividers and crate click-outside-to-close"
      },
      {
        type: 'improvement',
        "description": "Soften playlist track text and dividers"
      },
      {
        type: 'fix',
        "description": "Strip directory from UADE filename hint to prevent MEMFS write failure"
      },
      {
        type: 'improvement',
        "description": "Unify DJ Browser/Playlists/Online/Serato into tabbed Crate panel"
      },
      {
        type: 'fix',
        "description": "UADE prefix-named formats (cust.*, custom.*) no longer fall through to libopenmpt"
      },
      {
        type: 'feature',
        "description": "Playlist Smart Mix sort + BPM/key/energy/name sorting"
      },
      {
        type: 'fix',
        "description": "AutoDJ continuous mixing, hide knob values, readable playlist"
      },
      {
        type: 'feature',
        "description": "Wire OBXf hardware UI — interactive controls + patch browser"
      },
      {
        type: 'feature',
        "description": "Knob columns with faders/VUs full height between them"
      },
      {
        type: 'fix',
        "description": "Restore mixer panel padding/gaps"
      },
      {
        type: 'feature',
        "description": "Wire OBXf hardware UI — mouse events, param forwarding"
      },
      {
        type: 'fix',
        "description": "OBXf WASM deadlock — empty themeLocations triggered AlertWindow"
      },
      {
        type: 'fix',
        "description": "Debug: add OBXf WASM loading diagnostics"
      },
      {
        type: 'feature',
        "description": "Compact DJ mixer layout + cue mix slider"
      },
      {
        type: 'fix',
        "description": "Update Pixi DJ mixer PFL labels 1/2 → A/B"
      },
      {
        type: 'fix',
        "description": "Clarify cue section labels (A/B + Phones label)"
      },
      {
        type: 'fix',
        "description": "OBXf hardware UI browser freeze"
      },
      {
        type: 'feature',
        "description": "OBXd controls two-column layout"
      },
      {
        type: 'feature',
        "description": "WASM vocoder, Kraftwerk hair spikes, OBXd/Dexed UI, VJ fixes"
      },
      {
        type: 'feature',
        "description": "Implement remaining tracker parity features"
      },
      {
        type: 'fix',
        "description": "Popout windows use static /popout.html instead of blob URL"
      },
      {
        type: 'fix',
        "description": "PT F6-F10 jump to correct positions, remove ft2-col-1 border"
      },
      {
        type: 'fix',
        "description": "Use blob URL for popout windows to eliminate about:blank header"
      },
      {
        type: 'improvement',
        "description": "JC303 knob panel UI improvements"
      },
      {
        type: 'feature',
        "description": "Complete remaining tracker parity features"
      },
      {
        type: 'fix',
        "description": "Replace about:blank URL in popout windows with meaningful path"
      },
      {
        type: 'feature',
        "description": "Instrument control UI improvements (Dexed, OBXd, synth controls)"
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
