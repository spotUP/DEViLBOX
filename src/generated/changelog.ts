/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-31T05:22:40.263Z
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
export const BUILD_VERSION = '1.0.3729';
export const BUILD_NUMBER = '3729';
export const BUILD_HASH = 'c8d7a0157';
export const BUILD_DATE = '2026-03-31';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.3729',
    date: '2026-03-31',
    changes: [
      {
        type: 'fix',
        "description": "Ghost automation shows all lanes, not just primary"
      },
      {
        type: 'fix',
        "description": "Automation overlay no longer blocks pattern editor interaction"
      },
      {
        type: 'fix',
        "description": "Ghost automation for single-pattern songs + active channel highlight"
      },
      {
        type: 'fix',
        "description": "Automation lanes positioning and multi-lane visibility"
      }
    ]
  },
  {
    version: '2026-03-30',
    date: '2026-03-30',
    changes: [
      {
        type: 'fix',
        "description": "Automation lanes use dedicated column space, multiple lanes side by side"
      },
      {
        type: 'fix',
        "description": "Automation ghost patterns no longer clipped"
      },
      {
        type: 'fix',
        "description": "DOM overlay scroll uses currentRow, not constant baseY"
      },
      {
        type: 'fix',
        "description": "DOM automation lanes scroll via imperative RAF positioning"
      },
      {
        type: 'fix',
        "description": "DOM automation lanes scroll sync + full pattern height"
      },
      {
        type: 'fix',
        "description": "Automation lanes get own column space and scroll with pattern"
      },
      {
        type: 'fix',
        "description": "Show automation lanes on OK + add DOM dialog footer buttons"
      },
      {
        type: 'improvement',
        "description": "Rename Auto→Automation and GROOVE→Groove toolbar buttons"
      },
      {
        type: 'feature',
        "description": "Wire automation playback + interactive curve editor + dialog buttons"
      },
      {
        type: 'fix',
        "description": "Organ distortion and stuck notes"
      },
      {
        type: 'fix',
        "description": "Stop loadSong from killing freshly-created instruments"
      },
      {
        type: 'fix',
        "description": "Normalize volume for all legacy synth creation paths"
      },
      {
        type: 'fix',
        "description": "Normalize volume for all DrumMachine drum types"
      },
      {
        type: 'fix',
        "description": "Playback silence bugs — instrument timing race + skipNextReload gate"
      },
      {
        type: 'feature',
        "description": "Full MIDI CC/pitchbend → tracker effect mapping"
      },
      {
        type: 'fix',
        "description": "MIDI import pattern length and loadSongFile scope"
      },
      {
        type: 'fix',
        "description": "MIDI import now imports all tracks as channels"
      },
      {
        type: 'feature',
        "description": "PitchMultiplier for IO808/TR909 drum synths"
      },
      {
        type: 'feature',
        "description": "Note-to-drum mapping for IO808 and TR909"
      },
      {
        type: 'fix',
        "description": "Fix circular dep crash and harden voice routing"
      },
      {
        type: 'fix',
        "description": "Fix new channels silent: grow replayer channel array on hot-swap"
      },
      {
        type: 'fix',
        "description": "Fix VU meters firing before audio, remove diagnostic logs"
      },
      {
        type: 'feature',
        "description": "Add 'Add Instrument' button to synth editor header"
      },
      {
        type: 'fix',
        "description": "Instruments added after song load are now playable"
      },
      {
        type: 'feature',
        "description": "Open synth browser when adding new instrument"
      },
      {
        type: 'improvement',
        "description": "Update Monique WASM binary"
      },
      {
        type: 'improvement',
        "description": "Update generated changelog and file manifest"
      },
      {
        type: 'improvement',
        "description": "App shell, settings, toolbar, Pixi views, and misc updates"
      },
      {
        type: 'improvement',
        "description": "VJ view: Kraftwerk head scene and overlay"
      },
      {
        type: 'improvement',
        "description": "DJ view updates: AutoDJ, playlist, quantized FX, modland browser"
      },
      {
        type: 'feature',
        "description": "Add new WASM synth engines: Monique, Calf Mono, MDA (DX10/EPiano/JX10), Raffo, SynthV1, AMSynth, SetBfree, ZynAddSubFX"
      },
      {
        type: 'feature',
        "description": "Update .gitignore for new WASM synth builds and third-party trees"
      },
      {
        type: 'fix',
        "description": "Fix keyboard double-trigger: remove duplicate handler from TestKeyboard"
      },
      {
        type: 'fix',
        "description": "Keyboard double-trigger from competing capture-phase handlers"
      },
      {
        type: 'fix',
        "description": "Drum machines double-triggering on keyboard and mouse"
      },
      {
        type: 'fix',
        "description": "Drum machine double-trigger and stale pattern playback"
      },
      {
        type: 'fix',
        "description": "Share TR808/TR909 instances per instrument ID (not per-channel)"
      },
      {
        type: 'feature',
        "description": "IO808 + TR909 drum machine engines with presets and synth browser"
      },
      {
        type: 'fix',
        "description": "Add applyConfig to VSTBridgeSynth + param mapping"
      }
    ]
  },
  {
    version: '2026-03-29',
    date: '2026-03-29',
    changes: [
      {
        type: 'feature',
        "description": "Port ZynAddSubFX to WASM with full ADDsynth/SUBsynth/PADsynth engines"
      },
      {
        type: 'improvement',
        "description": "Port Sfizz SFZ sample player to WASM"
      },
      {
        type: 'improvement',
        "description": "Port TAL-NoiseMaker to WASM"
      },
      {
        type: 'feature',
        "description": "Port Aeolus pipe organ emulator to WASM"
      },
      {
        type: 'improvement',
        "description": "Port FluidSynth (SF2 SoundFont player) to WASM"
      },
      {
        type: 'feature',
        "description": "Add setBfree Hammond B3 organ + Leslie speaker WASM module"
      },
      {
        type: 'feature',
        "description": "Add AMSynth (Analog Modelling Synthesizer) WASM module"
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
