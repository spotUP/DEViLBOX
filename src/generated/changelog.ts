/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-03T16:39:22.078Z
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
export const BUILD_VERSION = '1.0.2061';
export const BUILD_NUMBER = '2061';
export const BUILD_HASH = '1b2a4c44';
export const BUILD_DATE = '2026-03-03';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2061',
    date: '2026-03-03',
    changes: [
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
      },
      {
        type: 'fix',
        "description": "Use READ macros for label_ref operands in RMW ops"
      },
      {
        type: 'feature',
        "description": "Wire WASM heap data to GTUltra UI components"
      },
      {
        type: 'feature',
        "description": "GTUltra ASID hardware bridge for USB-SID-Pico"
      },
      {
        type: 'feature',
        "description": "GTUltra block operations + SID register monitor"
      },
      {
        type: 'feature',
        "description": "GoatTracker .sng file detection and loading pipeline"
      },
      {
        type: 'feature',
        "description": "GoatTracker Ultra Phase 3 — Pixi/WebGL UI components"
      },
      {
        type: 'feature',
        "description": "GoatTracker Ultra Phase 2 — DOM UI components"
      },
      {
        type: 'feature',
        "description": "GoatTracker Ultra WASM engine — Phase 1 complete"
      },
      {
        type: 'feature',
        "description": "Add label destination writes, SIZE token skip, emitOperandRead"
      },
      {
        type: 'improvement',
        "description": "Revert(tracker): restore 47fps every-3rd-frame scroll baseline"
      },
      {
        type: 'improvement',
        "description": "Add ASID hardware support documentation"
      },
      {
        type: 'feature',
        "description": "Add ASID status tracking to C64SIDEngine"
      },
      {
        type: 'feature',
        "description": "Wire ASID protocol into jsSID engine"
      },
      {
        type: 'feature',
        "description": "Add ASID hardware protocol and settings UI"
      },
      {
        type: 'improvement',
        "description": "Note that HVSC browser requires backend server"
      },
      {
        type: 'fix',
        "description": "Improve HVSC error messages and remove broken CORS fallback"
      },
      {
        type: 'improvement',
        "description": "Revert(tracker): restore pre-tile-shift scroll (every-3rd-frame RAF)"
      },
      {
        type: 'fix',
        "description": "Debug(vj): add preset selection logging in VJView"
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
