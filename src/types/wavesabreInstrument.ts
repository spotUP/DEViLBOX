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
  /** Osc1 waveform (0=sine, 0.25=saw, 0.5=square, 0.75=noise, 1=silence) */
  osc1Waveform: number;
  /** Osc1 coarse tune (-24 to +24 semitones as 0-1) */
  osc1Coarse: number;
  /** Osc1 fine tune (-100 to +100 cents as 0-1) */
  osc1Fine: number;
  
  // Oscillator 2
  /** Osc2 waveform (0=sine, 0.25=saw, 0.5=square, 0.75=noise, 1=silence) */
  osc2Waveform: number;
  /** Osc2 coarse tune (-24 to +24 semitones as 0-1) */
  osc2Coarse: number;
  /** Osc2 fine tune (-100 to +100 cents as 0-1) */
  osc2Fine: number;
  
  // FM parameters
  /** FM amount (0-1) */
  fmAmount: number;
  /** FM ratio coarse (integer ratio 1-16 as 0-1) */
  fmCoarse: number;
  /** FM ratio fine (0-1) */
  fmFine: number;
  /** FM feedback (0-1) */
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
  /** Waveform (0=saw, 0.5=pulse, 1=noise) */
  waveform: number;
  /** Pulse width (0-1, only for pulse wave) */
  pulseWidth: number;
  /** Coarse tune (-24 to +24 semitones as 0-1) */
  coarse: number;
  /** Fine tune (-100 to +100 cents as 0-1) */
  fine: number;
  
  // Filter
  /** Filter type (0=LP, 0.33=BP, 0.67=HP, 1=notch) */
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
  osc1Coarse: 0.5,
  osc1Fine: 0.5,
  
  // Oscillator 2
  osc2Waveform: 0,
  osc2Coarse: 0.5,
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
  voices: 1,
  detune: 0.1,
  spread: 0.5,
};

export const DEFAULT_SLAUGHTER_CONFIG: SlaughterConfig = {
  // Oscillator
  waveform: 0, // Saw
  pulseWidth: 0.5,
  coarse: 0.5,
  fine: 0.5,
  
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
  voices: 1,
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

export const FalconParamIndex: Record<keyof FalconConfig, number> = {
  osc1Waveform: 0,
  osc1Coarse: 1,
  osc1Fine: 2,
  osc2Waveform: 3,
  osc2Coarse: 4,
  osc2Fine: 5,
  fmAmount: 6,
  fmCoarse: 7,
  fmFine: 8,
  feedback: 9,
  attack1: 10,
  decay1: 11,
  sustain1: 12,
  release1: 13,
  attack2: 14,
  decay2: 15,
  sustain2: 16,
  release2: 17,
  gain: 18,
  voices: 19,
  detune: 20,
  spread: 21,
};

export const SlaughterParamIndex: Record<keyof SlaughterConfig, number> = {
  waveform: 0,
  pulseWidth: 1,
  coarse: 2,
  fine: 3,
  filterType: 4,
  cutoff: 5,
  resonance: 6,
  filterEnvAmount: 7,
  ampAttack: 8,
  ampDecay: 9,
  ampSustain: 10,
  ampRelease: 11,
  filterAttack: 12,
  filterDecay: 13,
  filterSustain: 14,
  filterRelease: 15,
  gain: 16,
  voices: 17,
  detune: 18,
  spread: 19,
};
