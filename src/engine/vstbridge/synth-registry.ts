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
  volumeOffsetDb: 41,
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
  volumeOffsetDb: 0,
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
  volumeOffsetDb: 0,
});

// ---------------------------------------------------------------------------
// amsynth — Classic Analog Modeling Synthesizer by Nick Dowell (GPL2)
// 2 oscillators, filter, 2 envelopes, LFO, Freeverb reverb, distortion
// 41 parameters across 11 groups
// ---------------------------------------------------------------------------
registerVSTBridge({
  id: 'Amsynth',
  name: 'amsynth (Analog)',
  wasmDir: 'amsynth',
  wasmFile: 'Amsynth',
  synthClassName: 'AmsynthSynth',
  moduleFactoryName: 'createAmsynthModule',
  volumeOffsetDb: 0,
});

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
