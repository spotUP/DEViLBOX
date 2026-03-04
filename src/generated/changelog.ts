/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-04T15:22:32.357Z
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
export const BUILD_VERSION = '1.0.2232';
export const BUILD_NUMBER = '2232';
export const BUILD_HASH = 'a521a7b8';
export const BUILD_DATE = '2026-03-04';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2232',
    date: '2026-03-04',
    changes: [
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
      },
      {
        type: 'fix',
        "description": "Always-mount tab contents in TipOfTheDay to prevent Yoga BindingError"
      },
      {
        type: 'improvement',
        "description": "Increase Pixi UI font sizes for readability"
      },
      {
        type: 'fix',
        "description": "Guard PixiModal against uninitialized renderer"
      },
      {
        type: 'fix',
        "description": "Fix ReferenceError: cellContextMenu → openCellContextMenu in PixiPatternEditor"
      },
      {
        type: 'fix',
        "description": "Pixel-perfect GL dialog parity: fix 38 dialogs + create 6 new GL dialogs"
      },
      {
        type: 'fix',
        "description": "Gate auto-save and revisions on explicit user save"
      },
      {
        type: 'feature',
        "description": "Add PRG/SID export for GoatTracker Ultra"
      },
      {
        type: 'improvement',
        "description": "Pixel-perfect GL modal foundation + TipOfTheDay rewrite"
      },
      {
        type: 'fix',
        "description": "Runtime errors — guard PixiModal app.screen, fix invalid 8-digit hex colors"
      },
      {
        type: 'feature',
        "description": "Convert VJ view to hidden canvas + Pixi texture"
      },
      {
        type: 'feature',
        "description": "Convert DJ view to fully GL-native — panels, browsers, beat grid"
      },
      {
        type: 'improvement',
        "description": "Convert context menus, color picker, channel headers to GL"
      },
      {
        type: 'improvement',
        "description": "Convert knob tooltip and text input to GL-native"
      },
      {
        type: 'feature',
        "description": "Convert PixiPatternEditor DOM overlays to GL"
      },
      {
        type: 'improvement',
        "description": "Convert TrackerVisualBackground from PixiDOMOverlay to pure GL (Pixi.js)"
      },
      {
        type: 'fix',
        "description": "Fix C64 SID silence from missing c64 instrument block"
      },
      {
        type: 'fix',
        "description": "Fix Lynx silence and sample chip silence"
      },
      {
        type: 'improvement',
        "description": "Convert drag-and-drop overlay from PixiDOMOverlay to pure GL"
      },
      {
        type: 'improvement',
        "description": "Convert PixiContextMenu from DOM portal to pure GL (Pixi.js)"
      },
      {
        type: 'improvement',
        "description": "Wire Phase 5 GL dialogs, eliminate all DOM modals from bridge"
      },
      {
        type: 'feature',
        "description": "Phase 5 GL dialogs — Settings, EditInstrument, MasterFx, InstrumentFx, EffectParamEditor"
      },
      {
        type: 'fix',
        "description": "Add default instruments for FM/OPLL/VERA chips, fix SNES clipping"
      },
      {
        type: 'improvement',
        "description": "Wire Phase 4 GL dialogs, strip bridge to 4 DOM modals"
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
