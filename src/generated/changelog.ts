/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-04T10:02:50.316Z
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
export const BUILD_VERSION = '1.0.2201';
export const BUILD_NUMBER = '2201';
export const BUILD_HASH = '42db5bc0';
export const BUILD_DATE = '2026-03-04';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2201',
    date: '2026-03-04',
    changes: [
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
      },
      {
        type: 'feature',
        "description": "Phase 4 GL dialogs — Export, TD3 Pattern, FileBrowser, SamplePack, DrumPad"
      },
      {
        type: 'improvement',
        "description": "Wire Phase 3 import dialogs into PixiRoot, remove from bridge"
      },
      {
        type: 'feature',
        "description": "Add Phase 3 GL import dialogs (4 modals)"
      },
      {
        type: 'improvement',
        "description": "Wire Phase 2 GL dialogs into PixiRoot, remove from bridge"
      },
      {
        type: 'feature',
        "description": "Add GL infrastructure and Phase 2 dialogs (6 modals + 3 utilities)"
      },
      {
        type: 'improvement',
        "description": "Unify FM chips under FurnaceDispatchSynth"
      },
      {
        type: 'fix',
        "description": "Add view selector to piano roll, fix sign-in button wrapping"
      },
      {
        type: 'fix',
        "description": "Correct clocking for PSG, NES, AY, SID, SNES, ESFM chips"
      },
      {
        type: 'improvement',
        "description": "Wire DrumpadEditorModal into PixiRoot, remove from bridge"
      },
      {
        type: 'feature',
        "description": "Add GL DrumpadEditorModal (4x4 pad grid, MIDI learn, instrument picker)"
      },
      {
        type: 'fix',
        "description": "Remove stray closing paren in WebGLModalBridge"
      },
      {
        type: 'improvement',
        "description": "Wire SIDInfoModal, ArrangementContextMenu, HelpModal into PixiRoot"
      },
      {
        type: 'feature',
        "description": "Add 3 GL dialogs (SIDInfoModal, ArrangementContextMenu, HelpModal)"
      },
      {
        type: 'fix',
        "description": "Correct FM chip clocking for accurate pitch"
      },
      {
        type: 'improvement',
        "description": "Wire SIDInfoModal + ArrangementContextMenu into PixiRoot, remove from bridge"
      },
      {
        type: 'feature',
        "description": "Add 2 GL dialogs (SIDInfoModal, ArrangementContextMenu)"
      },
      {
        type: 'fix',
        "description": "MAME synths sound never stops — stale note in triggerAttackRelease"
      },
      {
        type: 'improvement',
        "description": "Wire 3 GL dialogs into PixiRoot, remove from bridge"
      },
      {
        type: 'feature',
        "description": "Add 3 GL dialogs (Collaboration, RevisionBrowser, FurnacePresetBrowser)"
      },
      {
        type: 'fix',
        "description": "Visualizer modes not responding to music"
      },
      {
        type: 'improvement',
        "description": "Wire AdvancedEdit + TipOfTheDay into PixiRoot, remove from bridge"
      },
      {
        type: 'feature',
        "description": "Add GL-native AdvancedEditModal and TipOfTheDay dialogs"
      },
      {
        type: 'improvement',
        "description": "Wire 4 GL dialogs into PixiRoot, remove DOM versions from bridge"
      },
      {
        type: 'feature',
        "description": "Add 4 GL-native dialogs: ShortcutSheet, GrooveSettings, FindReplace, EffectPicker"
      },
      {
        type: 'improvement',
        "description": "Wire 5 GL dialogs into PixiRoot, remove DOM versions from bridge"
      },
      {
        type: 'feature',
        "description": "Add 5 GL-native dialogs: ClipRename, TrackRename, Download, SynthError, UndoHistory"
      },
      {
        type: 'improvement',
        "description": "Chore: update auto-generated changelog"
      },
      {
        type: 'feature',
        "description": "Add GL-native dialog components"
      },
      {
        type: 'fix',
        "description": "Ghost/transparent buttons invisible — alpha was applied to entire container"
      },
      {
        type: 'fix',
        "description": "Remove unused draw callbacks left from layoutContainer migration"
      },
      {
        type: 'feature',
        "description": "Wire 7 GL-native dialogs into PixiRoot, remove DOM versions"
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
