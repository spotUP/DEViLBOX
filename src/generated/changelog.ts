/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-20T10:26:18.832Z
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
export const BUILD_VERSION = '1.0.3113';
export const BUILD_NUMBER = '3113';
export const BUILD_HASH = '4afee6642';
export const BUILD_DATE = '2026-03-20';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.3113',
    date: '2026-03-20',
    changes: [
      {
        type: 'feature',
        "description": "XM export with volume envelopes for FC synth instruments"
      }
    ]
  },
  {
    version: '2026-03-19',
    date: '2026-03-19',
    changes: [
      {
        type: 'fix',
        "description": "MIDI notes trigger ROM words when ROM loaded"
      },
      {
        type: 'fix',
        "description": "Don't loop silence for one-shot instruments"
      },
      {
        type: 'fix',
        "description": "Auto-upgrade AHX to HVL when song has >4 channels"
      },
      {
        type: 'fix',
        "description": "Remove proprietary ROM files from git, add to gitignore"
      },
      {
        type: 'feature',
        "description": "Auto-load ROMs and add game word presets"
      },
      {
        type: 'fix',
        "description": "Yield to React render before async loading so progress bar shows"
      },
      {
        type: 'fix',
        "description": "Always show progress bar during loading, not just during init"
      },
      {
        type: 'fix',
        "description": "Preemptive reinit during import to eliminate playback delay"
      },
      {
        type: 'fix',
        "description": "Use actual vol macro byte processing instead of ADSR approximation"
      },
      {
        type: 'fix',
        "description": "Progress bar in both DOM and Pixi import dialogs with theme colors"
      },
      {
        type: 'fix',
        "description": "Use raw file data instead of chip RAM readback for MCP export"
      },
      {
        type: 'fix',
        "description": "Show init progress bar for all UADE formats including SunTronic"
      },
      {
        type: 'feature',
        "description": "Add ROM loading support for S14001A, VLM5030, HC55516"
      },
      {
        type: 'fix',
        "description": "Reconstruct song for hively/klystrack/jamcracker from stores"
      },
      {
        type: 'fix',
        "description": "Use chip RAM/raw file for classic formats, serializers only with full song"
      },
      {
        type: 'feature',
        "description": "Add init progress bar to import dialog"
      },
      {
        type: 'fix',
        "description": "Add jamcracker editorMode to format detection"
      },
      {
        type: 'fix',
        "description": "Fallback to raw file data when UADE engine isn't running"
      },
      {
        type: 'fix',
        "description": "Correct sample rate, phaseInc, BPM, and FC waveforms"
      },
      {
        type: 'improvement',
        "description": "Pre-compile WASM module for fast reinit (~50ms vs ~2.5s)"
      },
      {
        type: 'fix',
        "description": "Skip MOD export for UADE classic formats, use chip RAM readback"
      },
      {
        type: 'fix',
        "description": "Detect native format from uadeEditableFileName extension"
      },
      {
        type: 'improvement',
        "description": "Only reinit WASM after audio has been rendered, not after scans"
      },
      {
        type: 'fix',
        "description": "Always reinit WASM before every song load (not just on failure)"
      },
      {
        type: 'fix',
        "description": "Fix variable name errors in worklet reinit (wasmBuffer→wasmBinary, initWasm→_init)"
      },
      {
        type: 'fix',
        "description": "Reinit WASM module on second song load failure"
      },
      {
        type: 'fix',
        "description": "Save exported file server-side, not in browser"
      },
      {
        type: 'fix',
        "description": "Export_native reconstructs TrackerSong from stores when replayer is empty"
      },
      {
        type: 'fix',
        "description": "Full reinit of UADE state between song loads"
      },
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
