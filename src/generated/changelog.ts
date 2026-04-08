/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-07T22:16:13.783Z
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
export const BUILD_VERSION = '1.0.4562';
export const BUILD_NUMBER = '4562';
export const BUILD_HASH = '96384ff2c';
export const BUILD_DATE = '2026-04-07';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.4562',
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
      },
      {
        type: 'fix',
        "description": "Effect chain, MCP bridge, and visualizer improvements"
      },
      {
        type: 'fix',
        "description": "Narrow hardware preset select dropdown width"
      },
      {
        type: 'feature',
        "description": "FX audit — test all 100 effects + report to dashboard"
      },
      {
        type: 'feature',
        "description": "Auto-infer effect UI knobs + enclosure colors + gain compensation"
      },
      {
        type: 'feature',
        "description": "Register 67 WASM effects in registry and parameter engine"
      },
      {
        type: 'feature',
        "description": "Add 67 effect TypeScript AudioWorklet wrapper classes"
      },
      {
        type: 'feature',
        "description": "Add 67 compiled WASM binaries, JS glue, and worklet processors"
      },
      {
        type: 'feature',
        "description": "Add 67 WASM effect C++ DSP sources"
      },
      {
        type: 'feature',
        "description": "Chore: add wildcard *-wasm/build/ to gitignore"
      },
      {
        type: 'improvement',
        "description": "Phase 5: Binary pattern extraction for David Whittaker and Rob Hubbard"
      },
      {
        type: 'improvement',
        "description": "Improve pattern display for streaming UADE formats"
      },
      {
        type: 'feature',
        "description": "Extend UADE audit to 10-point verification"
      },
      {
        type: 'fix',
        "description": "Build missing SidMon1/Fred replayer WASMs, fix DigiBooster NoneSynth"
      },
      {
        type: 'fix',
        "description": "Add all WASM player-pool synths to native dedup sets"
      },
      {
        type: 'fix',
        "description": "Exclude native whole-song players from hybrid replacement"
      },
      {
        type: 'fix',
        "description": "Add TFMXSynth, FCSynth, C64SID to native player dedup"
      },
      {
        type: 'fix',
        "description": "Dedup native player creation in preloadInstruments"
      },
      {
        type: 'fix',
        "description": "JAM WASM crash + HVL/TFMX player pool exhaustion"
      },
      {
        type: 'fix',
        "description": "Sync Knob refs during render to eliminate race condition"
      },
      {
        type: 'fix',
        "description": "StructuredClone crash blocking all knob/param updates"
      },
      {
        type: 'feature',
        "description": "Add editors for all 27 missing master effects"
      },
      {
        type: 'fix',
        "description": "Add missing parameter handlers for 6 effects"
      },
      {
        type: 'feature',
        "description": "Channel insert effects editor modal"
      },
      {
        type: 'feature',
        "description": "Add channel insert effect parameter update pipeline"
      },
      {
        type: 'feature',
        "description": "Add dedicated Furnace dispatch routing for ES5506, MultiPCM, QSound, OPZ"
      },
      {
        type: 'fix',
        "description": "Param queuing for WASM effects, JamCracker retry, dialog keyboard hooks"
      },
      {
        type: 'fix',
        "description": "BiPhase knob wiring + TapeSimulator overflow"
      },
      {
        type: 'fix',
        "description": "Apply configRef pattern to 4 stale-state components"
      },
      {
        type: 'improvement',
        "description": "Test(smoke): strict pattern + audio checks; SID engineDriven flag"
      },
      {
        type: 'fix',
        "description": "Phase 5.3 — gate scheduler-skip on hasActiveDispatch"
      },
      {
        type: 'feature',
        "description": "Expose pcmData preview + loop points + finetune knob"
      },
      {
        type: 'feature',
        "description": "Expose wavePCM canvas + pcmData loop points + finetune/transpose"
      },
      {
        type: 'feature',
        "description": "DM1 sampleData preview + DM2 waveformPCM draw editor"
      },
      {
        type: 'feature',
        "description": "Expose waveformData canvas + pcmData preview + loop points"
      },
      {
        type: 'improvement',
        "description": "Phase 5.3 — WASM-backed formats skip TS scheduler"
      },
      {
        type: 'improvement',
        "description": "Phase 5.2 — automation player moves to coordinator"
      },
      {
        type: 'feature',
        "description": "Default to bar-quantize and key-lock-on for easy mixing"
      },
      {
        type: 'improvement',
        "description": "Phase 5.1 — VU meter triggering moves to coordinator"
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
