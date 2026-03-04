/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-04T21:48:11.241Z
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
export const BUILD_VERSION = '1.0.2277';
export const BUILD_NUMBER = '2277';
export const BUILD_HASH = 'cc6637eb';
export const BUILD_DATE = '2026-03-04';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2277',
    date: '2026-03-04',
    changes: [
      {
        type: 'improvement',
        "description": "Chore: update generated changelog to build 2267"
      },
      {
        type: 'feature',
        "description": "Chip format metadata, improved render progress bar"
      },
      {
        type: 'feature',
        "description": "Preset tags, tag filtering, synth browser, escape-to-close"
      },
      {
        type: 'feature',
        "description": "Canvas view mode, improved module browser layout"
      },
      {
        type: 'feature',
        "description": "Pulsing connection dot, per-channel widths, collapsed channels"
      },
      {
        type: 'feature',
        "description": "Multi-mode visualizer, velocity-sensitive pads, turntable physics"
      },
      {
        type: 'fix',
        "description": "Add comprehensive synth debugging diagnostics to test runner"
      },
      {
        type: 'feature',
        "description": "Tag management UI, search/recommended APIs, HVSC search fixes"
      },
      {
        type: 'feature',
        "description": "Add all 48 missing synths to test runner — full 190/190 coverage"
      },
      {
        type: 'feature',
        "description": "Full DeepSID feature implementation — all tabs, search, tags, transport"
      },
      {
        type: 'feature',
        "description": "Add comprehensive FX test runner: music-driven tests, clipping detection, 39 param wiring tests, 19 new effects"
      },
      {
        type: 'fix',
        "description": "Alphabetically sort FX preset categories and items"
      },
      {
        type: 'fix',
        "description": "PixiSelect dropdown scroll support for long option lists"
      },
      {
        type: 'feature',
        "description": "Achieve 1:1 GL-DOM parity across all components"
      },
      {
        type: 'fix',
        "description": "Fix collaboration split view and remote pattern view to match DOM versions"
      },
      {
        type: 'fix',
        "description": "Resolve 17 TypeScript errors across Pixi components"
      },
      {
        type: 'fix',
        "description": "Escape apostrophe in PixiRemotePatternView string literal"
      },
      {
        type: 'fix',
        "description": "Remove extra </Div> closing tag in PixiPadEditor"
      },
      {
        type: 'feature',
        "description": "Pad name editing, MIDI learn, add layer from file"
      },
      {
        type: 'fix',
        "description": "SA: fix 11 period table values and ADSR sustain gate"
      },
      {
        type: 'feature',
        "description": "Add PixiPadEditor — 6-tab GL pad parameter editor"
      },
      {
        type: 'improvement',
        "description": "Enhance PixiDrumPadManager with full DOM drumpad feature parity"
      },
      {
        type: 'feature',
        "description": "Isolate drumpad samples from project instrument slots"
      },
      {
        type: 'fix',
        "description": "Remove extra closing pixiContainer tag in PixiStatusBar"
      },
      {
        type: 'fix',
        "description": "Wire drumpad audio — pads now trigger sounds on click"
      },
      {
        type: 'feature',
        "description": "Unify view headers/footers, fix danger button, resize drumpad"
      },
      {
        type: 'fix',
        "description": "Use theme.text instead of nonexistent theme.textPrimary"
      },
      {
        type: 'feature',
        "description": "Add view selector dropdown to drumpad header bar"
      },
      {
        type: 'fix',
        "description": "SA instrument editor changes now reach running WASM synth"
      },
      {
        type: 'fix',
        "description": "Remove auto-preview from instrument editors"
      },
      {
        type: 'fix',
        "description": "SA instrument preview plays at C3 instead of C4"
      },
      {
        type: 'fix',
        "description": "PixiButton click not firing due to layout-shift pointerOut"
      },
      {
        type: 'feature',
        "description": "Add drag-handle camera controls to studio workbench"
      },
      {
        type: 'fix',
        "description": "Guard nullable activeError references in PixiSynthErrorDialog"
      },
      {
        type: 'fix',
        "description": "Studio navigation — Ableton-style Cmd+drag pan, Cmd+/-/0/1 zoom"
      },
      {
        type: 'fix',
        "description": "SA portamento arrival zeros speed (ref line 1523)"
      },
      {
        type: 'feature',
        "description": "Wire SA instrument editor to running WASM synth"
      },
      {
        type: 'fix',
        "description": "SA effect routing — send effects 1,2,4,7,8,A to WASM directly"
      },
      {
        type: 'fix',
        "description": "Wire 0xy effect arpeggio to WASM synth"
      },
      {
        type: 'fix',
        "description": "ADSR sustain/release, note-off, special notes"
      },
      {
        type: 'fix',
        "description": "Effect editor content scrolling — add flex-1 min-h-0 for knob accessibility"
      },
      {
        type: 'fix',
        "description": "FX modal improvements — oscilloscope overlays, preset ordering, DnD constraint"
      },
      {
        type: 'fix',
        "description": "Arpeggio silence on out-of-range, speedCounter tick, wire arpTable from replayer"
      },
      {
        type: 'fix',
        "description": "CXX (set volume) now applies before note trigger in MOD path"
      },
      {
        type: 'fix',
        "description": "Increase master FX panel preset dropdown height to 70vh"
      },
      {
        type: 'feature',
        "description": "Add Neural amp, WAM, Buzz, and Tumult FX presets"
      },
      {
        type: 'fix',
        "description": "SID engines bypass blob URL pipeline for direct data loading"
      },
      {
        type: 'fix',
        "description": "Restore correct SA note offset -36 (was incorrectly reverted to -24)"
      },
      {
        type: 'fix',
        "description": "Prevent AudioContext mismatch crash in TrackerReplayer.loadSong"
      },
      {
        type: 'fix',
        "description": "SID engines silence — add player.play(), share AudioContext, playcont() hack"
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
