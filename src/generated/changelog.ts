/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-11T18:02:08.922Z
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
export const BUILD_VERSION = '1.0.4904';
export const BUILD_NUMBER = '4904';
export const BUILD_HASH = '86d56bdb9';
export const BUILD_DATE = '2026-04-11';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.4904',
    date: '2026-04-11',
    changes: [
      {
        type: 'fix',
        "description": "Status bar fixed-width numerals to prevent layout jumps"
      },
      {
        type: 'feature',
        "description": "F5 resize, Shift+F5 expand, F6 remove unused sequences"
      },
      {
        type: 'feature',
        "description": "Play markers, notation mode, SID toggle, expand/resize sequence"
      },
      {
        type: 'fix',
        "description": "VisualEffectEditorWrapper crash + Furnace frozen config mutation"
      },
      {
        type: 'fix',
        "description": "Reorder audit tests — stable engines first, UADE-heavy formats last"
      },
      {
        type: 'fix',
        "description": "SF2: fix transposition base 0xA0 in order matrix, GL view, and channel labels"
      },
      {
        type: 'improvement',
        "description": "SF2 deep audit: transposition, loop parsing, undo, validation, seq management"
      },
      {
        type: 'fix',
        "description": "MusicLine _ml_set_channel_on guard + chiptune3 registerProcessor guard"
      },
      {
        type: 'fix',
        "description": "Add Ctrl+Shift+Up/Down gate fill — toggle gate until next/prev event"
      },
      {
        type: 'fix',
        "description": "Validation, seq management, order display — closing remaining gaps"
      },
      {
        type: 'fix',
        "description": "1:1 parity with original SID Factory II editor"
      },
      {
        type: 'feature',
        "description": "--resume flag skips already-passed tests from previous run"
      },
      {
        type: 'fix',
        "description": "Three audit-revealed bugs — V2 routing, UADESynth cross-context crash, worklet registration"
      },
      {
        type: 'fix',
        "description": "Guard V2Synth worklet registerProcessor against double-registration"
      },
      {
        type: 'fix',
        "description": "Per-channel FX now works — two root causes found and fixed"
      },
      {
        type: 'fix',
        "description": "Remove guessed Modland paths, rely on local Reference Music collection"
      },
      {
        type: 'feature',
        "description": "Ultimate release-readiness test suite — 7 tiers, 300+ tests, all formats"
      },
      {
        type: 'fix',
        "description": "Master FX selectedChannels triggers per-channel WASM isolation routing"
      },
      {
        type: 'fix',
        "description": "Chore: remove dead code and clean up TODO/FIXME comments"
      },
      {
        type: 'feature',
        "description": "Unified audit — merge formats + furnace + effects into one script"
      },
      {
        type: 'fix',
        "description": "Display raw sequence data matching original editor 1:1"
      },
      {
        type: 'feature',
        "description": "Retry on browser interference + song identity check"
      },
      {
        type: 'feature',
        "description": "--push-results and --only flags for playback smoke test"
      },
      {
        type: 'fix',
        "description": "Playback smoke test — stop between tests, retry audio, better docs"
      },
      {
        type: 'feature',
        "description": "Expand playback smoke test to 163 local formats + fix local loader"
      },
      {
        type: 'feature',
        "description": "Make per-channel FX button always clickable with add-effect UI"
      },
      {
        type: 'fix',
        "description": "Don't create spurious libopenmpt XM for native-engine formats"
      },
      {
        type: 'improvement',
        "description": "Chore: remove noisy success log from SF2 callback monitor"
      },
      {
        type: 'improvement',
        "description": "Simplify per-channel FX to multi-output worklet (remove MessagePort isolation)"
      },
      {
        type: 'fix',
        "description": "Add missing label prop to PixiToggle in PixiSymphoniePanel"
      },
      {
        type: 'improvement',
        "description": "Chore: remove diagnostic logging from FormatPlaybackState"
      },
      {
        type: 'fix',
        "description": "Only use clock for smooth scrolling, use fps.row for stepped"
      },
      {
        type: 'fix',
        "description": "Debug: add logging to scheduleWasmEffectRebuild to trace per-channel FX path"
      },
      {
        type: 'feature',
        "description": "PixiRobHubbardPanel + PixiSteveTurnerPanel + PixiDavidWhittakerPanel with routing"
      },
      {
        type: 'fix',
        "description": "Use audio-clock-driven position like GT Ultra, not setInterval"
      },
      {
        type: 'fix',
        "description": "Belt-and-suspenders channel isolation using both mute AND volume"
      },
      {
        type: 'fix',
        "description": "Free-running clock for constant-rate pattern scrolling"
      },
      {
        type: 'fix',
        "description": "Remove blue border and black gap below playfield"
      },
      {
        type: 'fix',
        "description": "Constant-rate pattern scroll via predicted timestamps"
      },
      {
        type: 'fix',
        "description": "Remove black space below playfield — use grid aspect ratio"
      },
      {
        type: 'fix',
        "description": "MessagePort per-channel FX isolation (replace broken multi-output approach)"
      },
      {
        type: 'fix',
        "description": "Remove stale workletNode guard that could abort per-channel FX rebuild"
      },
      {
        type: 'feature',
        "description": "Synth sound effects + tighter input handling"
      },
      {
        type: 'fix',
        "description": "Replace broken after-process callback with reliable setInterval polling"
      },
      {
        type: 'improvement',
        "description": "SF2 position: use sequenceIndex in after-process callback, remove setInterval"
      },
      {
        type: 'feature',
        "description": "Preview buttons for HippelCoSo + SonicArranger instrument editors (DOM + Pixi)"
      },
      {
        type: 'fix',
        "description": "Robust per-channel FX isolation with multiple safeguards"
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
