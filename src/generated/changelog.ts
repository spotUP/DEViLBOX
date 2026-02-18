/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-18T21:05:16.858Z
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
export const BUILD_VERSION = '1.0.878';
export const BUILD_NUMBER = '878';
export const BUILD_HASH = 'eeded8f9';
export const BUILD_DATE = '2026-02-18';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.878',
    date: '2026-02-18',
    changes: [
      {
        type: 'fix',
        "description": "Remove unused Tone import from DJPitchSlider"
      },
      {
        type: 'fix',
        "description": "Coordinate DJ pitch slider with PatternScheduler for accurate BPM control"
      },
      {
        type: 'fix',
        "description": "Center collapsed channels correctly to prevent content shift"
      },
      {
        type: 'fix',
        "description": "Use opaque concave gradient on DJ pitch slider handle"
      },
      {
        type: 'fix',
        "description": "Remove unused chColor variable"
      },
      {
        type: 'fix',
        "description": "Correct TypeScript errors in collapsed channel code"
      },
      {
        type: 'feature',
        "description": "Extend DJ pitch slider range to ±16 semitones"
      },
      {
        type: 'fix',
        "description": "Update pitch slider scale to match ±12 semitone range"
      },
      {
        type: 'fix',
        "description": "Overlap scale onto housing so ticks sit flush against slider"
      },
      {
        type: 'fix',
        "description": "Show note column when channels are collapsed"
      },
      {
        type: 'feature',
        "description": "Add collapse/expand button to channel headers"
      },
      {
        type: 'fix',
        "description": "Add setGlobalPitchShift to TickResult type"
      },
      {
        type: 'fix',
        "description": "Remove vertical scrollbar from channel headers"
      },
      {
        type: 'fix',
        "description": "Replace ugly light blue focus border with discrete themed ring"
      },
      {
        type: 'fix',
        "description": "Move pitch slider scale flush against housing using absolute positioning"
      },
      {
        type: 'fix',
        "description": "Sync effect string field when typing effect commands"
      },
      {
        type: 'fix',
        "description": "Remove duplicate center tick from pitch slider housing"
      },
      {
        type: 'fix',
        "description": "Widen pitch slider groove line to 3px"
      },
      {
        type: 'fix',
        "description": "Darken pitch slider groove line to near-black"
      },
      {
        type: 'fix',
        "description": "Remove housing border from DJ pitch slider"
      },
      {
        type: 'feature',
        "description": "Add SL-1200 style scale to DJ pitch slider"
      },
      {
        type: 'feature',
        "description": "Restyle DJ pitch slider as Technics SL-1200 fader"
      },
      {
        type: 'fix',
        "description": "Hide spurious vertical scrollbar in pattern editor"
      },
      {
        type: 'fix',
        "description": "Align input caret with centered channel content"
      },
      {
        type: 'feature',
        "description": "Add Wxx tracker effect for global pitch shift"
      },
      {
        type: 'fix',
        "description": "Widen DJ pitch slider to center thumb correctly"
      },
      {
        type: 'feature',
        "description": "Add right-click to reset DJ pitch slider"
      },
      {
        type: 'fix',
        "description": "Center DJ pitch slider zero marker vertically"
      },
      {
        type: 'fix',
        "description": "Make DJ pitch slider fill full tracker height"
      },
      {
        type: 'fix',
        "description": "Move DJ pitch slider from toolbar to between pattern editor and instrument list"
      },
      {
        type: 'feature',
        "description": "Add DJ pitch slider to transport toolbar"
      },
      {
        type: 'feature',
        "description": "Add MPC/SP-1200 style sample resampler"
      },
      {
        type: 'fix',
        "description": "Filter modules.json from demo list and disable BLEP by default"
      },
      {
        type: 'feature',
        "description": "Add TD-3 patterns category to demo songs"
      },
      {
        type: 'fix',
        "description": "Handle disconnect errors in BLEP audio chain connection"
      },
      {
        type: 'fix',
        "description": "Add MIDI file import handler to prevent JSON parse error"
      },
      {
        type: 'feature',
        "description": "Add global BLEP synthesis for authentic Amiga sound"
      },
      {
        type: 'feature',
        "description": "Add 50+ Amiga sample presets from ST-01/ST-02 packs"
      },
      {
        type: 'feature',
        "description": "Add ST-01 and ST-02 Amiga sample packs (247 samples)"
      },
      {
        type: 'feature',
        "description": "Implement reference-based slicing for massive memory savings"
      },
      {
        type: 'improvement',
        "description": "Chore: update auto-generated changelog"
      },
      {
        type: 'fix',
        "description": "Eliminate audio context startup warnings with patient retry logic"
      },
      {
        type: 'fix',
        "description": "Ensure audio context started in auto-preview hook"
      },
      {
        type: 'fix',
        "description": "Show beat slices on waveform even when panel closed"
      },
      {
        type: 'fix',
        "description": "Verify audio context is running before instrument preview"
      },
      {
        type: 'fix',
        "description": "Create new instrument when loading sample with no current instrument"
      },
      {
        type: 'feature',
        "description": "Complete beat slicer implementation with manual mode, deletion, and visual enhancements"
      },
      {
        type: 'improvement',
        "description": "Add comprehensive Ami-Sampler resample algorithm audit"
      },
      {
        type: 'feature',
        "description": "Integrate AmigaPal with tracker's status message system"
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
