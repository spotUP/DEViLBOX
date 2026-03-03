/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-03T19:17:51.936Z
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
export const BUILD_VERSION = '1.0.2079';
export const BUILD_NUMBER = '2079';
export const BUILD_HASH = '49d02ae9';
export const BUILD_DATE = '2026-03-03';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2079',
    date: '2026-03-03',
    changes: [
      {
        type: 'feature',
        "description": "Add SID info button + subsong selector to tracker toolbar"
      },
      {
        type: 'feature',
        "description": "Replace DJ DOM overlays with native GL components"
      },
      {
        type: 'feature',
        "description": "Native GL horizontal scrollbar in pattern editor"
      },
      {
        type: 'improvement',
        "description": "Remove: delete PatternManagement component and panel"
      },
      {
        type: 'fix',
        "description": "Remove duplicate Groove button from FT2 toolbar panel"
      },
      {
        type: 'fix',
        "description": "Fix groove indicator showing active when set to straight/0%"
      },
      {
        type: 'fix',
        "description": "Add missing node-cache dependency to server"
      },
      {
        type: 'fix',
        "description": "Fix JamCracker drag-drop crash: add JamCrackerSynth to ToneEngine switch"
      },
      {
        type: 'fix',
        "description": "GoatTracker .sng files bypass UADE import dialog"
      },
      {
        type: 'fix',
        "description": "Add GoatTracker .sng to FormatRegistry for drag-drop support"
      },
      {
        type: 'fix',
        "description": "SID files use classic view, fix GTUltra yoga BindingError"
      },
      {
        type: 'fix',
        "description": "Switch to GoatTracker view when loading SID files"
      },
      {
        type: 'fix',
        "description": "Auto-initialize ASID device manager for USB-SID-Pico hot-plug"
      },
      {
        type: 'feature',
        "description": "DeepSID composer database integration"
      },
      {
        type: 'fix',
        "description": "Suppress Furnace note triggers during C64SID playback"
      },
      {
        type: 'improvement',
        "description": "Update AmigaFormatParsers JSDoc for dispatcher architecture"
      },
      {
        type: 'feature',
        "description": "SID info button in toolbar — modal shows full metadata on demand"
      },
      {
        type: 'feature',
        "description": "SID metadata UI — info panel, subsong selector, status bar integration"
      },
      {
        type: 'fix',
        "description": "Restore missing isSupportedModule import in UnifiedFileLoader"
      },
      {
        type: 'fix',
        "description": "Restore updateBpmSyncedEffects method removed during modularization"
      },
      {
        type: 'improvement',
        "description": "Delegate ToneEngine methods to 8 extracted modules"
      },
      {
        type: 'feature',
        "description": "Add withFallback helper, convert 83 format blocks to use DRY pattern"
      },
      {
        type: 'improvement',
        "description": "Clean up TrackerView, FileBrowser, and EditorControlsBar after modularization"
      },
      {
        type: 'fix',
        "description": "Missing imports in factoryPresets/drum.ts and EffectFactory.ts"
      },
      {
        type: 'improvement',
        "description": "Split stores and input hooks into focused helper modules (Tier 4)"
      },
      {
        type: 'improvement',
        "description": "Split TrackerReplayer.ts into focused modules (Tier 4)"
      },
      {
        type: 'improvement',
        "description": "Split FurnaceSongParser.ts into focused parser modules (Tier 4)"
      },
      {
        type: 'improvement',
        "description": "Split parseModuleToSong.ts into focused parser modules (Tier 4)"
      },
      {
        type: 'improvement',
        "description": "Split InstrumentFactory.ts into focused sub-factories (Tier 4)"
      },
      {
        type: 'improvement',
        "description": "Extract FilePreviewPanel and useModuleImport from FileBrowser/TrackerView"
      },
      {
        type: 'improvement',
        "description": "Split VisualEffectEditors.tsx into category files"
      },
      {
        type: 'improvement',
        "description": "Extract SampleLoopEditor and useSampleEditorUndo from SampleEditor"
      },
      {
        type: 'improvement',
        "description": "Split ExportDialog.tsx into per-format export panels"
      },
      {
        type: 'improvement',
        "description": "Split JeskolaEditors.tsx into per-category Buzzmachine editors"
      },
      {
        type: 'improvement',
        "description": "Split UnifiedInstrumentEditor into sub-modules"
      },
      {
        type: 'improvement',
        "description": "Split instrument.ts types into domain-grouped modules (Tier 2)"
      },
      {
        type: 'improvement',
        "description": "Split constant/preset files into per-category directories (Tier 1)"
      },
      {
        type: 'feature',
        "description": "Add FormatRegistry as single source of truth for 130+ format definitions"
      },
      {
        type: 'feature',
        "description": "JamCracker Pro full integration — WASM replayer, AM synth, editor UI"
      },
      {
        type: 'feature',
        "description": "Dual SID toggle button, .sng file validation tests"
      },
      {
        type: 'feature',
        "description": "Dual SID monitors, ASID UX, test .sng files, ADSR drag polish"
      },
      {
        type: 'feature',
        "description": "Interactive ADSR, table editing, preset browser, block ops, save/export"
      },
      {
        type: 'improvement',
        "description": "Test: GTUltra test suite — 39 tests for mapping, detection, presets"
      },
      {
        type: 'feature',
        "description": "ASID hardware toggle in tracker toolbar"
      },
      {
        type: 'fix',
        "description": "SID monitor syntax error — missing y: property key"
      },
      {
        type: 'feature',
        "description": "GTUltra piano roll, preset browser, and visual mapping"
      },
      {
        type: 'feature',
        "description": "GTUltra SID presets and visual table editor"
      },
      {
        type: 'feature',
        "description": "GTUltra oscilloscope, studio mode, and visual instrument designer"
      },
      {
        type: 'feature',
        "description": "GTUltra UI enhancements and VJ component refactoring"
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
