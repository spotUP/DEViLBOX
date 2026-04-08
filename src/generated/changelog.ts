/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-08T13:28:38.409Z
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
export const BUILD_VERSION = '1.0.4605';
export const BUILD_NUMBER = '4605';
export const BUILD_HASH = '33126b769';
export const BUILD_DATE = '2026-04-08';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.4605',
    date: '2026-04-08',
    changes: [
      {
        type: 'fix',
        "description": "Fix sidechain effects routing, gate audio kill, compressor rewrite, GEQ31 layout"
      },
      {
        type: 'fix',
        "description": "Route Pumatracker to OpenMPT WASM (UADE can't play .puma)"
      },
      {
        type: 'fix',
        "description": "Fix EQ parameter routing, oversample mapping, PhonoFilter 4-curve support"
      },
      {
        type: 'fix',
        "description": "PC tracker export + DMF routing + OpenMPT WASM fallback"
      },
      {
        type: 'feature',
        "description": "Add PC tracker format audit (23 formats, 12 PASS)"
      },
      {
        type: 'fix',
        "description": "Enable tick snapshots during short scan"
      },
      {
        type: 'fix',
        "description": "Fix short-scan: full WASM reinit after scan + tick snapshot passthrough"
      },
      {
        type: 'feature',
        "description": "Reapply \"Implement short-scan mode for compiled 68k replayers (Phase 1)\""
      },
      {
        type: 'feature',
        "description": "Revert \"Implement short-scan mode for compiled 68k replayers (Phase 1)\""
      },
      {
        type: 'feature',
        "description": "Implement short-scan mode for compiled 68k replayers (Phase 1)"
      },
      {
        type: 'fix',
        "description": "Remove extra vertical padding from FT2 toolbar button row"
      },
      {
        type: 'fix',
        "description": "Infinite render loop in sidechain editors (useShallow for array selectors)"
      },
      {
        type: 'feature',
        "description": "Add jpn/jp/jpnd (JasonPage) to SKIP_SCAN and FORCE_CLASSIC"
      },
      {
        type: 'fix',
        "description": "Use string size prop for Knob in EQ editors"
      },
      {
        type: 'feature',
        "description": "Add sjs (SoundPlayer) to SKIP_SCAN and FORCE_CLASSIC lists"
      },
      {
        type: 'fix',
        "description": "Register companion files in UADESynth.setInstrument() before load"
      },
      {
        type: 'feature',
        "description": "Add missing controls to 7 effect editors found by audit"
      },
      {
        type: 'fix',
        "description": "Add sb/ps/sng to FORCE_CLASSIC lists for defense-in-depth"
      },
      {
        type: 'feature',
        "description": "Add sidechain source channel selector to SidechainCompressor editor"
      },
      {
        type: 'feature',
        "description": "Chore: add crashing formats to audit skip list to prevent cascade failures"
      },
      {
        type: 'fix',
        "description": "Inject UADESynth stub instrument for injectUADE parsers with 0 instruments"
      },
      {
        type: 'fix',
        "description": "Add sb/ps/sng to SKIP_SCAN lists to prevent browser crashes during scan"
      },
      {
        type: 'feature',
        "description": "Add waveform selectors, BPM sync, and mode controls to effect editors"
      },
      {
        type: 'fix',
        "description": "Fix audio measurement + audit resilience: all 132 effects pass audio"
      },
      {
        type: 'feature',
        "description": "Comprehensive two-file format companion detection"
      },
      {
        type: 'fix',
        "description": "Route SynthPack through withNativeThenUADE for companion file support"
      },
      {
        type: 'fix',
        "description": "Propagate UADE companion files through store for two-file format playback"
      },
      {
        type: 'fix',
        "description": "Fix connect-first pattern in all 67 WASM effects + update audit script"
      },
      {
        type: 'feature',
        "description": "Chore: update UADE audit skip list with newly passing formats"
      },
      {
        type: 'feature',
        "description": "Add 66 custom hardware-style editors for Zynthian WASM effects + audit tool"
      },
      {
        type: 'fix',
        "description": "Export fallback for libopenmptFileData + Quartet two-file companion support"
      },
      {
        type: 'fix',
        "description": "Add libopenmptFileData to ALL native parsers for OpenMPT-supported formats"
      },
      {
        type: 'feature',
        "description": "Add 72 Zynthian-ported effects to UI dropdown"
      },
      {
        type: 'fix',
        "description": "Fix silent SpaceyDelayer/RETapeEcho + JCReverb replacement"
      },
      {
        type: 'fix',
        "description": "UADE two-file formats, crash-prone scan skips, Quartet 4v ext"
      },
      {
        type: 'fix',
        "description": "Suppress WAM plugin SortableJS clone errors in global handler"
      },
      {
        type: 'fix',
        "description": "Fix batch effect bugs: TapeSimulator, WAM audio/UI, knob params, race condition"
      },
      {
        type: 'improvement',
        "description": "Update audit skip list: 8 more formats passing (41/66 total)"
      },
      {
        type: 'fix',
        "description": "Fix silent classic-mode UADE formats and scan crashes"
      },
      {
        type: 'feature',
        "description": "Chore: update audit skip list with 3 newly passing formats"
      },
      {
        type: 'fix',
        "description": "Reinit UADE WASM after failed load to prevent protocol state corruption"
      },
      {
        type: 'fix',
        "description": "Guard subscribeToCoordinator call + improve audit resilience"
      },
      {
        type: 'fix',
        "description": "SpaceEcho rate overflow, play-pattern position, silent effects"
      }
    ]
  },
  {
    version: '2026-04-07',
    date: '2026-04-07',
    changes: [
      {
        type: 'fix',
        "description": "Render Big Muff WAM GUI at 1:1 scale, centered"
      },
      {
        type: 'feature',
        "description": "Add pattern extraction and metadata for 14 UADE format parsers"
      },
      {
        type: 'feature',
        "description": "Smart warnings + channel-type validation + instrument badges"
      },
      {
        type: 'feature',
        "description": "Add full pattern extraction for Ben Daglish format"
      },
      {
        type: 'fix',
        "description": "Show channel names by default and auto-enable on hardware preset"
      },
      {
        type: 'feature',
        "description": "Add build-effects-wasm.sh convenience script for 70 WASM effects"
      },
      {
        type: 'improvement',
        "description": "Chore: update format-state.json with FX audit results"
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
