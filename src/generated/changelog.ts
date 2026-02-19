/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-19T20:49:04.428Z
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
export const BUILD_VERSION = '1.0.953';
export const BUILD_NUMBER = '953';
export const BUILD_HASH = '433db49a';
export const BUILD_DATE = '2026-02-19';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.953',
    date: '2026-02-19',
    changes: [
      {
        type: 'fix',
        "description": "Atomic applyInstrument + clearSelection preserves clipboard"
      },
      {
        type: 'fix',
        "description": "Resolve all npm run type-check errors (tsc -b --force)"
      },
      {
        type: 'improvement',
        "description": "Chore: regenerate changelog, gitignore WASM build artifacts"
      },
      {
        type: 'fix',
        "description": "Implement paste/edit commands + patternOrder + console cleanup"
      },
      {
        type: 'fix',
        "description": "5 user-reported bugs — MIDI loading, TD-3 demos, reset localStorage, popup knobs, popup height"
      },
      {
        type: 'fix',
        "description": "Wire undo history + fix clonePattern + console cleanup"
      },
      {
        type: 'fix',
        "description": "Chore: remove debug console.logs from UIStore migration, add plan docs"
      },
      {
        type: 'fix',
        "description": "Syntax errors in useHistoryStore/PatternScheduler, remove dead diagnostic fields in TrackerReplayer"
      },
      {
        type: 'fix',
        "description": "Beta readiness — console cleanup, undo/redo, bug fixes"
      },
      {
        type: 'feature',
        "description": "Add MiniOutputMeter to effect chain cards — live RMS bar for each effect"
      },
      {
        type: 'fix',
        "description": "Consistency pass — hook after getParam calls in 3 editors, fix AutoPanner color"
      },
      {
        type: 'improvement',
        "description": "Move useEffectAnalyser call to after all getParam reads for consistency"
      },
      {
        type: 'feature',
        "description": "Add live visualizers to all effect editors — waveshaper curves, oscilloscopes, spectrums, GR meter"
      },
      {
        type: 'fix',
        "description": "Guard canvas resize, document no-dep useEffect pattern"
      },
      {
        type: 'feature',
        "description": "Add EffectVisualizer components — oscilloscope, spectrum, waveshaper curve, GR meter, mini meter"
      },
      {
        type: 'feature',
        "description": "Add useEffectAnalyser hook — reads pre/post analyser taps at 30fps"
      },
      {
        type: 'feature',
        "description": "Expose getMasterEffectAnalysers() for visualizer hook"
      },
      {
        type: 'fix',
        "description": "Fix analyser pre-tap node resolution; remove VinylNoise debug logs"
      },
      {
        type: 'feature',
        "description": "Add pre/post AnalyserNode taps per master effect for visualizers"
      },
      {
        type: 'fix',
        "description": "Move DYNAMICS_EFFECTS to module scope, remove SidechainCompressor from set"
      },
      {
        type: 'fix',
        "description": "Default wet 100 for dynamics effects — wet slider has no audio effect but showing 50 is misleading"
      },
      {
        type: 'fix',
        "description": "Re-send bits in registry path after worklet ready"
      },
      {
        type: 'fix',
        "description": "Re-send bits value after AudioWorklet is ready"
      },
      {
        type: 'fix',
        "description": "Update remaining order:50 defaults in registry and editor fallback"
      },
      {
        type: 'fix',
        "description": "Change default order from 50 to 2 — order 50 causes extreme distortion"
      },
      {
        type: 'fix',
        "description": "VinylNoise hiss audibility + tracker Backspace at row 0 + Cmd+Backspace on Mac"
      },
      {
        type: 'improvement',
        "description": "Chore: regenerate changelog"
      },
      {
        type: 'feature',
        "description": "Tumult — playback gate, sample-rate correction, followAmount default"
      },
      {
        type: 'feature',
        "description": "VinylNoise — playback gate, source mode, stylus/worn filters"
      },
      {
        type: 'fix',
        "description": "Resolve all pre-existing test failures (1219/1219 passing)"
      },
      {
        type: 'fix',
        "description": "Full audit — wet accessor, stale UI defaults, Custom mode sample browser"
      },
      {
        type: 'fix',
        "description": "Groove system — stride formula, active state, MOD pitch priority"
      },
      {
        type: 'fix',
        "description": "Correct defaults — Duck mode, mix 0.5, all EQ bands off"
      },
      {
        type: 'fix',
        "description": "Use additive mix formula so music always passes through"
      },
      {
        type: 'fix',
        "description": "Rename set→setParam, wire ToneEngine parameter dispatch"
      },
      {
        type: 'feature',
        "description": "TumultEditor React component — source, controls, 5-band EQ"
      },
      {
        type: 'feature',
        "description": "TumultEffect.ts — Tone.js wrapper with sample loading"
      },
      {
        type: 'improvement',
        "description": "Precompute clip exponents, env coefficients, hoist playerGain"
      },
      {
        type: 'feature',
        "description": "Worklet — clipper, sample player, envelope follower, processor"
      },
      {
        type: 'feature',
        "description": "Worklet — SVF filter classes (svf_*.cpp 1:1 port)"
      },
      {
        type: 'feature',
        "description": "Worklet — noise generator DSP (noise.cpp 1:1 port)"
      },
      {
        type: 'feature',
        "description": "Bundle 95 sample WAV files"
      },
      {
        type: 'feature',
        "description": "Add Tumult to type system and EffectRegistry"
      },
      {
        type: 'feature',
        "description": "VinylNoise — full vinyl emulator expansion"
      },
      {
        type: 'improvement',
        "description": "Add Tumult implementation plan"
      },
      {
        type: 'improvement',
        "description": "Add Tumult effect port design doc"
      },
      {
        type: 'fix',
        "description": "On/off toggle button is green when active in master effects chain"
      },
      {
        type: 'fix',
        "description": "Active LED is green in master effects chain column"
      },
      {
        type: 'fix',
        "description": "Remove redundant settings button from master effects chain items"
      },
      {
        type: 'fix',
        "description": "Master effects browser — widen chain column, narrow browser column"
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
