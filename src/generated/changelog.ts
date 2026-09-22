/**
 * Auto-generated changelog from git commits
 * Generated: 2026-09-22T18:42:10.735Z
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
export const BUILD_VERSION = '1.0.7255';
export const BUILD_NUMBER = '7255';
export const BUILD_HASH = 'fc6cce436';
export const BUILD_DATE = '2026-09-22';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.7255',
    date: '2026-09-22',
    changes: [
      {
        type: 'fix',
        "description": "A scan that recovered no waveform does not become a playable grid"
      },
      {
        type: 'improvement',
        "description": "CF-9 result — all seven songs play, four bugs fixed on the way"
      },
      {
        type: 'fix',
        "description": "The FT2 toolbar is as tall as its rows, so wrapped rows stop painting over the controls beneath"
      },
      {
        type: 'fix',
        "description": "Jochen Hippel 7V — native grid, UADE audio, TFMX decoder out of the way"
      },
      {
        type: 'fix',
        "description": "Jochen Hippel 7V plays through UADE"
      },
      {
        type: 'fix',
        "description": "A subsong scan may hold the audio thread for fifteen seconds, not ten minutes"
      },
      {
        type: 'improvement',
        "description": "Log the 33-route companion fix and the play-time freeze"
      },
      {
        type: 'fix',
        "description": "Every UADE route hands over the companion files"
      },
      {
        type: 'feature',
        "description": "A refused load_file reports the companions it received"
      },
      {
        type: 'fix',
        "description": "A sample directory is never count-capped — those files are the instrument set"
      },
      {
        type: 'improvement',
        "description": "Execution log through CF-8 and the .adsc finding"
      },
      {
        type: 'fix',
        "description": "An Audio Sculpture .adsc with its .as beside it goes to UADE"
      },
      {
        type: 'feature',
        "description": "Get_format_state lists the UADE companions actually registered"
      },
      {
        type: 'feature',
        "description": "Every load path asks the companion resolver"
      },
      {
        type: 'feature',
        "description": "One companion resolver for two-file Amiga formats"
      },
      {
        type: 'improvement',
        "description": "Record the owner's three decisions on the companion plan"
      },
      {
        type: 'improvement',
        "description": "Research and plan for one companion resolver across every load path"
      },
      {
        type: 'improvement',
        "description": "The BUS tab says which controls shape the mix and which the wet return"
      },
      {
        type: 'improvement',
        "description": "Test(nav): the transport-row contract expects Load on the App-level browser"
      },
      {
        type: 'fix',
        "description": "A test tone stops by itself, and can be stopped"
      },
      {
        type: 'fix',
        "description": "Load works while the Dub Deck is open"
      },
      {
        type: 'improvement',
        "description": "Record the crossover measurements"
      },
      {
        type: 'fix',
        "description": "Give the saturated low band room — ceiling 0.5, ride target just under the clipper knee"
      },
      {
        type: 'feature',
        "description": "The BASS control is a low-band saturator, not a shelf"
      },
      {
        type: 'fix',
        "description": "The ride spends punch before bass, and a ridden shelf cannot hand headroom back to the punch"
      },
      {
        type: 'fix',
        "description": "The ride answers only for what the boost adds"
      },
      {
        type: 'fix',
        "description": "The ride spends the bass boost before it touches the rest of the mix"
      },
      {
        type: 'improvement',
        "description": "Record the AutoDub follow-through measurements"
      },
      {
        type: 'fix',
        "description": "The riders move like a hand on a fader, and the return is kept under the music"
      },
      {
        type: 'fix',
        "description": "The master trim is ridden from what the clipper actually receives"
      },
      {
        type: 'fix',
        "description": "The weight band sits under the bass, and the return is trimmed like the dry"
      },
      {
        type: 'fix',
        "description": "The BASS control cuts the low mids as it lifts the low end"
      },
      {
        type: 'fix',
        "description": "The BASS control at its top no longer clips, and the echo return stays out of the low-end lift"
      },
      {
        type: 'improvement',
        "description": "Record the live BASS sweep against the low-band plan"
      },
      {
        type: 'feature',
        "description": "The BASS control gets heavy the whole way up"
      },
      {
        type: 'fix',
        "description": "The BASS control reaches the low end it is boosting"
      },
      {
        type: 'fix',
        "description": "The BASS slider works across its whole travel, and gets heavy"
      },
      {
        type: 'improvement',
        "description": "Chore(dub): probe the master-insert chain stage by stage"
      },
      {
        type: 'fix',
        "description": "Unblock the push — three suites the full run caught"
      },
      {
        type: 'improvement',
        "description": "Chore(dub): expose bus input and return in the compact probe"
      },
      {
        type: 'fix',
        "description": "The bus learns its settings without a component on screen"
      },
      {
        type: 'feature',
        "description": "Move the vinyl control in with the other bus sliders"
      },
      {
        type: 'feature',
        "description": "BassEmphasis — make the bass line already playing hit harder"
      },
      {
        type: 'fix',
        "description": "A hand on the fader wins"
      },
      {
        type: 'improvement',
        "description": "One definition of \"mobile\" — Phase 0"
      },
      {
        type: 'fix',
        "description": "A window resize must not change the audio graph"
      },
      {
        type: 'improvement',
        "description": "Record the six shape decisions the user answered"
      },
      {
        type: 'feature',
        "description": "Decide whether this is a bass-feature moment"
      },
      {
        type: 'fix',
        "description": "Make the Audition button say when it cannot do anything"
      },
      {
        type: 'fix',
        "description": "Load a song with the dub sends down"
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
