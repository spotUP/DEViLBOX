/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-16T19:56:39.213Z
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
export const BUILD_VERSION = '1.0.5443';
export const BUILD_NUMBER = '5443';
export const BUILD_HASH = '9ce132d80';
export const BUILD_DATE = '2026-04-16';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.5443',
    date: '2026-04-16',
    changes: [
      {
        type: 'fix',
        "description": "Fix LFO beat sync and anti-click ramps"
      },
      {
        type: 'improvement',
        "description": "Set stereo defaults to rich mono: PT2 25%, ModPlug 50/200"
      },
      {
        type: 'improvement',
        "description": "Auto-select DJ knob page based on playing deck"
      },
      {
        type: 'fix',
        "description": "Fix PT2 stereo slider live update during libopenmpt playback"
      },
      {
        type: 'fix',
        "description": "Show DJ MIDI knob assignments in status bar + fix EQ MIDI range"
      },
      {
        type: 'fix',
        "description": "Fix live stereo separation: apply config changes to running module"
      },
      {
        type: 'fix',
        "description": "Fix master audio chain: stereo downmix and limiter coloring"
      },
      {
        type: 'fix',
        "description": "Fix DJ pause immediately resuming: pause Auto DJ guard on manual stop"
      },
      {
        type: 'fix',
        "description": "Fix AdPlug hybrid notes: enable fireHybridNotesForRow in position callback"
      },
      {
        type: 'fix',
        "description": "Fix pure synth songs not playing after TS sequencer removal"
      },
      {
        type: 'fix',
        "description": "Remove PitchShift/key lock, fix PTT/Space, fix DJ libopenmpt routing"
      },
      {
        type: 'fix',
        "description": "Remove AmigaFilter from audio chain entirely"
      },
      {
        type: 'fix',
        "description": "Fix scratch accumulation: direction-switch cooldown + faster gain transitions"
      },
      {
        type: 'fix',
        "description": "Clean audio defaults — bypass AmigaFilter, widen stereo, soften limiter"
      },
      {
        type: 'feature',
        "description": "DJ view polish — EQ knobs, playlist preview/FX, Auto DJ resilience"
      },
      {
        type: 'fix',
        "description": "Worklet config merge preserves repeatCount=-1 (song looping)"
      },
      {
        type: 'feature',
        "description": "DJ Complete drumpad preset + fix LFO reschedule BPM sync"
      },
      {
        type: 'fix',
        "description": "Eliminate deferred stop race causing intermittent silent playback"
      },
      {
        type: 'feature',
        "description": "Add fader cuts to Baby/Tear scratches, convert EQ mute to hold-down"
      },
      {
        type: 'fix',
        "description": "Fix Transformer/Crab fader (Signal override), tune Chirp/Stab timing"
      },
      {
        type: 'fix',
        "description": "Fix baby scratch pause: tighter dead zone + steeper zero-crossings"
      },
      {
        type: 'improvement',
        "description": "Revert \"Double scratch pattern speed — all patterns now 2× faster\""
      },
      {
        type: 'fix',
        "description": "Fix osl_create_new: set up order list + fix osl_set_order OOB write"
      },
      {
        type: 'improvement',
        "description": "Double scratch pattern speed — all patterns now 2× faster"
      },
      {
        type: 'improvement',
        "description": "Beat-sync all scratch patterns to BPM and beat grid"
      },
      {
        type: 'feature',
        "description": "Add scratch actions to drum pads with hold-to-scratch semantics"
      },
      {
        type: 'fix',
        "description": "Fix empty song ending immediately: set up order list for fresh XM"
      },
      {
        type: 'improvement',
        "description": "Improve baby scratch: hold to loop, graceful release"
      },
      {
        type: 'fix',
        "description": "Fix source accumulation in scratch monkey-patch and playlist bad-flag persistence"
      },
      {
        type: 'fix',
        "description": "Fix silent synth playback + 4 SynthEffectProcessor bugs"
      },
      {
        type: 'fix',
        "description": "Fix DJ scratch creating two offset copies of the song"
      },
      {
        type: 'improvement',
        "description": "Slim ChannelState: remove 46 dead fields, delete orphaned EffectHandlers.ts"
      },
      {
        type: 'improvement',
        "description": "Restore turntable-style stop in tracker view"
      },
      {
        type: 'improvement',
        "description": "Save and restore built-in sample pack references in DJ environment"
      },
      {
        type: 'feature',
        "description": "SynthEffectProcessor — tick-level effects for hybrid synth instruments"
      },
      {
        type: 'improvement',
        "description": "Save full DJ environment with playlists (drumpads, master FX, settings)"
      },
      {
        type: 'fix',
        "description": "Fix Mix Now UI freeze: skip waveform peak recomputation for pre-rendered tracks"
      },
      {
        type: 'improvement',
        "description": "Remove dead TS sequencer code from TrackerReplayer (~2800 lines)"
      },
      {
        type: 'feature',
        "description": "Add headphone cue setup wizard for DJ view"
      },
      {
        type: 'fix',
        "description": "Fix Auto DJ Analyze button not working for local files"
      },
      {
        type: 'fix',
        "description": "Fix sweeps to sweep back at same speed as sweep in"
      },
      {
        type: 'fix',
        "description": "Fix beat jumps: use detectedBPM, bigger jump amounts"
      },
      {
        type: 'fix',
        "description": "Fix deck brake to use setDeckPitch with rAF animation"
      },
      {
        type: 'improvement',
        "description": "Group deck FX actions into dedicated Deck FX category"
      },
      {
        type: 'fix',
        "description": "Treat zero-duration module as warning, not fatal error"
      },
      {
        type: 'improvement',
        "description": "Rewrite stutter FX to use LFO gate instead of broken delay loop"
      },
      {
        type: 'feature',
        "description": "Add fade-out and filter sweep-down to noise riser on release"
      },
      {
        type: 'fix',
        "description": "Fix confirm dialog colors to use design tokens, remove Empty Kit"
      },
      {
        type: 'fix',
        "description": "Fix drumpad programs resurrecting after delete"
      },
      {
        type: 'fix',
        "description": "Stop button actually stops instead of restarting from pos 0"
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
