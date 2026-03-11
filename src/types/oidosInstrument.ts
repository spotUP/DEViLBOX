/**
 * Oidos Synth Instrument Type Definitions
 * 
 * Based on the Oidos additive synthesizer by Loonies (Blueberry).
 * Oidos generates sound through additive synthesis with many harmonics,
 * controlled by randomization and spectral shaping parameters.
 * 
 * Key features:
 * - Random harmonic generation with seed
 * - Spectral shaping (overtones, harmonicity, sharpness)
 * - Dual filter sweeps (low/high)
 * - Attack/release envelope
 * - Quantization parameters for size optimization
 */

// ═══════════════════════════════════════════════════════════════════════════
// Core parameters
// ═══════════════════════════════════════════════════════════════════════════

export interface OidosConfig {
  // === Generation parameters ===
  /** Random seed (0-100) - controls harmonic distribution */
  seed: number;
  /** Number of additive modes (1-100) - more = richer sound but heavier */
  modes: number;
  /** Fattening factor (1-100) - multiplies modes for width */
  fat: number;
  /** Width of detuning between fat voices (0-1) */
  width: number;
  
  // === Spectral shaping ===
  /** Number of overtones (0-100) */
  overtones: number;
  /** Spectral rolloff in dB/octave (-80 to +20) */
  sharpness: number;
  /** Harmonic vs inharmonic ratio (-1 to +1) */
  harmonicity: number;
  
  // === Decay ===
  /** Decay time for low frequencies (0-1) */
  decayLow: number;
  /** Decay time for high frequencies (0-1) */
  decayHigh: number;
  
  // === Low filter ===
  /** Low filter cutoff in semitones (-120 to +120) */
  filterLow: number;
  /** Low filter slope (0-1, 0 = steep) */
  filterSlopeLow: number;
  /** Low filter sweep rate in ST/s (-6000 to +6000) */
  filterSweepLow: number;
  
  // === High filter ===
  /** High filter cutoff in semitones (-120 to +120) */
  filterHigh: number;
  /** High filter slope (0-1, 0 = steep) */
  filterSlopeHigh: number;
  /** High filter sweep rate in ST/s (-6000 to +6000) */
  filterSweepHigh: number;
  
  // === Output ===
  /** Output gain (0-1) */
  gain: number;
  /** Attack time (0-1, 0 = instant) */
  attack: number;
  /** Release time (0-1, 0 = instant) */
  release: number;
  
  // === Quantization (for size optimization) ===
  /** Quantize decay difference (0-1, higher = coarser) */
  qDecayDiff: number;
  /** Quantize decay low (0-1) */
  qDecayLow: number;
  /** Quantize harmonicity (0-1) */
  qHarmonicity: number;
  /** Quantize sharpness (0-1) */
  qSharpness: number;
  /** Quantize width (0-1) */
  qWidth: number;
  /** Quantize filter low (0-1) */
  qFilterLow: number;
  /** Quantize filter slope low (0-1) */
  qFilterSlopeLow: number;
  /** Quantize filter sweep low (0-1) */
  qFilterSweepLow: number;
  /** Quantize filter high (0-1) */
  qFilterHigh: number;
  /** Quantize filter slope high (0-1) */
  qFilterSlopeHigh: number;
  /** Quantize filter sweep high (0-1) */
  qFilterSweepHigh: number;
  /** Quantize gain (0-1) */
  qGain: number;
  /** Quantize attack (0-1) */
  qAttack: number;
  /** Quantize release (0-1) */
  qRelease: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Reverb parameters (OidosReverb effect)
// ═══════════════════════════════════════════════════════════════════════════

export interface OidosReverbConfig {
  /** Reverb mix (0-1) */
  mix: number;
  /** Room size (0-1) */
  roomSize: number;
  /** Damping (0-1) */
  damping: number;
  /** Stereo width (0-1) */
  width: number;
  /** Pre-delay in ms (0-500) */
  preDelay: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Full Oidos instrument config (for InstrumentConfig)
// ═══════════════════════════════════════════════════════════════════════════

export interface OidosInstrumentConfig {
  synth: OidosConfig;
  reverb?: OidosReverbConfig;
  useReverb: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Default values (from oidos_generate.rs default_value())
// ═══════════════════════════════════════════════════════════════════════════

export const DEFAULT_OIDOS_CONFIG: OidosConfig = {
  // Generation
  seed: 0.5,
  modes: 0.40,
  fat: 0.10,
  width: 0.34,
  
  // Spectral
  overtones: 0.27,
  sharpness: 0.9,
  harmonicity: 1.0,
  
  // Decay
  decayLow: 1.0,
  decayHigh: 1.0,
  
  // Low filter
  filterLow: 0.0,
  filterSlopeLow: 0.0,
  filterSweepLow: 0.5,
  
  // High filter
  filterHigh: 1.0,
  filterSlopeHigh: 0.0,
  filterSweepHigh: 0.5,
  
  // Output
  gain: 0.25,
  attack: 0.25,
  release: 0.5,
  
  // Quantization (default: no quantization)
  qDecayDiff: 0,
  qDecayLow: 0,
  qHarmonicity: 0,
  qSharpness: 0,
  qWidth: 0,
  qFilterLow: 0,
  qFilterSlopeLow: 0,
  qFilterSweepLow: 0,
  qFilterHigh: 0,
  qFilterSlopeHigh: 0,
  qFilterSweepHigh: 0,
  qGain: 0,
  qAttack: 0,
  qRelease: 0,
};

export const DEFAULT_OIDOS_REVERB: OidosReverbConfig = {
  mix: 0.3,
  roomSize: 0.7,
  damping: 0.5,
  width: 1.0,
  preDelay: 20,
};

export const DEFAULT_OIDOS_INSTRUMENT: OidosInstrumentConfig = {
  synth: { ...DEFAULT_OIDOS_CONFIG },
  reverb: { ...DEFAULT_OIDOS_REVERB },
  useReverb: false,
};

// ═══════════════════════════════════════════════════════════════════════════
// Parameter metadata for UI generation
// ═══════════════════════════════════════════════════════════════════════════

export interface OidosParameterInfo {
  name: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  defaultValue: number;
  displayDecimals: number;
}

export const OIDOS_PARAMETERS: Record<keyof OidosConfig, OidosParameterInfo> = {
  seed: { name: 'seed', label: 'Seed', unit: '', min: 0, max: 1, defaultValue: 0.5, displayDecimals: 0 },
  modes: { name: 'modes', label: 'Modes', unit: '', min: 0, max: 1, defaultValue: 0.4, displayDecimals: 0 },
  fat: { name: 'fat', label: 'Fat', unit: '', min: 0, max: 1, defaultValue: 0.1, displayDecimals: 0 },
  width: { name: 'width', label: 'Width', unit: 'ST', min: 0, max: 1, defaultValue: 0.34, displayDecimals: 3 },
  overtones: { name: 'overtones', label: 'Overtones', unit: 'ST', min: 0, max: 1, defaultValue: 0.27, displayDecimals: 0 },
  sharpness: { name: 'sharpness', label: 'Sharpness', unit: 'dB/oct', min: 0, max: 1, defaultValue: 0.9, displayDecimals: 1 },
  harmonicity: { name: 'harmonicity', label: 'Harmonicity', unit: '', min: 0, max: 1, defaultValue: 1.0, displayDecimals: 2 },
  decayLow: { name: 'decayLow', label: 'Decay Low', unit: 'ms', min: 0, max: 1, defaultValue: 1.0, displayDecimals: 0 },
  decayHigh: { name: 'decayHigh', label: 'Decay High', unit: 'ms', min: 0, max: 1, defaultValue: 1.0, displayDecimals: 0 },
  filterLow: { name: 'filterLow', label: 'Filter Low', unit: 'ST', min: 0, max: 1, defaultValue: 0.0, displayDecimals: 0 },
  filterSlopeLow: { name: 'filterSlopeLow', label: 'F Slope Low', unit: 'ST', min: 0, max: 1, defaultValue: 0.0, displayDecimals: 1 },
  filterSweepLow: { name: 'filterSweepLow', label: 'F Sweep Low', unit: 'ST/s', min: 0, max: 1, defaultValue: 0.5, displayDecimals: 1 },
  filterHigh: { name: 'filterHigh', label: 'Filter High', unit: 'ST', min: 0, max: 1, defaultValue: 1.0, displayDecimals: 0 },
  filterSlopeHigh: { name: 'filterSlopeHigh', label: 'F Slope High', unit: 'ST', min: 0, max: 1, defaultValue: 0.0, displayDecimals: 1 },
  filterSweepHigh: { name: 'filterSweepHigh', label: 'F Sweep High', unit: 'ST/s', min: 0, max: 1, defaultValue: 0.5, displayDecimals: 1 },
  gain: { name: 'gain', label: 'Gain', unit: '', min: 0, max: 1, defaultValue: 0.25, displayDecimals: 2 },
  attack: { name: 'attack', label: 'Attack', unit: 'ms', min: 0, max: 1, defaultValue: 0.25, displayDecimals: 1 },
  release: { name: 'release', label: 'Release', unit: 's', min: 0, max: 1, defaultValue: 0.5, displayDecimals: 2 },
  qDecayDiff: { name: 'qDecayDiff', label: 'Q Decay Diff', unit: '', min: 0, max: 1, defaultValue: 0, displayDecimals: 2 },
  qDecayLow: { name: 'qDecayLow', label: 'Q Decay Low', unit: '', min: 0, max: 1, defaultValue: 0, displayDecimals: 2 },
  qHarmonicity: { name: 'qHarmonicity', label: 'Q Harmonicity', unit: '', min: 0, max: 1, defaultValue: 0, displayDecimals: 2 },
  qSharpness: { name: 'qSharpness', label: 'Q Sharpness', unit: '', min: 0, max: 1, defaultValue: 0, displayDecimals: 2 },
  qWidth: { name: 'qWidth', label: 'Q Width', unit: '', min: 0, max: 1, defaultValue: 0, displayDecimals: 2 },
  qFilterLow: { name: 'qFilterLow', label: 'Q Filter Low', unit: '', min: 0, max: 1, defaultValue: 0, displayDecimals: 2 },
  qFilterSlopeLow: { name: 'qFilterSlopeLow', label: 'Q F Slope Low', unit: '', min: 0, max: 1, defaultValue: 0, displayDecimals: 2 },
  qFilterSweepLow: { name: 'qFilterSweepLow', label: 'Q F Sweep Low', unit: '', min: 0, max: 1, defaultValue: 0, displayDecimals: 2 },
  qFilterHigh: { name: 'qFilterHigh', label: 'Q Filter High', unit: '', min: 0, max: 1, defaultValue: 0, displayDecimals: 2 },
  qFilterSlopeHigh: { name: 'qFilterSlopeHigh', label: 'Q F Slope High', unit: '', min: 0, max: 1, defaultValue: 0, displayDecimals: 2 },
  qFilterSweepHigh: { name: 'qFilterSweepHigh', label: 'Q F Sweep High', unit: '', min: 0, max: 1, defaultValue: 0, displayDecimals: 2 },
  qGain: { name: 'qGain', label: 'Q Gain', unit: '', min: 0, max: 1, defaultValue: 0, displayDecimals: 2 },
  qAttack: { name: 'qAttack', label: 'Q Attack', unit: '', min: 0, max: 1, defaultValue: 0, displayDecimals: 2 },
  qRelease: { name: 'qRelease', label: 'Q Release', unit: '', min: 0, max: 1, defaultValue: 0, displayDecimals: 2 },
};

// ═══════════════════════════════════════════════════════════════════════════
// Estimation functions (for UI display)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Estimate memory usage for this instrument at a given tone range
 */
export function estimateOidosMemory(config: OidosConfig, toneRange: number, maxNoteDuration: number): number {
  const modes = Math.floor(config.modes * 100 + 0.5);
  const fat = Math.floor(config.fat * 100 + 0.5);
  const partials = modes * fat;
  // Memory per tone = partials * duration * sizeof(f64) * 6 arrays
  const bytesPerSample = partials * 8 * 6;
  const sampleRate = 44100;
  const samples = maxNoteDuration * sampleRate;
  return toneRange * samples * bytesPerSample;
}

/**
 * Estimate computational burden for this instrument
 */
export function estimateOidosBurden(config: OidosConfig, toneRange: number, maxNoteDuration: number): number {
  const modes = Math.floor(config.modes * 100 + 0.5);
  const fat = Math.floor(config.fat * 100 + 0.5);
  return modes * fat * toneRange * maxNoteDuration;
}
