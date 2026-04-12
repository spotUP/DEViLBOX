/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-12T23:43:12.639Z
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
export const BUILD_VERSION = '1.0.5088';
export const BUILD_NUMBER = '5088';
export const BUILD_HASH = '1d81465a3';
export const BUILD_DATE = '2026-04-12';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.5088',
    date: '2026-04-13',
    changes: [
      {
        type: 'fix',
        "description": "V2 synth filter DC offset and noise state bugs (from RetrovertApp)"
      },
      {
        type: 'fix',
        "description": "Enable OGG Vorbis decoding in PxTone WASM build"
      },
      {
        type: 'fix',
        "description": "Force-stop UADEEngine and LibopenmptEngine on stop"
      },
      {
        type: 'fix',
        "description": "Restore engine output gain on play/resume after stop mute"
      },
      {
        type: 'feature',
        "description": "Replace PreTracker with emoon's C99 replayer — full native editing + export"
      },
      {
        type: 'fix',
        "description": "Mute ALL engine output gains on stop in stopNativeEngines"
      },
      {
        type: 'fix',
        "description": "Mute libopenmpt output gain on stop to prevent audio leaking"
      },
      {
        type: 'fix',
        "description": "Mute UADE output gain on stop to prevent audio leaking"
      },
      {
        type: 'fix',
        "description": "Allow zero-size chunks in AON parser"
      },
      {
        type: 'feature',
        "description": "CheeseCutter ASID/USB-SID-Pico hardware output"
      },
      {
        type: 'fix',
        "description": "Use editorMode to route isolation to correct engine"
      },
      {
        type: 'fix',
        "description": "Stop ALL active WASM engines on stop, not just current song's"
      },
      {
        type: 'fix',
        "description": "Remove buzzmachine effect test configs from test-runner"
      },
      {
        type: 'feature',
        "description": "Add per-channel isolation for Hively + UADE (130+ Amiga formats)"
      },
      {
        type: 'fix',
        "description": "Route 6 silent formats + fix test files"
      },
      {
        type: 'fix',
        "description": "Channel-targeted effects fall back to global when isolation unavailable"
      },
      {
        type: 'fix',
        "description": "Remove buzzmachine effects (not working) + fix Aelapse clip type"
      },
      {
        type: 'fix',
        "description": "XM volume envelopes preserved when loaded via MCP load_file"
      },
      {
        type: 'feature',
        "description": "Chore: add test songs and gearmulator test page"
      },
      {
        type: 'feature',
        "description": "Chore: add quick smoke test script + soak test report"
      },
      {
        type: 'feature',
        "description": "Chore: add Aelapse and Swedish Chainsaw WASM builds"
      },
      {
        type: 'fix',
        "description": "KlysView silent-first-play — init ToneEngine before Klys playback"
      },
      {
        type: 'feature',
        "description": "DJ pad mode system — 4 modes, quick assign, factory presets"
      },
      {
        type: 'feature',
        "description": "Gate channel routing UI on format isolation support"
      },
      {
        type: 'feature',
        "description": "DJ pad category colors + glassmorphic toast notifications"
      },
      {
        type: 'fix',
        "description": "AutoDJ and precache detect server-down instead of burning through playlist"
      },
      {
        type: 'feature',
        "description": "CheeseCutter WASM bridge — cc_write_byte/cc_read_byte/cc_get_ram exports + SID AudioWorklet"
      },
      {
        type: 'feature',
        "description": "Generalize per-channel effects routing + add Furnace isolation"
      },
      {
        type: 'fix',
        "description": "UADE worklet crash recovery — reinit WASM after malloc abort"
      }
    ]
  },
  {
    version: '2026-04-12',
    date: '2026-04-12',
    changes: [
      {
        type: 'feature',
        "description": "Unified SID editor for CheeseCutter/GTUltra + SF2 editor rewrite + fix song load cleanup"
      },
      {
        type: 'feature',
        "description": "Port Swedish Chainsaw (Boss HM-2 + JCM800) distortion effect + fix master sidechain routing"
      },
      {
        type: 'fix',
        "description": "Add .jd extension + jd.* prefix to Special FX format detection"
      },
      {
        type: 'fix',
        "description": "Resolve pre-existing type errors blocking dev server startup"
      },
      {
        type: 'fix',
        "description": "Implement buzz_set_parameter in C++ + use it from worklet"
      },
      {
        type: 'feature',
        "description": "Add standard format test songs — MOD, XM, IT, S3M, FUR, SID, VGM"
      },
      {
        type: 'feature',
        "description": "Add test-songs directory — 166 formats, one file per format"
      },
      {
        type: 'fix',
        "description": "Chip RAM pattern reader — use immutable store update instead of direct mutation"
      },
      {
        type: 'feature',
        "description": "Enable 65 more formats for editing + register demoscene synths"
      },
      {
        type: 'feature',
        "description": "Dedicated WASM engine — 6502 CPU + reSID"
      },
      {
        type: 'fix',
        "description": "Direct DSP writes from render-loop param polling"
      },
      {
        type: 'fix',
        "description": "Format registry bugs + disable HMR for live use"
      },
      {
        type: 'fix',
        "description": "Throttle param polling to ~3Hz with epsilon threshold"
      },
      {
        type: 'fix',
        "description": "Buzzmachine param byte offsets — use real struct layout from C++ sources"
      },
      {
        type: 'fix',
        "description": "Poll JUCE params every frame to catch preset loads"
      },
      {
        type: 'fix',
        "description": "Direct DSP write for JUCE preset changes"
      },
      {
        type: 'fix',
        "description": "Use string param IDs for JUCE→store mapping"
      },
      {
        type: 'fix',
        "description": "Multispeed wrapper — call $1003 + N×$1006 per VBI"
      },
      {
        type: 'fix',
        "description": "Correct all param converters to match JUCE createLayout()"
      },
      {
        type: 'fix',
        "description": "Load only $0DFE-$BFFF, startPage=auto-detect"
      },
      {
        type: 'feature',
        "description": "Add uadePatternLayout to last 6 parsers without layouts"
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
