/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-22T21:46:16.279Z
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
export const BUILD_VERSION = '1.0.6070';
export const BUILD_NUMBER = '6070';
export const BUILD_HASH = '6013a2be1';
export const BUILD_DATE = '2026-04-22';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.6070',
    date: '2026-04-22',
    changes: [
      {
        type: 'feature',
        "description": "Swappable DubBus echo engine + RE-201/AnotherDelay master FX presets"
      },
      {
        type: 'feature',
        "description": "Add dub/sound system presets to all reverb and echo effects"
      },
      {
        type: 'feature',
        "description": "Proper dub/sound system presets for RE-201 and AnotherDelay"
      },
      {
        type: 'feature',
        "description": "Port RE-201 Space Echo and AnotherDelay to WASM"
      },
      {
        type: 'improvement',
        "description": "Keyboard navigation UX overhaul: menus, focus rings, focus traps, dynamic shortcuts"
      },
      {
        type: 'feature',
        "description": "Add UI labeling rule to CLAUDE.md — never abbreviate labels"
      },
      {
        type: 'improvement',
        "description": "Use full readable words for DJ FX pad labels instead of abbreviations"
      },
      {
        type: 'improvement',
        "description": "Route DJ FX pads through DubBus WASM effects instead of naive Web Audio"
      },
      {
        type: 'fix',
        "description": "Siren pad fires actual synth instead of silent feedback ramp"
      },
      {
        type: 'improvement',
        "description": "Color-tinted backgrounds for FX pads, stem controls, and drum pads"
      },
      {
        type: 'improvement',
        "description": "Make stem controls and FX pads look like proper buttons"
      },
      {
        type: 'improvement',
        "description": "Increase text sizes across all dub components + add hover info bar"
      },
      {
        type: 'improvement',
        "description": "Increase dub strip button and text sizes for readability"
      },
      {
        type: 'feature',
        "description": "Loop all songs by default in DJ view"
      },
      {
        type: 'feature',
        "description": "Playlist-level stem separation — auto-queue on add + bulk separate"
      },
      {
        type: 'feature',
        "description": "Add server status badges to app header"
      },
      {
        type: 'feature',
        "description": "Add preview/apply/discard flow to sample enhancer"
      },
      {
        type: 'feature',
        "description": "Add progress bar to sample enhancer panel"
      },
      {
        type: 'feature',
        "description": "Add 4-stem / 6-stem model selector for Demucs separation"
      },
      {
        type: 'fix',
        "description": "Scope port cleanup to DEViLBOX-owned processes only"
      },
      {
        type: 'improvement',
        "description": "Stream Auto Dub — autonomous dub effects for DJ audio decks"
      },
      {
        type: 'improvement',
        "description": "DJ stem mixer UI + per-stem waveform visualization"
      },
      {
        type: 'feature',
        "description": "Add stem separation priority queue, pre-separation, and auto-load"
      },
      {
        type: 'improvement',
        "description": "Persist stem separation results across component unmount/remount"
      },
      {
        type: 'feature',
        "description": "Add fine-grained stem separation progress from WASM log parsing"
      },
      {
        type: 'fix',
        "description": "Fix stem button not visible after HMR (undefined vs null guard)"
      },
      {
        type: 'feature',
        "description": "Add on-demand stem separation for all DJ formats"
      },
      {
        type: 'fix',
        "description": "Fix Demucs WASM crash (HEAPU8 export), model URLs, resonance tamer"
      },
      {
        type: 'feature',
        "description": "Per-stem dub effect sends"
      },
      {
        type: 'feature',
        "description": "Integrate stem separation into Sample Editor, Import Dialog, Beat Slicer"
      },
      {
        type: 'feature',
        "description": "DJ deck stem playback (Phase 4)"
      },
      {
        type: 'feature',
        "description": "Add Demucs WASM stem separation engine (Phase 1-3)"
      },
      {
        type: 'improvement',
        "description": "Convert Auto Dub from inline toolbar to portal dropdown dialog"
      },
      {
        type: 'fix',
        "description": "Fix MOVES dropdown clipped by overflow-hidden, preview plays directly"
      },
      {
        type: 'fix',
        "description": "Harden dub system: clamp feedback params, fix panic cleanup"
      },
      {
        type: 'feature',
        "description": "Add preview button to tracker Modland/HVSC browser"
      },
      {
        type: 'fix',
        "description": "Fix dub bus bass shelf self-oscillation in feedback loop"
      },
      {
        type: 'fix',
        "description": "Clamp dub bass shelf to ±12 dB — prevents feedback loop NaN blowup"
      },
      {
        type: 'fix',
        "description": "Cap all live-automated filters at -12 rolloff to prevent NaN audio death"
      },
      {
        type: 'fix',
        "description": "Prevent dub siren filter from killing all audio"
      },
      {
        type: 'fix',
        "description": "Write automation curves for all dub moves, not just holds/globals"
      },
      {
        type: 'fix',
        "description": "Display dub effect commands as Zxx instead of ?XX in pattern editor"
      },
      {
        type: 'fix',
        "description": "Match empty XM pattern lengths and order to actual song data"
      },
      {
        type: 'fix',
        "description": "Route .dbx synth songs through libopenmpt for proper looping"
      }
    ]
  },
  {
    version: '2026-04-21',
    date: '2026-04-21',
    changes: [
      {
        type: 'fix',
        "description": "Fix DefleMask import: handle corrupted zlib checksums + proper DMF detection"
      },
      {
        type: 'improvement',
        "description": "Remove .dvbx extension — standardize on .dbx only"
      },
      {
        type: 'feature',
        "description": "Add zlib compression for .dbx/.dvbx project files + LZMA for NanoExporter"
      },
      {
        type: 'fix',
        "description": "Add masterVol/systemVol/systemPan to WASM file-ops path"
      },
      {
        type: 'fix',
        "description": ".fur files misidentified as DefleMask when WASM unavailable"
      },
      {
        type: 'fix',
        "description": "Correct POST_AMP enum IDs + apply masterVol/systemVol/systemPan"
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
