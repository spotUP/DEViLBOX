/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-05T20:50:38.645Z
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
export const BUILD_VERSION = '1.0.2409';
export const BUILD_NUMBER = '2409';
export const BUILD_HASH = 'e82ec102';
export const BUILD_DATE = '2026-03-05';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2409',
    date: '2026-03-05',
    changes: [
      {
        type: 'feature',
        "description": "Add SC tracker integration: knob panels, channel badges"
      },
      {
        type: 'feature',
        "description": "Live Furnace register writes from instrument editor"
      },
      {
        type: 'improvement',
        "description": "Split SC editor into Script/Controls tabs for DOM and Pixi UIs"
      },
      {
        type: 'improvement',
        "description": "Chore: uncommitted editor and loader improvements"
      },
      {
        type: 'feature',
        "description": "Complete USB-SID-Pico integration"
      },
      {
        type: 'feature',
        "description": "Add SC preset search, two-way GUI sync, routine pattern generation, and preset caching"
      },
      {
        type: 'feature',
        "description": "SoundMon waveform gen, MDX/PMD advanced effects, GT keyboard nav, SC preset search"
      },
      {
        type: 'feature',
        "description": "Add 109 community SC SynthDef presets with browser UI"
      },
      {
        type: 'feature',
        "description": "FC synth/arp chip RAM writes + exporter effect mapping"
      },
      {
        type: 'feature',
        "description": "Add dedicated JamCracker and Future Player instrument panels"
      },
      {
        type: 'feature',
        "description": "Add 'Save as Instrument' button to SuperCollider editor"
      },
      {
        type: 'feature',
        "description": "Implement ADSR chip RAM writes for FC and SoundMon controls"
      },
      {
        type: 'feature',
        "description": "Add Buzz machine params, JamCracker test data, SC Routine pattern extraction"
      },
      {
        type: 'improvement',
        "description": "Update ASID_HARDWARE_SUPPORT.md with WebUSB documentation"
      },
      {
        type: 'feature',
        "description": "Add WebUSB USB-SID-Pico support with unified hardware manager"
      },
      {
        type: 'feature',
        "description": "Implement chip RAM writes for SidMon1 waveforms + expand synth set() params"
      },
      {
        type: 'fix',
        "description": "Remove 15 unused variables causing TS6133 errors"
      },
      {
        type: 'fix',
        "description": "Unused variable warnings in HES/PMD/SPC parsers"
      },
      {
        type: 'fix',
        "description": "Unused variable warnings in AdPlugParser"
      },
      {
        type: 'improvement',
        "description": "Cleanup: remove dead WASM scaffold, worklets, and engine classes"
      },
      {
        type: 'feature',
        "description": "Add referenceEngine field to FormatRegistry + export barrel updates"
      },
      {
        type: 'feature',
        "description": "Add 9 new retro music format parsers, exporters, engines & WASM infrastructure"
      },
      {
        type: 'fix',
        "description": "Remove double routing for native WASM synths, add native instrument panel"
      },
      {
        type: 'fix',
        "description": "Correct MIDI-to-native note conversion for FP and JC"
      },
      {
        type: 'feature',
        "description": "Add FuturePlayerSynth and JamCrackerSynth to synth registry"
      },
      {
        type: 'fix',
        "description": "Fix SC GUI labels showing raw code instead of label text"
      },
      {
        type: 'fix',
        "description": "Update instrumentPtr on every cache hit, not just first creation"
      },
      {
        type: 'fix',
        "description": "Fix silent instrument preview and editor routing"
      },
      {
        type: 'fix',
        "description": "Fix keyboard shortcuts in CodeMirror editors (paste, copy, undo, etc.)"
      },
      {
        type: 'fix',
        "description": "Fix SC compile timeout: skip comments in paren tracker"
      },
      {
        type: 'fix',
        "description": "Fix SC compile: strip .send(s) chain, add logging, increase timeout"
      },
      {
        type: 'feature',
        "description": "Add per-note instrument preview and extract instrument metadata"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog"
      },
      {
        type: 'feature',
        "description": "Integrate FuturePlayer WASM engine into playback pipeline"
      },
      {
        type: 'fix',
        "description": "Fix crash in EditInstrumentModal for unknown synth types"
      },
      {
        type: 'feature',
        "description": "Add SC GUI parser and renderer for SuperCollider editor"
      },
      {
        type: 'improvement',
        "description": "Default to DOM UI, disable GL UI on mobile phones"
      },
      {
        type: 'feature',
        "description": "Full Future Player binary parser with real note/instrument extraction"
      },
      {
        type: 'fix',
        "description": "Fix view switcher, console warnings, and TypeScript errors"
      },
      {
        type: 'fix',
        "description": "Clean up SuperCollider debug diagnostics"
      },
      {
        type: 'feature',
        "description": "Add restructure pass with for/do-while/if-else detection"
      },
      {
        type: 'feature',
        "description": "Add VU meter triggers for native engine formats (SID, HVL, MusicLine)"
      },
      {
        type: 'fix',
        "description": "Chore: add SuperCollider audio driver debug logging"
      },
      {
        type: 'feature',
        "description": "Add Future Player 68k replayer transpiled to C/WASM"
      },
      {
        type: 'fix',
        "description": "Fix silent playback bug: play() race condition and stale state"
      },
      {
        type: 'fix',
        "description": "Fix SuperCollider volume normalization and audio routing"
      },
      {
        type: 'fix',
        "description": "Fix Buzz percussion trigger in test runner"
      },
      {
        type: 'fix',
        "description": "Move transpile/debug skill to proper .github/skills/ format"
      },
      {
        type: 'improvement',
        "description": "Rename skill to 'Transpile and Debug 68k Replayer Waveform Mismatch'"
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
