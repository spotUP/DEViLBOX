/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-04T14:26:40.634Z
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
export const BUILD_VERSION = '1.0.4063';
export const BUILD_NUMBER = '4063';
export const BUILD_HASH = '334b7daa9';
export const BUILD_DATE = '2026-04-04';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.4063',
    date: '2026-04-04',
    changes: [
      {
        type: 'fix',
        "description": "Prevent matrix from scrolling during playback"
      },
      {
        type: 'improvement',
        "description": "Extract useInstrumentColors hook, migrate 38 instrument controls"
      },
      {
        type: 'fix',
        "description": "Gate FormatPlaybackState on formatIsPlaying prop"
      },
      {
        type: 'fix',
        "description": "Clamp displayPos to valid pattern order range"
      },
      {
        type: 'fix',
        "description": "Follow playback position now that bypass prevents reload"
      },
      {
        type: 'fix',
        "description": "Add WASM bypass in usePatternPlayback to prevent crash"
      },
      {
        type: 'improvement',
        "description": "Extract shared SectionLabel, migrate 19 inline copies"
      },
      {
        type: 'fix',
        "description": "Prevent reload loop by keeping channels tied to editPos"
      },
      {
        type: 'improvement',
        "description": "Unify 7 ADSR envelope visualizations into shared EnvelopeVisualization"
      },
      {
        type: 'fix',
        "description": "Drive FormatPlaybackState for pattern editor scrolling"
      },
      {
        type: 'improvement',
        "description": "Chore: remove dead MusicLinePatternViewer.tsx"
      },
      {
        type: 'fix',
        "description": "Read playback position from WASM position store"
      },
      {
        type: 'fix',
        "description": "Follow playback song position in pattern viewer"
      },
      {
        type: 'feature',
        "description": "Multi-column layout for SID instrument editor"
      },
      {
        type: 'fix',
        "description": "Correct playback speed for multispeed SID songs"
      },
      {
        type: 'fix',
        "description": "Pattern editor scrolls during WASM playback"
      },
      {
        type: 'feature',
        "description": "Add ms mode to EnvelopeVisualization for millisecond-based ADSR"
      },
      {
        type: 'feature',
        "description": "Add SID mode and responsive width to EnvelopeVisualization"
      },
      {
        type: 'fix',
        "description": "Include MusicLine in isFormatEngine for per-row updates"
      },
      {
        type: 'fix',
        "description": "Skip generic onPositionUpdate so TrackerReplayer path is used"
      },
      {
        type: 'feature',
        "description": "Add master WASM build script and build documentation"
      },
      {
        type: 'feature',
        "description": "Live table position tracking during playback"
      },
      {
        type: 'fix',
        "description": "Wire position sync through TrackerReplayer queueDisplayState"
      },
      {
        type: 'fix',
        "description": "Lay out 4 tables side by side horizontally"
      },
      {
        type: 'fix',
        "description": "Show all 4 tables stacked on one page instead of sub-tabs"
      },
      {
        type: 'feature',
        "description": "Full SID instrument editor + move tables from pattern view"
      },
      {
        type: 'feature',
        "description": "Bookmarks, PWA install, audio health, keybinding hint"
      },
      {
        type: 'improvement',
        "description": "Chore(sfizz): rebuild WASM"
      },
      {
        type: 'feature',
        "description": "Add arpeggio table WASM API and engine methods"
      },
      {
        type: 'improvement',
        "description": "Migrate Hively, Klystrack, TFMX to generic format editor"
      },
      {
        type: 'feature',
        "description": "Add scroll-wheel on knobs + double-click instrument rename"
      },
      {
        type: 'feature',
        "description": "Unify all order/matrix editors with PatternEditorCanvas"
      },
      {
        type: 'feature',
        "description": "Add right-click context menu to GL pattern order sidebar"
      },
      {
        type: 'fix',
        "description": "Suppress noisy WASM stderr output during init"
      },
      {
        type: 'fix',
        "description": "Replace MusicLinePatternViewer with PatternEditorCanvas in mobile view"
      },
      {
        type: 'fix',
        "description": "HEAPU8 not exported on Module — use wasmMemory fallback"
      },
      {
        type: 'feature',
        "description": "Replace custom DOM pattern viewer with PatternEditorCanvas"
      },
      {
        type: 'feature',
        "description": "Add drag-to-reorder to GL pattern order sidebar"
      },
      {
        type: 'fix',
        "description": "TextEncoder not available in AudioWorklet scope"
      },
      {
        type: 'fix',
        "description": "Aeolus param mapping + Sfizz missing setParam handler"
      },
      {
        type: 'fix',
        "description": "CONFIG_KEYS→WASM param index mapping was wrong"
      },
      {
        type: 'feature',
        "description": "HivelyTracker standalone synth + MusicLine editor + unified sequence editors"
      },
      {
        type: 'feature',
        "description": "Add audio export sample rate and bit depth UI to GL export"
      },
      {
        type: 'fix',
        "description": "Add interactive MacroSlotsPanel to GL Advanced Edit modal"
      },
      {
        type: 'fix',
        "description": "Merge Settings Input tab keyboard section into single block"
      },
      {
        type: 'fix',
        "description": "Improve DOM studio canvas view"
      },
      {
        type: 'fix',
        "description": "Escape Tailwind bracket class in querySelector"
      },
      {
        type: 'fix',
        "description": "Debug(hively): log HivelySynth creation in InstrumentFactory"
      },
      {
        type: 'fix',
        "description": "Lazy setup + queued note on pending config"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog"
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
