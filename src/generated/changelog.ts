/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-04T19:56:51.640Z
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
export const BUILD_VERSION = '1.0.2255';
export const BUILD_NUMBER = '2255';
export const BUILD_HASH = 'da23acce';
export const BUILD_DATE = '2026-03-04';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2255',
    date: '2026-03-04',
    changes: [
      {
        type: 'feature',
        "description": "Isolate drumpad samples from project instrument slots"
      },
      {
        type: 'fix',
        "description": "Remove extra closing pixiContainer tag in PixiStatusBar"
      },
      {
        type: 'fix',
        "description": "Wire drumpad audio — pads now trigger sounds on click"
      },
      {
        type: 'feature',
        "description": "Unify view headers/footers, fix danger button, resize drumpad"
      },
      {
        type: 'fix',
        "description": "Use theme.text instead of nonexistent theme.textPrimary"
      },
      {
        type: 'feature',
        "description": "Add view selector dropdown to drumpad header bar"
      },
      {
        type: 'fix',
        "description": "SA instrument editor changes now reach running WASM synth"
      },
      {
        type: 'fix',
        "description": "Remove auto-preview from instrument editors"
      },
      {
        type: 'fix',
        "description": "SA instrument preview plays at C3 instead of C4"
      },
      {
        type: 'fix',
        "description": "PixiButton click not firing due to layout-shift pointerOut"
      },
      {
        type: 'feature',
        "description": "Add drag-handle camera controls to studio workbench"
      },
      {
        type: 'fix',
        "description": "Guard nullable activeError references in PixiSynthErrorDialog"
      },
      {
        type: 'fix',
        "description": "Studio navigation — Ableton-style Cmd+drag pan, Cmd+/-/0/1 zoom"
      },
      {
        type: 'fix',
        "description": "SA portamento arrival zeros speed (ref line 1523)"
      },
      {
        type: 'feature',
        "description": "Wire SA instrument editor to running WASM synth"
      },
      {
        type: 'fix',
        "description": "SA effect routing — send effects 1,2,4,7,8,A to WASM directly"
      },
      {
        type: 'fix',
        "description": "Wire 0xy effect arpeggio to WASM synth"
      },
      {
        type: 'fix',
        "description": "ADSR sustain/release, note-off, special notes"
      },
      {
        type: 'fix',
        "description": "Effect editor content scrolling — add flex-1 min-h-0 for knob accessibility"
      },
      {
        type: 'fix',
        "description": "FX modal improvements — oscilloscope overlays, preset ordering, DnD constraint"
      },
      {
        type: 'fix',
        "description": "Arpeggio silence on out-of-range, speedCounter tick, wire arpTable from replayer"
      },
      {
        type: 'fix',
        "description": "CXX (set volume) now applies before note trigger in MOD path"
      },
      {
        type: 'fix',
        "description": "Increase master FX panel preset dropdown height to 70vh"
      },
      {
        type: 'feature',
        "description": "Add Neural amp, WAM, Buzz, and Tumult FX presets"
      },
      {
        type: 'fix',
        "description": "SID engines bypass blob URL pipeline for direct data loading"
      },
      {
        type: 'fix',
        "description": "Restore correct SA note offset -36 (was incorrectly reverted to -24)"
      },
      {
        type: 'fix',
        "description": "Prevent AudioContext mismatch crash in TrackerReplayer.loadSong"
      },
      {
        type: 'fix',
        "description": "SID engines silence — add player.play(), share AudioContext, playcont() hack"
      },
      {
        type: 'fix',
        "description": "Handle AudioContext mismatch in SonicArrangerEngine singleton"
      },
      {
        type: 'fix',
        "description": "Correct SA note-to-XM offset from -24 to -36"
      },
      {
        type: 'fix',
        "description": "Remove unused _config field in ScriptNodePlayerEngine"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript errors in SID engine wrappers"
      },
      {
        type: 'fix',
        "description": "Rewrite SID engine wrappers to use ScriptNodePlayer API"
      },
      {
        type: 'feature',
        "description": "Revert \"Add pattern data reading to MusicLine/Sonic Arranger engine\""
      },
      {
        type: 'feature',
        "description": "Add pattern data reading to MusicLine/Sonic Arranger engine"
      },
      {
        type: 'fix',
        "description": "Rewrite JSSIDEngine to use jsSID native API"
      },
      {
        type: 'fix',
        "description": "Fix GT Ultra: pattern data, layout, and audio routing"
      },
      {
        type: 'fix',
        "description": "Always-mount import dialogs to fix SID modal not showing in GL mode"
      },
      {
        type: 'fix',
        "description": "Fix GT engine double-init in React StrictMode consuming pendingSongData"
      },
      {
        type: 'fix',
        "description": "Fix GTUltra engine init crash: detached ArrayBuffer on re-init"
      },
      {
        type: 'fix',
        "description": "Fix GT Ultra pattern data not loading after song load"
      },
      {
        type: 'fix',
        "description": "Welcome modal 'Start Jamming' button clipped by overflow"
      },
      {
        type: 'fix',
        "description": "Fix GT song drop causing black pattern editor"
      },
      {
        type: 'improvement',
        "description": "Unify file import paths through UnifiedFileLoader"
      },
      {
        type: 'fix',
        "description": "GTUltra view Yoga BindingError fixes and diagnostic logging"
      },
      {
        type: 'fix',
        "description": "Resolve all 62 TypeScript errors across Pixi UI and engine"
      },
      {
        type: 'fix',
        "description": "Fix PixiButton click not firing due to stale pressed state in closure"
      },
      {
        type: 'improvement',
        "description": "Add no-emoji rule to project memory — always use FontAudio flat icons"
      },
      {
        type: 'improvement',
        "description": "Replace all emojis with FontAudio flat icons in Pixi UI"
      },
      {
        type: 'improvement',
        "description": "Guard all Yoga WASM node operations against BindingErrors"
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
