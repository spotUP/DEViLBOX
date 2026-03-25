/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-25T11:37:56.573Z
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
export const BUILD_VERSION = '1.0.3549';
export const BUILD_NUMBER = '3549';
export const BUILD_HASH = '194daeb98';
export const BUILD_DATE = '2026-03-25';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.3549',
    date: '2026-03-25',
    changes: [
      {
        type: 'feature',
        "description": "Expand chip parameters and wire setParam for FZ/ZSG2/KS0164/SWP00"
      },
      {
        type: 'fix',
        "description": "VU meters visible on iOS, scratch drag works on touch"
      },
      {
        type: 'fix',
        "description": "Use overflow-hidden on pattern editor for centered cursor bar"
      },
      {
        type: 'fix',
        "description": "Fix MAME CMI boot hang — re-enable keyboard CPUs"
      },
      {
        type: 'feature',
        "description": "Extract Samsung KS0164 wavetable synth as standalone WASM"
      },
      {
        type: 'feature',
        "description": "IOS/mobile feature parity — Canvas2D renderer, view switching, format editors, transport bar, touch support"
      },
      {
        type: 'feature',
        "description": "Extract Yamaha SWP00 rompler/DSP as standalone WASM"
      },
      {
        type: 'improvement',
        "description": "Extract Zoom ZSG-2 wavetable chip as standalone WASM module"
      },
      {
        type: 'feature',
        "description": "Extract Casio FZ PCM chip as standalone WASM module"
      },
      {
        type: 'fix',
        "description": "Add bottom padding to piano keyboard for tab bar"
      },
      {
        type: 'fix',
        "description": "Hide instrument list sidebar in EditInstrumentModal"
      },
      {
        type: 'improvement',
        "description": "Cleanup: remove iOS sample rate diagnostic logs"
      },
      {
        type: 'improvement',
        "description": "Cleanup: remove all iOS diagnostic alerts"
      },
      {
        type: 'feature',
        "description": "Add MAME CRT hardware UI as lazy-loaded tab"
      },
      {
        type: 'feature',
        "description": "Add sample preview/audition to CMI library browser"
      },
      {
        type: 'feature',
        "description": "Add CMI 16-voice status LEDs and factory presets"
      },
      {
        type: 'fix',
        "description": "Fix 'Maximum update depth exceeded' in MixerPanel, SequenceMatrixEditor, and GT Ultra position updates"
      },
      {
        type: 'improvement',
        "description": "Use tab bar red for matrix editor header (--color-bg-tertiary)"
      },
      {
        type: 'improvement',
        "description": "Match matrix editor header to FT2 panel background color"
      },
      {
        type: 'improvement',
        "description": "Use darker accent red for matrix editor header"
      },
      {
        type: 'improvement',
        "description": "Style matrix editor header with red accent background"
      },
      {
        type: 'improvement',
        "description": "Unify Furnace order matrix with shared SequenceMatrixEditor"
      },
      {
        type: 'fix',
        "description": "Register Fairlight CMI pack + fix FurnaceEditor operator layout"
      },
      {
        type: 'improvement',
        "description": "Update CMI WASM and sample pack constants"
      },
      {
        type: 'improvement',
        "description": "Refactor macro editors: simplify MAMEMacroEditor and MacroEditor"
      },
      {
        type: 'fix',
        "description": "Fix GT Ultra instrument sync, pattern refresh, and order position tracking"
      },
      {
        type: 'fix',
        "description": "Correct sample playback speed — was 11x too slow (\"whale\")"
      },
      {
        type: 'fix',
        "description": "Fix Song Len display for GT Ultra: read from order data not tracker store"
      },
      {
        type: 'fix',
        "description": "Fix pattern length using table channels (255 rows) instead of pattern channels"
      },
      {
        type: 'fix',
        "description": "Fix GT Ultra row position: divide pattptr by 4 (byte offset → row index)"
      },
      {
        type: 'improvement',
        "description": "Smooth pattern editor scrolling for GT Ultra playback"
      }
    ]
  },
  {
    version: '2026-03-24',
    date: '2026-03-24',
    changes: [
      {
        type: 'fix',
        "description": "Fix GT Ultra pattern editor not following playback"
      },
      {
        type: 'feature',
        "description": "Add CMI WASM build dir to gitignore"
      },
      {
        type: 'improvement',
        "description": "CMI synth: smooth envelope accumulator, UI layout improvements"
      },
      {
        type: 'fix',
        "description": "Fix PatternEditorCanvas cleanup for iOS fallback and safe canvas removal"
      },
      {
        type: 'fix',
        "description": "Fix GT Ultra silent playback: initialize editorInfo in gt_play()"
      },
      {
        type: 'fix',
        "description": "Fix format editors rendering zeros instead of dots for empty cells"
      },
      {
        type: 'improvement',
        "description": "Wire format context menu + shared SequenceMatrixEditor"
      },
      {
        type: 'feature',
        "description": "Unify format editor sizing and add collapsible matrix editors"
      },
      {
        type: 'improvement',
        "description": "Unify format/normal pattern editor headers with full channel controls"
      },
      {
        type: 'improvement',
        "description": "Update DEViLBOX theme tracker rows to navy background"
      },
      {
        type: 'fix',
        "description": "Fix format mode channel header alignment with pattern content"
      },
      {
        type: 'improvement',
        "description": "Use theme CSS variables in GTOrderMatrix and GTUltraView"
      },
      {
        type: 'improvement',
        "description": "Remove table sections from GTOrderMatrix — tables live in pattern editor now"
      },
      {
        type: 'improvement',
        "description": "Update default dark theme tracker rows to navy color scheme"
      },
      {
        type: 'improvement',
        "description": "Match pattern editor colors to GTOrderMatrix color scheme"
      },
      {
        type: 'improvement',
        "description": "Remove order channels from pattern editor — orders live only in GTOrderMatrix"
      },
      {
        type: 'feature',
        "description": "Add per-channel column support to pattern editor"
      },
      {
        type: 'improvement',
        "description": "GT Ultra: integrate orders + tables as pattern editor channels"
      },
      {
        type: 'improvement',
        "description": "GT Ultra: tighten instrument isEmpty filter — require ADSR or waveform"
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
