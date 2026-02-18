/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-18T14:29:30.523Z
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
export const BUILD_VERSION = '1.0.821';
export const BUILD_NUMBER = '821';
export const BUILD_HASH = 'd46aab57';
export const BUILD_DATE = '2026-02-18';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.821',
    date: '2026-02-18',
    changes: [
      {
        type: 'fix',
        "description": "AmigaPal UI issues - icon visibility, border clipping, and spacing"
      },
      {
        type: 'fix',
        "description": "Increase AmigaPal modal width to accommodate custom icons"
      },
      {
        type: 'feature',
        "description": "Replace AmigaPal copy icons with custom SVG icons"
      },
      {
        type: 'fix',
        "description": "Resolve all type errors and React hooks violations from code audit"
      },
      {
        type: 'feature',
        "description": "Add Ableton Link-style sync via Web MIDI Clock"
      },
      {
        type: 'feature',
        "description": "Add Max for Live sample import utilities"
      },
      {
        type: 'improvement',
        "description": "Add comprehensive Modular Plugin SDK documentation"
      },
      {
        type: 'feature',
        "description": "Add 5 new Max for Live-inspired modular modules"
      },
      {
        type: 'fix',
        "description": "Make AmigaPal modal narrower with responsive waveform"
      },
      {
        type: 'feature',
        "description": "Add DJ-style turntable pitch slider to AmigaPal"
      },
      {
        type: 'fix',
        "description": "Make AmigaPal modal height dynamic instead of full-screen"
      },
      {
        type: 'feature',
        "description": "Update AmigaPal UI to use FT2 design system"
      },
      {
        type: 'fix',
        "description": "Replace non-existent Random icon with Shuffle"
      },
      {
        type: 'feature',
        "description": "Add real-time waveform preview showing processed output"
      },
      {
        type: 'feature',
        "description": "Completely rewrite AmigaPalModal UI to match original 1:1"
      },
      {
        type: 'fix',
        "description": "Stale sample playing after loading new sample from pack browser"
      },
      {
        type: 'fix',
        "description": "Preset preview not playing on first click in LoadPresetModal"
      },
      {
        type: 'fix',
        "description": "Complete 1:1 AmigaPal port with all features and bug fixes"
      },
      {
        type: 'feature',
        "description": "Integrate AmigaPal 8-bit conversion into sample editor"
      },
      {
        type: 'fix',
        "description": "Make error messages selectable in file dialog"
      },
      {
        type: 'fix',
        "description": "Use absolute paths and public endpoint for file reading"
      },
      {
        type: 'improvement',
        "description": "Chore: ignore .env files"
      },
      {
        type: 'feature',
        "description": "Add local development support for demo file browsing"
      },
      {
        type: 'fix',
        "description": "Prevent FileBrowser infinite re-render loop causing flickering"
      },
      {
        type: 'fix',
        "description": "Correct production API URL fallback in serverFS"
      },
      {
        type: 'fix',
        "description": "Broken waveform + missing neural upscaler in enhancer panel"
      },
      {
        type: 'fix',
        "description": "IOS audio unlock, clean initial state, instrument ID fixes, checkbox focus"
      }
    ]
  },
  {
    version: '2026-02-17',
    date: '2026-02-17',
    changes: [
      {
        type: 'fix',
        "description": "Fix CI build: remove unused vars, iOS audio unlock, ONNX WASM loading, instrument persistence, sample editor rewrite"
      },
      {
        type: 'feature',
        "description": "IOS audio unlock via silent MP3 to bypass mute switch"
      },
      {
        type: 'fix',
        "description": "Prevent setCurrentPattern -> jumpToPattern -> seekTo timeline reset"
      },
      {
        type: 'fix',
        "description": "Refactor scheduler to BassoonTracker continuous timeline pattern"
      },
      {
        type: 'fix',
        "description": "Eliminate cumulative timing drift (~100ms/pattern)"
      },
      {
        type: 'fix',
        "description": "Debug: add stack trace to BPM change detection in scheduler loop"
      },
      {
        type: 'fix',
        "description": "Debug: add startTime, totalTicksScheduled, formula check to drift log"
      },
      {
        type: 'fix',
        "description": "Debug: add drift diagnostic logs to find scheduler reset source"
      },
      {
        type: 'fix',
        "description": "Eliminate 107ms/pattern timing drift caused by false song reloads"
      },
      {
        type: 'fix',
        "description": "Improve drift diagnostics with scheduled time & tick counting"
      },
      {
        type: 'fix',
        "description": "Timing drift - sync BPM/speed on load, remove processTick BPM override"
      },
      {
        type: 'fix',
        "description": "Full state reset when loading new song prevents broken playback"
      },
      {
        type: 'fix',
        "description": "Furnace 2nd effect column + scheduler BPM timing"
      },
      {
        type: 'fix',
        "description": "Pattern break 0Dxx uses hex for XM/Furnace, BCD only for MOD"
      },
      {
        type: 'fix',
        "description": "Implement Furnace speed1/speed2 alternation for correct timing"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog"
      },
      {
        type: 'fix',
        "description": "Sync normalDecay with filterEnvelope.decay across all TB-303 presets"
      },
      {
        type: 'fix',
        "description": "All knobs now responsive - use refs to prevent stale closures in effect/TB303 knob handlers"
      },
      {
        type: 'fix',
        "description": "TB-303 Decay knob now updates devilFish.normalDecay"
      }
    ]
  },
  {
    version: '2026-02-16',
    date: '2026-02-16',
    changes: [
      {
        type: 'fix',
        "description": "Correct parameter ranges to 0-1 normalized values matching DB303 site rip. All knobs were using Hz/ms/% ranges instead of 0-1, causing values to clamp at 1.0. Decay knob now syncs devilFish.normalDecay to prevent applyConfig() from overriding it. Added auto-instrument detection and dropdown for multiple 303s."
      },
      {
        type: 'fix',
        "description": "Use Zustand selectors to properly track pattern changes in piano roll"
      },
      {
        type: 'fix',
        "description": "Debug: add comprehensive logging to diagnose piano roll interaction issues"
      },
      {
        type: 'fix',
        "description": "Velocity lane now shows full width with helpful empty state"
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
