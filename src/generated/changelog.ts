/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-01T17:14:59.962Z
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
export const BUILD_VERSION = '1.0.1820';
export const BUILD_NUMBER = '1820';
export const BUILD_HASH = '143bdb98';
export const BUILD_DATE = '2026-03-01';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1820',
    date: '2026-03-01',
    changes: [
      {
        type: 'fix',
        "description": "Duplicate clip key and maximum update depth errors"
      },
      {
        type: 'fix',
        "description": "Title bar drag, fit button height, and window content clipping"
      },
      {
        type: 'improvement',
        "description": "Chore: remove completed plan docs + update changelog"
      },
      {
        type: 'fix',
        "description": "Add AMP section to all pre-existing synth layouts"
      },
      {
        type: 'feature',
        "description": "Integrate PixiUADELiveParams into GL instrument editor"
      },
      {
        type: 'fix',
        "description": "Restore window dragging broken by chrome buttons hit area"
      },
      {
        type: 'feature',
        "description": "Add PixiUADELiveParams GL component — live volume/finetune knobs"
      },
      {
        type: 'feature',
        "description": "Active window selection — FIT targets active window or all"
      },
      {
        type: 'feature',
        "description": "Render UADELiveParamsBar above waveform in SampleEditor for enhanced-scan instruments"
      },
      {
        type: 'fix',
        "description": "Hoist useCallback handlers above early return — fix rules of hooks violation"
      },
      {
        type: 'fix',
        "description": "UseCallback for knob handlers + synchronous basePeriod reset in UADELiveParamsBar"
      },
      {
        type: 'feature',
        "description": "Add UADELiveParamsBar DOM component — live volume/finetune knobs for enhanced-scan instruments"
      },
      {
        type: 'fix',
        "description": "Zoom scroll pivots on viewport center, not cursor position"
      },
      {
        type: 'fix',
        "description": "Fix erasableSyntaxOnly and unused variable TS errors"
      },
      {
        type: 'improvement',
        "description": "UADELiveParamsBar implementation plan — DOM + GL live volume/finetune knobs"
      },
      {
        type: 'fix',
        "description": "Fix background click-drag pan not working"
      },
      {
        type: 'improvement',
        "description": "UADELiveParamsBar design doc — live volume/finetune knobs for UADE enhanced-scan instruments"
      },
      {
        type: 'fix',
        "description": "Add RESET button and fix PixiTabBar BindingError"
      },
      {
        type: 'feature',
        "description": "Fix configKey prefix resolution + pixel-perfect synth layouts"
      },
      {
        type: 'fix',
        "description": "Fix window chrome buttons appearing huge and oblong"
      },
      {
        type: 'feature',
        "description": "Add Paula write log + memory watchpoints for instrument auto-discovery"
      },
      {
        type: 'feature',
        "description": "Add standard pan/zoom hotkeys for GL canvas navigation"
      },
      {
        type: 'feature',
        "description": "Add layouts for Tone.js synths, GranularSynth, and all Furnace chips"
      },
      {
        type: 'fix',
        "description": "Restructure layout to avoid flex/absolute coord mismatch"
      },
      {
        type: 'improvement',
        "description": "Replace DOM <select> overlays with native PixiSelect"
      },
      {
        type: 'feature',
        "description": "Add Sampler/Player layout for Pixi instrument editor"
      },
      {
        type: 'fix',
        "description": "Hide view-selector DOM overlay when not the active view mode"
      },
      {
        type: 'fix',
        "description": "Compact toolbar height + MIDIKnobBar layout accounting"
      },
      {
        type: 'fix',
        "description": "Clip WorkbenchContainer hit area to prevent NavBar event interception"
      },
      {
        type: 'fix',
        "description": "Replace dynamic cache-buster with static ?v=2 on worklet URLs"
      },
      {
        type: 'fix',
        "description": "Prevent PixiDOMOverlay leaking when parent view is hidden"
      },
      {
        type: 'feature',
        "description": "Add sample offset, fine vol slides, and DM1 name extraction"
      },
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
