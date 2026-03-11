/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-11T11:10:17.978Z
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
export const BUILD_VERSION = '1.0.2632';
export const BUILD_NUMBER = '2632';
export const BUILD_HASH = '50778111e';
export const BUILD_DATE = '2026-03-11';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2632',
    date: '2026-03-11',
    changes: [
      {
        type: 'feature',
        "description": "Add playback position cursor to PT2 and FT2 sample editors"
      },
      {
        type: 'fix',
        "description": "Fix getNativeAudioNode: recursively unwrap nested Tone.js wrappers"
      },
      {
        type: 'fix',
        "description": "Fix audio capture: tap masterEffectsInput instead of masterChannel"
      },
      {
        type: 'fix',
        "description": "Fix VU meters: empty channels no longer mirror active channel levels"
      },
      {
        type: 'fix',
        "description": "Fix TD-3 import: show dialog from all entry points, fix empty pattern"
      },
      {
        type: 'improvement',
        "description": "Remove unused TD-3 imports from TrackerView"
      },
      {
        type: 'improvement',
        "description": "Show TD-3 import dialog in all views (DJ, arrangement, etc.)"
      },
      {
        type: 'fix',
        "description": "Fix TD-3 import leaving old patterns + 303 panel bottom clipped"
      },
      {
        type: 'improvement',
        "description": "Skip empty TD-3 patterns on import"
      }
    ]
  },
  {
    version: '2026-03-10',
    date: '2026-03-10',
    changes: [
      {
        type: 'fix',
        "description": "Fix TD-3 import to load as new song by default"
      },
      {
        type: 'improvement',
        "description": "Sort Modland format dropdown alphabetically"
      },
      {
        type: 'fix',
        "description": "Fix tonearm not resetting on track loop"
      },
      {
        type: 'feature',
        "description": "Consolidate master FX: add individual effect browser + 25 new presets"
      },
      {
        type: 'fix',
        "description": "Tonearm starts on outer groove, ends near label"
      },
      {
        type: 'feature',
        "description": "Shared song analysis cache (server-side SQLite)"
      },
      {
        type: 'feature',
        "description": "Sync button auto-plays and guards crossfader"
      },
      {
        type: 'fix',
        "description": "Sync button now phase-aligns without jumping to start"
      },
      {
        type: 'feature',
        "description": "V2M file import as editable patterns with V2 synth support"
      },
      {
        type: 'feature',
        "description": "Click-outside-to-close and auto-close for Modland browser"
      },
      {
        type: 'fix',
        "description": "Sync button matches BPM only, no longer seeks/resets position"
      },
      {
        type: 'fix',
        "description": "Eliminate clicks in fader LFO and scratch pattern chops"
      },
      {
        type: 'feature',
        "description": "Add V2 Synthesizer worklet and instrument types"
      },
      {
        type: 'improvement',
        "description": "Add pattern editor optimization and loop stutter fix notes"
      },
      {
        type: 'improvement',
        "description": "Chore: engine, store, tracker, and miscellaneous updates"
      },
      {
        type: 'improvement',
        "description": "Pixi UI dialog and component updates"
      },
      {
        type: 'improvement',
        "description": "Dialog and modal UI improvements"
      },
      {
        type: 'feature',
        "description": "DJ engine improvements and component updates"
      },
      {
        type: 'feature',
        "description": "Add tracker analysis pipeline with genre detection"
      },
      {
        type: 'feature',
        "description": "Add V2 Synthesizer and V2M Player WASM modules"
      },
      {
        type: 'fix',
        "description": "Browser panels overlay + one-shot scratch buttons"
      },
      {
        type: 'feature',
        "description": "Add CSS Technics SL-1200 turntable with proper aspect ratio"
      },
      {
        type: 'fix',
        "description": "Fix bulk pattern edits not syncing to playback engines"
      }
    ]
  },
  {
    version: '2026-03-09',
    date: '2026-03-09',
    changes: [
      {
        type: 'improvement',
        "description": "Chore: update gitignore, gearmulator build, and changelog"
      },
      {
        type: 'feature',
        "description": "Chore: add Claude slash commands, update MCP config and CLAUDE.md"
      },
      {
        type: 'feature',
        "description": "AI chat panel, SC68 visualizer, VU meters, and UI improvements"
      },
      {
        type: 'fix',
        "description": "Symphonie Pro delta16 decoding and sample editor for native formats"
      },
      {
        type: 'feature',
        "description": "Engine improvements, new exporters, and format support updates"
      },
      {
        type: 'feature',
        "description": "Add AI chat, music analysis, and MCP bridge improvements"
      },
      {
        type: 'feature',
        "description": "Update WASM engine builds and add Furnace FileOps module"
      }
    ]
  },
  {
    version: '2026-03-08',
    date: '2026-03-08',
    changes: [
      {
        type: 'fix',
        "description": "Pre-upload all Furnace instruments before sequencer playback"
      },
      {
        type: 'feature',
        "description": "Add Ben Daglish, SidMon2, Symphonie Pro WASM engines and improvements"
      },
      {
        type: 'fix',
        "description": "Furnace INS2 instrument upload for all non-FM platforms"
      },
      {
        type: 'fix',
        "description": "Furnace C64 SID crash — HEAPU8 undefined after WASM memory growth"
      },
      {
        type: 'fix',
        "description": "Register missing C64SID, KlysSynth, Sc68Synth in SYNTH_INFO"
      },
      {
        type: 'fix',
        "description": "Cap Symphonie instruments at 128 to prevent duplicate React keys"
      },
      {
        type: 'fix',
        "description": "Symphonie Pro mix clipping and sample-to-instrument mapping"
      },
      {
        type: 'fix',
        "description": "Symphonie Pro broken audio — suppress notes and fix instrument types"
      },
      {
        type: 'fix',
        "description": "Symphonie Pro silent playback and missing instrument samples"
      },
      {
        type: 'fix',
        "description": "Reduce MCP bridge reconnect spam and fix Symphonie type errors"
      },
      {
        type: 'improvement',
        "description": "Chore: gitignore artofnoise/pumatracker build dirs and update changelog"
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
