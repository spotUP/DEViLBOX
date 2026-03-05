/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-05T00:50:49.644Z
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
export const BUILD_VERSION = '1.0.2322';
export const BUILD_NUMBER = '2322';
export const BUILD_HASH = 'f2247987';
export const BUILD_DATE = '2026-03-05';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2322',
    date: '2026-03-05',
    changes: [
      {
        type: 'fix',
        "description": "GL smooth scroll jitter — cache row duration to prevent oscillation"
      },
      {
        type: 'fix',
        "description": "Fix hooks ordering violation in GlModal — move hooks before early return"
      },
      {
        type: 'fix',
        "description": "GL tracker smooth scroll jitter on row transitions"
      },
      {
        type: 'feature',
        "description": "Restore all VJ pattern overlay effects (3D tilt, drift, beat kicks, shimmer)"
      },
      {
        type: 'fix',
        "description": "VJ pattern overlay crash — undefined 't' variable after shake removal"
      },
      {
        type: 'fix',
        "description": "Remove screen blend mode making overlay invisible on bright backgrounds"
      },
      {
        type: 'fix',
        "description": "Remove all shake/tilt/drift from VJ pattern overlay"
      },
      {
        type: 'fix',
        "description": "Reduce VJ pattern overlay shake ~60%"
      },
      {
        type: 'fix',
        "description": "Zoom VJ pattern overlay 50% more (base scale 1.4→2.1)"
      },
      {
        type: 'fix',
        "description": "Zoom VJ pattern overlay another 20% (base scale 1.2→1.4)"
      },
      {
        type: 'fix',
        "description": "Zoom VJ pattern overlay 20% larger (base scale 1.0→1.2)"
      },
      {
        type: 'fix',
        "description": "Increase VJ pattern overlay visibility"
      },
      {
        type: 'fix',
        "description": "Center VJ pattern overlay using flex instead of translate"
      },
      {
        type: 'fix',
        "description": "Remove invalid onClick on Pixi Div, fix nested Txt in settings"
      },
      {
        type: 'fix',
        "description": "VJ pattern overlay width matches actual channel count"
      },
      {
        type: 'feature',
        "description": "Music-reactive animated VJ pattern overlay"
      },
      {
        type: 'fix',
        "description": "Fix app.screen getter crash in all GL modals"
      },
      {
        type: 'fix',
        "description": "Fix SID backend adapter not found — class declarations don't create window properties"
      },
      {
        type: 'fix',
        "description": "GL settings modal 1:1 parity with DOM, scroll leak fix, channel header click fix"
      },
      {
        type: 'fix',
        "description": "Add onClick handlers to all GL interactive elements"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog"
      },
      {
        type: 'fix',
        "description": "Add lens distortion controls to DOM SettingsModal"
      },
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
