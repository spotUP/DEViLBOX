/**
 * Auto-generated changelog from git commits
 * Generated: 2026-10-02T19:26:09.994Z
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
export const BUILD_VERSION = '1.0.7633';
export const BUILD_NUMBER = '7633';
export const BUILD_HASH = '9a375ce7a';
export const BUILD_DATE = '2026-10-02';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.7633',
    date: '2026-10-02',
    changes: [
      {
        type: 'improvement',
        "description": "Test(dub): register the rig's suspends a tick before rendering"
      },
      {
        type: 'fix',
        "description": "Keep test files out of Tailwind's content scan"
      },
      {
        type: 'improvement',
        "description": "Test(dub): render the real DubBus offline and assert on its audio"
      },
      {
        type: 'fix',
        "description": "Close the siren feedback loop through one block of delay"
      },
      {
        type: 'fix',
        "description": "The wet make-up lives on the wet chain, not in the Return knob"
      },
      {
        type: 'fix',
        "description": "The 'drums' sidechain key follows the song, not its pattern count"
      },
      {
        type: 'fix',
        "description": "Measure_dub_knob keeps probe values off the store; adds the tail probe"
      },
      {
        type: 'fix',
        "description": "DJ Kill All writes only enabled:false, never the levels"
      },
      {
        type: 'improvement',
        "description": "Handoff: dub bus dead-control hunt, root causes and tracing"
      },
      {
        type: 'improvement',
        "description": "Let Auto Dub actually fire the transport tape stop"
      },
      {
        type: 'improvement',
        "description": "Dub bus: restore panic levels, plate reachability, hold buttons, sub modes"
      },
      {
        type: 'improvement',
        "description": "Relabel the dub bus return-mute from Tape Stop to Dub Mute"
      },
      {
        type: 'fix',
        "description": "Add measure_dub_knob: A/B a dub knob against fixed pink noise"
      },
      {
        type: 'improvement',
        "description": "Report the dub bus as desired vs actual instead of one flat bag"
      },
      {
        type: 'improvement',
        "description": "Feed an enabled dub bus so its controls are not silently inert"
      },
      {
        type: 'improvement',
        "description": "Re-enable the dub bus after a panic instead of leaving it dead"
      }
    ]
  },
  {
    version: '2026-10-01',
    date: '2026-10-01',
    changes: [
      {
        type: 'improvement',
        "description": "Add the live measurement-probe evidence to PR 79"
      },
      {
        type: 'improvement',
        "description": "Record PR 79 description for the dub bus dead-return fix"
      },
      {
        type: 'fix',
        "description": "A bus saved with its return closed comes back dead"
      }
    ]
  },
  {
    version: '2026-09-30',
    date: '2026-09-30',
    changes: [
      {
        type: 'improvement',
        "description": "Vendor 1.3.11 release notes, feed and screenshots"
      },
      {
        type: 'improvement',
        "description": "Chore: refresh format state, changelog and file manifest"
      },
      {
        type: 'improvement',
        "description": "Test(effects): scratch SwedishChainsaw render harness (PRESETS env driven)"
      },
      {
        type: 'improvement',
        "description": "Chore(audit): master FX response and preset frequency audit data, probe tools"
      },
      {
        type: 'fix',
        "description": "Arm register capture on word/long chip writes - entry.c def pending"
      },
      {
        type: 'improvement',
        "description": "Idle audio graph - per-node attribution from chrome tracing"
      },
      {
        type: 'fix',
        "description": "Measure dub echo taps at the engine output, not the master return"
      },
      {
        type: 'fix',
        "description": "Auto Dub's starting sends low enough for the moves to be heard"
      },
      {
        type: 'feature',
        "description": "Every dub move fire is measured and logged"
      },
      {
        type: 'fix',
        "description": "The bus return opens after a reload; the siren is heard"
      },
      {
        type: 'fix',
        "description": "The bus return survives the boot swap; Auto Dub seeds its sends on every start"
      },
      {
        type: 'fix',
        "description": "Playing an AHX instrument plays the instrument, not the song"
      },
      {
        type: 'fix',
        "description": "The Oomek Aggressor 3o3 shows its editor"
      },
      {
        type: 'fix',
        "description": "One preset list, a generator by default, no self-starting drones"
      },
      {
        type: 'improvement',
        "description": "Cosmic confirmed by the owner; Buzz status"
      },
      {
        type: 'fix',
        "description": "Cosmic swirls instead of stuttering"
      },
      {
        type: 'fix',
        "description": "Buzz generators start with their preset / saved settings"
      },
      {
        type: 'fix',
        "description": "A Buzz generator plays the note that started its engine"
      },
      {
        type: 'improvement',
        "description": "Master FX ledger - owner reports O1-O15 status"
      },
      {
        type: 'fix',
        "description": "Vinyl and Tumult noise runs while a song plays"
      },
      {
        type: 'fix',
        "description": "Big Muff Doom out of the jar; the meter reports octave bands"
      },
      {
        type: 'fix',
        "description": "Big Room sounds like a big room"
      },
      {
        type: 'fix',
        "description": "Delay times, distortion drive and Spacey Delay reach their effects"
      },
      {
        type: 'fix',
        "description": "Aelapse Dub runs its delay and springs"
      },
      {
        type: 'fix',
        "description": "Crack, siren and radio riser louder"
      },
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
