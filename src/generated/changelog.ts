/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-01T19:47:53.159Z
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
export const BUILD_VERSION = '1.0.1854';
export const BUILD_NUMBER = '1854';
export const BUILD_HASH = 'e10d052d';
export const BUILD_DATE = '2026-03-01';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1854',
    date: '2026-03-01',
    changes: [
      {
        type: 'fix',
        "description": "Simplify dialog — remove engine/mode toggles, always load editable"
      },
      {
        type: 'improvement',
        "description": "Chore: trigger pipeline test"
      },
      {
        type: 'improvement',
        "description": "Unify toolbar state via UI store, match GL UI to DOM UI"
      },
      {
        type: 'fix',
        "description": "Guard keyboard shortcuts against firing in input fields"
      },
      {
        type: 'feature',
        "description": "Switch to pull-based deployment via GitHub Release + webhook"
      },
      {
        type: 'feature',
        "description": "Add vertical scroll for tracks"
      },
      {
        type: 'fix',
        "description": "Remove File/Module/Help menu bar row from Pixi tracker toolbar"
      },
      {
        type: 'feature',
        "description": "Add horizontal and vertical zoom controls to toolbar"
      },
      {
        type: 'fix',
        "description": "Cast Uint8Array.buffer to ArrayBuffer for parseHippelCoSoFile"
      },
      {
        type: 'fix',
        "description": "Fix BindingError on menu open + wire up Load/Save/Clear buttons"
      },
      {
        type: 'fix',
        "description": "Handle PP20-compressed HippelCoSo files and guard loadSongFile parse errors"
      },
      {
        type: 'fix',
        "description": "Remove unused cameraScale var, add drawNoop for imperative overlay ref"
      },
      {
        type: 'fix',
        "description": "Explicit NavBar/StatusBar heights, extract computeEffectivePitch, remove unused navBarH prop"
      },
      {
        type: 'fix',
        "description": "Correct bloom field name (bloomStrength→bloomIntensity), proper hysteresis, HMR state reset"
      },
      {
        type: 'feature',
        "description": "Add full clip interaction to arrangement canvas"
      },
      {
        type: 'improvement',
        "description": "FPS monitor + adaptive CRT bloom gating + 1s idle threshold"
      },
      {
        type: 'feature',
        "description": "Implement select tool with move/resize/rubber-band"
      },
      {
        type: 'improvement',
        "description": "CacheAsTexture on NavBar and StatusBar — static chrome composited as GPU quad"
      },
      {
        type: 'fix',
        "description": "Wrap useTick spring callback in useCallback to prevent re-registration on every render"
      },
      {
        type: 'fix',
        "description": "Remove ?v=2 query string from worklet addModule URLs"
      },
      {
        type: 'improvement',
        "description": "Move window open/close spring from RAF to Pixi ticker — respects idle FPS cap"
      },
      {
        type: 'fix',
        "description": "Use direct ContainerType API for cacheAsTexture — no cast needed in Pixi v8"
      },
      {
        type: 'fix',
        "description": "Screen-proportional default window sizes, clear stale localStorage"
      },
      {
        type: 'improvement',
        "description": "CacheAsTexture on window chrome — frame/buttons/title cached as GPU quad"
      },
      {
        type: 'improvement',
        "description": "Revert(ios): revert worklet sampleRate/mono changes — caused silence on iOS"
      },
      {
        type: 'improvement',
        "description": "Separate grid pan (position) from zoom (redraw) to eliminate per-pan Graphics rebuild"
      },
      {
        type: 'fix',
        "description": "Use workbenchH for viewport culling height (excludes NavBar/StatusBar chrome)"
      },
      {
        type: 'improvement',
        "description": "Cull off-screen windows with renderable=false"
      },
      {
        type: 'improvement',
        "description": "Disable interactiveChildren on non-focused window content"
      },
      {
        type: 'fix',
        "description": "Fit views to window size and enable wheel scroll"
      },
      {
        type: 'improvement',
        "description": "GL performance implementation plan (7 tasks)"
      },
      {
        type: 'improvement',
        "description": "GL performance optimization design (approach C)"
      },
      {
        type: 'fix',
        "description": "Remove unused activeWindowId, fix type cast, move mask effect after declarations"
      },
      {
        type: 'improvement',
        "description": "Chore(dev): kill existing vite on dev start, remove type-check from predev"
      },
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
