/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-20T19:29:26.020Z
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
export const BUILD_VERSION = '1.0.3160';
export const BUILD_NUMBER = '3160';
export const BUILD_HASH = '61e72ed09';
export const BUILD_DATE = '2026-03-20';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.3160',
    date: '2026-03-20',
    changes: [
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
      },
      {
        type: 'feature',
        "description": "Add Steve Turner synth engine with WASM playback"
      },
      {
        type: 'fix',
        "description": "Fix DigMug/DM1/DM2 XM export issues"
      },
      {
        type: 'fix',
        "description": "Debug: add initialize() entry log to VLM5030"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated files, WASM binaries, and format state"
      },
      {
        type: 'fix',
        "description": "Sequencer improvements and lock-step command debugging docs"
      },
      {
        type: 'fix',
        "description": "Reduce sv_volume from 256 to 128 to prevent clipping"
      },
      {
        type: 'fix',
        "description": "Set max volume on play, increase graph timeout, fix pattern count"
      },
      {
        type: 'fix',
        "description": "Fix ROM auto-load init flow to prevent double-init"
      },
      {
        type: 'fix',
        "description": "Don't skip synth instruments with existing samples for XM"
      },
      {
        type: 'feature',
        "description": "Upgrade to official SunVox Library v2.1.4d (699KB WASM)"
      },
      {
        type: 'fix',
        "description": "Match MAME init state for ROM playback"
      },
      {
        type: 'fix',
        "description": "Route load_file through libopenmpt when useLibopenmpt=true"
      },
      {
        type: 'fix',
        "description": "Add xmNoteExportOffset: 12 for correct octave in XM"
      },
      {
        type: 'feature',
        "description": "XM volume envelopes for all synth formats"
      },
      {
        type: 'fix',
        "description": "Improve song playback — donate handle, suppress notes, async start"
      },
      {
        type: 'fix',
        "description": "Use 2x sample rate for correct XM pitch mapping"
      },
      {
        type: 'fix',
        "description": "Revert to period base 3424 — frequency analysis confirms correct pitch"
      },
      {
        type: 'fix',
        "description": "Use period 1712 as base for note conversion (one octave down)"
      },
      {
        type: 'fix',
        "description": "Read frqTranspose as signed byte matching FlodJS"
      },
      {
        type: 'fix',
        "description": "1:1 MAME audit for S14001A and HC55516 ROM playback"
      },
      {
        type: 'fix',
        "description": "1:1 MAME ROM frame parser and excitation"
      },
      {
        type: 'improvement',
        "description": "Unify .sunvox import — remove separate dialog, load directly"
      },
      {
        type: 'fix',
        "description": "Convert period indices to notes via actual Amiga period lookup"
      },
      {
        type: 'fix',
        "description": "Use base notes and clear volume column for FC synth XM export"
      },
      {
        type: 'fix',
        "description": "Remove incorrect -12 relNote offset causing octave-low playback"
      },
      {
        type: 'feature',
        "description": "XM export with volume envelopes for FC synth instruments"
      }
    ]
  },
  {
    version: '2026-03-19',
    date: '2026-03-19',
    changes: [
      {
        type: 'fix',
        "description": "MIDI notes trigger ROM words when ROM loaded"
      },
      {
        type: 'fix',
        "description": "Don't loop silence for one-shot instruments"
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
