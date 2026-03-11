// Tunefish 4 Synth Types
// Used by XRNS import and the TunefishSynth engine

export const TunefishParam = {
  GLOBAL_GAIN: 0,
  GEN_BANDWIDTH: 1,
  GEN_NUMHARMONICS: 2,
  GEN_DAMP: 3,
  GEN_MODULATION: 4,
  GEN_VOLUME: 5,
  GEN_PANNING: 6,
  GEN_SLOP: 7,
  GEN_OCTAVE: 8,
  GEN_GLIDE: 9,
  GEN_DETUNE: 10,
  GEN_FREQ: 11,
  GEN_POLYPHONY: 12,
  GEN_DRIVE: 13,
  GEN_UNISONO: 14,
  GEN_SPREAD: 15,
  GEN_SCALE: 16,
  NOISE_AMOUNT: 17,
  NOISE_FREQ: 18,
  NOISE_BW: 19,
  LP_FILTER_ON: 20,
  LP_FILTER_CUTOFF: 21,
  LP_FILTER_RESONANCE: 22,
  HP_FILTER_ON: 23,
  HP_FILTER_CUTOFF: 24,
  HP_FILTER_RESONANCE: 25,
  DISTORT_AMOUNT: 26,
  CHORUS_RATE: 27,
  CHORUS_DEPTH: 28,
  DELAY_LEFT: 29,
  DELAY_RIGHT: 30,
  DELAY_DECAY: 31,
  REVERB_ROOMSIZE: 32,
  REVERB_DAMP: 33,
  REVERB_WET: 34,
  REVERB_WIDTH: 35,
  FLANGER_LFO: 36,
  FLANGER_FREQUENCY: 37,
  FLANGER_AMPLITUDE: 38,
  FLANGER_WET: 39,
  CHORUS_GAIN: 40,
  FORMANT_MODE: 41,
  FORMANT_WET: 42,
  EQ_LOW: 43,
  EQ_MID: 44,
  EQ_HIGH: 45,
  PITCHWHEEL_UP: 46,
  PITCHWHEEL_DOWN: 47,
  BP_FILTER_ON: 48,
  BP_FILTER_CUTOFF: 49,
  BP_FILTER_Q: 50,
  NT_FILTER_ON: 51,
  NT_FILTER_CUTOFF: 52,
  NT_FILTER_Q: 53,
  PARAM_COUNT: 54
} as const;

/**
 * Tunefish instrument configuration
 * All parameters are normalized to 0.0-1.0 range
 */
export interface TunefishInstrumentConfig {
  /** Global gain (0.0-1.0) */
  globalGain: number;
  
  // Generator
  genBandwidth: number;
  genNumHarmonics: number;
  genDamp: number;
  genModulation: number;
  genVolume: number;
  genPanning: number;
  genSlop: number;
  genOctave: number;
  genGlide: number;
  genDetune: number;
  genFreq: number;
  genPolyphony: number;
  genDrive: number;
  genUnisono: number;
  genSpread: number;
  genScale: number;
  
  // Noise
  noiseAmount: number;
  noiseFreq: number;
  noiseBw: number;
  
  // LP Filter
  lpFilterOn: number;
  lpFilterCutoff: number;
  lpFilterResonance: number;
  
  // HP Filter
  hpFilterOn: number;
  hpFilterCutoff: number;
  hpFilterResonance: number;
  
  // BP Filter
  bpFilterOn: number;
  bpFilterCutoff: number;
  bpFilterQ: number;
  
  // NT Filter
  ntFilterOn: number;
  ntFilterCutoff: number;
  ntFilterQ: number;
  
  // Distortion
  distortAmount: number;
  
  // Chorus
  chorusRate: number;
  chorusDepth: number;
  chorusGain: number;
  
  // Delay
  delayLeft: number;
  delayRight: number;
  delayDecay: number;
  
  // Reverb
  reverbRoomsize: number;
  reverbDamp: number;
  reverbWet: number;
  reverbWidth: number;
  
  // Flanger
  flangerLfo: number;
  flangerFrequency: number;
  flangerAmplitude: number;
  flangerWet: number;
  
  // Formant
  formantMode: number;
  formantWet: number;
  
  // EQ
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  
  // Pitch wheel
  pitchwheelUp: number;
  pitchwheelDown: number;
}

/**
 * Default Tunefish configuration (basic saw-like sound)
 */
export const DEFAULT_TUNEFISH: TunefishInstrumentConfig = {
  globalGain: 0.7,
  
  // Generator defaults
  genBandwidth: 0.5,
  genNumHarmonics: 0.5,
  genDamp: 0.5,
  genModulation: 0.0,
  genVolume: 0.8,
  genPanning: 0.5,
  genSlop: 0.0,
  genOctave: 0.5,  // 0.5 = middle octave
  genGlide: 0.0,
  genDetune: 0.0,
  genFreq: 0.5,
  genPolyphony: 1.0,
  genDrive: 0.0,
  genUnisono: 0.0,
  genSpread: 0.5,
  genScale: 0.5,
  
  // Noise off
  noiseAmount: 0.0,
  noiseFreq: 0.5,
  noiseBw: 0.5,
  
  // LP filter off by default
  lpFilterOn: 0.0,
  lpFilterCutoff: 1.0,
  lpFilterResonance: 0.0,
  
  // HP filter off
  hpFilterOn: 0.0,
  hpFilterCutoff: 0.0,
  hpFilterResonance: 0.0,
  
  // BP filter off
  bpFilterOn: 0.0,
  bpFilterCutoff: 0.5,
  bpFilterQ: 0.5,
  
  // NT filter off
  ntFilterOn: 0.0,
  ntFilterCutoff: 0.5,
  ntFilterQ: 0.5,
  
  // Effects off
  distortAmount: 0.0,
  chorusRate: 0.0,
  chorusDepth: 0.0,
  chorusGain: 0.0,
  delayLeft: 0.0,
  delayRight: 0.0,
  delayDecay: 0.0,
  reverbRoomsize: 0.0,
  reverbDamp: 0.5,
  reverbWet: 0.0,
  reverbWidth: 0.5,
  flangerLfo: 0.0,
  flangerFrequency: 0.5,
  flangerAmplitude: 0.0,
  flangerWet: 0.0,
  
  // Formant off
  formantMode: 0.0,
  formantWet: 0.0,
  
  // EQ flat
  eqLow: 0.5,
  eqMid: 0.5,
  eqHigh: 0.5,
  
  // Pitch bend range
  pitchwheelUp: 0.5,  // 12 semitones
  pitchwheelDown: 0.5
};

/**
 * Convert TunefishInstrumentConfig to parameter array
 */
export function tunefishConfigToParams(config: TunefishInstrumentConfig): number[] {
  return [
    config.globalGain,
    config.genBandwidth,
    config.genNumHarmonics,
    config.genDamp,
    config.genModulation,
    config.genVolume,
    config.genPanning,
    config.genSlop,
    config.genOctave,
    config.genGlide,
    config.genDetune,
    config.genFreq,
    config.genPolyphony,
    config.genDrive,
    config.genUnisono,
    config.genSpread,
    config.genScale,
    config.noiseAmount,
    config.noiseFreq,
    config.noiseBw,
    config.lpFilterOn,
    config.lpFilterCutoff,
    config.lpFilterResonance,
    config.hpFilterOn,
    config.hpFilterCutoff,
    config.hpFilterResonance,
    config.distortAmount,
    config.chorusRate,
    config.chorusDepth,
    config.delayLeft,
    config.delayRight,
    config.delayDecay,
    config.reverbRoomsize,
    config.reverbDamp,
    config.reverbWet,
    config.reverbWidth,
    config.flangerLfo,
    config.flangerFrequency,
    config.flangerAmplitude,
    config.flangerWet,
    config.chorusGain,
    config.formantMode,
    config.formantWet,
    config.eqLow,
    config.eqMid,
    config.eqHigh,
    config.pitchwheelUp,
    config.pitchwheelDown,
    config.bpFilterOn,
    config.bpFilterCutoff,
    config.bpFilterQ,
    config.ntFilterOn,
    config.ntFilterCutoff,
    config.ntFilterQ
  ];
}

/**
 * Convert parameter array to TunefishInstrumentConfig
 */
export function paramsToTunefishConfig(params: number[]): TunefishInstrumentConfig {
  return {
    globalGain: params[TunefishParam.GLOBAL_GAIN] ?? DEFAULT_TUNEFISH.globalGain,
    genBandwidth: params[TunefishParam.GEN_BANDWIDTH] ?? DEFAULT_TUNEFISH.genBandwidth,
    genNumHarmonics: params[TunefishParam.GEN_NUMHARMONICS] ?? DEFAULT_TUNEFISH.genNumHarmonics,
    genDamp: params[TunefishParam.GEN_DAMP] ?? DEFAULT_TUNEFISH.genDamp,
    genModulation: params[TunefishParam.GEN_MODULATION] ?? DEFAULT_TUNEFISH.genModulation,
    genVolume: params[TunefishParam.GEN_VOLUME] ?? DEFAULT_TUNEFISH.genVolume,
    genPanning: params[TunefishParam.GEN_PANNING] ?? DEFAULT_TUNEFISH.genPanning,
    genSlop: params[TunefishParam.GEN_SLOP] ?? DEFAULT_TUNEFISH.genSlop,
    genOctave: params[TunefishParam.GEN_OCTAVE] ?? DEFAULT_TUNEFISH.genOctave,
    genGlide: params[TunefishParam.GEN_GLIDE] ?? DEFAULT_TUNEFISH.genGlide,
    genDetune: params[TunefishParam.GEN_DETUNE] ?? DEFAULT_TUNEFISH.genDetune,
    genFreq: params[TunefishParam.GEN_FREQ] ?? DEFAULT_TUNEFISH.genFreq,
    genPolyphony: params[TunefishParam.GEN_POLYPHONY] ?? DEFAULT_TUNEFISH.genPolyphony,
    genDrive: params[TunefishParam.GEN_DRIVE] ?? DEFAULT_TUNEFISH.genDrive,
    genUnisono: params[TunefishParam.GEN_UNISONO] ?? DEFAULT_TUNEFISH.genUnisono,
    genSpread: params[TunefishParam.GEN_SPREAD] ?? DEFAULT_TUNEFISH.genSpread,
    genScale: params[TunefishParam.GEN_SCALE] ?? DEFAULT_TUNEFISH.genScale,
    noiseAmount: params[TunefishParam.NOISE_AMOUNT] ?? DEFAULT_TUNEFISH.noiseAmount,
    noiseFreq: params[TunefishParam.NOISE_FREQ] ?? DEFAULT_TUNEFISH.noiseFreq,
    noiseBw: params[TunefishParam.NOISE_BW] ?? DEFAULT_TUNEFISH.noiseBw,
    lpFilterOn: params[TunefishParam.LP_FILTER_ON] ?? DEFAULT_TUNEFISH.lpFilterOn,
    lpFilterCutoff: params[TunefishParam.LP_FILTER_CUTOFF] ?? DEFAULT_TUNEFISH.lpFilterCutoff,
    lpFilterResonance: params[TunefishParam.LP_FILTER_RESONANCE] ?? DEFAULT_TUNEFISH.lpFilterResonance,
    hpFilterOn: params[TunefishParam.HP_FILTER_ON] ?? DEFAULT_TUNEFISH.hpFilterOn,
    hpFilterCutoff: params[TunefishParam.HP_FILTER_CUTOFF] ?? DEFAULT_TUNEFISH.hpFilterCutoff,
    hpFilterResonance: params[TunefishParam.HP_FILTER_RESONANCE] ?? DEFAULT_TUNEFISH.hpFilterResonance,
    bpFilterOn: params[TunefishParam.BP_FILTER_ON] ?? DEFAULT_TUNEFISH.bpFilterOn,
    bpFilterCutoff: params[TunefishParam.BP_FILTER_CUTOFF] ?? DEFAULT_TUNEFISH.bpFilterCutoff,
    bpFilterQ: params[TunefishParam.BP_FILTER_Q] ?? DEFAULT_TUNEFISH.bpFilterQ,
    ntFilterOn: params[TunefishParam.NT_FILTER_ON] ?? DEFAULT_TUNEFISH.ntFilterOn,
    ntFilterCutoff: params[TunefishParam.NT_FILTER_CUTOFF] ?? DEFAULT_TUNEFISH.ntFilterCutoff,
    ntFilterQ: params[TunefishParam.NT_FILTER_Q] ?? DEFAULT_TUNEFISH.ntFilterQ,
    distortAmount: params[TunefishParam.DISTORT_AMOUNT] ?? DEFAULT_TUNEFISH.distortAmount,
    chorusRate: params[TunefishParam.CHORUS_RATE] ?? DEFAULT_TUNEFISH.chorusRate,
    chorusDepth: params[TunefishParam.CHORUS_DEPTH] ?? DEFAULT_TUNEFISH.chorusDepth,
    chorusGain: params[TunefishParam.CHORUS_GAIN] ?? DEFAULT_TUNEFISH.chorusGain,
    delayLeft: params[TunefishParam.DELAY_LEFT] ?? DEFAULT_TUNEFISH.delayLeft,
    delayRight: params[TunefishParam.DELAY_RIGHT] ?? DEFAULT_TUNEFISH.delayRight,
    delayDecay: params[TunefishParam.DELAY_DECAY] ?? DEFAULT_TUNEFISH.delayDecay,
    reverbRoomsize: params[TunefishParam.REVERB_ROOMSIZE] ?? DEFAULT_TUNEFISH.reverbRoomsize,
    reverbDamp: params[TunefishParam.REVERB_DAMP] ?? DEFAULT_TUNEFISH.reverbDamp,
    reverbWet: params[TunefishParam.REVERB_WET] ?? DEFAULT_TUNEFISH.reverbWet,
    reverbWidth: params[TunefishParam.REVERB_WIDTH] ?? DEFAULT_TUNEFISH.reverbWidth,
    flangerLfo: params[TunefishParam.FLANGER_LFO] ?? DEFAULT_TUNEFISH.flangerLfo,
    flangerFrequency: params[TunefishParam.FLANGER_FREQUENCY] ?? DEFAULT_TUNEFISH.flangerFrequency,
    flangerAmplitude: params[TunefishParam.FLANGER_AMPLITUDE] ?? DEFAULT_TUNEFISH.flangerAmplitude,
    flangerWet: params[TunefishParam.FLANGER_WET] ?? DEFAULT_TUNEFISH.flangerWet,
    formantMode: params[TunefishParam.FORMANT_MODE] ?? DEFAULT_TUNEFISH.formantMode,
    formantWet: params[TunefishParam.FORMANT_WET] ?? DEFAULT_TUNEFISH.formantWet,
    eqLow: params[TunefishParam.EQ_LOW] ?? DEFAULT_TUNEFISH.eqLow,
    eqMid: params[TunefishParam.EQ_MID] ?? DEFAULT_TUNEFISH.eqMid,
    eqHigh: params[TunefishParam.EQ_HIGH] ?? DEFAULT_TUNEFISH.eqHigh,
    pitchwheelUp: params[TunefishParam.PITCHWHEEL_UP] ?? DEFAULT_TUNEFISH.pitchwheelUp,
    pitchwheelDown: params[TunefishParam.PITCHWHEEL_DOWN] ?? DEFAULT_TUNEFISH.pitchwheelDown
  };
}
