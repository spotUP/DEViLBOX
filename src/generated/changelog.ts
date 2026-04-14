/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-14T10:00:44.770Z
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
export const BUILD_VERSION = '1.0.5207';
export const BUILD_NUMBER = '5207';
export const BUILD_HASH = 'a28a005cd';
export const BUILD_DATE = '2026-04-14';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.5207',
    date: '2026-04-14',
    changes: [
      {
        type: 'fix',
        "description": "Fix playlist context menu - remove duplicate handler"
      },
      {
        type: 'fix',
        "description": "Fix UADE crash during pre-rendered track loading"
      },
      {
        type: 'fix',
        "description": "Rewrite ShimmerReverb DSP — true allpass, 4-head pitch shifter, Hermite interp"
      },
      {
        type: 'fix',
        "description": "Fix Auto DJ UADE crashes with background pre-rendering"
      },
      {
        type: 'fix',
        "description": "FTM/Klystrack volume, AVP subsong selector UI"
      },
      {
        type: 'fix',
        "description": "ShimmerReverb stutter — remove ScriptProcessorNode fallback"
      },
      {
        type: 'fix',
        "description": "Rewrite Exciter as pure Web Audio — no WASM worklet"
      },
      {
        type: 'fix',
        "description": "Apply passthroughGain pattern to all 56 WASM AudioWorklet effects"
      },
      {
        type: 'fix',
        "description": "Exciter audio kill — use passthrough gain mute instead of disconnect"
      },
      {
        type: 'fix',
        "description": "WASM effects disconnect bug (54 effects) + GT Ultra master FX routing"
      },
      {
        type: 'fix',
        "description": "Exciter/BassEnhancer audio kill + preset selector UX"
      },
      {
        type: 'fix',
        "description": "Suppress unknown synthType errors for dedicated WASM replayer formats"
      },
      {
        type: 'feature',
        "description": "Complete instrument param editing for all WASM replayer formats"
      },
      {
        type: 'fix',
        "description": "SoundFactory WASM silence, FC wrong engine routing, RK blank patterns"
      },
      {
        type: 'improvement',
        "description": "Derive effect preset categories from data instead of hardcoding"
      },
      {
        type: 'fix',
        "description": "Add Amiga and C64 to effect preset category order"
      },
      {
        type: 'feature',
        "description": "Add 18 Amiga & C64 SID effect chain presets for live gig"
      },
      {
        type: 'feature',
        "description": "Wire existing instrument editors to WASM param APIs"
      },
      {
        type: 'feature',
        "description": "Add instrument param APIs to ArtOfNoise, MusicAssembler, BenDaglish"
      },
      {
        type: 'feature',
        "description": "Sidechain compressor WASM isolation integration + effect browser filter"
      },
      {
        type: 'feature',
        "description": "Instrument editors for 28+ WASM formats — interactive param editing"
      }
    ]
  },
  {
    version: '2026-04-13',
    date: '2026-04-13',
    changes: [
      {
        type: 'feature',
        "description": "Live pattern editing for all 23 NostalgicPlayer WASM replayers"
      },
      {
        type: 'feature',
        "description": "Full edit APIs for all 22 NostalgicPlayer C replayers"
      },
      {
        type: 'feature',
        "description": "Add edit API + export to all 22 NostalgicPlayer C replayers"
      },
      {
        type: 'fix',
        "description": "SA export roundtrip — use original file data, remove broken serializer"
      },
      {
        type: 'feature',
        "description": "Sonic Arranger edit API — get/set cells, instruments, positions"
      },
      {
        type: 'feature',
        "description": "Wire 12 parsers to dedicated WASM replayers (bypass UADE)"
      },
      {
        type: 'fix',
        "description": "Fred converter — allow negative offsetDiff (fuzzball-title.fred)"
      },
      {
        type: 'fix',
        "description": "Fred replayer — add Amiga hunk stripper + Final format converter"
      },
      {
        type: 'fix',
        "description": "SoundFactory opcode interpreter infinite loop"
      },
      {
        type: 'feature',
        "description": "Sawteeth (.st) WASM engine — transpiled from NostalgicPlayer C#"
      },
      {
        type: 'feature',
        "description": "Port final 8 NostalgicPlayer formats (batch 4) — 23 total"
      },
      {
        type: 'fix',
        "description": "Sidechain compressor — broken signal path, missing self-route, param normalization"
      },
      {
        type: 'feature',
        "description": "Port 6 more NostalgicPlayer formats (batch 3)"
      },
      {
        type: 'feature',
        "description": "Decode SynTracker pattern data — 4-byte cells, per-channel patterns"
      },
      {
        type: 'fix',
        "description": "Rewrite shimmer reverb pitch shifter — crossfade dual-tap replaces broken grain OLA"
      },
      {
        type: 'feature',
        "description": "Per-channel render + oscilloscope for all 4 NostalgicPlayer ports"
      },
      {
        type: 'fix',
        "description": "SoundMon C port — reader_eof was too strict (>= vs >)"
      },
      {
        type: 'fix',
        "description": "Rebuild SoundMon C port (still has loading bug — WIP)"
      },
      {
        type: 'feature',
        "description": "Port SoundMon, Digital Mugician, David Whittaker from NostalgicPlayer C#"
      },
      {
        type: 'fix',
        "description": "Stub UADE parsers use tick reconstruction instead of empty patterns"
      },
      {
        type: 'fix',
        "description": "Debug: wrap fur_load in try/catch to capture WASM abort details"
      },
      {
        type: 'fix',
        "description": "Revert SynTracker→Symphonie Pro redirect — synmod IS SynTracker, .symmod is Symphonie Pro"
      },
      {
        type: 'fix',
        "description": "Update remaining synmod comment from SynTracker to Symphonie Pro"
      },
      {
        type: 'fix',
        "description": "Route synmod (SynTracker) to Symphonie Pro parser — correct format identification"
      },
      {
        type: 'feature',
        "description": "Parsers + native routes for remaining 5 FORCE_CLASSIC formats"
      },
      {
        type: 'fix',
        "description": "Only use SA WASM replayer for SOARV1.0 format, 4EFA falls to UADE"
      },
      {
        type: 'feature',
        "description": "Parsers + native routes for 6 more UADE formats"
      },
      {
        type: 'fix',
        "description": "DefleMask — pre-decompress zlib in ModuleLoader before parseFurnaceFile"
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
