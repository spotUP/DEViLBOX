/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-05T11:35:13.609Z
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
export const BUILD_VERSION = '1.0.4213';
export const BUILD_NUMBER = '4213';
export const BUILD_HASH = 'a31dc183b';
export const BUILD_DATE = '2026-04-05';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.4213',
    date: '2026-04-05',
    changes: [
      {
        type: 'fix',
        "description": "Encode baked chord sample as WAV instead of raw PCM"
      },
      {
        type: 'feature',
        "description": "Bake chord — render chord notes into a single sample instrument"
      },
      {
        type: 'fix',
        "description": "LoadSong skips stopNativeEngines — root cause of WASM replay bug"
      },
      {
        type: 'feature',
        "description": "Multi-note-column rendering in GL renderer for chord display"
      },
      {
        type: 'fix',
        "description": "Pattern editor context menu — wrong column/channel on click, native menu leak"
      },
      {
        type: 'fix',
        "description": "Only loadSong on first play, not on replay"
      },
      {
        type: 'fix',
        "description": "Skip engine.stop()+delay for WASM singleton engines"
      },
      {
        type: 'fix',
        "description": "Remove loadSong skip — let _runningEngineKeys guard handle it"
      },
      {
        type: 'fix',
        "description": "Skip redundant loadSong to prevent WASM state corruption"
      },
      {
        type: 'fix',
        "description": "Prevent double-start of WASM engines in startNativeEngines"
      },
      {
        type: 'fix',
        "description": "Use onContextMenuCapture to intercept right-click before browser native menu"
      },
      {
        type: 'fix',
        "description": "Remove unused useFormatStore import from PixiTrackerView"
      },
      {
        type: 'fix',
        "description": "Prevent browser context menu on canvas element itself — blocks native menu on first right-click"
      },
      {
        type: 'fix',
        "description": "Dedicated play handler prevents double startNativeEngines"
      },
      {
        type: 'fix',
        "description": "Debug: show actual offset and width values in hit-test log"
      },
      {
        type: 'fix',
        "description": "Revert play handler to simple — load handles reset"
      },
      {
        type: 'fix',
        "description": "Debug: log getCellFromCoords hit-test values"
      },
      {
        type: 'fix',
        "description": "Remove _ml_init from play handler — was clearing song"
      },
      {
        type: 'fix',
        "description": "Throttle param changes to avoid audio worklet flooding"
      },
      {
        type: 'fix',
        "description": "Fall back to store instrumentId when prop is undefined"
      },
      {
        type: 'fix',
        "description": "Guard pattern?.length in useCallback dep to prevent crash on reload"
      },
      {
        type: 'fix',
        "description": "Right-click context menu always opens — no left-click required first"
      },
      {
        type: 'fix',
        "description": "Debug: log context menu position for troubleshooting"
      },
      {
        type: 'fix',
        "description": "Chore: PreTracker wrapper update + Monique UI fix"
      },
      {
        type: 'feature',
        "description": "Unify DOM and Pixi channel context menus — same items in both"
      },
      {
        type: 'fix',
        "description": "Reinit WASM on play to fix silence-on-replay"
      },
      {
        type: 'fix',
        "description": "Save WASM position on stop (button + spacebar)"
      },
      {
        type: 'feature',
        "description": "Add Automation submenu to cell right-click context menu"
      },
      {
        type: 'fix',
        "description": "Add dedicated stop handler to prevent play-once bug"
      },
      {
        type: 'fix',
        "description": "Merge Pixi channel context menu to match DOM — unified Automation submenu"
      },
      {
        type: 'fix',
        "description": "Use ref for instrumentId in hardware UI callbacks"
      },
      {
        type: 'feature',
        "description": "Wire register capture → automation store sync"
      },
      {
        type: 'fix',
        "description": "Enable global showAutomationLanes toggle when selecting register params from context menu"
      },
      {
        type: 'fix',
        "description": "Revert automation overlay to style.top — transform broke scrolling"
      },
      {
        type: 'fix',
        "description": "Automation overlay uses GPU-accelerated transform for perfect scroll sync"
      },
      {
        type: 'improvement',
        "description": "Chore: remove unused useCursorStore import"
      },
      {
        type: 'improvement',
        "description": "Chore: remove unused variables from automation lane cleanup"
      },
      {
        type: 'fix',
        "description": "Remove automation lane backgrounds and fill areas — curves only, no clutter"
      },
      {
        type: 'fix',
        "description": "Hide automation lanes in all sub-editors (order matrices, instrument tables, etc.)"
      },
      {
        type: 'fix',
        "description": "Prevent parent scroll when dragging hardware UI knobs"
      },
      {
        type: 'fix',
        "description": "Automation lanes work in per-channel format mode"
      },
      {
        type: 'fix',
        "description": "Automation modal uses 95vh max height with scrollbar instead of clipping content"
      },
      {
        type: 'improvement',
        "description": "Remove separate lane strip — register params use standard per-channel automation"
      },
      {
        type: 'feature',
        "description": "Add block mark/copy/cut/paste to arpeggio and track table editors"
      },
      {
        type: 'feature',
        "description": "Parse INFO chunk metadata and expose on TrackerSong"
      },
      {
        type: 'feature',
        "description": "Add mono/poly keyboard mode toggle and removeUnusedParts"
      },
      {
        type: 'feature',
        "description": "Add real-time waveform visualizer to instrument editor"
      },
      {
        type: 'feature',
        "description": "Add dropdown selectors and Copy/Swap/Cut to instrument editor"
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
