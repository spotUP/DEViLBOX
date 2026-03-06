/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-06T10:11:46.725Z
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
export const BUILD_VERSION = '1.0.2460';
export const BUILD_NUMBER = '2460';
export const BUILD_HASH = '4acd81224';
export const BUILD_DATE = '2026-03-06';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2460',
    date: '2026-03-06',
    changes: [
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
      },
      {
        type: 'fix',
        "description": "Use replayer row for rendering to eliminate note blinking"
      },
      {
        type: 'fix',
        "description": "Always smooth-scroll in VJ view regardless of preference"
      },
      {
        type: 'fix',
        "description": "Fix GT Ultra pattern editor showing REST bytes as notes"
      },
      {
        type: 'fix',
        "description": "Dampen 3D tilt during smooth scroll to prevent parallax"
      },
      {
        type: 'fix',
        "description": "Draw highlight bar at fixed position, scroll data underneath"
      },
      {
        type: 'fix',
        "description": "Replace broken scroll with replayer-based interpolation"
      },
      {
        type: 'fix',
        "description": "Fix GT Ultra WASM bridge: mismatched cwrap arg counts causing wrong data"
      },
      {
        type: 'fix',
        "description": "Remove await in sync createInstrument for Gearmulator case"
      },
      {
        type: 'improvement',
        "description": "Route C64 .sid files to GT Ultra view instead of classic editor"
      },
      {
        type: 'fix',
        "description": "Fix GT Ultra pattern data not displaying in both DOM and WebGL views"
      }
    ]
  },
  {
    version: '2026-03-05',
    date: '2026-03-05',
    changes: [
      {
        type: 'improvement',
        "description": "Polish WebGL GT Ultra: FT2 neutral palette, toolbar controls, pattern headers, order list enhancements, table annotations"
      },
      {
        type: 'feature',
        "description": "Phase 5 — Preview generation with LUFS normalization"
      },
      {
        type: 'feature',
        "description": "Effect taxonomy mappings and accessibility names (phases 8-9)"
      },
      {
        type: 'feature',
        "description": "Implement NKS2 SDK v2.0.2 compliance (phases 1-4, 6-7)"
      },
      {
        type: 'feature',
        "description": "Add interactive editing to GT Ultra DOM components"
      },
      {
        type: 'improvement',
        "description": "Polish GT Ultra DOM UI with FT2 theme and wire into TrackerView"
      },
      {
        type: 'improvement',
        "description": "Allow Hively songs to display in DOM pattern editor"
      },
      {
        type: 'feature',
        "description": "Add MIDI Controller and NKS setup wizards"
      },
      {
        type: 'improvement',
        "description": "Allow Furnace songs to display in DOM mode pattern editor"
      },
      {
        type: 'improvement',
        "description": "Route C64SIDEngine through synthBus for master FX + pitch control"
      },
      {
        type: 'fix',
        "description": "Handle unhandled promise rejections in USB write path"
      },
      {
        type: 'fix',
        "description": "Improve wizard connect flow with auto-pair and browser dialog guidance"
      },
      {
        type: 'feature',
        "description": "Setup wizard and hardware UX improvements"
      },
      {
        type: 'fix',
        "description": "SAM speech flags, add Link peer sync, wire Modland remix query"
      },
      {
        type: 'fix',
        "description": "Add view error boundaries and Yoga BindingError recovery"
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
