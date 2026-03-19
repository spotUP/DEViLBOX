/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-19T09:13:22.015Z
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
export const BUILD_VERSION = '1.0.3083';
export const BUILD_NUMBER = '3083';
export const BUILD_HASH = 'f1c823e7e';
export const BUILD_DATE = '2026-03-19';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.3083',
    date: '2026-03-19',
    changes: [
      {
        type: 'feature',
        "description": "Add export_native tool for native format export via MCP"
      },
      {
        type: 'fix',
        "description": "Init uninitialized bools in POKEY and C140 constructors"
      },
      {
        type: 'fix',
        "description": "Skip UADE pre-scan for .sun/.tsm files entirely"
      },
      {
        type: 'fix',
        "description": "Use original filename for UADE auto-detection instead of tsm. prefix"
      },
      {
        type: 'fix',
        "description": "Use tsm. prefix for UADE pre-scan in import dialog"
      },
      {
        type: 'fix',
        "description": "Skip enhanced UADE scan for TSM format"
      },
      {
        type: 'fix',
        "description": "Use tsm. prefix (not sun.) for UADE eagleplayer lookup"
      },
      {
        type: 'fix',
        "description": "Use UADE classic streaming for TSM playback"
      },
      {
        type: 'feature',
        "description": "Add 8 more native format exporters and wire routing"
      },
      {
        type: 'fix',
        "description": "Route .sun/.tsm files through UADE with tsm. prefix conversion"
      },
      {
        type: 'feature',
        "description": "Add tick-by-tick synth pre-rendering for Amiga formats"
      },
      {
        type: 'fix',
        "description": "Add suntronic to FormatEnginePreferences"
      },
      {
        type: 'feature',
        "description": "Add new MAME chip sources, encoders, and export infrastructure"
      },
      {
        type: 'feature',
        "description": "New MAME chips, InStereo2 synth, format exporters, and misc fixes"
      },
      {
        type: 'feature',
        "description": "Add SunTronic/TSM support (.sun/.tsm via UADE)"
      },
      {
        type: 'fix',
        "description": "Init uninitialized bools in Arcade/FDS/Genesis constructors"
      },
      {
        type: 'fix',
        "description": "Fix Furnace WASM crash recovery: prevent cascading chip failures"
      },
      {
        type: 'fix',
        "description": "Kill process groups and orphaned tsx watchers on dev.sh restart"
      },
      {
        type: 'improvement',
        "description": "Export audit: all 45 formats pass, WAV comparison results updated"
      },
      {
        type: 'fix',
        "description": "Convert 8-bit and 12-bit samples to 16-bit before encoding"
      },
      {
        type: 'fix',
        "description": "Auto-reinitialize WASM after memory crash"
      },
      {
        type: 'fix',
        "description": "Catch WASM render crashes to prevent tab freeze cascade"
      }
    ]
  },
  {
    version: '2026-03-18',
    date: '2026-03-18',
    changes: [
      {
        type: 'fix',
        "description": "Prevent WASM memory crash when loading a second .sunvox file"
      },
      {
        type: 'fix',
        "description": "Fix MOD exporter: merge secondary effects (effTyp2) like XM exporter"
      },
      {
        type: 'fix',
        "description": "Fix ULT timing: speed=4 default, clamp speed 32-47 for XM compat"
      },
      {
        type: 'fix',
        "description": "Prevent browser freeze on complex .sunvox files"
      },
      {
        type: 'fix',
        "description": "Fix XM exporter: merge secondary effects, prefer global commands"
      },
      {
        type: 'feature',
        "description": "Per-note triggering, real-time params, save, type detection"
      },
      {
        type: 'fix',
        "description": "Fix ULT sample data: use fileSize - totalSampleBytes for PCM offset"
      },
      {
        type: 'feature',
        "description": "Create one instrument per generator module with per-instrument sub-graphs"
      },
      {
        type: 'fix',
        "description": "Sample sync to all chips + MuLaw/C219 format converters"
      },
      {
        type: 'fix',
        "description": "Set currentInstrumentId after .sunvox load so editor opens immediately"
      },
      {
        type: 'fix',
        "description": "Stop render loop in SunVoxModularEditor"
      },
      {
        type: 'improvement',
        "description": "Revert ULT sample offset change (sequential reading was correct)"
      },
      {
        type: 'fix',
        "description": "Fix duplicate input port on Output module causing React key errors"
      },
      {
        type: 'improvement',
        "description": "Add format status tracker section to CLAUDE.md"
      },
      {
        type: 'fix',
        "description": "Fix effect mapping for 669, STM, ULT per OpenMPT reference"
      },
      {
        type: 'improvement',
        "description": "Update format status tracker guide with live SSE API and key conventions"
      },
      {
        type: 'fix',
        "description": "Live SSE updates + dynamic audit entries from server"
      },
      {
        type: 'fix',
        "description": "SSE event name mismatch for bulk updates"
      },
      {
        type: 'fix',
        "description": "Restore lowered silence threshold (0.00005) for quiet instruments"
      },
      {
        type: 'feature',
        "description": "Show SunVox module controls as inline sliders"
      },
      {
        type: 'fix',
        "description": "Fix TCB speed injection and sample loop detection"
      },
      {
        type: 'fix',
        "description": "Fix sample volumes, restore parser fixes, improve WAV correlation"
      },
      {
        type: 'fix',
        "description": "Recalculate port positions on camera pan/zoom so cables follow modules"
      },
      {
        type: 'fix',
        "description": "Fix MOD/XM volume export and empty sample loopLen"
      },
      {
        type: 'fix',
        "description": "Route SunVoxModular to modular editor in both DOM and Pixi UIs"
      },
      {
        type: 'fix',
        "description": "Restore lost parser fixes from session knowledge"
      },
      {
        type: 'fix',
        "description": "Complete synth test suite + NES/PCE/Amiga/SNES/TIA audio fixes"
      },
      {
        type: 'feature',
        "description": "Add GDM, PSM, Music-Line test songs and exports"
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
