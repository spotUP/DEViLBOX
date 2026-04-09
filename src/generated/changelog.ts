/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-09T09:27:41.553Z
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
export const BUILD_VERSION = '1.0.4619';
export const BUILD_NUMBER = '4619';
export const BUILD_HASH = '904714419';
export const BUILD_DATE = '2026-04-09';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.4619',
    date: '2026-04-09',
    changes: [
      {
        type: 'fix',
        "description": "Fix ghosted rate knobs + robust mute forwarding for WASM engines"
      },
      {
        type: 'improvement',
        "description": "Chore: update format tracker (revert stale retest entries)"
      }
    ]
  },
  {
    version: '2026-04-08',
    date: '2026-04-08',
    changes: [
      {
        type: 'improvement',
        "description": "Chore: update format audit state (packed formats + missing formats)"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog"
      },
      {
        type: 'fix',
        "description": "Fix visualizer overlapping play buttons on narrow windows"
      },
      {
        type: 'feature',
        "description": "Chore: add packed format audit script (38 PTK-Prowiz formats)"
      },
      {
        type: 'fix',
        "description": "Auto-detect and inflate gzip-compressed module files"
      },
      {
        type: 'fix',
        "description": "Recognize UADE-only extensions in isSupportedFormat"
      },
      {
        type: 'fix',
        "description": "Fix VisualBgCycler hidden behind channel headers"
      },
      {
        type: 'fix',
        "description": "Add PTK-Prowiz packed format prefixes to UADE routing"
      },
      {
        type: 'feature',
        "description": "Add GL EQ editors with sliders + frequency response curves"
      },
      {
        type: 'fix',
        "description": "Add oscilloscope visualizers to all remaining editors + fix export warning freeze"
      },
      {
        type: 'feature',
        "description": "Replace EQ knobs with sliders + add frequency response curve visualization"
      },
      {
        type: 'feature',
        "description": "Add BPM sync for 10 effects + DJ FX pad system with 20 performance effects"
      },
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
