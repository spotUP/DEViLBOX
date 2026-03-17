/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-17T21:20:42.486Z
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
export const BUILD_VERSION = '1.0.2993';
export const BUILD_NUMBER = '2993';
export const BUILD_HASH = '380171d71';
export const BUILD_DATE = '2026-03-17';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2993',
    date: '2026-03-17',
    changes: [
      {
        type: 'fix',
        "description": "Suppress libopenmpt WASM stderr to silence console spam"
      },
      {
        type: 'fix',
        "description": "Upsample sub-8kHz WAV in pcm8ToWAV to fix Chrome decode failures"
      },
      {
        type: 'feature',
        "description": "Add HippelCoSo from-scratch exporter + roundtrip tests"
      },
      {
        type: 'improvement',
        "description": "Wire all Amiga format exporters into Native export tab"
      },
      {
        type: 'feature',
        "description": "Add SoundMon exporter wrapper with chip RAM fallback"
      },
      {
        type: 'fix',
        "description": "Fix SoundMon exporter bugs + export roundtrip tests"
      },
      {
        type: 'fix',
        "description": "Fix SidMon2 template header layout and PumaTracker loading path"
      },
      {
        type: 'feature',
        "description": "Add templates for SoundMon, HippelCoSo, Future Composer, OctaMED + chip RAM export fallback"
      },
      {
        type: 'fix',
        "description": "Inject UADE for QuadraComposer audio; fix EMS test files"
      },
      {
        type: 'improvement',
        "description": "From-scratch file builders for JamCracker and SoundMon, native export UI"
      },
      {
        type: 'improvement',
        "description": "Shrink template files: 1 pattern instead of 64"
      },
      {
        type: 'feature',
        "description": "New Song: template-based creation for exotic Amiga formats"
      },
      {
        type: 'fix',
        "description": "Fix MMDC prefix form and remove mmdc from OpenMPT path"
      },
      {
        type: 'fix',
        "description": "Fix PVP prefix routing and MED format parsing"
      },
      {
        type: 'improvement',
        "description": "UADE: variable-length encoders for SidMon2, PumaTracker, HippelCoSo, Actionamics"
      }
    ]
  },
  {
    version: '2026-03-16',
    date: '2026-03-16',
    changes: [
      {
        type: 'fix',
        "description": "Add .sas suffix-form routing for SonicArranger compiled binary"
      },
      {
        type: 'fix',
        "description": "Skip Paula scan for SKIP_SCAN formats regardless of mode"
      },
      {
        type: 'feature',
        "description": "Add variable-length encoder infrastructure for RLE/packed formats"
      },
      {
        type: 'feature',
        "description": "Add console audit badges and live envCorr bar updates to format-status"
      },
      {
        type: 'fix',
        "description": "Fix MMD0Sample struct layout, transpose, tempo, and effect mapping"
      },
      {
        type: 'fix',
        "description": "Convert Tier 3 suffix-form files to UADE prefix form before routing"
      },
      {
        type: 'improvement',
        "description": "UADE: real-time score position tracking during playback"
      },
      {
        type: 'fix',
        "description": "Stop playback keeps pattern editor at current position"
      },
      {
        type: 'feature',
        "description": "Enable native parsers by default for remaining 4 formats"
      },
      {
        type: 'improvement',
        "description": "UADE: declarative encoder factory for common cell layouts"
      },
      {
        type: 'improvement',
        "description": "UADE: universal native export, enhanced effect detection"
      },
      {
        type: 'improvement',
        "description": "UADE: JamCracker encoder, DMA restart detection, improved pattern reconstruction"
      },
      {
        type: 'fix',
        "description": "Enable native pattern editing for SonicArranger by default"
      },
      {
        type: 'fix',
        "description": "Add mk2/mkii to skip-scan and force-classic prefix sets"
      },
      {
        type: 'fix',
        "description": "TCBTrackerParser note formula correction"
      },
      {
        type: 'fix',
        "description": "MEDParser MMD3 noteBaseTranspose (12 instead of 36)"
      },
      {
        type: 'improvement',
        "description": "Update project memory with multi-chip, scratch, and import fixes"
      },
      {
        type: 'feature',
        "description": "Startup jingle, GL AI panel input, jingle visualizer mode, pattern bar editor"
      },
      {
        type: 'feature',
        "description": "120s buffer, scroll wheel velocity, fader gain MIDI CC, scratch in VJView"
      },
      {
        type: 'fix',
        "description": "MED cell decode, MOD channel widths, TCB note offset, UADE routing"
      },
      {
        type: 'fix',
        "description": "Create all chips on song load, destroy stale chips between songs"
      },
      {
        type: 'fix',
        "description": "Channel bounds check in WASM dispatch + destroyChip API"
      },
      {
        type: 'fix',
        "description": "Envelope correlation export, float32 WAV, BRR field offsets"
      },
      {
        type: 'feature',
        "description": "Add console capture, evaluate_script, and play_fur tools"
      },
      {
        type: 'fix',
        "description": "Explicit number type for HWKnob onChange callback in MAMEGenericHardware"
      },
      {
        type: 'fix',
        "description": "Extend skip-scan/force-classic to suffix-form compiled replayer extensions"
      },
      {
        type: 'fix',
        "description": "Correct baseNote format from OpenMPT 'C-4' to Tone.js 'C4'"
      },
      {
        type: 'fix',
        "description": "Add .sa to skip-scan and force-classic for compiled binary SA files"
      },
      {
        type: 'fix',
        "description": "Swap instrument/note byte order per IFF EMOD spec"
      },
      {
        type: 'fix',
        "description": "Add compiled 68k replayer prefixes to skip-scan and force-classic"
      },
      {
        type: 'improvement',
        "description": "Prevent browser crashes: skip enhanced scan for compiled replayer formats"
      },
      {
        type: 'fix',
        "description": "Fix SonicArranger prefix-form crash: move sas to FORCE_CLASSIC_PREFIXES"
      },
      {
        type: 'fix',
        "description": "Fix InStereo! 2 wrong pattern speed: convert Hz tempo to BPM"
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
