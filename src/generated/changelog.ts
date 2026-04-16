/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-16T13:15:45.354Z
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
export const BUILD_VERSION = '1.0.5416';
export const BUILD_NUMBER = '5416';
export const BUILD_HASH = 'ea76c99d8';
export const BUILD_DATE = '2026-04-16';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.5416',
    date: '2026-04-16',
    changes: [
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
      },
      {
        type: 'fix',
        "description": "Fix drum pad grid to fill viewport without scrolling"
      },
      {
        type: 'fix',
        "description": "Fix DJ vocoder settings panel not opening on click"
      },
      {
        type: 'fix',
        "description": "Remove test-songs from git, deploy separately via Hetzner scripts"
      },
      {
        type: 'fix',
        "description": "Fix Pink Trombone note-off: engine passes time, not note"
      },
      {
        type: 'fix',
        "description": "Fix Pink Trombone TTS: shapeMainTract was overwriting lip/constriction changes"
      },
      {
        type: 'fix',
        "description": "Fix TMS5220 re-render loop, VLM5030 wrong ROM labels"
      },
      {
        type: 'fix',
        "description": "Remove broken eSpeak-NG from Pink Trombone — fixes 10s browser freeze"
      },
      {
        type: 'fix',
        "description": "Fix speech synths: eSpeak-NG freeze, ROM speech first-press, dynamic labels"
      },
      {
        type: 'fix',
        "description": "Fix speech synth quality: MEA8000 formant range, SP0250 pitch & fade-out"
      },
      {
        type: 'feature',
        "description": "Add ROM speech presets for Speak & Spell TMS5220"
      },
      {
        type: 'improvement',
        "description": "Remove tone mode from speech synths, remove TMS5220 hardware UI"
      },
      {
        type: 'improvement',
        "description": "Drumpad UI improvements: ROM speech presets, pad grid layout"
      },
      {
        type: 'fix',
        "description": "PadEditor preview button uses mouseDown/Up for hold-to-play"
      },
      {
        type: 'fix',
        "description": "Drumpad sustain indicator and MIDI note-off routing"
      },
      {
        type: 'fix',
        "description": "Remove duplicate DUB_SIREN_PRESETS from factory presets"
      },
      {
        type: 'improvement',
        "description": "PadEditor uses UnifiedInstrumentEditor, wider modal"
      },
      {
        type: 'improvement',
        "description": "DECtalk pad UI with grouped character presets"
      },
      {
        type: 'improvement',
        "description": "DubSiren controls use configRef pattern for knob stability"
      },
      {
        type: 'fix',
        "description": "Speech synth timing and auto-render on trigger"
      }
    ]
  },
  {
    version: '2026-04-15',
    date: '2026-04-15',
    changes: [
      {
        type: 'fix',
        "description": "Correct sample playback pitch — hardcode 2x rate for octave up"
      },
      {
        type: 'fix',
        "description": "Tour spotlight covers full tracker editor (matrix + pattern)"
      },
      {
        type: 'fix',
        "description": "Correct tour narration — sample is 303 acid line, not guitar riff"
      },
      {
        type: 'improvement',
        "description": "Tour: revert sample playback to direct Web Audio"
      },
      {
        type: 'improvement',
        "description": "PadEditor: dispose cached synth on config change"
      },
      {
        type: 'improvement',
        "description": "Update changelog, persistence schema, and project memory"
      },
      {
        type: 'improvement',
        "description": "KraftwerkHead: update VJ scene"
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
