/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-15T20:26:31.179Z
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
export const BUILD_VERSION = '1.0.2912';
export const BUILD_NUMBER = '2912';
export const BUILD_HASH = 'ce1fca86f';
export const BUILD_DATE = '2026-03-15';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2912',
    date: '2026-03-15',
    changes: [
      {
        type: 'improvement',
        "description": "Chore: delete FormatEditorGL — PatternEditorCanvas is the one true editor"
      },
      {
        type: 'feature',
        "description": "Migrate KlysView, HivelyView, GTUltraView to PatternEditorCanvas format mode"
      },
      {
        type: 'feature',
        "description": "Use PatternEditorCanvas in format mode"
      },
      {
        type: 'feature',
        "description": "Format mode mouse hit-test + keyboard handler"
      },
      {
        type: 'feature',
        "description": "Format mode channel/column header"
      },
      {
        type: 'feature',
        "description": "Add format mode props, refs, and channel width computation"
      },
      {
        type: 'feature',
        "description": "Add Canvas2D fallback renderer with data-driven column support"
      },
      {
        type: 'improvement',
        "description": "Chore: delete FormatPatternEditor, GenericFormatView, HivelyPatternEditor (replaced by FormatEditorGL)"
      },
      {
        type: 'feature',
        "description": "Migrate HivelyView to FormatEditorGL"
      },
      {
        type: 'feature',
        "description": "Migrate GTUltraView to FormatEditorGL"
      },
      {
        type: 'feature',
        "description": "Migrate KlysView to FormatEditorGL"
      },
      {
        type: 'feature',
        "description": "Migrate JamCrackerView to FormatEditorGL"
      },
      {
        type: 'feature',
        "description": "Add FormatEditorGL unified WebGL2 format pattern editor"
      },
      {
        type: 'feature',
        "description": "Add data-driven column rendering to TrackerGLRenderer"
      },
      {
        type: 'improvement',
        "description": "Misc updates: libopenmpt engine, pattern canvas, changelog, audit tool"
      },
      {
        type: 'improvement',
        "description": "Update MCP server tools and drag-drop handler"
      },
      {
        type: 'fix',
        "description": "Update format parser tests: add new format coverage and fix assertions"
      },
      {
        type: 'improvement',
        "description": "Extend shared format editor types and components"
      },
      {
        type: 'feature',
        "description": "Update export UI: add live capture mode to export dialogs"
      },
      {
        type: 'improvement',
        "description": "Update JamCracker WASM harness and binary"
      },
      {
        type: 'fix',
        "description": "Format parser audit fixes: routing, detection, and withFallback pattern"
      },
      {
        type: 'improvement',
        "description": "Expand PxtoneParser: full pattern and instrument data extraction"
      },
      {
        type: 'improvement',
        "description": "Improve MAME engine and OctaMED controls"
      },
      {
        type: 'fix',
        "description": "Update Furnace WASM: sync wrapper and sequencer fixes"
      },
      {
        type: 'feature',
        "description": "Add live audio capture export via MCP bridge"
      },
      {
        type: 'improvement',
        "description": "Refactor JamCracker/Klys views to use shared GenericFormatView"
      },
      {
        type: 'feature',
        "description": "Add view-switcher dropdown to SplitView toolbar"
      },
      {
        type: 'fix',
        "description": "Fix Digital Mugician parser: tracks precede PCM audio in file layout"
      },
      {
        type: 'feature',
        "description": "Add ColumnSpec and params/columns fields to worker types"
      },
      {
        type: 'fix',
        "description": "Fix Medley (.ml/.mso), injectUADE logic, MAMEMultiPCM missing entry"
      },
      {
        type: 'fix',
        "description": "Add native tests for DSS/SCR/DSR/DODA; fix missing injectUADE on pvp/dsr"
      },
      {
        type: 'feature',
        "description": "Add native detection tests for WallyBeben, SteveBarrett, PaulSummers, DaveLoweNew"
      },
      {
        type: 'improvement',
        "description": "Convert daveLowe and magneticFieldsPacker to withNativeThenUADE"
      },
      {
        type: 'improvement',
        "description": "Convert adpcmMono/robHubbard to withNativeThenUADE; remove duplicate smus/snx/tiny block"
      },
      {
        type: 'improvement',
        "description": "Convert 9 more format routing blocks to withNativeThenUADE"
      },
      {
        type: 'feature',
        "description": "Add SoundMon/MusicMaker native parser tests; convert mm4/mm8 to withNativeThenUADE"
      },
      {
        type: 'improvement',
        "description": "Convert 5 inline native-parser blocks to withNativeThenUADE with injectUADE"
      },
      {
        type: 'fix',
        "description": "Fix injectUADE: bypass 0-notes check for stub parsers; add injectUADE to 6 formats"
      },
      {
        type: 'fix',
        "description": "Fix format parser tests: correct wrong parsers for .ntp, .rho, .psa, .sg files"
      }
    ]
  },
  {
    version: '2026-03-14',
    date: '2026-03-14',
    changes: [
      {
        type: 'fix',
        "description": "Fix .digi routing: fall back to OpenMPT for old DigiBooster 1.x text-header format"
      },
      {
        type: 'feature',
        "description": "Furnace WASM stub: implement DivSample::render() for BRR encoding (SNES)"
      },
      {
        type: 'improvement',
        "description": "Furnace WASM: call render() on all PCM samples before renderSamples(); SoundFactory: enable native+UADE injection"
      },
      {
        type: 'fix',
        "description": "DeltaMusic1: simplify synth instrument to first-segment snapshot; withFallback: add injectUADE option; Furnace: fix BRR/ADPCM sample depth byte counts"
      },
      {
        type: 'feature',
        "description": "Add MED magic-based routing; cover med.sadman and ballade.ems in tests"
      },
      {
        type: 'improvement',
        "description": "Update format status dashboard"
      },
      {
        type: 'improvement',
        "description": "DeltaMusic1: pre-render full sound table sequence for synth instruments"
      },
      {
        type: 'fix',
        "description": "Remove MAMEMultiPCM synth; fix ZSG-2 ROM config size"
      },
      {
        type: 'fix',
        "description": "Remove unused uadePatternLayout from parsers; misc synth fixes"
      },
      {
        type: 'fix',
        "description": "Add .hip routing to JochenHippelSTParser; fix PC-relative LEA off-by-2"
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
