/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-11T22:30:18.034Z
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
export const BUILD_VERSION = '1.0.2706';
export const BUILD_NUMBER = '2706';
export const BUILD_HASH = '0791a5b31';
export const BUILD_DATE = '2026-03-11';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2706',
    date: '2026-03-11',
    changes: [
      {
        type: 'fix',
        "description": "DJ scratch position from audio player, add XRNS to metadata format"
      },
      {
        type: 'fix',
        "description": "Add XRNS source format, improve debug logging"
      },
      {
        type: 'improvement',
        "description": "Chore: update changelog"
      },
      {
        type: 'improvement',
        "description": "Unify view switcher to shared viewOptions"
      },
      {
        type: 'feature',
        "description": "Adultery WASM support, velocity fix, chunk-based presets"
      },
      {
        type: 'fix',
        "description": "Fix DJ scratch position reset: accurate variable-rate position tracking"
      },
      {
        type: 'fix',
        "description": "Fix VJ view pauses: willReadFrequently, stuck detection threshold, reduce GC"
      },
      {
        type: 'fix',
        "description": "Improve WASM synth routing and UI feedback"
      },
      {
        type: 'improvement',
        "description": "VJ overlay: single unified canvas for multiple sources"
      },
      {
        type: 'feature',
        "description": "Add debug logging and parameter application improvements"
      },
      {
        type: 'fix',
        "description": "Fix instrument index mapping and empty instrument handling"
      },
      {
        type: 'fix',
        "description": "VJ pattern overlay — DJ deck scrolling + side-by-side layout"
      },
      {
        type: 'fix',
        "description": "SynthControlsRouter type errors — Gearmulator synthType + MAME handle"
      },
      {
        type: 'fix',
        "description": "Fix V2 Emscripten module loading + add debug logs"
      },
      {
        type: 'feature',
        "description": "VJ pattern overlay supports tracker + DJ deck sources"
      },
      {
        type: 'fix',
        "description": "Add smoothness fixes to PixiKnob and GmKnob"
      },
      {
        type: 'feature',
        "description": "WobbleBass mode presets and oscilloscope visualizer"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript errors in SynthControlsRouter and TB303KnobPanel"
      },
      {
        type: 'fix',
        "description": "Use ref pattern to avoid stale closures"
      },
      {
        type: 'fix',
        "description": "Tracker scratch — wheel handler conflict + grab activation check"
      },
      {
        type: 'feature',
        "description": "Auto-join room from URL query parameter"
      },
      {
        type: 'fix',
        "description": "Open at correct size from the start"
      },
      {
        type: 'fix',
        "description": "Move useCallback before early return to fix hooks ordering error"
      },
      {
        type: 'fix',
        "description": "WobbleBass knob ranges, duplicate Neural keys, structuredClone error"
      },
      {
        type: 'fix',
        "description": "Live parameter updates for WobbleBass + knob layout improvements"
      },
      {
        type: 'fix',
        "description": "Fix title and fitContent sizing"
      },
      {
        type: 'fix',
        "description": "Revert to document.write (blob URLs break popups)"
      },
      {
        type: 'feature',
        "description": "Add Furnace chip synth routing to SynthControlsRouter"
      },
      {
        type: 'improvement',
        "description": "Extract SynthControlsRouter for cleaner synth UI routing"
      },
      {
        type: 'improvement',
        "description": "Chore: gitignore tunefish and wavesabre build dirs"
      },
      {
        type: 'fix',
        "description": "Debug: add temporary logging for instrument effects chain"
      },
      {
        type: 'improvement',
        "description": "Minor cleanup in knob panels"
      },
      {
        type: 'fix',
        "description": "Use Blob URL to avoid about:blank in title bar"
      },
      {
        type: 'improvement',
        "description": "Move FX panel headers into tab bar with action buttons"
      },
      {
        type: 'improvement',
        "description": "FX tabs: auto height to fit effect modules"
      },
      {
        type: 'improvement',
        "description": "FX tabs: horizontal layout for effects pedals"
      },
      {
        type: 'feature',
        "description": "InstrumentKnobPanel: follow selected instrument, add FX tabs"
      },
      {
        type: 'improvement',
        "description": "Replace TB303+SC panels with unified InstrumentKnobPanel"
      },
      {
        type: 'fix',
        "description": "Fix 303 panel visible when collapsed — fade content out"
      },
      {
        type: 'fix',
        "description": "Fix 303 FX tab sliders hidden behind tips bar"
      },
      {
        type: 'improvement',
        "description": "Animate 303 panel expand/collapse with eased height transition"
      },
      {
        type: 'improvement',
        "description": "Pin 303 expand/collapse buttons to top-right of screen"
      },
      {
        type: 'fix',
        "description": "Fix 303 centering — make ScrollLockContainer full width"
      },
      {
        type: 'fix',
        "description": "Fix 303 horizontal centering — add mx-auto on hardware div"
      },
      {
        type: 'improvement',
        "description": "Center 303 panel horizontally — cap max width at 1200px"
      },
      {
        type: 'fix',
        "description": "Fix 303 panel shadow/border layers clipping unevenly"
      },
      {
        type: 'fix',
        "description": "Fix 303 panel cutoff — remove maxHeight limit, let flex layout handle sizing"
      },
      {
        type: 'fix',
        "description": "Correct 303 tab-to-page mapping for hardware knobs"
      },
      {
        type: 'fix',
        "description": "Fix VU meters for native synths (DB303) — always use trigger data"
      },
      {
        type: 'improvement',
        "description": "Enable pattern scratch during playback without DJ/toggle gate"
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
