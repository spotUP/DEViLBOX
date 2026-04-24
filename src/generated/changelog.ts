/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-24T13:37:44.985Z
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
export const BUILD_VERSION = '1.0.6134';
export const BUILD_NUMBER = '6134';
export const BUILD_HASH = 'b27ded6f1';
export const BUILD_DATE = '2026-04-24';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.6134',
    date: '2026-04-24',
    changes: [
      {
        type: 'fix',
        "description": "Tubby springEcho, BBD treble, WASM pre-heat, faster swap, hover layout"
      },
      {
        type: 'fix',
        "description": "Spring output mute during warmup + Perry springEcho chain order"
      },
      {
        type: 'fix',
        "description": "Tune RE201 and AnotherDelay adapter voicing"
      },
      {
        type: 'fix',
        "description": "RE201 WASM stability — fix NaN at 640ms from unstable filters"
      },
      {
        type: 'fix',
        "description": "Mute-hold guard prevents spring burst leak during echo engine swap"
      },
      {
        type: 'fix',
        "description": "Fix dry bus — ConvolverNode null buffer + feedback cycle without DelayNode"
      },
      {
        type: 'fix',
        "description": "Resonance Tamer — transient-vs-sustained discrimination"
      },
      {
        type: 'feature',
        "description": "Phase 3+ — chain reorder, ext feedback, club sim, intros, macros"
      }
    ]
  },
  {
    version: '2026-04-23',
    date: '2026-04-23',
    changes: [
      {
        type: 'feature',
        "description": "Phase 2 — ghost reverb, siren presets, post-echo sat, ring mod, lo-fi"
      },
      {
        type: 'feature',
        "description": "Phase 1 — return EQ, true phaser, spring kick, delay presets"
      },
      {
        type: 'feature',
        "description": "Test: add contract test for compressor ratio bypass during echo swap"
      },
      {
        type: 'fix',
        "description": "Bypass compressors with ratio=1 during echo swap"
      },
      {
        type: 'fix',
        "description": "Defer spring params until return_ is at 0, disable sidechain during swap"
      },
      {
        type: 'fix',
        "description": "Remove spring input/output mute — was starving delay lines, killing reverb"
      },
      {
        type: 'fix',
        "description": "Mute spring input+output during param transitions + debounce slider updates"
      },
      {
        type: 'fix',
        "description": "Mute spring JS output during param transitions"
      },
      {
        type: 'fix',
        "description": "Root-cause — smooth Aelapse params in worklet, revert band-aids"
      },
      {
        type: 'fix',
        "description": "Revert DRYWET=0 hack, lower ceiling, slow recovery ramp"
      },
      {
        type: 'fix',
        "description": "Mute spring INTERNALLY during preset param storm"
      },
      {
        type: 'fix',
        "description": "Safety limiter on spring.output + longer warmup holds"
      },
      {
        type: 'improvement',
        "description": "Diag(dub): SpringTap — measure spring.output RMS for 2s after preset change"
      },
      {
        type: 'feature',
        "description": "Diag(dub): add [DubBusCtrl]/[DubBusSnap] logs for interactive walkthrough"
      },
      {
        type: 'fix',
        "description": "Warmup mute on same-engine preset transitions (Tubby↔MadProfessor)"
      },
      {
        type: 'fix',
        "description": "Hold feedback+return muted 120ms after engine swap to bleed WASM startup transient"
      },
      {
        type: 'fix',
        "description": "Third NaN-scrubber between echo→spring protects spring worklet"
      },
      {
        type: 'fix',
        "description": "Reverse-chain-order preserves forward NaN-scrubber"
      },
      {
        type: 'fix',
        "description": "Chore(dub): remove scrubber amplitude telemetry — fix confirmed"
      },
      {
        type: 'improvement',
        "description": "Diag(dub): scrubber amplitude telemetry + drop explicit channel forcing"
      },
      {
        type: 'fix',
        "description": "Forward scrubber is NaN-only, no tanh — fixes 'dreaded bass sound'"
      },
      {
        type: 'fix',
        "description": "Forward scrubber uses native .connect() — reverb no longer silent"
      },
      {
        type: 'fix',
        "description": "Forward NaN-scrubber on spring.output → sidechain"
      },
      {
        type: 'fix',
        "description": "Eliminate scrubber race + soft-limit feedback runaway"
      },
      {
        type: 'fix',
        "description": "NaN-scrubber AudioWorklet on feedback tap prevents Tubby crash"
      },
      {
        type: 'improvement',
        "description": "Diag(dub): log biquad + gain node state pre/post character preset pick"
      },
      {
        type: 'fix',
        "description": "Apply fallback-disconnect-first to RETapeEcho + AnotherDelay"
      },
      {
        type: 'fix',
        "description": "Safe biquad automation to prevent 'state is bad' NaN latch"
      },
      {
        type: 'fix',
        "description": "Transactional echo-engine swap + RE-201 fallback/WASM ordering"
      },
      {
        type: 'improvement',
        "description": "Test: contract test for Phase 4 standalone per-voice synths"
      },
      {
        type: 'improvement',
        "description": "Route UADESynth to wasm-info editor"
      },
      {
        type: 'improvement',
        "description": "Expose Eupmini/PreTracker/RonKlaren/Sawteeth synths in browser"
      },
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
