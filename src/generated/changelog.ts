/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-16T22:26:55.717Z
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
export const BUILD_VERSION = '1.0.5475';
export const BUILD_NUMBER = '5475';
export const BUILD_HASH = '60a12e58c';
export const BUILD_DATE = '2026-04-16';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.5475',
    date: '2026-04-17',
    changes: [
      {
        type: 'improvement',
        "description": "Update CLAUDE.md — remove GL/Pixi rules"
      },
      {
        type: 'improvement',
        "description": "Remove Pixi npm dependencies"
      },
      {
        type: 'improvement',
        "description": "Remove GL rendering mode from app shell"
      },
      {
        type: 'feature',
        "description": "Hively voice param automation — C bridge + WASM rebuild"
      },
      {
        type: 'feature',
        "description": "Universal channel filter automation for all 188+ formats"
      },
      {
        type: 'improvement',
        "description": "Delete src/pixi/ — remove entire GL/WebGL UI (351 files, ~99K LOC)"
      },
      {
        type: 'improvement',
        "description": "Extract shared utilities from pixi/ before GL removal"
      },
      {
        type: 'feature',
        "description": "Add format test songs collection (181 files)"
      },
      {
        type: 'improvement',
        "description": "Chore: clean up test files, move 303-Demo to songs/devilbox/"
      }
    ]
  },
  {
    version: '2026-04-16',
    date: '2026-04-16',
    changes: [
      {
        type: 'feature',
        "description": "Wire WASM replayer automation — NKS params + synth set() for 13 engines"
      },
      {
        type: 'feature',
        "description": "Scratch on waveform/pattern displays, fix line loop Dxx awareness"
      },
      {
        type: 'fix',
        "description": "DJ line loops respect pattern length and snap correctly"
      },
      {
        type: 'improvement',
        "description": "WASM replayer automation plan — 26 engines audited"
      },
      {
        type: 'fix',
        "description": "Backward scratch silence — wire captureNode inline"
      },
      {
        type: 'fix',
        "description": "DJ loop sync, quantization, and button UX"
      },
      {
        type: 'feature',
        "description": "Format-aware automation with mixer/global params and synth NKS maps"
      },
      {
        type: 'fix',
        "description": "Fix DJ scratch flanger/doubling from zombie audio sources"
      },
      {
        type: 'fix',
        "description": "Use default CustomSelect styling for tracker controls bar"
      },
      {
        type: 'feature',
        "description": "Prompt login when unauthenticated user tries to rate"
      },
      {
        type: 'feature',
        "description": "Complete automation lane toolset"
      },
      {
        type: 'feature',
        "description": "Add DJ-style filter sweep presets"
      },
      {
        type: 'improvement',
        "description": "Move Order and Master FX from FT2 toolbar to pattern editor header"
      },
      {
        type: 'feature',
        "description": "Add reverb send for scratch/LFO fader effects"
      },
      {
        type: 'improvement',
        "description": "Remove TB-303 from sub-mode dropdown (no longer exists)"
      },
      {
        type: 'improvement',
        "description": "Unify drumpad stutter with DJ fader LFO scheduling"
      },
      {
        type: 'feature',
        "description": "Add Tracker/Grid/TB-303 sub-mode toggle to DOM editor controls bar"
      },
      {
        type: 'fix',
        "description": "Fix LFO/Transformer/Crab phase: open on beats, mute on off-beats"
      },
      {
        type: 'improvement',
        "description": "Remove Mixer knob bank, replace with MasterFX"
      },
      {
        type: 'improvement',
        "description": "Auto-detect format editors on file load, remove from dropdown"
      },
      {
        type: 'improvement',
        "description": "Integrate Grid editor into Pattern editor as toggle"
      },
      {
        type: 'improvement',
        "description": "Remove Mixer view from navigable views"
      },
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
