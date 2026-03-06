/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-06T22:53:44.191Z
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
export const BUILD_VERSION = '1.0.2513';
export const BUILD_NUMBER = '2513';
export const BUILD_HASH = 'b329c69de';
export const BUILD_DATE = '2026-03-06';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2513',
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
      },
      {
        type: 'feature',
        "description": "Integrate Music-Assembler and Hippel ST WASM engines"
      },
      {
        type: 'feature',
        "description": "Wire GT Ultra editing and per-channel playback rows"
      },
      {
        type: 'feature',
        "description": "Test: add PreTracker integration tests verifying parser-to-engine pipeline"
      },
      {
        type: 'feature',
        "description": "Integrate PreTracker into engine routing and import pipeline"
      },
      {
        type: 'fix',
        "description": "Audit PreTracker code — deadlock, wrong types, wrong location"
      },
      {
        type: 'fix',
        "description": "Audit cleanup of Haiku-written refactoring code"
      },
      {
        type: 'fix',
        "description": "Address code quality issues in PreTrackerParser"
      },
      {
        type: 'feature',
        "description": "Add per-channel playback row support to FormatPatternEditor"
      },
      {
        type: 'fix',
        "description": "Correct PreTrackerParser to match spec (TrackerModule structure)"
      },
      {
        type: 'fix',
        "description": "Build errors in refactored pattern editors and adapters"
      },
      {
        type: 'feature',
        "description": "Add diagnostic printf output for audio queue sizes"
      },
      {
        type: 'feature',
        "description": "Add PreTrackerParser for module metadata extraction"
      },
      {
        type: 'feature',
        "description": "Simplify Gearmulator ESAI initialization for snapshot loading"
      },
      {
        type: 'improvement',
        "description": "Remove unused GTPatternEditor export"
      },
      {
        type: 'improvement',
        "description": "Replace GTPatternEditor with FormatPatternEditor in GTUltraView"
      },
      {
        type: 'feature',
        "description": "Create PreTrackerEngine for playback control"
      },
      {
        type: 'improvement',
        "description": "JamCrackerView to use FormatPatternEditor"
      },
      {
        type: 'fix',
        "description": "Rewrite PreTracker worklet following DB303 pattern"
      },
      {
        type: 'feature',
        "description": "Add PreTracker AudioWorklet bridge to WASM"
      },
      {
        type: 'fix',
        "description": "Skip sendInitControlCommands for snapshot-loaded devices"
      },
      {
        type: 'fix',
        "description": "Ensure microcontroller init commands execute for snapshot-loaded devices"
      },
      {
        type: 'improvement',
        "description": "Build: create WASM modules for pretracker, ma, and hippel replayers"
      },
      {
        type: 'feature',
        "description": "Rebuild Gearmulator WASM with ESAI audio fix and snapshot loading"
      },
      {
        type: 'improvement',
        "description": "Add klystrack adapter reference pattern"
      },
      {
        type: 'feature',
        "description": "Add format adapters for Hively, GT Ultra, and JamCracker"
      },
      {
        type: 'improvement',
        "description": "Implement format-agnostic pattern editor"
      },
      {
        type: 'improvement',
        "description": "Comprehensive completion summary for all format integration phases"
      },
      {
        type: 'improvement',
        "description": "Add klystrack pattern data debug guide and test helper"
      },
      {
        type: 'fix',
        "description": "Debug: add comprehensive logging to klystrack pattern data extraction"
      },
      {
        type: 'improvement',
        "description": "Chore: clean up diagnostic logging from klystrack engine"
      },
      {
        type: 'feature',
        "description": "Add DEViLBOX integration phases (9-13) to 68k transpile skill"
      },
      {
        type: 'fix',
        "description": "Replace TextDecoder with manual ASCII decode in klystrack worklet"
      },
      {
        type: 'fix',
        "description": "Klystrack WASM init robustness and diagnostic logging"
      },
      {
        type: 'feature',
        "description": "Add PixiRemapInstrumentDialog for GL/DOM parity"
      },
      {
        type: 'feature',
        "description": "GL/DOM parity — acid pattern dialog + Modland/HVSC browser panels"
      },
      {
        type: 'fix',
        "description": "Load klystrack song into WASM engine and populate pattern data"
      },
      {
        type: 'feature',
        "description": "Add Pixi GL views for JamCracker and Klystrack formats"
      },
      {
        type: 'fix',
        "description": "Add KlysSynth to ToneEngine switch cases"
      },
      {
        type: 'improvement',
        "description": "Extract format state from useTrackerStore into useFormatStore"
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
