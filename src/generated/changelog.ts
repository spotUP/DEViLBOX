/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-22T13:08:52.164Z
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
export const BUILD_VERSION = '1.0.6048';
export const BUILD_NUMBER = '6048';
export const BUILD_HASH = '2806c02b1';
export const BUILD_DATE = '2026-04-22';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.6048',
    date: '2026-04-22',
    changes: [
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
      },
      {
        type: 'fix',
        "description": "Scale multi-chip output by 1/chipCount — root cause of distortion"
      },
      {
        type: 'fix',
        "description": "Add safety limiter to master bus — prevents catastrophic clipping"
      },
      {
        type: 'feature',
        "description": "Prime scratch ring buffer at deck load — scratch-audible before play"
      },
      {
        type: 'fix',
        "description": "Scratch on stopped deck — Option C (no audio-source resume)"
      },
      {
        type: 'fix',
        "description": "Scratching stopped deck — release pauses immediately, no forward burst"
      },
      {
        type: 'fix',
        "description": "Scratch on stopped deck — correct behavior (scratch sounds, release pauses)"
      },
      {
        type: 'improvement',
        "description": "Rename(dub): \"GHOST\" bus-bleed toggle → \"BLEED\" to avoid ghost-pattern collision"
      },
      {
        type: 'fix',
        "description": "Move blacklist button is now actually findable"
      },
      {
        type: 'fix',
        "description": "Scratching a stopped deck no longer starts playback on release"
      },
      {
        type: 'improvement',
        "description": "Diag(dub-recorder): log cell-write decisions to trace missing Zxx cells"
      },
      {
        type: 'fix',
        "description": "Fall back to any non-empty channel when role match empty"
      },
      {
        type: 'feature',
        "description": "Resonance Tamer — auto-clear fighting frequencies on master"
      },
      {
        type: 'fix',
        "description": "Restore automationCurves + dubBus + autoDub on .dbx import"
      },
      {
        type: 'improvement',
        "description": "Test(ui-smoke): skip flow 08 until warm-reload baseline is root-caused"
      },
      {
        type: 'feature',
        "description": "Extract 5 dub voices as standalone synths in the registry"
      },
      {
        type: 'feature',
        "description": "Extended Zxx encoding + global/hold → automation curves + 27-move picker"
      },
      {
        type: 'feature',
        "description": "SoundTouch WASM key-lock + dub fullscreen + export peak-limit"
      },
      {
        type: 'feature',
        "description": "Any-instrument promotion — bass/perc below dominance threshold"
      },
      {
        type: 'feature',
        "description": "DubRecorder writes Zxx cells inline + source=lane replay guard"
      },
      {
        type: 'improvement',
        "description": "Test(ui-smoke): flow 13 — role classification from real Modland dub MOD"
      },
      {
        type: 'improvement',
        "description": "Global FX lane chapter section + Zxx 36/37/38 correction"
      },
      {
        type: 'feature',
        "description": "Global FX lane — pattern-editor row above channels"
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
