/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-22T12:15:10.791Z
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
export const BUILD_VERSION = '1.0.3205';
export const BUILD_NUMBER = '3205';
export const BUILD_HASH = '4c0274633';
export const BUILD_DATE = '2026-03-22';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.3205',
    date: '2026-03-22',
    changes: [
      {
        type: 'fix',
        "description": "Preserve native engine data in .dbx roundtrip for all formats"
      },
      {
        type: 'fix',
        "description": "Eagerly warm up mute imports so first click works"
      }
    ]
  },
  {
    version: '2026-03-21',
    date: '2026-03-21',
    changes: [
      {
        type: 'improvement',
        "description": "Chore: latest Pink Trombone + format state updates"
      },
      {
        type: 'improvement',
        "description": "Chore: engine and synth updates from concurrent agents"
      },
      {
        type: 'feature',
        "description": "Speech synth updates, export dialog, file loader improvements"
      },
      {
        type: 'fix',
        "description": "Fix mute/solo — replace require() with async import()"
      },
      {
        type: 'fix',
        "description": "Chore: add Steve Turner WASM debug/test source files"
      },
      {
        type: 'improvement',
        "description": "Chore: update song exports and format audit state"
      },
      {
        type: 'improvement',
        "description": "Furnace pattern parser cleanup + tracker store updates"
      },
      {
        type: 'feature',
        "description": "Relax Amiga format detection — support both prefix and Modland extension naming (137 total, 0 failures)"
      },
      {
        type: 'feature',
        "description": "PinkTrombone synth, Furnace fixes, parser improvements, format test files"
      },
      {
        type: 'feature',
        "description": "Add PT36, AMF, STX, DSYM, PTM exports (129 total, 0 failures)"
      },
      {
        type: 'fix',
        "description": "Envelope timing and format identification"
      },
      {
        type: 'feature',
        "description": "Add IFF-SMUS + Music Maker 8V exports (124 total, 0 failures)"
      },
      {
        type: 'fix',
        "description": "Cache-bust worklet URL to prevent stale audio code"
      },
      {
        type: 'fix',
        "description": "Remove double sv_stop() that put engine in standby mode"
      },
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
