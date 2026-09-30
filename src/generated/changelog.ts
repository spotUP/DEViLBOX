/**
 * Auto-generated changelog from git commits
 * Generated: 2026-09-30T11:54:22.183Z
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
export const BUILD_VERSION = '1.0.7587';
export const BUILD_NUMBER = '7587';
export const BUILD_HASH = '49556bb4f';
export const BUILD_DATE = '2026-09-30';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.7587',
    date: '2026-09-30',
    changes: [
      {
        type: 'fix',
        "description": "Tool schemas valid for zod 4 - the tool list loads again"
      },
      {
        type: 'fix',
        "description": "The make-up writer finds double-quoted preset names"
      },
      {
        type: 'fix',
        "description": "Drive, amp and dynamics presets levelled after the wet-path move"
      },
      {
        type: 'fix',
        "description": "Drive and amp corrections on the wet signal; late worklet messages ignored"
      },
      {
        type: 'fix',
        "description": "The RE-201 shares the bus's intensity over its heads"
      },
      {
        type: 'fix',
        "description": "Measure_dub_echo_response fires moves and releases held ones"
      },
      {
        type: 'fix',
        "description": "Every persona sets its own chain order and head mode"
      },
      {
        type: 'fix',
        "description": "Echo engines trimmed to unity, not down to the quietest"
      },
      {
        type: 'fix',
        "description": "The chain order button says what it does"
      },
      {
        type: 'fix',
        "description": "RE-201 modes named as the engine runs them; the bus default is head 1"
      },
      {
        type: 'feature',
        "description": "Measure_dub_echo_response - the dub echo's impulse response"
      },
      {
        type: 'fix',
        "description": "Master effects aimed at channels play on Hively and UADE songs"
      },
      {
        type: 'fix',
        "description": "The amp models add their input back, as they were trained"
      },
      {
        type: 'fix',
        "description": "Removed TapeDelay, ToneArm, Tumult and VinylNoise stop their processors"
      },
      {
        type: 'fix',
        "description": "A removed guitar amp model stops its audio processor"
      },
      {
        type: 'feature',
        "description": "Measure_master_effect reports the effect's polarity"
      },
      {
        type: 'fix',
        "description": "Radiowave and two RE-201 presets levelled on music"
      },
      {
        type: 'fix',
        "description": "Every guitar amp model comes out at its input's level"
      },
      {
        type: 'feature',
        "description": "Measure_master_effect can measure on the playing song"
      },
      {
        type: 'fix',
        "description": "Master FX preset make-ups measured on the calibrated effects"
      },
      {
        type: 'feature',
        "description": "Measure_master_effect measures whole preset chains"
      },
      {
        type: 'fix',
        "description": "The four echo engines come out at the same level"
      },
      {
        type: 'fix',
        "description": "Calibrate delays, reverbs and modulation in their wet path"
      },
      {
        type: 'fix',
        "description": "The RE-Tape Echo engine no longer self-oscillates at high intensity"
      },
      {
        type: 'fix',
        "description": "An echo-engine swap restores the bus input the bus should have now"
      },
      {
        type: 'fix',
        "description": "The liquid sweep colours without adding level; measure_dub_bus_stages"
      },
      {
        type: 'improvement',
        "description": "Test(dub): compressor-bypass contract reads the named sidechain ratio"
      },
      {
        type: 'improvement',
        "description": "Test(ci): run this session's regression tests in test:ci"
      },
      {
        type: 'fix',
        "description": "Leaving a scratch restores note suppression - the pattern scrolls again"
      },
      {
        type: 'fix',
        "description": "One control per setting on screen; a twist ends a held drone"
      },
      {
        type: 'fix',
        "description": "Wet stages pass level through - the return no longer drowns the mix"
      },
      {
        type: 'fix',
        "description": "The pattern scrolls again after a scratch"
      },
      {
        type: 'fix',
        "description": "Encoders with a held press turn like every other knob"
      },
      {
        type: 'fix',
        "description": "Master BASS adds or removes bass on the whole mix - nothing else"
      },
      {
        type: 'fix',
        "description": "The bus HPF knob filters the bus, not the whole song"
      },
      {
        type: 'improvement',
        "description": "One parse path + Amiga notes - 22 of 23, live check done"
      },
      {
        type: 'fix',
        "description": "One MOD writer - exportAsMOD is exportSongToMOD"
      }
    ]
  },
  {
    version: '2026-09-29',
    date: '2026-09-29',
    changes: [
      {
        type: 'fix',
        "description": "One parse per format - the tracker and the DJ decks open the same song"
      },
      {
        type: 'fix',
        "description": "One note naming for every Amiga period - ProTracker's"
      },
      {
        type: 'feature',
        "description": "The song lights up its instruments and moves the editor playhead"
      },
      {
        type: 'fix',
        "description": "A MOD note's speed comes from its period, not its number"
      },
      {
        type: 'fix',
        "description": "Judge a drum as the song plays it, and within its kit"
      },
      {
        type: 'fix',
        "description": "One role chip, slot numbers, no redundant PCM badge"
      },
      {
        type: 'fix',
        "description": "Opening the editor no longer switches an imported loop off"
      },
      {
        type: 'feature',
        "description": "Owner instrument labels as evidence, in the list and over MCP"
      },
      {
        type: 'fix',
        "description": "Instruments keep the slot number the pattern cells name"
      },
      {
        type: 'feature',
        "description": "Instrument-first song analyzer"
      },
      {
        type: 'fix',
        "description": "Changes under __tests__ no longer reload the app tab"
      },
      {
        type: 'improvement',
        "description": "Test(classifier): labelled corpus and a scored accuracy ratchet"
      },
      {
        type: 'improvement',
        "description": "The replayer's song is liveTrackerSong"
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
