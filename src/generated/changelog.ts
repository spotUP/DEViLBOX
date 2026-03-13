/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-13T07:30:19.977Z
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
export const BUILD_VERSION = '1.0.2755';
export const BUILD_NUMBER = '2755';
export const BUILD_HASH = 'c99dcc731';
export const BUILD_DATE = '2026-03-13';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2755',
    date: '2026-03-13',
    changes: [
      {
        type: 'improvement',
        "description": "Revert: undo 5 pattern editor optimization attempts that caused regressions"
      },
      {
        type: 'fix',
        "description": "Fix smooth scroll duration calculation returning inflated values"
      },
      {
        type: 'fix',
        "description": "Move grid to fixed layer and reduce redraw frequency"
      },
      {
        type: 'fix',
        "description": "Add renderGrid to vStartChanged path and remove per-row fullRedraw"
      },
      {
        type: 'fix',
        "description": "Eliminate redundant full redraw at pattern boundaries"
      },
      {
        type: 'fix',
        "description": "Increase scheduler lookahead to 250ms and defer pattern boundary React updates"
      },
      {
        type: 'fix',
        "description": "Only reset speedCounter on note triggers, not every row"
      }
    ]
  },
  {
    version: '2026-03-12',
    date: '2026-03-12',
    changes: [
      {
        type: 'fix',
        "description": "Remove unused isAmigaNative variable"
      },
      {
        type: 'fix',
        "description": "Shift all Amiga format note display +2 octaves to match FT2/OpenMPT convention"
      },
      {
        type: 'fix',
        "description": "Shift note display +2 octaves to match FT2/OpenMPT convention"
      },
      {
        type: 'fix',
        "description": "Lower instrument preview note from C3 to C2 for Amiga-native synths"
      },
      {
        type: 'fix',
        "description": "Reset period from table each tick and fix volume slide target"
      },
      {
        type: 'fix',
        "description": "Reset speedCounter at row boundaries for correct arpeggio/slide timing"
      },
      {
        type: 'fix',
        "description": "Route amiga-native formats through parseModuleToSong instead of libopenmpt"
      },
      {
        type: 'fix',
        "description": "Song engine types always show NativeInstrumentPanel"
      },
      {
        type: 'fix',
        "description": "Fix JS eval in V2MPlayer worklet"
      },
      {
        type: 'fix',
        "description": "Fix instrument editor showing basic synth for song engine types"
      },
      {
        type: 'fix',
        "description": "Fix SunVox import: create 5 pattern order positions instead of 1"
      },
      {
        type: 'fix',
        "description": "Fix SunVox handle exhaustion: reclaim stale slots from HMR/reloads"
      },
      {
        type: 'fix',
        "description": "Fix SunVox WASM init: send wasmBinary as Uint8Array for reliable transfer"
      },
      {
        type: 'fix',
        "description": "Add ready message handler for init"
      },
      {
        type: 'fix',
        "description": "Make worklets self-contained with inline initMAMEWasmModule"
      },
      {
        type: 'fix',
        "description": "Fix V2Synth: send wasmBinary as Uint8Array for reliable worklet transfer"
      },
      {
        type: 'fix',
        "description": "Polyfill globalThis for AudioWorklet scope"
      },
      {
        type: 'fix',
        "description": "Fix shell environment assertion in worklets"
      },
      {
        type: 'fix',
        "description": "Export wasmMemory for worklet access"
      },
      {
        type: 'fix',
        "description": "Fix V2Synth init: send sampleRate and accept 'initialized' message"
      },
      {
        type: 'fix',
        "description": "Fix JUCE synth module factory eval errors"
      },
      {
        type: 'fix',
        "description": "Route .v2m files to V2MPlayer instead of ImportModuleDialog"
      },
      {
        type: 'fix',
        "description": "Increase MAX_ENGINES from 8 to 32"
      },
      {
        type: 'fix',
        "description": "Fix TrackerScratchController: use store.patterns not store.song.patterns"
      },
      {
        type: 'improvement',
        "description": "Replace hardcoded color hex values with theme tokens in Pixi graphics"
      },
      {
        type: 'improvement',
        "description": "Replace all hardcoded tint={0x} values in src/pixi/ with theme tokens"
      },
      {
        type: 'fix',
        "description": "Call synthSetGlobals to prevent high-cut filter silence"
      },
      {
        type: 'feature',
        "description": "Add accentHighlight token to Pixi/GL theme system"
      },
      {
        type: 'improvement',
        "description": "Replace hardcoded colors with design system tokens app-wide"
      },
      {
        type: 'fix',
        "description": "Add default params to prevent silence"
      },
      {
        type: 'fix',
        "description": "Fix WaveSabre audio - add Helpers::Init() and fix NoteOn signature"
      },
      {
        type: 'fix',
        "description": "Clean up SunVox worklet debug logging"
      },
      {
        type: 'fix',
        "description": "Fix SunVox WASM playback - add pattern selection init"
      },
      {
        type: 'fix',
        "description": "Robust chunk decoding with param fallback"
      },
      {
        type: 'fix',
        "description": "Fix touchpad/scroll scratch: lower thresholds, boost impulse"
      },
      {
        type: 'fix',
        "description": "Strip whitespace from base64 chunks, fix SYNTH_INFO types"
      },
      {
        type: 'feature',
        "description": "Add visual pattern scrolling during scratch"
      },
      {
        type: 'fix',
        "description": "Fix pattern editor scratch: document-level mouse tracking"
      }
    ]
  },
  {
    version: '2026-03-11',
    date: '2026-03-11',
    changes: [
      {
        type: 'improvement',
        "description": "Link VJ overlay opacity to DJ crossfader position"
      },
      {
        type: 'feature',
        "description": "Add Demoscene category to synth browser"
      },
      {
        type: 'fix',
        "description": "Fix DJ scratch position reset and ProjectM stuck visuals"
      },
      {
        type: 'fix',
        "description": "DJ scratch position from audio player, add XRNS to metadata format"
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
