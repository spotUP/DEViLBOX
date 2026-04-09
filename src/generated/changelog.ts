/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-09T22:10:33.797Z
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
export const BUILD_VERSION = '1.0.4735';
export const BUILD_NUMBER = '4735';
export const BUILD_HASH = 'bddc389c5';
export const BUILD_DATE = '2026-04-09';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.4735',
    date: '2026-04-10',
    changes: [
      {
        type: 'fix',
        "description": "Instrument list context menu + double-click + scope channel colors"
      },
      {
        type: 'fix',
        "description": "Align track scopes strip with pattern editor channels"
      }
    ]
  },
  {
    version: '2026-04-09',
    date: '2026-04-09',
    changes: [
      {
        type: 'fix',
        "description": "Stop all audio immediately when loading new AdLib song"
      },
      {
        type: 'fix',
        "description": "Flanger/doubling on WASM-backed formats + worklet memory leak"
      },
      {
        type: 'feature',
        "description": "Stop AdPlug streaming player when loading new song"
      },
      {
        type: 'fix',
        "description": "Fix AdLib capture: note-offs, volume, instrument fingerprinting"
      },
      {
        type: 'fix',
        "description": "Fix AdLib capture visual tempo — use speed to target ~10 rows/sec"
      },
      {
        type: 'fix',
        "description": "Fix clear not resetting song name + show dialog on load failure"
      },
      {
        type: 'fix',
        "description": "Enable mute/solo for MOD/XM/IT/S3M (libopenmpt ext API)"
      },
      {
        type: 'fix',
        "description": "Wire companion files through drag-drop for AdLib SNG/SCI formats"
      },
      {
        type: 'fix',
        "description": "Add missing AdLib extension aliases (edl, dtl, as3m, adlib, wlf)"
      },
      {
        type: 'improvement',
        "description": "Centralize UADE scan lists into shared module (Phase 1)"
      },
      {
        type: 'feature',
        "description": "Add RAW exporter and integrate AdLib export (RAD/IMF/RAW)"
      },
      {
        type: 'fix',
        "description": "OPL3 allNotesOff now forces instant silence"
      },
      {
        type: 'fix',
        "description": "OPL3 per-voice patches — multi-instrument songs no longer corrupt"
      },
      {
        type: 'feature',
        "description": "Add right-click context menu to Pixi instrument panel"
      },
      {
        type: 'fix',
        "description": "AdLib BPM/speed computation and DMO instrument extraction"
      },
      {
        type: 'improvement',
        "description": "VU fill meters use theme accent color instead of hardcoded green"
      },
      {
        type: 'improvement',
        "description": "Hold-to-preview instruments: click selects, hold plays until release"
      },
      {
        type: 'fix',
        "description": "All 36 AdLib formats now editable (ADL subsong iter, SCI/SNG companions)"
      },
      {
        type: 'fix',
        "description": "Fix 43 double-fire bugs across all Pixi components"
      },
      {
        type: 'feature',
        "description": "OPL register capture — 33/36 AdLib formats now editable"
      },
      {
        type: 'fix',
        "description": "Fix ProTracker mod mute + solo gain cache bug"
      },
      {
        type: 'fix',
        "description": "Fix AddChannelBtn double-fire, remove diagnostic logs"
      },
      {
        type: 'fix',
        "description": "Fix double-fire: HoverableHeaderBtn called onPress twice per click"
      },
      {
        type: 'feature',
        "description": "Add diagnostic logging to mute forwarding chain"
      },
      {
        type: 'feature',
        "description": "Multi-player AdLib WASM extraction — 15 formats now editable"
      },
      {
        type: 'improvement',
        "description": "Replace ALL require() with cached dynamic imports in useMixerStore"
      },
      {
        type: 'fix',
        "description": "Fix require() → ESM import for mute/solo in browser"
      },
      {
        type: 'fix',
        "description": "OPL3Synth singleton — share one WASM instance across all AdLib instruments"
      },
      {
        type: 'fix',
        "description": "Fix nested setState: move resetMuteState outside immer set()"
      },
      {
        type: 'fix',
        "description": "Add sanity checks to prevent WASM crashes on HSP/MTK formats"
      },
      {
        type: 'feature',
        "description": "Add master bus limiter + enable auto-gain by default"
      },
      {
        type: 'improvement',
        "description": "Bulletproof engine mute forwarding: cached refs + error logging"
      },
      {
        type: 'improvement',
        "description": "Unify mute/solo: single source of truth in useMixerStore"
      },
      {
        type: 'feature',
        "description": "Add IMF (id Music Format) exporter for OPL songs"
      },
      {
        type: 'fix',
        "description": "Update RAD exporter to support OPL3Synth instruments"
      },
      {
        type: 'feature',
        "description": "Add WASM pattern/instrument extraction for AdPlug CmodPlayer formats"
      },
      {
        type: 'improvement',
        "description": "Consolidate bottom bars: move paste mode/mask to PatternBottomBar"
      },
      {
        type: 'feature',
        "description": "Make AdLib/OPL formats editable with OPL3Synth"
      },
      {
        type: 'feature',
        "description": "Add GUI layout presets (1-4 slots)"
      },
      {
        type: 'feature',
        "description": "Add Renoise-style bottom control bar for pattern editor"
      },
      {
        type: 'feature',
        "description": "Add channel color blend slider in settings"
      },
      {
        type: 'feature',
        "description": "Add shift-click multi-select to pattern order sidebar"
      },
      {
        type: 'fix',
        "description": "Return streaming player metadata for AdPlug/V2M load_file"
      },
      {
        type: 'feature',
        "description": "Add Renoise-style track scopes strip"
      },
      {
        type: 'improvement',
        "description": "Chore: update format-state with verified AdPlug WASM results"
      },
      {
        type: 'fix',
        "description": "Route AdPlug and V2M audio through ToneEngine master mixer"
      },
      {
        type: 'feature',
        "description": "Make pattern order sidebar fully interactive"
      },
      {
        type: 'improvement',
        "description": "Chore: update format-state.json with AdPlug audit entries"
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
