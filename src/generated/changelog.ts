/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-06T15:45:56.157Z
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
export const BUILD_VERSION = '1.0.2485';
export const BUILD_NUMBER = '2485';
export const BUILD_HASH = '333ca8908';
export const BUILD_DATE = '2026-03-06';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2485',
    date: '2026-03-06',
    changes: [
      {
        type: 'improvement',
        "description": "Remove unused GTPatternEditor export"
      },
      {
        type: 'improvement',
        "description": "Replace GTPatternEditor with FormatPatternEditor in GTUltraView"
      },
      {
        type: 'improvement',
        "description": "JamCrackerView to use FormatPatternEditor"
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
      },
      {
        type: 'feature',
        "description": "Add pattern editing for JamCracker and MusicLine formats"
      },
      {
        type: 'feature',
        "description": "Add Virus C Trancy hardware skin assets"
      },
      {
        type: 'improvement',
        "description": "Chore: gitignore build artifacts, remove tracked build dirs, update changelog"
      },
      {
        type: 'feature',
        "description": "Gearmulator hardware skin UI integration"
      },
      {
        type: 'feature',
        "description": "Add MusicLine effect display and Pixi export button"
      },
      {
        type: 'fix',
        "description": "Resolve 11 TypeScript strict-mode errors in gearmulator components"
      },
      {
        type: 'improvement',
        "description": "Remove dead ProTrackerPlayer.ts (1092 lines)"
      },
      {
        type: 'feature',
        "description": "Add JamCracker and FuturePlayer binary exporters"
      },
      {
        type: 'improvement',
        "description": "Support all 5 MusicLine effect columns in parser, exporter, and renderers"
      },
      {
        type: 'feature',
        "description": "Add Hively pattern editing with note input and hex entry"
      },
      {
        type: 'feature',
        "description": "Add MusicLine .ml export button to DOM tracker view"
      },
      {
        type: 'fix',
        "description": "Resolve all 30 TypeScript strict-mode errors"
      },
      {
        type: 'fix',
        "description": "Fix JamCrackerView: correct transport store field and Uint8Array blob type"
      },
      {
        type: 'improvement',
        "description": "Extract editor state from useTrackerStore into useEditorStore"
      },
      {
        type: 'feature',
        "description": "Implement full .kt file serialization with bitpacking"
      },
      {
        type: 'feature',
        "description": "Add JamCracker save/export functionality"
      },
      {
        type: 'feature',
        "description": "Klystrack: add full editing stack (pattern input, instrument editor, WASM setters)"
      },
      {
        type: 'feature',
        "description": "Add JamCracker pattern viewer and wire editorMode routing"
      },
      {
        type: 'feature',
        "description": "Add pattern editing bridge to MusicLine and JamCracker WASM engines"
      },
      {
        type: 'feature',
        "description": "IT/S3M export via OpenMPT WASM, proper effect mapping"
      },
      {
        type: 'fix',
        "description": "OpenMPT effect mapping, sample extraction, type identification"
      },
      {
        type: 'improvement',
        "description": "Klystrack: wire up full integration pipeline"
      },
      {
        type: 'feature',
        "description": "OpenMPT soundlib WASM, Gearmulator port, new synth presets"
      },
      {
        type: 'feature',
        "description": "Add klystrack (.kt/.ki) format support via Emscripten WASM"
      },
      {
        type: 'improvement',
        "description": "Revert PT2 WASM integration hooks — modplug will handle MOD/XM playback"
      },
      {
        type: 'feature',
        "description": "Add PT2 WASM replayer for authentic ProTracker MOD playback"
      },
      {
        type: 'feature',
        "description": "Add DOM Studio view with resizable tracker/instrument/mixer panels"
      },
      {
        type: 'feature',
        "description": "Add DOM Hively/AHX pattern editor and wire into TrackerView"
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
