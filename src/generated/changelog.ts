/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-11T02:39:34.617Z
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
export const BUILD_VERSION = '1.0.4823';
export const BUILD_NUMBER = '4823';
export const BUILD_HASH = '006142c08';
export const BUILD_DATE = '2026-04-11';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.4823',
    date: '2026-04-11',
    changes: [
      {
        type: 'fix',
        "description": "Add sourceFormat metadata to patterns and read SF2 store in engine routing"
      },
      {
        type: 'improvement',
        "description": "Complete SF2Synth integration parity with GTUltra"
      },
      {
        type: 'fix',
        "description": "Fix channel routing: keep all effects in global chain"
      },
      {
        type: 'fix',
        "description": "Fix channel routing: fall back to global chain when channelOutputs unavailable"
      },
      {
        type: 'feature',
        "description": "Add SF2 live editing engine with C64 memory bridge"
      },
      {
        type: 'fix',
        "description": "Fix channel routing: use parallel send architecture (no disconnects)"
      },
      {
        type: 'fix',
        "description": "Fix channel routing: use gain gate instead of surgical disconnect"
      },
      {
        type: 'fix',
        "description": "Fix channel routing: use native Web Audio API for surgical disconnect"
      },
      {
        type: 'feature',
        "description": "Add SF2 synth type, instrument editor, keyboard handler, SID register access"
      },
      {
        type: 'feature',
        "description": "Add channel routing selector to Master FX modal dialog"
      },
      {
        type: 'improvement',
        "description": "Make channel routing selector always visible on master FX pedals"
      },
      {
        type: 'improvement',
        "description": "Wire SF2 format editor: store, adapter, views (DOM+GL), routing"
      },
      {
        type: 'fix',
        "description": "Fix channel routing teardown, race guard, empty channel display"
      },
      {
        type: 'feature',
        "description": "Add per-channel effect routing and channel selection UI"
      },
      {
        type: 'improvement',
        "description": "Update porting guide with SID Factory II case study"
      },
      {
        type: 'fix',
        "description": "Fix VocoderEditor and VinylNoiseEditor preset batch updates"
      },
      {
        type: 'feature',
        "description": "Add SID Factory II (.sf2) format support"
      },
      {
        type: 'fix',
        "description": "Fix effect presets: batch parameter update to prevent clobbering"
      },
      {
        type: 'feature',
        "description": "Add RE Tape Echo dub presets + further tame ShimmerReverb"
      },
      {
        type: 'feature',
        "description": "Add comprehensive WASM effects porting guide"
      },
      {
        type: 'feature',
        "description": "Add comprehensive format porting guide"
      },
      {
        type: 'fix',
        "description": "Fix RE Tape Echo + SpaceyDelayer silence, tame ShimmerReverb + MoogFilters"
      },
      {
        type: 'fix',
        "description": "Fix ShimmerReverb: tanhf soft clip on feedback + output, tame defaults"
      },
      {
        type: 'fix',
        "description": "Fix AdPlug scroll stutter: check position every process() call"
      },
      {
        type: 'fix',
        "description": "Fix AdPlug scroll: use dispatchEnginePosition for stable timing"
      },
      {
        type: 'fix',
        "description": "Fix AdPlug pattern scroll sync: row duration + onEnded"
      },
      {
        type: 'fix',
        "description": "Fix WASM effects: Embind base class binding for process()"
      },
      {
        type: 'fix',
        "description": "Fix cached WASM: density check fallback + cache-busting for extraction"
      },
      {
        type: 'fix',
        "description": "Fix missing AdPlug pattern notes: real-time channel state + OPL capture sort"
      },
      {
        type: 'fix',
        "description": "Fix Masha button: momentary hold instead of toggle"
      },
      {
        type: 'fix',
        "description": "Fix worklet HEAPF32 crash: use DataView + try/catch for safety"
      }
    ]
  },
  {
    version: '2026-04-10',
    date: '2026-04-10',
    changes: [
      {
        type: 'fix',
        "description": "Fix RE Tape Echo silence + add per-effect default wet levels"
      },
      {
        type: 'fix',
        "description": "Fix worklet HEAPF32 crash: use Float32Array view from HEAPU8.buffer"
      },
      {
        type: 'fix',
        "description": "Fix AdPlug distortion and pattern scroll jitter"
      },
      {
        type: 'improvement',
        "description": "AdPlug: per-channel mute/solo, VU meters, D00 native extraction, position sync"
      },
      {
        type: 'improvement',
        "description": "Remove non-functional environments display from KissOfShame"
      },
      {
        type: 'fix',
        "description": "Fix KissOfShame VU meters and restore environment display"
      },
      {
        type: 'fix',
        "description": "Fix KissOfShame knob interaction: memoize FilmstripKnob + reduce re-renders"
      },
      {
        type: 'improvement',
        "description": "AdPlug hybrid playback: streaming audio + editable patterns"
      },
      {
        type: 'fix',
        "description": "Fix KissOfShame VU visibility and Environments control"
      },
      {
        type: 'feature',
        "description": "Add KissOfShame Bypass and Print Through buttons"
      },
      {
        type: 'fix',
        "description": "KissOfShame UI: always show reels, red VU meters, fix cutoff"
      },
      {
        type: 'fix',
        "description": "Fix OPL3 distortion properly: normalize in WASM bridge, not gain node"
      },
      {
        type: 'improvement',
        "description": "Animate KissOfShame VU meters from post-effect audio level"
      },
      {
        type: 'fix',
        "description": "Fix capture BPM: use speed=ticksPerRow, BPM=refresh*5/2"
      },
      {
        type: 'fix',
        "description": "Fix TapeSimulator killing all audio — missing WASM memory capture in worklet"
      },
      {
        type: 'fix',
        "description": "Fix OPL capture ticksPerRow + distortion: measure actual note spacing"
      },
      {
        type: 'fix',
        "description": "Fix OPL capture volume: was sending Fxx (speed) instead of Cxx (volume)"
      },
      {
        type: 'fix',
        "description": "Fix OPL capture BPM: remove 5-7x tempo slowdown"
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
