/**
 * Auto-generated changelog from git commits
 * Generated: 2026-07-03T19:47:09.110Z
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
export const BUILD_VERSION = '1.0.6487';
export const BUILD_NUMBER = '6487';
export const BUILD_HASH = 'c6eacee88';
export const BUILD_DATE = '2026-07-03';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.6487',
    date: '2026-07-02',
    changes: [
      {
        type: 'fix',
        "description": "Cinter voice monophonic — retrigger cuts previous note"
      },
      {
        type: 'improvement',
        "description": "Chore: commit Cinter WASM source + transpile provenance"
      },
      {
        type: 'fix',
        "description": "Commit complete Cinter feature to unbreak CI build"
      },
      {
        type: 'feature',
        "description": "Rip all Cinter songs' instruments into factory presets"
      },
      {
        type: 'feature',
        "description": "Cinter4 as a first-class synth voice"
      },
      {
        type: 'feature',
        "description": "Auto-harvest song synth voices into preset library"
      },
      {
        type: 'fix',
        "description": "Tracker worker watchdog false-alarm on slow startup"
      },
      {
        type: 'improvement',
        "description": "Cinter4 editability plan + UADE-only format inventory"
      },
      {
        type: 'improvement',
        "description": "Complete Cinter4 WASM player fixes handoff"
      }
    ]
  },
  {
    version: '2026-05-09',
    date: '2026-05-09',
    changes: [
      {
        type: 'feature',
        "description": "Add standalone Sammy Blammy pad preset (bank A samples only)"
      },
      {
        type: 'fix',
        "description": "MIDI pads now respect DEViLBOX bank selection"
      },
      {
        type: 'fix',
        "description": "Sammy Blammy bank B wrong offset + add load diagnostics"
      },
      {
        type: 'fix',
        "description": "Sammy Blammy bank B pads silent — fetch+decode samples on preset apply"
      },
      {
        type: 'feature',
        "description": "Wire Sammy Blammy samples as One-Shots Live bank B"
      },
      {
        type: 'feature',
        "description": "Add Sammy Blammy sample pack (17 DJ samples)"
      },
      {
        type: 'fix',
        "description": "MPK Mini mapping, CORS analysis cache, remote DB proxy"
      },
      {
        type: 'fix',
        "description": "Audio levels peaking red + playlist preview stop broken"
      },
      {
        type: 'fix',
        "description": "Fader range, DubBus insert race, deck 2 cached song data"
      },
      {
        type: 'fix',
        "description": "Auto DJ silence — scratch-buffer priming race with play()"
      },
      {
        type: 'improvement',
        "description": "DJ view regression fix session handoff"
      },
      {
        type: 'fix',
        "description": "Auto DJ transition sweep guard prevents premature completeTransition"
      },
      {
        type: 'fix',
        "description": "Crossfader animation, Auto DJ advancement, 200MB limit"
      },
      {
        type: 'fix',
        "description": "Crossfader animation + DJ echo prevention"
      },
      {
        type: 'fix',
        "description": "Pipeline cache hit returns 0-byte audio for stub entries"
      },
      {
        type: 'fix',
        "description": "TFMX/FRED analysis — download companions before render, route FRED locally"
      },
      {
        type: 'fix',
        "description": "Preview play await, smart sort on Auto DJ enable, remove duplicate case"
      },
      {
        type: 'fix',
        "description": "Auto DJ modal close-on-outside-click, snappier skip crossfade, analysis improvements"
      },
      {
        type: 'fix',
        "description": "IndexedDB getAll() OOM crash + analysis render limit + context menu analyze"
      },
      {
        type: 'fix',
        "description": "Wrap playlist rehydration in try-catch to prevent silent data loss"
      },
      {
        type: 'fix',
        "description": "Collapse action buttons width when not hovered to stop track name truncation"
      },
      {
        type: 'fix',
        "description": "Prevent Oh Snap crashes from Immer Draft proxy cloning"
      },
      {
        type: 'fix',
        "description": "Batch 3 — deck B pattern view, local file support, selector storms, FX release handlers"
      },
      {
        type: 'fix',
        "description": "Prevent Aw Snap OOM crashes in playlist panel and modal"
      },
      {
        type: 'fix',
        "description": "Reduce playlist panel re-render storms that crash Chrome"
      },
      {
        type: 'fix',
        "description": "Protect playlists from destructive migrations + cloud restore"
      },
      {
        type: 'fix',
        "description": "Always reset chips and clear stale samples between song loads"
      },
      {
        type: 'fix',
        "description": "Prevent Oh Snap crashes from playlist reorder and pipeline races"
      },
      {
        type: 'fix',
        "description": "Immediate crossfade on skip — no quantize delay"
      },
      {
        type: 'fix',
        "description": "Prevent preload race condition on second song load"
      },
      {
        type: 'fix',
        "description": "Fix multiple DJ view regressions"
      },
      {
        type: 'fix',
        "description": "Effect commands work for all WASM synths (DevilboxSynth)"
      }
    ]
  },
  {
    version: '2026-05-08',
    date: '2026-05-08',
    changes: [
      {
        type: 'feature',
        "description": "Bridge auto-start route and NKS browser updates"
      },
      {
        type: 'feature',
        "description": "Slot-aware MIDI routing and native GUI open"
      },
      {
        type: 'feature',
        "description": "Multi-slot TypeScript bridge protocol"
      },
      {
        type: 'feature',
        "description": "Add AUPlugin synthType and bridgeSlotId to instrument config"
      },
      {
        type: 'improvement',
        "description": "Multi-slot AU bridge — host multiple plugins simultaneously"
      }
    ]
  },
  {
    version: '2026-05-07',
    date: '2026-05-07',
    changes: [
      {
        type: 'improvement',
        "description": "Consolidate MIDI settings into dedicated tab"
      },
      {
        type: 'feature',
        "description": "Add VST tab to Add Instrument dialog"
      },
      {
        type: 'feature',
        "description": "AU plugin picker UI — browse and load any AU instrument"
      },
      {
        type: 'feature',
        "description": "Generalize AU bridge — enumerate and load any AU plugin"
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
