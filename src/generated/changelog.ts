/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-11T17:24:16.922Z
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
export const BUILD_VERSION = '1.0.2688';
export const BUILD_NUMBER = '2688';
export const BUILD_HASH = 'db1140adc';
export const BUILD_DATE = '2026-03-11';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2688',
    date: '2026-03-11',
    changes: [
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
      },
      {
        type: 'fix',
        "description": "Throttle direct synth updates to prevent audio noise"
      },
      {
        type: 'improvement',
        "description": "Allow left/right/tab cursor movement during playback"
      },
      {
        type: 'fix',
        "description": "Route CC mappings through unified parameter router"
      },
      {
        type: 'improvement',
        "description": "Use same accent color for cursor caret during playback"
      },
      {
        type: 'feature',
        "description": "Chore: add demoscene synth third-party sources"
      },
      {
        type: 'improvement',
        "description": "Update CLAUDE.md with TB-303 accent hardware details"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog and file manifest"
      },
      {
        type: 'feature',
        "description": "Add useImportDialog hook and dialog improvements"
      },
      {
        type: 'improvement',
        "description": "Chore: rename behringer_td-3_patterns to behringer-td-3"
      },
      {
        type: 'feature',
        "description": "Chore: add demoscene XRNS example songs"
      },
      {
        type: 'feature',
        "description": "Add Tunefish, WaveSabre, Oidos demoscene synths"
      },
      {
        type: 'feature',
        "description": "Add XRNS debug logging for pattern pipeline"
      },
      {
        type: 'fix',
        "description": "Hardware-accurate accent timing + soft limiter"
      },
      {
        type: 'fix',
        "description": "Lock drag direction to prevent value jumps"
      },
      {
        type: 'fix',
        "description": "Fix cursor caret hidden behind highlight bar during playback"
      },
      {
        type: 'improvement',
        "description": "Revert \"Make highlight bar solid during playback (non-visual-bg mode)\""
      },
      {
        type: 'improvement',
        "description": "Make highlight bar solid during playback (non-visual-bg mode)"
      },
      {
        type: 'improvement',
        "description": "Restore highlight bar to original accentGlow color"
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
