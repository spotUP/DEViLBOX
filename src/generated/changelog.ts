/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-01T10:07:08.839Z
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
export const BUILD_VERSION = '1.0.1788';
export const BUILD_NUMBER = '1788';
export const BUILD_HASH = '7c36d82e';
export const BUILD_DATE = '2026-03-01';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1788',
    date: '2026-03-01',
    changes: [
      {
        type: 'fix',
        "description": "Eliminate remaining @pixi/layout BindingErrors from conditional rendering"
      },
      {
        type: 'fix',
        "description": "Throw on init failure instead of silently returning"
      },
      {
        type: 'feature',
        "description": "Wire Tier 2 parsers to NATIVE_ROUTES"
      },
      {
        type: 'fix',
        "description": "Always mount step label to prevent BindingError on play"
      },
      {
        type: 'fix',
        "description": "Always mount PixiInstrumentToggle to prevent BindingError"
      },
      {
        type: 'fix',
        "description": "Use PixiWindow dimensions for layout instead of screen size"
      },
      {
        type: 'fix',
        "description": "Add sections field, fix UADEChipRamInfo errors, cache-bust worklet URLs"
      },
      {
        type: 'feature',
        "description": "Wire chip RAM for GraoumfTracker2 + MusicLine parsers"
      },
      {
        type: 'feature',
        "description": "Wire chip RAM + NATIVE_ROUTES for Tier 1 formats"
      },
      {
        type: 'fix',
        "description": "Correct UV normalization for oversized stage bounding box"
      },
      {
        type: 'fix',
        "description": "Remove unused OFF_TABLE const and add missing sections field"
      },
      {
        type: 'fix',
        "description": "Sync stage filterArea to screen size to fix CRT shader distortion"
      },
      {
        type: 'feature',
        "description": "Add category dot icons and index numbers to GL instrument list"
      },
      {
        type: 'fix',
        "description": "Detect WASM createChip crashes as WASM_UNAVAIL in test runner"
      },
      {
        type: 'fix',
        "description": "Fix three TS errors blocking CI build"
      },
      {
        type: 'fix',
        "description": "Use globalScope sampleRate and fix mono channel mix in worklets"
      },
      {
        type: 'fix',
        "description": "Add chip RAM info to empty instrument slots in UADE parsers"
      },
      {
        type: 'improvement',
        "description": "Chore: regenerate changelog to build 1671"
      },
      {
        type: 'improvement',
        "description": "Chore(test): update synth test runner"
      },
      {
        type: 'feature',
        "description": "Add DOM mode button to NavBar + FT2 CSS utility classes"
      },
      {
        type: 'fix',
        "description": "Replace layout absolute positioning with x/y on BitmapText"
      },
      {
        type: 'fix',
        "description": "Improve error messages, add default config, and debug logging"
      },
      {
        type: 'fix',
        "description": "Route .sunvox drag-drop through import dialog + improve init timeouts"
      },
      {
        type: 'fix',
        "description": "Fix OPN register write order and OPNB_B channel mapping"
      },
      {
        type: 'fix',
        "description": "Make ScrollList DOM container keyboard-focusable and scroll selected item into view"
      },
      {
        type: 'feature',
        "description": "Wire chip RAM for Delta Music 2.0"
      },
      {
        type: 'fix',
        "description": "Memoize instrument items mapping in PixiInstrumentPanel"
      },
      {
        type: 'feature',
        "description": "Migrate PixiInstrumentPanel to GL-native ScrollList"
      },
      {
        type: 'fix',
        "description": "Warn when GLScrollList width is omitted"
      },
      {
        type: 'fix',
        "description": "Add DeltaMusic1Synth to SYNTH_INFO record in synthCategories"
      },
      {
        type: 'feature',
        "description": "Wire chip RAM for TFMX (VolModSeq/SndModSeq extraction)"
      },
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
  }
];

// Current display version
export const CURRENT_VERSION = FULL_VERSION;

// Get all changes from the last N entries
export function getRecentChanges(count: number = 10): ChangelogEntry[] {
  return CHANGELOG.slice(0, count);
}
