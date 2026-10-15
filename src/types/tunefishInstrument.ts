// Tunefish 4 Synth Types
// Used by XRNS import and the TunefishSynth engine

/**
 * Parameter indices: the engine's own eTfParam enum (third-party/tunefish/.../synth/tf4.hpp), which is also the VST
 * parameter order Renoise stores. The keys below are the ones the editor drives; the enum also holds the envelopes
 * (TF_ADSR1_*, TF_ADSR2_*), LFOs and the modulation matrix between them, so these indices are not contiguous.
 * tunefishParams.test.ts compares this table with the header.
 */
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
  DISTORT_AMOUNT: 84,
  CHORUS_RATE: 85,
  CHORUS_DEPTH: 86,
  DELAY_LEFT: 87,
  DELAY_RIGHT: 88,
  DELAY_DECAY: 89,
  REVERB_ROOMSIZE: 90,
  REVERB_DAMP: 91,
  REVERB_WET: 92,
  REVERB_WIDTH: 93,
  FLANGER_LFO: 94,
  FLANGER_FREQUENCY: 95,
  FLANGER_AMPLITUDE: 96,
  FLANGER_WET: 97,
  CHORUS_GAIN: 98,
  FORMANT_MODE: 99,
  FORMANT_WET: 100,
  EQ_LOW: 101,
  EQ_MID: 102,
  EQ_HIGH: 103,
  PITCHWHEEL_UP: 104,
  PITCHWHEEL_DOWN: 105,
  BP_FILTER_ON: 106,
  BP_FILTER_CUTOFF: 107,
  BP_FILTER_Q: 108,
  NT_FILTER_ON: 109,
  NT_FILTER_CUTOFF: 110,
  NT_FILTER_Q: 111,
  PARAM_COUNT: 112,
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

/** Which engine parameter each config key drives. */
export const TUNEFISH_CONFIG_PARAM: Record<keyof TunefishInstrumentConfig, number> = {
  globalGain: TunefishParam.GLOBAL_GAIN,
  genBandwidth: TunefishParam.GEN_BANDWIDTH,
  genNumHarmonics: TunefishParam.GEN_NUMHARMONICS,
  genDamp: TunefishParam.GEN_DAMP,
  genModulation: TunefishParam.GEN_MODULATION,
  genVolume: TunefishParam.GEN_VOLUME,
  genPanning: TunefishParam.GEN_PANNING,
  genSlop: TunefishParam.GEN_SLOP,
  genOctave: TunefishParam.GEN_OCTAVE,
  genGlide: TunefishParam.GEN_GLIDE,
  genDetune: TunefishParam.GEN_DETUNE,
  genFreq: TunefishParam.GEN_FREQ,
  genPolyphony: TunefishParam.GEN_POLYPHONY,
  genDrive: TunefishParam.GEN_DRIVE,
  genUnisono: TunefishParam.GEN_UNISONO,
  genSpread: TunefishParam.GEN_SPREAD,
  genScale: TunefishParam.GEN_SCALE,
  noiseAmount: TunefishParam.NOISE_AMOUNT,
  noiseFreq: TunefishParam.NOISE_FREQ,
  noiseBw: TunefishParam.NOISE_BW,
  lpFilterOn: TunefishParam.LP_FILTER_ON,
  lpFilterCutoff: TunefishParam.LP_FILTER_CUTOFF,
  lpFilterResonance: TunefishParam.LP_FILTER_RESONANCE,
  hpFilterOn: TunefishParam.HP_FILTER_ON,
  hpFilterCutoff: TunefishParam.HP_FILTER_CUTOFF,
  hpFilterResonance: TunefishParam.HP_FILTER_RESONANCE,
  bpFilterOn: TunefishParam.BP_FILTER_ON,
  bpFilterCutoff: TunefishParam.BP_FILTER_CUTOFF,
  bpFilterQ: TunefishParam.BP_FILTER_Q,
  ntFilterOn: TunefishParam.NT_FILTER_ON,
  ntFilterCutoff: TunefishParam.NT_FILTER_CUTOFF,
  ntFilterQ: TunefishParam.NT_FILTER_Q,
  distortAmount: TunefishParam.DISTORT_AMOUNT,
  chorusRate: TunefishParam.CHORUS_RATE,
  chorusDepth: TunefishParam.CHORUS_DEPTH,
  chorusGain: TunefishParam.CHORUS_GAIN,
  delayLeft: TunefishParam.DELAY_LEFT,
  delayRight: TunefishParam.DELAY_RIGHT,
  delayDecay: TunefishParam.DELAY_DECAY,
  reverbRoomsize: TunefishParam.REVERB_ROOMSIZE,
  reverbDamp: TunefishParam.REVERB_DAMP,
  reverbWet: TunefishParam.REVERB_WET,
  reverbWidth: TunefishParam.REVERB_WIDTH,
  flangerLfo: TunefishParam.FLANGER_LFO,
  flangerFrequency: TunefishParam.FLANGER_FREQUENCY,
  flangerAmplitude: TunefishParam.FLANGER_AMPLITUDE,
  flangerWet: TunefishParam.FLANGER_WET,
  formantMode: TunefishParam.FORMANT_MODE,
  formantWet: TunefishParam.FORMANT_WET,
  eqLow: TunefishParam.EQ_LOW,
  eqMid: TunefishParam.EQ_MID,
  eqHigh: TunefishParam.EQ_HIGH,
  pitchwheelUp: TunefishParam.PITCHWHEEL_UP,
  pitchwheelDown: TunefishParam.PITCHWHEEL_DOWN,
};

/**
 * The config as engine parameters: engine index -> value. Sparse on purpose: the engine also holds the envelopes, LFOs
 * and modulation matrix, which the config does not carry, so a config edit must never write over them.
 */
export function tunefishConfigToParams(config: TunefishInstrumentConfig): Record<number, number> {
  const params: Record<number, number> = {};
  for (const key of Object.keys(TUNEFISH_CONFIG_PARAM) as Array<keyof TunefishInstrumentConfig>) {
    params[TUNEFISH_CONFIG_PARAM[key]] = config[key];
  }
  return params;
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
