/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-18T18:32:32.578Z
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
export const BUILD_VERSION = '1.0.3015';
export const BUILD_NUMBER = '3015';
export const BUILD_HASH = '296211efd';
export const BUILD_DATE = '2026-03-18';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.3015',
    date: '2026-03-18',
    changes: [
      {
        type: 'feature',
        "description": "ALL 6 compiled 68k replayers build as WASM"
      },
      {
        type: 'feature',
        "description": "Two-pass scope analysis — 4/6 replayers compile clean"
      },
      {
        type: 'fix',
        "description": "Unified scope pass + indirect JMP function close"
      },
      {
        type: 'fix',
        "description": "Sync sanitizeLabel between emitter and instr-map"
      },
      {
        type: 'feature',
        "description": "3/6 compiled 68k replayers build as WASM"
      },
      {
        type: 'feature',
        "description": "Fix cross-function goto detection, Core Design WASM compiles"
      },
      {
        type: 'fix',
        "description": "Add sr register, improve RTS-close pre-pass simulation"
      },
      {
        type: 'fix',
        "description": "Escape C keywords, extract functions after RTS, fix MULU pointer cast"
      },
      {
        type: 'improvement',
        "description": "Wip(formats): transpile 6 compiled 68k replayers to C via asm68k-to-c"
      },
      {
        type: 'fix',
        "description": "Correct synth instrument preview pitch"
      },
      {
        type: 'fix',
        "description": "Route Tier 3 formats through UADE classic streaming"
      },
      {
        type: 'feature',
        "description": "StarTrekker AM WASM engine + cross-format editing/mute/preview fixes"
      }
    ]
  },
  {
    version: '2026-03-17',
    date: '2026-03-17',
    changes: [
      {
        type: 'feature',
        "description": "Add startup jingle toggle to Settings UI"
      },
      {
        type: 'improvement',
        "description": "Chore(generated): update changelog and file-manifest"
      },
      {
        type: 'feature',
        "description": "Chore(dev): add FORMAT_PORT=4444 to dev.sh startup and cleanup"
      },
      {
        type: 'fix',
        "description": "Correct note encoding and add noteExportOffset for S3M-origin files"
      },
      {
        type: 'feature',
        "description": "Add engine preferences for new Amiga formats + TrackerSong.noteExportOffset"
      },
      {
        type: 'feature',
        "description": "Extend FormatRegistry and FurnaceSongParser for new formats"
      },
      {
        type: 'feature',
        "description": "Add native parsers for 18 additional Amiga composer formats"
      },
      {
        type: 'fix',
        "description": "Use dataSize directly for BRR sample byte count"
      },
      {
        type: 'feature',
        "description": "Full song-mode integration with pattern data and MCP routing"
      },
      {
        type: 'fix',
        "description": "Prevent tab freeze and WASM crashes during song playback"
      },
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
