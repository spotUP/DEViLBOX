/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-28T23:45:50.380Z
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
export const BUILD_VERSION = '1.0.1757';
export const BUILD_NUMBER = '1757';
export const BUILD_HASH = 'b5c96cd3';
export const BUILD_DATE = '2026-02-28';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1757',
    date: '2026-03-01',
    changes: [
      {
        type: 'feature',
        "description": "Wrap Application in GLRenderer context"
      },
      {
        type: 'feature',
        "description": "Add ScrollList GL adapter, dispatcher, and module exports"
      },
      {
        type: 'fix',
        "description": "Improve ScrollList DOM accessibility and conventions"
      },
      {
        type: 'fix',
        "description": "Apply filter to app.stage not layout root — avoids Yoga BindingError on addChild"
      },
      {
        type: 'fix',
        "description": "Remove unused currentPositionIndex variable in PixiTrackerView"
      },
      {
        type: 'feature',
        "description": "Add ScrollList types and DOM implementation"
      },
      {
        type: 'feature',
        "description": "Wire chip RAM for OctaMED SynthInstr + Delta Music 1.0"
      },
      {
        type: 'feature',
        "description": "Add renderer context layer (dom/gl discriminator)"
      },
      {
        type: 'improvement',
        "description": "GL design system implementation plan"
      },
      {
        type: 'fix',
        "description": "Rewrite as PixiJS Filter to avoid Yoga layout conflicts during scroll"
      },
      {
        type: 'improvement',
        "description": "GL renderer-aware design system design doc"
      },
      {
        type: 'feature',
        "description": "Wire chip RAM for HippelCoSo + RobHubbard formats"
      },
      {
        type: 'fix',
        "description": "Add #version 300 es to tilt renderer GLSL shaders"
      },
      {
        type: 'fix',
        "description": "Restore alpha=1 before RT capture, use alpha=0 to hide scene from screen render"
      },
      {
        type: 'fix',
        "description": "Restore pointer events when CRT active — use eventMode=none on mesh, drop renderable=false on scene"
      },
      {
        type: 'fix',
        "description": "Fix erasableSyntaxOnly and Uint8Array type errors in UADEChipEditor"
      },
      {
        type: 'improvement',
        "description": "Remove completed CRT shader plan"
      },
      {
        type: 'feature',
        "description": "Wire chip RAM for DavidWhittaker format"
      },
      {
        type: 'feature',
        "description": "Wire chip RAM for DigitalMugician + SoundFX formats"
      }
    ]
  },
  {
    version: '2026-02-28',
    date: '2026-02-28',
    changes: [
      {
        type: 'feature',
        "description": "Integrate CRTRenderer into PixiRoot with useTick drive loop"
      },
      {
        type: 'fix',
        "description": "Remove unused upd helper from FredControls"
      },
      {
        type: 'feature',
        "description": "Pass uadeChipRam to all UADE synthesis controls in UnifiedInstrumentEditor"
      },
      {
        type: 'feature',
        "description": "Extend FredControls with chip RAM write-back"
      },
      {
        type: 'feature',
        "description": "Extend SidMonControls with chip RAM write-back"
      },
      {
        type: 'feature',
        "description": "Add CRTRenderer — RenderTexture + Mesh + GlProgram shader"
      },
      {
        type: 'feature',
        "description": "SidMon1Controls writes ADSR/arp/phase params to chip RAM when loaded via UADE"
      },
      {
        type: 'feature',
        "description": "SoundMonControls writes synth params to chip RAM when loaded via UADE"
      },
      {
        type: 'feature',
        "description": "Add CRT shader settings section to SettingsModal"
      },
      {
        type: 'feature',
        "description": "FCControls writes vibrato/speed params to chip RAM when loaded via UADE"
      },
      {
        type: 'feature',
        "description": "Add CRTParams type and state to useSettingsStore"
      },
      {
        type: 'improvement',
        "description": "CRT shader implementation plan — 4 tasks for full-screen WebGL post-processing"
      },
      {
        type: 'feature',
        "description": "Future Composer chip RAM instrument editor with export"
      },
      {
        type: 'feature',
        "description": "Wire Fred Editor native parser + chip RAM scanning"
      },
      {
        type: 'feature',
        "description": "Wire SidMon 2 native parser + chip RAM addresses"
      },
      {
        type: 'feature',
        "description": "Wire SidMon 1 native parser + chip RAM scanning for module base"
      },
      {
        type: 'feature',
        "description": "Wire SoundMon native parser + chip RAM addresses"
      },
      {
        type: 'feature',
        "description": "Wire Future Composer native parser + embed chip RAM addresses in instruments"
      },
      {
        type: 'fix',
        "description": "Fix TS errors in WorkbenchTiltRenderer"
      },
      {
        type: 'feature',
        "description": "UADEChipEditor — typed read/write helpers + module export for chip RAM editing"
      },
      {
        type: 'feature',
        "description": "Add UADEChipRamInfo type for chip RAM address metadata on instruments"
      },
      {
        type: 'fix',
        "description": "Add malloc null checks and WASM-ready guards to readMemory/writeMemory handlers"
      },
      {
        type: 'feature',
        "description": "Add general-purpose readMemory/writeMemory to worklet and UADEEngine"
      },
      {
        type: 'improvement',
        "description": "UADE chip RAM editing implementation plan — 12 tasks for Phase 1 synthesis formats"
      },
      {
        type: 'improvement',
        "description": "UADE chip RAM editing design — full format editability via chip RAM read/write"
      },
      {
        type: 'fix',
        "description": "Fix silent audio failure when AudioContext is suspended on iOS"
      },
      {
        type: 'feature',
        "description": "Phase 3b — read instrument names from Amiga chip RAM"
      },
      {
        type: 'feature',
        "description": "CIA-A tick counter, native parser routing, expanded effects"
      },
      {
        type: 'fix',
        "description": "Eliminate remaining visible= BindingErrors on layout containers"
      },
      {
        type: 'feature',
        "description": "Infinite canvas workbench with floating windows"
      },
      {
        type: 'fix',
        "description": "Rewrite PixiFurnaceView and PixiHivelyView to pure Pixi"
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
