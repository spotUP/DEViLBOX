/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-07T13:26:10.296Z
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
export const BUILD_VERSION = '1.0.2554';
export const BUILD_NUMBER = '2554';
export const BUILD_HASH = '7cc955472';
export const BUILD_DATE = '2026-03-07';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2554',
    date: '2026-03-07',
    changes: [
      {
        type: 'fix',
        "description": "Sync arrangement playhead on view switch and update changelog"
      },
      {
        type: 'feature',
        "description": "Add searchable filter to PixiSelect dropdown"
      },
      {
        type: 'feature',
        "description": "Import dialog format capabilities, warnings, and metadata"
      },
      {
        type: 'feature',
        "description": "Add 7 new WASM format engines"
      },
      {
        type: 'feature',
        "description": "Extend furnace sequencer with FDS, QSound, N163, ESFM commands"
      },
      {
        type: 'feature',
        "description": "Refactor gearmulator to Worker+SAB audio architecture"
      },
      {
        type: 'feature',
        "description": "Add per-channel mixer gain to WASM Amiga engines"
      },
      {
        type: 'fix',
        "description": "Chore: remove temporary diagnostic/debug files and update .gitignore"
      },
      {
        type: 'feature',
        "description": "Chore: update pxtone harness and add CMakeLists.txt"
      },
      {
        type: 'fix',
        "description": "TrackerView merge resolution"
      },
      {
        type: 'improvement',
        "description": "Chore: update gm-o2-test script"
      },
      {
        type: 'feature',
        "description": "Add Organya, Sonix, and MusicLine editor modes to TrackerView"
      },
      {
        type: 'feature',
        "description": "Add pxtone WASM engine source (Pixel music format)"
      },
      {
        type: 'fix',
        "description": "Update gearmulator CMake and TrackerView routing"
      },
      {
        type: 'feature',
        "description": "Add eupmini WASM build config and compiled output"
      },
      {
        type: 'fix',
        "description": "Update useUIStore for split view mode"
      },
      {
        type: 'feature',
        "description": "Add eupmini WASM engine (FM Towns EUP music format)"
      },
      {
        type: 'improvement',
        "description": "Chore: update gearmulator O2 test script"
      },
      {
        type: 'feature',
        "description": "Add PitchResampler worklet for sample-based engines"
      },
      {
        type: 'feature',
        "description": "Add Organya WASM engine (Cave Story music format)"
      },
      {
        type: 'feature',
        "description": "Add Sonix Music Driver format parser"
      },
      {
        type: 'feature',
        "description": "Engine and store updates for Sonix format and routing"
      },
      {
        type: 'feature',
        "description": "Update FurnaceEditor, MixerPanel, and StudioCanvasView"
      },
      {
        type: 'improvement',
        "description": "Add synth-controls-flow class to all instrument control panels"
      },
      {
        type: 'improvement',
        "description": "Add debug investigation notes and test scripts"
      },
      {
        type: 'feature',
        "description": "Chore: add sonix-wasm/build to .gitignore"
      },
      {
        type: 'feature',
        "description": "Chore: rebuild gearmulator WASM and add test helpers"
      },
      {
        type: 'feature',
        "description": "Add Sonix WASM engine (transpiled 68k replayer)"
      },
      {
        type: 'feature',
        "description": "Enhance StudioCanvasView and TrackerReplayer"
      },
      {
        type: 'fix',
        "description": "Improve JamCracker controls layout"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog"
      },
      {
        type: 'improvement',
        "description": "Split StudioView into StudioCanvasView and SplitView"
      },
      {
        type: 'feature',
        "description": "Tracker engine improvements for Furnace format playback"
      },
      {
        type: 'fix',
        "description": "Furnace import parser type fixes and pattern data improvements"
      },
      {
        type: 'feature',
        "description": "Furnace WASM sequencer with per-system effects and compat flags"
      },
      {
        type: 'feature',
        "description": "Improve gearmulator WASM bridge and worker"
      },
      {
        type: 'feature',
        "description": "Improve 68k replayer WASM engines (hippel, ma, pretracker)"
      },
      {
        type: 'feature',
        "description": "Chore: add 68k replayer build dirs to .gitignore"
      },
      {
        type: 'fix',
        "description": "68k-to-C transpiler — compound expressions, XREF, EQU, orphan labels, jump tables"
      }
    ]
  },
  {
    version: '2026-03-06',
    date: '2026-03-06',
    changes: [
      {
        type: 'fix',
        "description": "68k-to-C transpiler — PEA, jump tables, label arithmetic, compound expressions"
      },
      {
        type: 'fix',
        "description": "68k-to-C transpiler — 6 fixes for cross-function gotos, case sensitivity, addressing modes"
      },
      {
        type: 'fix',
        "description": "Remove unused grooves param from convertFurnaceCell"
      },
      {
        type: 'fix',
        "description": "Remove duplicate case 0x9 that caused silent Furnace playback"
      },
      {
        type: 'fix',
        "description": "4 Furnace playback bugs — speed, effects, dual-processing, grooves"
      },
      {
        type: 'fix',
        "description": "Connect WASM engine output to audio graph for direct-routed engines"
      },
      {
        type: 'feature',
        "description": "Accept both prefix and extension forms for all Amiga formats"
      },
      {
        type: 'fix',
        "description": "Dynamic import resolution and worklet stereo buffer layout"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript errors in PreTracker parser, MA parser, and tests"
      },
      {
        type: 'feature',
        "description": "Per-channel playhead in MusicLine, delete dead GTPatternEditor"
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
