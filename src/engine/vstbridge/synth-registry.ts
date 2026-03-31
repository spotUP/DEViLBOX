/**
 * synth-registry.ts - Declarative registry for VSTBridge synths
 *
 * Adding a new synth = adding one descriptor object.
 * No worklet to write, no TypeScript class, no factory changes.
 */

export interface VSTBridgeParam {
  id: number;
  name: string;
  min: number;
  max: number;
  defaultValue: number;
}

export interface VSTBridgeDescriptor {
  /** SynthType string used in InstrumentConfig, e.g. 'DexedBridge' */
  id: string;
  /** Display name for UI, e.g. 'Dexed DX7 (Bridge)' */
  name: string;
  /** Directory under public/ containing WASM files, e.g. 'dexed' */
  wasmDir: string;
  /** Base filename (no extension), e.g. 'dexed' → dexed.wasm + dexed.js */
  wasmFile: string;
  /** Class name exported from WASM module, e.g. 'DexedSynth' */
  synthClassName: string;
  /** Emscripten module factory function name, e.g. 'createDexedModule' */
  moduleFactoryName: string;
  /** Volume normalization offset in dB (applied to output gain) */
  volumeOffsetDb?: number;
  /** Optional custom UI panel component name (overrides auto-generated knobs) */
  panelComponent?: string;
  /** Supported extension command types, e.g. ['loadSysEx', 'loadPatch'] */
  commands?: string[];
  /**
   * Explicit mapping from InstrumentConfig sub-object keys to WASM parameter IDs.
   * Used by VSTBridgeSynth.applyConfig() to translate UI config changes into
   * setParameter() calls. Required when config key names don't match WASM
   * parameter names (e.g. 'osc1Wave' → WASM param 5 "Osc1:Wave").
   */
  paramMapping?: Record<string, number>;
  /** Config key on InstrumentConfig that holds this synth's config, e.g. 'monique' */
  configKey?: string;
}

/** Global registry of VSTBridge synth descriptors */
export const SYNTH_REGISTRY = new Map<string, VSTBridgeDescriptor>();

/** Register a new VSTBridge synth descriptor */
export function registerVSTBridge(desc: VSTBridgeDescriptor): void {
  SYNTH_REGISTRY.set(desc.id, desc);
}

// ---------------------------------------------------------------------------
// Example: Register Dexed via VSTBridge (for testing/validation)
// This creates a 'DexedBridge' synth type that uses the same WASM as Dexed
// but routes through the generic VSTBridge worklet instead of Dexed.worklet.js
// ---------------------------------------------------------------------------
registerVSTBridge({
  id: 'DexedBridge',
  name: 'Dexed DX7 (Bridge)',
  wasmDir: 'dexed',
  wasmFile: 'Dexed',
  synthClassName: 'DexedSynth',
  moduleFactoryName: 'createDexedModule',
  volumeOffsetDb: -10,
  commands: ['loadSysEx', 'loadPatch'],
});

// ---------------------------------------------------------------------------
// Vital — Spectral Warping Wavetable Synthesizer by Matt Tytel
// 3 wavetable oscillators with spectral morphing, 2 filters, 8 LFOs, 6 envelopes
// ---------------------------------------------------------------------------
registerVSTBridge({
  id: 'Vital',
  name: 'Vital (Wavetable)',
  wasmDir: 'vital',
  wasmFile: 'Vital',
  synthClassName: 'VitalSynth',
  moduleFactoryName: 'createVitalModule',
  volumeOffsetDb: 0,
  panelComponent: 'VitalControls',
  commands: ['loadWavetable', 'loadPreset'],
});

// ---------------------------------------------------------------------------
// Odin2 — Semi-Modular Hybrid Synthesizer by The Wave Warden
// 3 oscillators (11 types), 2+1 filters (9 types), 5-slot FX chain
// ---------------------------------------------------------------------------
registerVSTBridge({
  id: 'Odin2',
  name: 'Odin2 (Hybrid)',
  wasmDir: 'odin2',
  wasmFile: 'Odin2',
  synthClassName: 'Odin2Synth',
  moduleFactoryName: 'createOdin2Module',
  volumeOffsetDb: 0,
  panelComponent: 'Odin2Controls',
  commands: ['loadPatch'],
});

// ---------------------------------------------------------------------------
// Surge XT — Hybrid Synthesizer by Surge Synth Team
// Dual-scene, 12 oscillator types, 32 FX types, ~765 parameters
// ---------------------------------------------------------------------------
registerVSTBridge({
  id: 'Surge',
  name: 'Surge XT (Hybrid)',
  wasmDir: 'surge',
  wasmFile: 'Surge',
  synthClassName: 'SurgeSynth',
  moduleFactoryName: 'createSurgeModule',
  volumeOffsetDb: 0,
  panelComponent: 'SurgeControls',
  commands: ['loadPatch', 'loadWavetable'],
});

// ---------------------------------------------------------------------------
// Tonewheel Organ — Hammond-style 8-voice polyphonic organ
// 9 drawbars, key click, percussion, vibrato/chorus, overdrive
// ---------------------------------------------------------------------------
registerVSTBridge({
  id: 'TonewheelOrgan',
  name: 'Tonewheel Organ',
  wasmDir: 'tonewheel',
  wasmFile: 'Tonewheel',
  synthClassName: 'TonewheelOrganSynth',
  moduleFactoryName: 'createTonewheelModule',
  volumeOffsetDb: 0,
});

// ---------------------------------------------------------------------------
// Melodica — Monophonic reed instrument physical model
// Sawtooth reed + breath noise + body resonance + vibrato + portamento
// ---------------------------------------------------------------------------
registerVSTBridge({
  id: 'Melodica',
  name: 'Melodica',
  wasmDir: 'melodica',
  wasmFile: 'Melodica',
  synthClassName: 'MelodicaWASMSynth',
  moduleFactoryName: 'createMelodicaModule',
  volumeOffsetDb: -9,
});

// ---------------------------------------------------------------------------
// Monique — Morphing Monosynth by Surge Synth Team (dual GPL3/MIT)
// 3 morphable oscillators, 3 cross-routed filters, 4 tempo-synced MFOs, arpeggiator
// ---------------------------------------------------------------------------
registerVSTBridge({
  id: 'Monique',
  name: 'Monique (Monosynth)',
  wasmDir: 'monique',
  wasmFile: 'Monique',
  synthClassName: 'MoniqueSynth',
  moduleFactoryName: 'createMoniqueModule',
  volumeOffsetDb: 0,
  configKey: 'monique',
  // Maps MoniqueConfig keys → WASM param IDs (C++ MoniqueParams enum, 0-119)
  paramMapping: {
    // Master (0-4)
    volume: 0, glide: 1, octaveOffset: 2, noteOffset: 3, sync: 4,
    // Oscillators (5-20)
    osc1Wave: 5, osc1Octave: 6, osc1FmPower: 7, osc1Sync: 8,
    osc2Wave: 9, osc2Octave: 10, osc2FmPower: 11, osc2Sync: 12,
    osc3Wave: 13, osc3Octave: 14, osc3FmPower: 15, osc3Sync: 16,
    fmMulti: 17, fmPhase: 18, fmSwing: 19, masterShift: 20,
    // Filter 1 (21-27)
    filter1Type: 21, filter1Cutoff: 22, filter1Resonance: 23,
    filter1Distortion: 24, filter1Output: 25, filter1Pan: 26, filter1ModMix: 27,
    // Filter 2 (28-34)
    filter2Type: 28, filter2Cutoff: 29, filter2Resonance: 30,
    filter2Distortion: 31, filter2Output: 32, filter2Pan: 33, filter2ModMix: 34,
    // Filter 3 (35-41)
    filter3Type: 35, filter3Cutoff: 36, filter3Resonance: 37,
    filter3Distortion: 38, filter3Output: 39, filter3Pan: 40, filter3ModMix: 41,
    // Envelope 1 — Filter 1 (42-47)
    env1Attack: 42, env1Decay: 43, env1Sustain: 44,
    env1Retrigger: 45, env1Release: 46, env1Shape: 47,
    // Envelope 2 — Filter 2 (48-53)
    env2Attack: 48, env2Decay: 49, env2Sustain: 50,
    env2Retrigger: 51, env2Release: 52, env2Shape: 53,
    // Envelope 3 — Filter 3 (54-59)
    env3Attack: 54, env3Decay: 55, env3Sustain: 56,
    env3Retrigger: 57, env3Release: 58, env3Shape: 59,
    // Envelope 4 — Main (60-65)
    env4Attack: 60, env4Decay: 61, env4Sustain: 62,
    env4Retrigger: 63, env4Release: 64, env4Shape: 65,
    // LFOs (66-74)
    lfo1Speed: 66, lfo1Wave: 67, lfo1Phase: 68,
    lfo2Speed: 69, lfo2Wave: 70, lfo2Phase: 71,
    lfo3Speed: 72, lfo3Wave: 73, lfo3Phase: 74,
    // MFOs — Morphing Oscillators (75-86)
    mfo1Speed: 75, mfo1Wave: 76, mfo1Phase: 77,
    mfo2Speed: 78, mfo2Wave: 79, mfo2Phase: 80,
    mfo3Speed: 81, mfo3Wave: 82, mfo3Phase: 83,
    mfo4Speed: 84, mfo4Wave: 85, mfo4Phase: 86,
    // Routing — filter input levels (87-95)
    filter1Input0: 87, filter1Input1: 88, filter1Input2: 89,
    filter2Input0: 90, filter2Input1: 91, filter2Input2: 92,
    filter3Input0: 93, filter3Input1: 94, filter3Input2: 95,
    // Effects (96-103)
    distortion: 96, shape: 97, delay: 98, delayPan: 99,
    reverbRoom: 100, reverbMix: 101, chorusMod: 102, effectBypass: 103,
    // Morph groups (104-107)
    morph1: 104, morph2: 105, morph3: 106, morph4: 107,
    // Arpeggiator (108-111)
    arpOn: 108, arpSequencer: 109, arpSpeed: 110, arpShuffle: 111,
    // EQ (112-119)
    eqBand1: 112, eqBand2: 113, eqBand3: 114, eqBand4: 115,
    eqBand5: 116, eqBand6: 117, eqBand7: 118, eqBypass: 119,
  },
});

// ---------------------------------------------------------------------------
// Helm — Polyphonic Synthesizer by Matt Tytel (GPL3)
// 2 oscillators, sub osc, 2 filters, 2 LFOs, 2 step sequencers, effects
// 108 parameters across 19 groups
// ---------------------------------------------------------------------------
registerVSTBridge({
  id: 'Helm',
  name: 'Helm (Poly)',
  wasmDir: 'helm',
  wasmFile: 'Helm',
  synthClassName: 'HelmSynth',
  moduleFactoryName: 'createHelmModule',
  volumeOffsetDb: 0,
});

// ---------------------------------------------------------------------------
// Sorcer — FAUST-based Wavetable Synthesizer by OpenAV (GPL2)
// Wavetable oscillator, Butterworth filter, compressor, LFO
// 21 parameters across 6 groups
// ---------------------------------------------------------------------------
registerVSTBridge({
  id: 'Sorcer',
  name: 'Sorcer (Wavetable)',
  wasmDir: 'sorcer',
  wasmFile: 'Sorcer',
  synthClassName: 'SorcerSynth',
  moduleFactoryName: 'createSorcerModule',
  volumeOffsetDb: 17,
});

// ---------------------------------------------------------------------------
// amsynth — handled by dedicated AMSynthSynth class (not VSTBridge)
// See src/engine/amsynth/AMSynthSynth.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// OB-Xf — Oberheim OB-X/OB-Xa Modeling by Surge Synth Team (GPL3)
// 2 oscillators (saw/pulse), multimode filter, 2 LFOs, analog voice variation
// 83 parameters across 12 groups
// ---------------------------------------------------------------------------
registerVSTBridge({
  id: 'OBXf',
  name: 'OB-Xf (Analog)',
  wasmDir: 'obxf',
  wasmFile: 'OBXf',
  synthClassName: 'OBXfSynth',
  moduleFactoryName: 'createOBXfModule',
  volumeOffsetDb: 0,
});

// ---------------------------------------------------------------------------
// OB-Xd — Oberheim OB-X/OB-Xa Modeling by discoDSP (GPL3)
// 2 oscillators (saw/pulse/tri/noise), biquad filter, LFO, 8-voice polyphonic
// 45 parameters across 10 groups
// ---------------------------------------------------------------------------
registerVSTBridge({
  id: 'OBXd',
  name: 'OB-Xd (Analog)',
  wasmDir: 'obxd',
  wasmFile: 'OBXd',
  synthClassName: 'OBXdSynth',
  moduleFactoryName: 'createOBXdModule',
  volumeOffsetDb: 0,
});
