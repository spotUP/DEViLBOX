/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-04T23:30:54.294Z
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
export const BUILD_VERSION = '1.0.2299';
export const BUILD_NUMBER = '2299';
export const BUILD_HASH = '77381cff';
export const BUILD_DATE = '2026-03-04';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2299',
    date: '2026-03-05',
    changes: [
      {
        type: 'feature',
        "description": "Add global lens distortion filter with presets"
      },
      {
        type: 'feature',
        "description": "Add lens distortion settings (barrel, chromatic, vignette)"
      },
      {
        type: 'improvement',
        "description": "Chore: update changelog, tilt shader, test runner, headless test"
      },
      {
        type: 'fix',
        "description": "Resolve all TypeScript build errors across codebase"
      },
      {
        type: 'feature',
        "description": "Add 3D toggle button to studio workbench control bar"
      },
      {
        type: 'fix',
        "description": "Complete app-wide eventMode=\"none\" audit for GL views/dialogs"
      },
      {
        type: 'fix',
        "description": "Add eventMode=\"none\" to all GL component children to fix click handling"
      },
      {
        type: 'fix',
        "description": "Resolve build errors from tracker visual bg removal"
      },
      {
        type: 'fix',
        "description": "Rewrite GL welcome modal to match DOM version 1:1"
      }
    ]
  },
  {
    version: '2026-03-04',
    date: '2026-03-04',
    changes: [
      {
        type: 'feature',
        "description": "Add module info button and modal for non-SID tunes"
      },
      {
        type: 'feature',
        "description": "Add pattern data overlay, remove tracker visual bg"
      },
      {
        type: 'improvement',
        "description": "Throttle visual bg copy to 30fps, cap DPR at 1"
      },
      {
        type: 'fix',
        "description": "Restore original DOM overlay + fullscreen layout"
      },
      {
        type: 'fix',
        "description": "Set sidMetadata synchronously to ensure info button appears"
      },
      {
        type: 'improvement',
        "description": "Chore: regenerate changelog (build 2283)"
      },
      {
        type: 'feature',
        "description": "Chore: add puppeteer headless synth test infrastructure"
      },
      {
        type: 'fix',
        "description": "Prevent turntable platter non-uniform scaling"
      },
      {
        type: 'fix',
        "description": "Prevent non-uniform knob scaling"
      },
      {
        type: 'fix',
        "description": "SID files produce no audio — store c64SidFileData in tracker state"
      },
      {
        type: 'fix',
        "description": "Channel headers 1:1 parity with DOM"
      },
      {
        type: 'feature',
        "description": "Fix 3 'unfixable' GL-DOM parity gaps"
      },
      {
        type: 'fix',
        "description": "Update FM synth metering to use dispatch path"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog to build 2267"
      },
      {
        type: 'feature',
        "description": "Chip format metadata, improved render progress bar"
      },
      {
        type: 'feature',
        "description": "Preset tags, tag filtering, synth browser, escape-to-close"
      },
      {
        type: 'feature',
        "description": "Canvas view mode, improved module browser layout"
      },
      {
        type: 'feature',
        "description": "Pulsing connection dot, per-channel widths, collapsed channels"
      },
      {
        type: 'feature',
        "description": "Multi-mode visualizer, velocity-sensitive pads, turntable physics"
      },
      {
        type: 'fix',
        "description": "Add comprehensive synth debugging diagnostics to test runner"
      },
      {
        type: 'feature',
        "description": "Tag management UI, search/recommended APIs, HVSC search fixes"
      },
      {
        type: 'feature',
        "description": "Add all 48 missing synths to test runner — full 190/190 coverage"
      },
      {
        type: 'feature',
        "description": "Full DeepSID feature implementation — all tabs, search, tags, transport"
      },
      {
        type: 'feature',
        "description": "Add comprehensive FX test runner: music-driven tests, clipping detection, 39 param wiring tests, 19 new effects"
      },
      {
        type: 'fix',
        "description": "Alphabetically sort FX preset categories and items"
      },
      {
        type: 'fix',
        "description": "PixiSelect dropdown scroll support for long option lists"
      },
      {
        type: 'feature',
        "description": "Achieve 1:1 GL-DOM parity across all components"
      },
      {
        type: 'fix',
        "description": "Fix collaboration split view and remote pattern view to match DOM versions"
      },
      {
        type: 'fix',
        "description": "Resolve 17 TypeScript errors across Pixi components"
      },
      {
        type: 'fix',
        "description": "Escape apostrophe in PixiRemotePatternView string literal"
      },
      {
        type: 'fix',
        "description": "Remove extra </Div> closing tag in PixiPadEditor"
      },
      {
        type: 'feature',
        "description": "Pad name editing, MIDI learn, add layer from file"
      },
      {
        type: 'fix',
        "description": "SA: fix 11 period table values and ADSR sustain gate"
      },
      {
        type: 'feature',
        "description": "Add PixiPadEditor — 6-tab GL pad parameter editor"
      },
      {
        type: 'improvement',
        "description": "Enhance PixiDrumPadManager with full DOM drumpad feature parity"
      },
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
