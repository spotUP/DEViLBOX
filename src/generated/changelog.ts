/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-28T15:19:33.059Z
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
export const BUILD_VERSION = '1.0.1670';
export const BUILD_NUMBER = '1670';
export const BUILD_HASH = '3157e525';
export const BUILD_DATE = '2026-02-28';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1670',
    date: '2026-02-28',
    changes: [
      {
        type: 'fix',
        "description": "SunVox worklet cleanup + keyboard handler improvements"
      },
      {
        type: 'feature',
        "description": "Error line highlighting, raw output display, param management"
      },
      {
        type: 'feature',
        "description": "Add MAME chips + phrase-based test sounds to synth test runner"
      },
      {
        type: 'fix',
        "description": "Init WASM directly in onmessage, add _rejectInit"
      },
      {
        type: 'feature',
        "description": "Show banner when Vite dev server is unreachable"
      },
      {
        type: 'fix',
        "description": "Cast preSunVoxModules to fix tsc -b type errors"
      },
      {
        type: 'fix',
        "description": "Add status message feedback to keyboard commands missing user feedback"
      },
      {
        type: 'fix',
        "description": "Add pop-out button to ArrangementToolbar"
      },
      {
        type: 'fix',
        "description": "Gate AutomationLanes/MacroLanes on UIStore flags in DOM; respect tb303Collapsed in GL"
      },
      {
        type: 'fix',
        "description": "Add status messages to panel focus commands and wire useHexNumbers in DrumPad"
      },
      {
        type: 'fix',
        "description": "Add 6s timeout to module extraction to prevent load hang"
      },
      {
        type: 'fix',
        "description": "Remove unused vars, add missing UIStateSnapshot fields to workers"
      },
      {
        type: 'fix',
        "description": "Remove unused ROW_HEIGHT/rowHighlightInterval/showBeatLabels vars, add missing UIStateSnapshot fields to workers"
      },
      {
        type: 'feature',
        "description": "Implement showChannelNames in channel headers (DOM + Pixi)"
      },
      {
        type: 'fix',
        "description": "Restore missing fetch call in authFetch body"
      },
      {
        type: 'feature',
        "description": "Wire trackerZoom, rowHighlightInterval, showBeatLabels through DOM canvas pipeline"
      },
      {
        type: 'feature',
        "description": "Decompose modules into individual synth instruments on import"
      },
      {
        type: 'fix',
        "description": "Wire compactToolbar, trackerZoom, rowHighlightInterval, showBeatLabels, oscilloscopeVisible from UIStore"
      },
      {
        type: 'fix',
        "description": "Reset editor mode when loading .sunvox or .dbx files"
      },
      {
        type: 'fix',
        "description": "Strip .add/.store/.load/.play from SynthDef before compilation"
      },
      {
        type: 'fix',
        "description": "Auto-logout on 403 and fall back to static on server 404"
      },
      {
        type: 'improvement',
        "description": "Mark MusicLine WASM engine plan as complete"
      },
      {
        type: 'fix',
        "description": "Preview ML instruments via Sampler instead of WASM engine"
      },
      {
        type: 'fix',
        "description": "Re-route GainNode when SunVoxSynth is recreated after project reset"
      },
      {
        type: 'fix',
        "description": "Route instrument preview through WASM, pre-init on song load"
      },
      {
        type: 'fix',
        "description": "Version Zustand stores and add DANGER ZONE reset button"
      },
      {
        type: 'fix',
        "description": "Add setTimeout polyfill and fix Module scoping in SC worklet"
      },
      {
        type: 'fix',
        "description": "Surface worker errors and silent hangs via SynthErrorDialog"
      },
      {
        type: 'fix',
        "description": "Defer OffscreenCanvas init to rAF so flex layout is computed first"
      },
      {
        type: 'fix',
        "description": "Guard prefetcher cache.put against HTTP 206 partial responses"
      },
      {
        type: 'fix',
        "description": "Address code review issues — 206 guard, Set dedup, error tracking, export CACHE_NAME"
      },
      {
        type: 'feature',
        "description": "Show toast when previewing uncached sample during download"
      },
      {
        type: 'improvement',
        "description": "Replace JSON.parse/stringify with structuredClone"
      },
      {
        type: 'fix',
        "description": "Guard cache.put against HTTP 206 partial responses"
      },
      {
        type: 'fix',
        "description": "Hold synth instrument preview for 800ms instead of 300ms"
      },
      {
        type: 'feature',
        "description": "Run background sample pack prefetch on first boot"
      },
      {
        type: 'feature',
        "description": "Add SamplePackPrefetcher for background cache population"
      },
      {
        type: 'feature',
        "description": "Register service worker on app startup"
      },
      {
        type: 'feature',
        "description": "Add sample-packs-v1 cache with cache-first strategy"
      },
      {
        type: 'improvement',
        "description": "Add sample packs on-demand implementation plan"
      },
      {
        type: 'improvement',
        "description": "Add sample packs on-demand download design"
      },
      {
        type: 'improvement',
        "description": "Chore: ignore wasm build dirs and thoughts/ in .gitignore"
      },
      {
        type: 'feature',
        "description": "Chore(refs): add reference music files for parser testing"
      },
      {
        type: 'feature',
        "description": "Chore(refs): add EaglePlayers replayer documentation tree"
      },
      {
        type: 'improvement',
        "description": "Add format documentation and format popularity CSVs"
      },
      {
        type: 'feature',
        "description": "Add MusicLineEngine.ts + audit/inspection utility scripts"
      },
      {
        type: 'improvement',
        "description": "Chore: regenerate changelog to build 1619"
      },
      {
        type: 'fix',
        "description": "Route MusicLine audio through separation chain, fix channel tracking when suppressed"
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
