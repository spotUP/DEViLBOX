/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-10T20:03:57.687Z
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
export const BUILD_VERSION = '1.0.4781';
export const BUILD_NUMBER = '4781';
export const BUILD_HASH = 'affb944e7';
export const BUILD_DATE = '2026-04-10';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.4781',
    date: '2026-04-10',
    changes: [
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
      },
      {
        type: 'fix',
        "description": "Fix WASM effects appearing unresponsive: wet defaults, NoiseGate bug, Maximizer range"
      },
      {
        type: 'improvement',
        "description": "D00/EdLib: native instrument extraction in WASM bridge"
      },
      {
        type: 'fix',
        "description": "Fix OPL3 note-on-drop: skip preload, create synth on play"
      },
      {
        type: 'fix',
        "description": "Add setParam to all WASM effects, fix updateEffectParameters routing"
      },
      {
        type: 'feature',
        "description": "Remove JS fallbacks from 5 handcrafted WASM effects, add diagnostics"
      },
      {
        type: 'fix',
        "description": "Fix OPL3 editable playback silence — three root causes"
      },
      {
        type: 'fix',
        "description": "OPL3 transient on drop and volume miscalculation"
      },
      {
        type: 'feature',
        "description": "Make AdLib/OPL formats fully editable via OPL3Synth"
      },
      {
        type: 'feature',
        "description": "Add LHA archive unwrapping for YM files"
      },
      {
        type: 'fix',
        "description": "Restore AdPlug gain on play after autoPlay=false load"
      },
      {
        type: 'fix',
        "description": "Prevent instrument trigger on AdLib file drop"
      },
      {
        type: 'feature',
        "description": "Add OPL3 instrument editor for AdLib formats"
      },
      {
        type: 'fix',
        "description": "Proper AdPlug transport wiring — no auto-play, position sync, single audio source"
      },
      {
        type: 'fix',
        "description": "Remove non-functional Layout 1-4 preset buttons from toolbar"
      },
      {
        type: 'fix',
        "description": "Start WASM streaming player after AdLib extraction for audio"
      },
      {
        type: 'feature',
        "description": "Tabbed FX panes — show one effect at a time with tabs when multiple"
      },
      {
        type: 'feature',
        "description": "Pure WASM streaming for AdLib + OPL effect display"
      },
      {
        type: 'fix',
        "description": "Cap instrument panel height with scrollbar for tall content"
      },
      {
        type: 'feature',
        "description": "OPL native effect routing for AdLib formats (HSC/D00/LDS)"
      },
      {
        type: 'fix',
        "description": "Make SAMPLE button match other instrument list buttons"
      },
      {
        type: 'fix',
        "description": "Correct HSC/D00/LDS playback speed — derive BPM from refresh rate"
      },
      {
        type: 'fix',
        "description": "Auto-size instrument panel, effects side by side with horizontal scroll"
      },
      {
        type: 'improvement',
        "description": "Restyle synth panels to match FX pedal aesthetic"
      },
      {
        type: 'fix',
        "description": "Route HSC/RAD/CMF/DRO/IMF to WASM extractor instead of TS parser"
      },
      {
        type: 'improvement',
        "description": "Redo instrument panel: proper horizontal 3-pane layout"
      },
      {
        type: 'improvement',
        "description": "Horizontal layout for synth + inst FX + master FX panels"
      },
      {
        type: 'improvement',
        "description": "Double per-channel visualizer height (36px → 72px)"
      },
      {
        type: 'improvement',
        "description": "Remove border-right from FT2 toolbar sections"
      },
      {
        type: 'feature',
        "description": "Remove viz area, add About dialog with logo + sine scroller"
      },
      {
        type: 'fix',
        "description": "HSC instrument tracking + correct note/effect parsing"
      },
      {
        type: 'improvement',
        "description": "Remove tap tempo, Ins, Del buttons from FT2 toolbar"
      },
      {
        type: 'feature',
        "description": "Strip toolbar viz to logo-only + add Nibbles dialog"
      },
      {
        type: 'fix',
        "description": "Track scopes always stretch to full width"
      },
      {
        type: 'fix',
        "description": "Remove redundant export buttons from pattern editor headers"
      },
      {
        type: 'fix',
        "description": "Track scopes react to MOD/XM/IT playback via master waveform"
      },
      {
        type: 'fix',
        "description": "Simplify track scopes to waveform-only oscilloscopes"
      },
      {
        type: 'fix',
        "description": "OPL3 multi-timbral channel routing + scratch mode grace period"
      },
      {
        type: 'fix',
        "description": "Instrument list context menu + double-click + scope channel colors"
      },
      {
        type: 'fix',
        "description": "Align track scopes strip with pattern editor channels"
      }
    ]
  },
  {
    version: '2026-04-09',
    date: '2026-04-09',
    changes: [
      {
        type: 'fix',
        "description": "Stop all audio immediately when loading new AdLib song"
      },
      {
        type: 'fix',
        "description": "Flanger/doubling on WASM-backed formats + worklet memory leak"
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
