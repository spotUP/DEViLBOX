/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-21T00:30:53.044Z
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
export const BUILD_VERSION = '1.0.3189';
export const BUILD_NUMBER = '3189';
export const BUILD_HASH = '1f50ed6f9';
export const BUILD_DATE = '2026-03-21';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.3189',
    date: '2026-03-21',
    changes: [
      {
        type: 'feature',
        "description": "Add 5 more format exports (122 total, 0 failures)"
      },
      {
        type: 'feature',
        "description": "Add 12 more format exports (117 total, 0 failures)"
      },
      {
        type: 'feature',
        "description": "Add 26 more format exports (105 total, 0 failures)"
      },
      {
        type: 'fix',
        "description": "Debug(sunvox): add mute/solo routing debug logs"
      },
      {
        type: 'feature',
        "description": "Add Synthesis format export (79 formats, 0 failures)"
      },
      {
        type: 'feature',
        "description": "Add CustomMade + Anders0land exports (78 formats, 0 failures)"
      },
      {
        type: 'feature',
        "description": "Add original DigiBooster 1.x parser (76 exportable formats)"
      },
      {
        type: 'fix',
        "description": "Debug(sunvox): add mute/solo debug logging to trace routing"
      },
      {
        type: 'fix',
        "description": "Improve lock-step command comparator"
      },
      {
        type: 'fix',
        "description": "Off-by-one in year field offset (203→202), enabling GT2 export"
      },
      {
        type: 'feature',
        "description": "Integrate eSpeak-NG for modern text-to-phoneme analysis"
      }
    ]
  },
  {
    version: '2026-03-20',
    date: '2026-03-20',
    changes: [
      {
        type: 'fix',
        "description": "Simple 1:1 pattern mapping instead of timeline linearization"
      },
      {
        type: 'fix',
        "description": "Proper timeline linearization for pattern display"
      },
      {
        type: 'feature',
        "description": "Add OctaMED + StartrekkerAM encoders and exporters"
      },
      {
        type: 'feature',
        "description": "10 refinements — question intonation, pauses, +40 words"
      },
      {
        type: 'fix',
        "description": "Update votrax phoneme map"
      },
      {
        type: 'fix',
        "description": "Update exporter"
      },
      {
        type: 'fix',
        "description": "Phoneme map and reciter improvements"
      },
      {
        type: 'improvement',
        "description": "Chore: clean up mame-wasm build artifacts, update tools and generated files"
      },
      {
        type: 'feature',
        "description": "XM synth export fixes + 29 new exportable formats (74 total)"
      },
      {
        type: 'fix',
        "description": "Tracker rendering and store improvements"
      },
      {
        type: 'fix',
        "description": "Rename unused FRICATIVES variable for linter"
      },
      {
        type: 'fix',
        "description": "Improve FuturePlayer, SidMon1, FredEditor, Symphonie parsers"
      },
      {
        type: 'feature',
        "description": "Vowel reduction, aspiration, energy envelopes, more words"
      },
      {
        type: 'feature',
        "description": "Add SAM reciter exception dictionary"
      },
      {
        type: 'feature',
        "description": "Sentence intonation, diphthong glides, CV energy ramps"
      },
      {
        type: 'feature',
        "description": "Add prosody (pitch/stress variation) to all speech synths"
      },
      {
        type: 'improvement',
        "description": "Chore: multi-agent updates — speech synths, exports, format audit state"
      },
      {
        type: 'fix',
        "description": "Mute/solo, speed, looping, note preview, live params"
      },
      {
        type: 'feature',
        "description": "SP0250 frame buffer TTS + MEA8000 coarticulation"
      },
      {
        type: 'fix',
        "description": "Stop filtering out unvoiced consonants from TTS"
      },
      {
        type: 'feature',
        "description": "Add coarticulation transitions to TTS"
      },
      {
        type: 'fix',
        "description": "Remove unused imports and VOWEL_FRAMES"
      },
      {
        type: 'feature',
        "description": "Per-phoneme LPC coefficients for TTS"
      },
      {
        type: 'feature',
        "description": "Frame buffer TTS for VLM5030 + phrase builder for all"
      },
      {
        type: 'fix',
        "description": "Fix note=12 octave bug in old format patterns and CFLG merge"
      },
      {
        type: 'fix',
        "description": "Boost ROM speech output level (4x)"
      },
      {
        type: 'fix',
        "description": "Prevent infinite render loop from _updateRomStatus"
      },
      {
        type: 'fix',
        "description": "Guard worklet message handler against disposed synth"
      },
      {
        type: 'fix',
        "description": "Extract waveforms from sample data for DM1/DM2"
      },
      {
        type: 'improvement',
        "description": "Chore: update aces_high export and synth-prerender tool"
      },
      {
        type: 'fix',
        "description": "Remaining unstaged changes (loader, mixer, export tool)"
      },
      {
        type: 'fix',
        "description": "Decode data URL fallback for instruments without audioBuffer"
      },
      {
        type: 'fix',
        "description": "Add Steve Turner format to unified file loader"
      },
      {
        type: 'fix',
        "description": "Add Steve Turner engine to active gain engine routing"
      },
      {
        type: 'fix',
        "description": "Update instrument store _romsLoaded after auto-load"
      },
      {
        type: 'improvement',
        "description": "Chore: update MOD export files"
      },
      {
        type: 'fix',
        "description": "20ms envelope window and lock-step command comparator"
      },
      {
        type: 'fix',
        "description": "Worklet rendering improvements"
      },
      {
        type: 'feature',
        "description": "Add HC55516, S14001A, and VLM5030 WASM synths"
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
