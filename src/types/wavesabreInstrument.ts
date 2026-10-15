/**
 * WaveSabre Synth Instrument Type Definitions
 * 
 * Based on WaveSabre by Logicoma, a collection of small synths for 64k intros.
 * We've compiled Falcon (2-op FM) and Slaughter (oscillator + filter) to WASM.
 * 
 * Adultery (sampler) and Specimen (GSM samples) require Windows APIs and are excluded.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Falcon: 2-operator FM synth
// ═══════════════════════════════════════════════════════════════════════════

export interface FalconConfig {
  // Oscillator 1
  /** Carrier waveform: 0 sine, 1 sine plus the 3rd and 5th square harmonics (a soft square) */
  osc1Waveform: number;
  /** Carrier frequency ratio, coarse: 1 + floor(value * 32.99) times the note */
  osc1Coarse: number;
  /** Carrier frequency ratio, fine: adds ((value - 0.5) * 2)^3 to the ratio */
  osc1Fine: number;
  
  // Oscillator 2
  /** Modulator waveform: 0 sine, 1 sine plus the 3rd and 5th square harmonics */
  osc2Waveform: number;
  /** Modulator frequency ratio, coarse: 1 + floor(value * 32.99) times the note */
  osc2Coarse: number;
  /** Modulator frequency ratio, fine: adds ((value - 0.5) * 2)^3 to the ratio */
  osc2Fine: number;
  
  // FM parameters
  /** FM amount: the modulator reaches the carrier at amount^2 * 13.25 radians at full envelope */
  fmAmount: number;
  /** Unused: the engine has no separate FM ratio (kept so saved instruments load) */
  fmCoarse: number;
  /** Unused (see fmCoarse) */
  fmFine: number;
  /** Modulator feedback: value^2 / 2 of its own output re-enters its phase */
  feedback: number;
  
  // Envelope 1 (carrier)
  /** Attack time (0-1) */
  attack1: number;
  /** Decay time (0-1) */
  decay1: number;
  /** Sustain level (0-1) */
  sustain1: number;
  /** Release time (0-1) */
  release1: number;
  
  // Envelope 2 (modulator)
  /** Attack time (0-1) */
  attack2: number;
  /** Decay time (0-1) */
  decay2: number;
  /** Sustain level (0-1) */
  sustain2: number;
  /** Release time (0-1) */
  release2: number;
  
  // Master
  /** Output gain (0-1) */
  gain: number;
  /** Voices (1-8) */
  voices: number;
  /** Detune between voices (0-1) */
  detune: number;
  /** Spread between voices (0-1) */
  spread: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Slaughter: Oscillator + multimode filter synth
// ═══════════════════════════════════════════════════════════════════════════

export interface SlaughterConfig {
  // Oscillator
  /** Waveform morph: 0 saw, 1 pulse (blend in between) */
  waveform: number;
  /** Pulse width: the pulse is high for this fraction of the cycle */
  pulseWidth: number;
  /** Coarse tune: floor(value * 24.99) semitones above the note */
  coarse: number;
  /** Fine tune: 0 to 1 semitone above the note */
  fine: number;
  
  // Filter
  /** Filter type: floor(value * 3) = 0 low-pass, 1 high-pass, 2 band-pass, 3 notch */
  filterType: number;
  /** Filter cutoff frequency (0-1) */
  cutoff: number;
  /** Filter resonance (0-1) */
  resonance: number;
  /** Filter envelope amount (0-1) */
  filterEnvAmount: number;
  
  // Amp envelope
  /** Attack time (0-1) */
  ampAttack: number;
  /** Decay time (0-1) */
  ampDecay: number;
  /** Sustain level (0-1) */
  ampSustain: number;
  /** Release time (0-1) */
  ampRelease: number;
  
  // Filter envelope
  /** Attack time (0-1) */
  filterAttack: number;
  /** Decay time (0-1) */
  filterDecay: number;
  /** Sustain level (0-1) */
  filterSustain: number;
  /** Release time (0-1) */
  filterRelease: number;
  
  // Master
  /** Output gain (0-1) */
  gain: number;
  /** Voices (1-8) */
  voices: number;
  /** Detune between voices (0-1) */
  detune: number;
  /** Spread between voices (0-1) */
  spread: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Combined WaveSabre instrument config
// ═══════════════════════════════════════════════════════════════════════════

export type WaveSabreSynthType = 'falcon' | 'slaughter' | 'adultery';

export interface WaveSabreInstrumentConfig {
  synthType: WaveSabreSynthType;
  falcon?: FalconConfig;
  slaughter?: SlaughterConfig;
}

// ═══════════════════════════════════════════════════════════════════════════
// Default values
// ═══════════════════════════════════════════════════════════════════════════

export const DEFAULT_FALCON_CONFIG: FalconConfig = {
  // Oscillator 1
  osc1Waveform: 0,
  osc1Coarse: 0, // ratio 1
  osc1Fine: 0.5,
  
  // Oscillator 2
  osc2Waveform: 0,
  osc2Coarse: 0.04, // ratio 2
  osc2Fine: 0.5,
  
  // FM
  fmAmount: 0.3,
  fmCoarse: 0.125, // Ratio 2:1
  fmFine: 0.5,
  feedback: 0.1,
  
  // Envelope 1
  attack1: 0.01,
  decay1: 0.3,
  sustain1: 0.5,
  release1: 0.3,
  
  // Envelope 2
  attack2: 0.01,
  decay2: 0.2,
  sustain2: 0.3,
  release2: 0.2,
  
  // Master
  gain: 0.5,
  voices: 0, // one voice (VoicesUnisono = voices * 15 + 1)
  detune: 0.1,
  spread: 0.5,
};

export const DEFAULT_SLAUGHTER_CONFIG: SlaughterConfig = {
  // Oscillator
  waveform: 0, // Saw
  pulseWidth: 0.5,
  coarse: 0, // semitones above the note (floor(coarse * 24.99))
  fine: 0, // 0..1 semitone
  
  // Filter
  filterType: 0, // LP
  cutoff: 0.5,
  resonance: 0.3,
  filterEnvAmount: 0.5,
  
  // Amp envelope
  ampAttack: 0.01,
  ampDecay: 0.3,
  ampSustain: 0.7,
  ampRelease: 0.3,
  
  // Filter envelope
  filterAttack: 0.01,
  filterDecay: 0.2,
  filterSustain: 0.3,
  filterRelease: 0.2,
  
  // Master
  gain: 0.5,
  voices: 0, // one voice (VoicesUnisono = voices * 15 + 1)
  detune: 0.1,
  spread: 0.5,
};

export const DEFAULT_WAVESABRE_INSTRUMENT: WaveSabreInstrumentConfig = {
  synthType: 'falcon',
  falcon: { ...DEFAULT_FALCON_CONFIG },
  slaughter: { ...DEFAULT_SLAUGHTER_CONFIG },
};

// ═══════════════════════════════════════════════════════════════════════════
// Parameter indices for WASM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Engine parameter index for each config key (WaveSabreCore Falcon::ParamIndices and Slaughter::ParamIndices, the order
 * the VST and Renoise store). -1 marks a config key the engine has no counterpart for: it is kept so saved instruments
 * load, and nothing is written for it.
 *
 * Falcon is a two-operator FM voice: oscillator 2 is the carrier (its envelope shapes the output), oscillator 1 the
 * modulator (its envelope scales the modulation depth). Config "osc1" and "carrier envelope" (attack1..) are therefore
 * the engine's oscillator 2, config "osc2" and "modulator envelope" (attack2..) the engine's oscillator 1.
 */
export const FalconParamIndex: Record<keyof FalconConfig, number> = {
  osc1Waveform: 9,   // Osc2Waveform
  osc1Coarse: 10,    // Osc2RatioCoarse
  osc1Fine: 11,      // Osc2RatioFine
  osc2Waveform: 0,   // Osc1Waveform
  osc2Coarse: 1,     // Osc1RatioCoarse
  osc2Fine: 2,       // Osc1RatioFine
  fmAmount: 4,       // Osc1FeedForward: how much of the modulator reaches the carrier
  fmCoarse: -1,
  fmFine: -1,
  feedback: 3,       // Osc1Feedback
  attack1: 13,       // Osc2Attack
  decay1: 14,
  sustain1: 15,
  release1: 16,
  attack2: 5,        // Osc1Attack
  decay2: 6,
  sustain2: 7,
  release2: 8,
  gain: 17,          // MasterLevel
  voices: 18,        // VoicesUnisono
  detune: 19,        // VoicesDetune
  spread: 20,        // VoicesPan
};

export const SlaughterParamIndex: Record<keyof SlaughterConfig, number> = {
  waveform: 0,       // Osc1Waveform: 0 saw to 1 pulse
  pulseWidth: 1,     // Osc1PulseWidth
  coarse: 3,         // Osc1DetuneCoarse
  fine: 4,           // Osc1DetuneFine
  filterType: 16,    // FilterType
  cutoff: 17,        // FilterFreq
  resonance: 18,     // FilterResonance
  filterEnvAmount: 19, // FilterModAmt
  ampAttack: 20,     // AmpAttack
  ampDecay: 21,
  ampSustain: 22,
  ampRelease: 23,
  filterAttack: 24,  // ModAttack
  filterDecay: 25,
  filterSustain: 26,
  filterRelease: 27,
  gain: 28,          // MasterLevel
  voices: 29,        // VoicesUnisono
  detune: 30,        // VoicesDetune
  spread: 31,        // VoicesPan
};
