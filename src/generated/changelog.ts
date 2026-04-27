/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-27T13:42:50.442Z
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
export const BUILD_VERSION = '1.0.6296';
export const BUILD_NUMBER = '6296';
export const BUILD_HASH = '13e859b52';
export const BUILD_DATE = '2026-04-27';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.6296',
    date: '2026-04-27',
    changes: [
      {
        type: 'feature',
        "description": "PatternEditorCanvas — MASTER_DUB_LANE_WIDTH slot + MasterDubLane render"
      },
      {
        type: 'feature',
        "description": "MasterDubLane — 48px global dub automation column"
      },
      {
        type: 'feature',
        "description": "AutomationLane — color + label dub.* parameters using MOVE_COLOR"
      },
      {
        type: 'feature',
        "description": "Fil4EqPanel — vertical gain faders, freq via curve handles"
      },
      {
        type: 'fix',
        "description": "Fil4EqCurve — remove dead helpers, non-passive wheel listener for React 19"
      },
      {
        type: 'feature',
        "description": "Fil4EqCurve — export freqToX/dbToY/BandId, add draggable band handles overlay"
      },
      {
        type: 'fix',
        "description": "Remove dead fireRow from pendingHolds, tighten spike-row assertion"
      },
      {
        type: 'feature',
        "description": "DubRecorder — write automation curves per-channel, remove dubLane events"
      },
      {
        type: 'fix',
        "description": "Dub.channelMute restore uses volume column even after mute row"
      },
      {
        type: 'feature',
        "description": "AutomationBaker — dub.* effect mappings (channelMute, echoThrow, eqSweep)"
      },
      {
        type: 'fix',
        "description": "Remove duplicate eqSweep from HOLD_KINDS"
      },
      {
        type: 'improvement',
        "description": "Extract MOVE_COLOR + HOLD_KINDS to moveColors.ts"
      },
      {
        type: 'improvement',
        "description": "Dub studio visual spec — vertical EQ faders + unified dub automation lanes"
      },
      {
        type: 'improvement',
        "description": "Replace EQ knobs with horizontal sliders in Fil4EqPanel"
      },
      {
        type: 'fix',
        "description": "Dub deck tabs — PERFORM/EQ/BUS only, TONE in BUS tab, lane in PERFORM"
      },
      {
        type: 'feature',
        "description": "Tabbed DubDeckStrip — PERFORM / EQ / BUS / RECORD tabs"
      },
      {
        type: 'fix',
        "description": "Fil4EQ — genre preset dropdown + flat reset + EQ in DubDeckStrip + N_IR 4096→1024"
      },
      {
        type: 'feature',
        "description": "EQ button in DubDeckStrip + fix WASM N_IR 4096→1024 (eliminates silence on knob moves)"
      },
      {
        type: 'feature',
        "description": "Fil4EqPanel auto-EQ info bar — genre label, strength slider"
      },
      {
        type: 'feature',
        "description": "DubBus auto-EQ — enhancer chain, analysis subscription, _applyAutoEQ, dispose cleanup"
      },
      {
        type: 'feature',
        "description": "Add DubBusEnhancer — spectral exciter, transient sharpener, offline lo-fi pipeline"
      },
      {
        type: 'improvement',
        "description": "Test: AutoEQ.ts unit tests — genre baseline, instrument modulation, spectral, detectLoFi"
      },
      {
        type: 'feature',
        "description": "Add AutoEQ.ts — genre/instrument/spectral EQ computation + lo-fi detection"
      },
      {
        type: 'feature',
        "description": "Add frequencyPeaks to FullAnalysisResult + autoEqStrength/autoEqLastGenre to DubBusSettings"
      },
      {
        type: 'improvement',
        "description": "Auto EQ implementation plan (7 tasks)"
      },
      {
        type: 'improvement',
        "description": "Update auto-EQ spec — add DC removal, denoise, spectral exciter, transient sharpener stages"
      },
      {
        type: 'improvement',
        "description": "Auto-EQ design spec (genre+instrument+spectral+neural enhancement)"
      },
      {
        type: 'fix',
        "description": "Fil4EQ — getMagnitude promise cleanup on dispose, Q-to-BW conversion in compat aliases, params emit on worklet ready, Button for toggles"
      },
      {
        type: 'feature',
        "description": "Wire Fil4EqPanel into MasterEffectsModal for master FX chain"
      },
      {
        type: 'feature',
        "description": "Add Fil4EqCurve canvas display and Fil4EqPanel master FX UI"
      },
      {
        type: 'feature',
        "description": "Register Fil4EQ as master FX effect type (AudioEffectType, unifiedEffects, EffectFactory)"
      },
      {
        type: 'feature',
        "description": "Swap DubBus returnEQ from ParametricEQEffect to Fil4EqEffect + HP/LP wiring"
      },
      {
        type: 'feature',
        "description": "Add returnEqHp*/returnEqLp* fields to DubBusSettings for Fil4 pass filters"
      },
      {
        type: 'improvement',
        "description": "Test: Fil4EqEffect contract test covering ParametricEQEffect surface"
      },
      {
        type: 'fix',
        "description": "Fil4EqEffect set_shelf uses which:0/1 not shelf:'low'/'high' to match worklet"
      },
      {
        type: 'feature',
        "description": "Add Fil4EqEffect ToneAudioNode wrapper (drop-in for ParametricEQEffect)"
      },
      {
        type: 'feature',
        "description": "Add Fil4 AudioWorklet processor"
      },
      {
        type: 'feature',
        "description": "Build fil4 WASM parametric EQ (8-band, Regalia-Mitra, Goertzel magnitude)"
      },
      {
        type: 'fix',
        "description": "Fil4_wasm parametric band gain divisor /40 → /20 (linear amplitude, not sqrt)"
      },
      {
        type: 'feature',
        "description": "Chore: add fil4.lv2 DSP source files (iir, filters, hip, lop)"
      },
      {
        type: 'improvement',
        "description": "Fil4 WASM EQ implementation plan"
      },
      {
        type: 'improvement',
        "description": "Fil4 WASM parametric EQ design spec"
      },
      {
        type: 'fix',
        "description": "Dub bus defaults — eliminate damp cloth sound character"
      },
      {
        type: 'fix',
        "description": "Cxx volume fires without note; apply instrument default volume on switch"
      },
      {
        type: 'feature',
        "description": "Implement E6x pattern loop and EEx pattern delay in TS scheduler path"
      },
      {
        type: 'feature',
        "description": "Implement missing XM effects for synth channels in hybrid mode"
      },
      {
        type: 'fix',
        "description": "Sync transport speed display when Fxx effect fires during playback"
      },
      {
        type: 'fix',
        "description": "Persona hints in AutoDub panel, remove dead genre worker"
      },
      {
        type: 'fix',
        "description": "Classification follow-ups — shared model, CED Tier 3, dub refinements"
      },
      {
        type: 'feature',
        "description": "CED neural instrument/genre classification overhaul"
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
