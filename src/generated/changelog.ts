/**
 * Auto-generated changelog from git commits
 * Generated: 2026-10-23T06:11:23.377Z
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
export const BUILD_VERSION = '1.0.9176';
export const BUILD_NUMBER = '9176';
export const BUILD_HASH = '0f88f271b';
export const BUILD_DATE = '2026-10-23';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.9176',
    date: '2026-10-23',
    changes: [
      {
        type: 'improvement',
        "description": "Show the info panel for WaveSabre Adultery instead of the Falcon layout"
      },
      {
        type: 'improvement',
        "description": "Remove stale paula_soft snapshots and untrack CMake build artifacts"
      },
      {
        type: 'feature',
        "description": "Add The Mod Archive search and load through the Express server and MCP"
      },
      {
        type: 'improvement',
        "description": "JX10, DX10 and ePiano notes keep the time the replayer scheduled them for"
      },
      {
        type: 'improvement',
        "description": "Place the first automation curve in its own parameter's lane slot"
      },
      {
        type: 'improvement',
        "description": "Size multi-lane automation rows by the channel's active lanes"
      },
      {
        type: 'improvement',
        "description": "Remove the unused updateChipSynthArpeggio"
      },
      {
        type: 'improvement',
        "description": "Render VFXSynth through the shared MAMEEngine.attachRenderer"
      },
      {
        type: 'improvement',
        "description": "Make VL1 ensureInitialized wait for the worklet ready message"
      },
      {
        type: 'improvement',
        "description": "Guard MOD note numbering across load paths"
      },
      {
        type: 'improvement',
        "description": "Let the MultibandLimiter WASM own the dry/wet mix"
      },
      {
        type: 'fix',
        "description": "Fix stale FX WET comment in DubDeckStrip"
      },
      {
        type: 'fix',
        "description": "Fix WAM Graphic EQ being 6 dB louder at flat defaults"
      },
      {
        type: 'improvement',
        "description": "Build the edit modal temp instrument through applySynthTypeDefaults"
      },
      {
        type: 'improvement',
        "description": "Resolve the synth panel layout from the instrument, not its engine type alone"
      },
      {
        type: 'improvement',
        "description": "Keep setChainOrder from restoring half-faded gains on a second reorder"
      },
      {
        type: 'improvement',
        "description": "Skip ghost automation curves on channels that reserve no lane width"
      },
      {
        type: 'improvement',
        "description": "Correct the UADE worklet note-start comment"
      },
      {
        type: 'improvement',
        "description": "Use one meter-target rule; realtime meters ignore note flashes"
      },
      {
        type: 'improvement',
        "description": "Make row meter triggers follow the note's start volume"
      },
      {
        type: 'improvement',
        "description": "Peak channel meters at the note volume, not 1.2x"
      },
      {
        type: 'improvement',
        "description": "Centre the note caret on the note glyphs"
      },
      {
        type: 'improvement',
        "description": "Reserve no automation lane width on channels without lanes"
      },
      {
        type: 'improvement',
        "description": "Count UADE meter note starts when Paula is written, not at the tick poll"
      },
      {
        type: 'improvement',
        "description": "Hold every engine's channel meters until their block is heard"
      },
      {
        type: 'improvement',
        "description": "Post UADE channel levels the block a note starts in"
      },
      {
        type: 'improvement',
        "description": "Show UADE channel meters when their block is heard"
      },
      {
        type: 'improvement',
        "description": "Feed the libopenmpt channel meters when the row is heard"
      },
      {
        type: 'improvement',
        "description": "Build the libopenmpt scopes in the paused load, not while the song plays"
      },
      {
        type: 'fix',
        "description": "Give the hand-built ToneEngine test fixtures the release-restore map"
      },
      {
        type: 'improvement',
        "description": "Warm the first module build at song open"
      }
    ]
  },
  {
    version: '2026-10-22',
    date: '2026-10-22',
    changes: [
      {
        type: 'improvement',
        "description": "Replace the WobbleBass Tone.Distortion stages with unity-gain tanh shapers"
      },
      {
        type: 'improvement',
        "description": "Give hybrid songs a 32 ms lead so the first synth note keeps its attack"
      },
      {
        type: 'improvement',
        "description": "Keep current-format cells unchanged when a saved song migrates"
      },
      {
        type: 'improvement',
        "description": "End Stop's release fades when playback starts again"
      },
      {
        type: 'improvement',
        "description": "Keep channel strips stereo so pattern notes play at key-preview level"
      },
      {
        type: 'improvement',
        "description": "Scope pre-push affected tests to the commits the remote lacks"
      },
      {
        type: 'improvement',
        "description": "Accept warmUp with arguments in the pre-warm source test"
      },
      {
        type: 'improvement',
        "description": "Lift the 4-slot channel isolation cap: channels sharing one effect list share one slot"
      },
      {
        type: 'improvement',
        "description": "Route each Up Rough softsynth channel through its own native output"
      },
      {
        type: 'improvement',
        "description": "Never let a released softsynth voice jump back to full gain"
      },
      {
        type: 'feature',
        "description": "Add the 2026-10-22 R2 factory handoff"
      },
      {
        type: 'feature',
        "description": "Add the ReRebirth 303, 808 and 909 synths and the ReBirth effects"
      },
      {
        type: 'improvement',
        "description": "Run src/__tests__/ci in test:ci again"
      },
      {
        type: 'improvement',
        "description": "Install the native-context worklet patch in the master preset parity renders"
      },
      {
        type: 'fix',
        "description": "Fix the offline render hang under faked timers by waiting for worklet acks by event"
      },
      {
        type: 'improvement',
        "description": "Cap every vitest run at two workers and the lowest CPU priority"
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
