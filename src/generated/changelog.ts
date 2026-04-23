/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-23T09:59:52.747Z
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
export const BUILD_VERSION = '1.0.6094';
export const BUILD_NUMBER = '6094';
export const BUILD_HASH = '8483160e8';
export const BUILD_DATE = '2026-04-23';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.6094',
    date: '2026-04-23',
    changes: [
      {
        type: 'improvement',
        "description": "Dub: smoother lane playhead (match PatternEditorCanvas drain pattern)"
      },
      {
        type: 'improvement',
        "description": "Dub: time-mode lanes for raw SID / SC68 + Sc68Visualizer for raw SIDs"
      },
      {
        type: 'feature',
        "description": "Auto-boost SID master volume when dub bus is enabled"
      },
      {
        type: 'feature',
        "description": "SID-fy slam and sub-harmonic generators"
      },
      {
        type: 'fix',
        "description": "Export wasmMemory from RE201 and AnotherDelay"
      },
      {
        type: 'feature',
        "description": "Soft-compression curve on channel dub sends"
      },
      {
        type: 'fix',
        "description": "AnotherDelay JS-fallback 'forever' tail — cap feedback at 0.7"
      },
      {
        type: 'improvement',
        "description": "RAF-batch dubSend state writes to prevent SID audio stutter"
      },
      {
        type: 'fix',
        "description": "SID channel sliders — replace broken require() with ES import"
      },
      {
        type: 'fix',
        "description": "Debug: trace setSidVoiceDubSend path selection for slider→reverb issue"
      },
      {
        type: 'fix',
        "description": "SID channel sliders — no reverb + audio stutter"
      },
      {
        type: 'feature',
        "description": "Animate channel faders during dub tap open/close"
      },
      {
        type: 'feature',
        "description": "Animate dub deck buttons and faders on move fire"
      },
      {
        type: 'fix',
        "description": "WASM worklets crash in AudioWorklet — environment shims"
      },
      {
        type: 'fix',
        "description": "SID channel dub sends silent with websid — whole-mix fallback"
      },
      {
        type: 'fix',
        "description": "SID dub synths pulse-wave instruments silent — pulse width was 0"
      },
      {
        type: 'fix',
        "description": "SID dub synths use playTestNote for reliable note triggering"
      },
      {
        type: 'fix',
        "description": "SID dub bus — zero baseline, sync voice tap routing, singleton accessor"
      },
      {
        type: 'feature',
        "description": "Expand SID dub synths — 8 siren presets, 9 new instruments, preset selection"
      },
      {
        type: 'feature',
        "description": "Per-voice SID echo throws, GT Ultra presets, SidMon2 synth browser"
      },
      {
        type: 'improvement',
        "description": "SID dub synths (GTUltra WASM), auto-dub format warning, 16 tests"
      },
      {
        type: 'fix',
        "description": "Fix master FX preset display: derive active preset via fingerprint matching"
      },
      {
        type: 'fix',
        "description": "SID per-voice mute/solo — track bitmask per engine"
      }
    ]
  },
  {
    version: '2026-04-22',
    date: '2026-04-22',
    changes: [
      {
        type: 'fix',
        "description": "Connect SID engine output to dub bus send"
      },
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
