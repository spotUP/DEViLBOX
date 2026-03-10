/**
 * V2 Synth Instrument Type Definitions
 * 
 * Based on sounddef.h from the Farbrausch V2 synthesizer.
 * The V2 synth has 3 oscillators, 2 filters, 2 envelopes, 2 LFOs,
 * distortion, chorus/flanger, compressor, and a modulation matrix.
 */

// Oscillator modes
export type V2OscMode = 'off' | 'saw' | 'pulse' | 'sin' | 'noise' | 'fm' | 'auxA' | 'auxB';

// Filter modes
export type V2FilterMode = 'off' | 'low' | 'band' | 'high' | 'notch' | 'all' | 'moogL' | 'moogH';

// Filter routing
export type V2FilterRouting = 'single' | 'serial' | 'parallel';

// Distortion modes
export type V2DistMode = 'off' | 'overdrive' | 'clip' | 'bitcrush' | 'decimate' | 'lpf' | 'bpf' | 'hpf' | 'notch' | 'allpass' | 'moogL';

// LFO modes
export type V2LFOMode = 'saw' | 'tri' | 'pulse' | 'sin' | 'sampleHold';

// LFO polarity
export type V2LFOPolarity = 'positive' | 'negative' | 'bipolar';

// Key sync modes
export type V2KeySync = 'none' | 'osc' | 'full';

// Modulation sources
export type V2ModSource = 
  | 'velocity' | 'modulation' | 'breath' 
  | 'ctl3' | 'ctl4' | 'ctl5' | 'ctl6' | 'volume'
  | 'ampEG' | 'eg2' | 'lfo1' | 'lfo2' | 'note';

// Modulation destination (parameter index)
export type V2ModDest = number; // 0-88 (parameter index)

/**
 * V2 Oscillator configuration
 */
export interface V2Oscillator {
  mode: V2OscMode;       // 0-7
  ringmod: boolean;      // Ring modulation (osc 2/3 only)
  transpose: number;     // -64 to +63 semitones (0-127, 64=center)
  detune: number;        // -64 to +63 cents (0-127, 64=center)
  color: number;         // Waveform shape/FM amount (0-127)
  volume: number;        // Output level (0-127)
}

/**
 * V2 Filter configuration
 */
export interface V2Filter {
  mode: V2FilterMode;    // 0-7
  cutoff: number;        // Cutoff frequency (0-127)
  resonance: number;     // Resonance/Q (0-127)
}

/**
 * V2 Envelope configuration (ADSR + sustain time)
 */
export interface V2Envelope {
  attack: number;        // Attack time (0-127)
  decay: number;         // Decay time (0-127)
  sustain: number;       // Sustain level (0-127)
  sustainTime: number;   // Sustain time (0-127, 64=infinite)
  release: number;       // Release time (0-127)
  amplify: number;       // Output gain (0-127)
}

/**
 * V2 LFO configuration
 */
export interface V2LFO {
  mode: V2LFOMode;       // 0-4
  keySync: boolean;      // Restart on note
  envMode: boolean;      // Envelope mode (one-shot)
  rate: number;          // Speed (0-127)
  phase: number;         // Start phase (0-127)
  polarity: V2LFOPolarity; // 0-2
  amplify: number;       // Output level (0-127)
}

/**
 * V2 Distortion configuration
 */
export interface V2Distortion {
  mode: V2DistMode;      // 0-10
  inGain: number;        // Input gain (0-127)
  param1: number;        // Mode-specific param (0-127)
  param2: number;        // Mode-specific param (0-127)
}

/**
 * V2 Chorus/Flanger configuration
 */
export interface V2ChorusFlanger {
  amount: number;        // Wet/dry mix (0-127, 64=center)
  feedback: number;      // Feedback amount (0-127, 64=center)
  delayL: number;        // Left delay (1-127)
  delayR: number;        // Right delay (1-127)
  modRate: number;       // Modulation rate (0-127)
  modDepth: number;      // Modulation depth (0-127)
  modPhase: number;      // Stereo phase offset (0-127, 64=center)
}

/**
 * V2 Compressor configuration
 */
export interface V2Compressor {
  mode: 'off' | 'peak' | 'rms';  // 0-2
  stereoLink: boolean;   // Link L/R detection
  autoGain: boolean;     // Auto makeup gain
  lookahead: number;     // Lookahead time (0-10)
  threshold: number;     // Threshold (0-127)
  ratio: number;         // Ratio (0-127)
  attack: number;        // Attack time (0-127)
  release: number;       // Release time (0-127)
  outGain: number;       // Output gain (0-127, 64=0dB)
}

/**
 * V2 Modulation routing
 */
export interface V2ModRouting {
  source: V2ModSource;   // Modulation source (0-12)
  amount: number;        // Amount (-64 to +63, stored as 0-127)
  dest: V2ModDest;       // Destination parameter index (0-88)
}

/**
 * V2 Voice/Channel global settings
 */
export interface V2VoiceGlobals {
  panning: number;       // Pan position (0-127, 64=center)
  transpose: number;     // Global transpose (0-127, 64=center)
  keySync: V2KeySync;    // Key sync mode
  channelVolume: number; // Channel output volume (0-127)
  auxARecv: number;      // Aux A receive level (0-127)
  auxBRecv: number;      // Aux B receive level (0-127)
  auxASend: number;      // Aux A send level (0-127)
  auxBSend: number;      // Aux B send level (0-127)
  reverb: number;        // Reverb send (0-127)
  delay: number;         // Delay send (0-127)
  fxRoute: 'distThenChorus' | 'chorusThenDist'; // FX chain order
  boost: number;         // Bass boost (0-127)
  maxPoly: number;       // Max polyphony (1-16)
}

/**
 * Complete V2 Instrument configuration
 */
export interface V2InstrumentConfig {
  // Voice globals
  voice: V2VoiceGlobals;
  
  // Three oscillators
  osc1: V2Oscillator;
  osc2: V2Oscillator;
  osc3: V2Oscillator;
  
  // Two filters
  filter1: V2Filter;
  filter2: V2Filter;
  filterRouting: V2FilterRouting;
  filterBalance: number;  // 0-127, 64=center
  
  // Voice distortion
  voiceDistortion: V2Distortion;
  
  // Amp envelope (always routes to VCA)
  ampEnvelope: V2Envelope;
  
  // Modulation envelope (free assignment)
  modEnvelope: V2Envelope;
  
  // Two LFOs
  lfo1: V2LFO;
  lfo2: V2LFO;
  
  // Channel distortion (post-voice)
  channelDistortion: V2Distortion;
  
  // Channel effects
  chorusFlanger: V2ChorusFlanger;
  compressor: V2Compressor;
  
  // Modulation matrix (up to 255 routings, typically 4-8 used)
  modMatrix: V2ModRouting[];
}

/**
 * V2 Global Effects (shared across all channels)
 */
export interface V2GlobalEffects {
  // Reverb
  reverbTime: number;      // 0-127
  reverbHighCut: number;   // 0-127
  reverbLowCut: number;    // 0-127
  reverbVolume: number;    // 0-127
  
  // Stereo delay
  delayVolume: number;     // 0-127
  delayFeedback: number;   // 0-127
  delayL: number;          // 1-127
  delayR: number;          // 1-127
  delayModRate: number;    // 0-127
  delayModDepth: number;   // 0-127
  delayModPhase: number;   // 0-127
  
  // Post filters
  lowCut: number;          // 0-127
  highCut: number;         // 0-127
  
  // Sum compressor
  sumCompressor: V2Compressor;
}

/**
 * Default V2 instrument configuration
 * Based on v2initsnd from sounddef.h
 */
export const DEFAULT_V2_INSTRUMENT: V2InstrumentConfig = {
  voice: {
    panning: 64,
    transpose: 64,
    keySync: 'none',
    channelVolume: 0,
    auxARecv: 0,
    auxBRecv: 0,
    auxASend: 0,
    auxBSend: 0,
    reverb: 0,
    delay: 0,
    fxRoute: 'distThenChorus',
    boost: 0,
    maxPoly: 1,
  },
  
  osc1: {
    mode: 'saw',
    ringmod: false,
    transpose: 64,
    detune: 64,
    color: 0,
    volume: 127,
  },
  
  osc2: {
    mode: 'off',
    ringmod: false,
    transpose: 64,
    detune: 64,
    color: 32,
    volume: 127,
  },
  
  osc3: {
    mode: 'off',
    ringmod: false,
    transpose: 64,
    detune: 64,
    color: 32,
    volume: 127,
  },
  
  filter1: {
    mode: 'low',
    cutoff: 127,
    resonance: 0,
  },
  
  filter2: {
    mode: 'off',
    cutoff: 64,
    resonance: 0,
  },
  
  filterRouting: 'single',
  filterBalance: 64,
  
  voiceDistortion: {
    mode: 'off',
    inGain: 32,
    param1: 0,
    param2: 64,
  },
  
  ampEnvelope: {
    attack: 0,
    decay: 64,
    sustain: 127,
    sustainTime: 64,
    release: 80,
    amplify: 0,
  },
  
  modEnvelope: {
    attack: 0,
    decay: 64,
    sustain: 127,
    sustainTime: 64,
    release: 80,
    amplify: 64,
  },
  
  lfo1: {
    mode: 'tri',
    keySync: true,
    envMode: false,
    rate: 64,
    phase: 2,
    polarity: 'positive',
    amplify: 0,
  },
  
  lfo2: {
    mode: 'tri',
    keySync: true,
    envMode: false,
    rate: 64,
    phase: 2,
    polarity: 'positive',
    amplify: 127,
  },
  
  channelDistortion: {
    mode: 'off',
    inGain: 32,
    param1: 100,
    param2: 64,
  },
  
  chorusFlanger: {
    amount: 64,
    feedback: 64,
    delayL: 32,
    delayR: 32,
    modRate: 0,
    modDepth: 0,
    modPhase: 64,
  },
  
  compressor: {
    mode: 'off',
    stereoLink: false,
    autoGain: true,
    lookahead: 2,
    threshold: 90,
    ratio: 32,
    attack: 20,
    release: 64,
    outGain: 64,
  },
  
  modMatrix: [
    { source: 'velocity', amount: 127, dest: 37 }, // velocity -> amp env amplify
    { source: 'modulation', amount: 127, dest: 50 }, // modulation -> lfo1 amplify
    { source: 'lfo1', amount: 65, dest: 1 },  // lfo1 -> transpose
    { source: 'volume', amount: 127, dest: 59 }, // volume CC -> channel vol
  ],
};

/**
 * Default V2 global effects
 * Based on v2initglobs from sounddef.h
 */
export const DEFAULT_V2_GLOBALS: V2GlobalEffects = {
  reverbTime: 64,
  reverbHighCut: 64,
  reverbLowCut: 32,
  reverbVolume: 127,
  
  delayVolume: 100,
  delayFeedback: 80,
  delayL: 64,
  delayR: 64,
  delayModRate: 0,
  delayModDepth: 0,
  delayModPhase: 64,
  
  lowCut: 0,
  highCut: 127,
  
  sumCompressor: {
    mode: 'off',
    stereoLink: false,
    autoGain: true,
    lookahead: 2,
    threshold: 90,
    ratio: 32,
    attack: 20,
    release: 64,
    outGain: 64,
  },
};

/**
 * Parameter index mapping for modulation destinations
 * Based on v2parms array ordering from sounddef.h
 */
export const V2_PARAM_MAP = {
  // Voice (0-1)
  panning: 0,
  transpose: 1,
  
  // Osc 1 (2-7)
  osc1Mode: 2,
  osc1Ringmod: 3,
  osc1Transpose: 4,
  osc1Detune: 5,
  osc1Color: 6,
  osc1Volume: 7,
  
  // Osc 2 (8-13)
  osc2Mode: 8,
  osc2Ringmod: 9,
  osc2Transpose: 10,
  osc2Detune: 11,
  osc2Color: 12,
  osc2Volume: 13,
  
  // Osc 3 (14-19)
  osc3Mode: 14,
  osc3Ringmod: 15,
  osc3Transpose: 16,
  osc3Detune: 17,
  osc3Color: 18,
  osc3Volume: 19,
  
  // Filter 1 (20-22)
  filter1Mode: 20,
  filter1Cutoff: 21,
  filter1Reso: 22,
  
  // Filter 2 (23-25)
  filter2Mode: 23,
  filter2Cutoff: 24,
  filter2Reso: 25,
  
  // Routing (26-27)
  filterRouting: 26,
  filterBalance: 27,
  
  // Voice distortion (28-31)
  voiceDistMode: 28,
  voiceDistInGain: 29,
  voiceDistParam1: 30,
  voiceDistParam2: 31,
  
  // Amp envelope (32-37)
  ampEnvAttack: 32,
  ampEnvDecay: 33,
  ampEnvSustain: 34,
  ampEnvSusTime: 35,
  ampEnvRelease: 36,
  ampEnvAmplify: 37,
  
  // Mod envelope (38-43)
  modEnvAttack: 38,
  modEnvDecay: 39,
  modEnvSustain: 40,
  modEnvSusTime: 41,
  modEnvRelease: 42,
  modEnvAmplify: 43,
  
  // LFO 1 (44-50)
  lfo1Mode: 44,
  lfo1KeySync: 45,
  lfo1EnvMode: 46,
  lfo1Rate: 47,
  lfo1Phase: 48,
  lfo1Polarity: 49,
  lfo1Amplify: 50,
  
  // LFO 2 (51-57)
  lfo2Mode: 51,
  lfo2KeySync: 52,
  lfo2EnvMode: 53,
  lfo2Rate: 54,
  lfo2Phase: 55,
  lfo2Polarity: 56,
  lfo2Amplify: 57,
  
  // Globals (58-67)
  keySync: 58,
  channelVolume: 59,
  auxARecv: 60,
  auxBRecv: 61,
  auxASend: 62,
  auxBSend: 63,
  reverb: 64,
  delay: 65,
  fxRoute: 66,
  boost: 67,
  
  // Channel distortion (68-71)
  chanDistMode: 68,
  chanDistInGain: 69,
  chanDistParam1: 70,
  chanDistParam2: 71,
  
  // Chorus/Flanger (72-78)
  chorusAmount: 72,
  chorusFeedback: 73,
  chorusDelayL: 74,
  chorusDelayR: 75,
  chorusModRate: 76,
  chorusModDepth: 77,
  chorusModPhase: 78,
  
  // Compressor (79-87)
  compMode: 79,
  compStereoLink: 80,
  compAutoGain: 81,
  compLookahead: 82,
  compThreshold: 83,
  compRatio: 84,
  compAttack: 85,
  compRelease: 86,
  compOutGain: 87,
  
  // Polyphony (88)
  maxPoly: 88,
} as const;

/**
 * Convert V2InstrumentConfig to raw patch bytes for WASM
 */
export function v2ConfigToBytes(config: V2InstrumentConfig): Uint8Array {
  const bytes = new Uint8Array(256); // Conservative size
  let i = 0;
  
  // Voice
  bytes[i++] = config.voice.panning;
  bytes[i++] = config.voice.transpose;
  
  // Osc 1
  bytes[i++] = oscModeToNumber(config.osc1.mode);
  bytes[i++] = config.osc1.ringmod ? 1 : 0;
  bytes[i++] = config.osc1.transpose;
  bytes[i++] = config.osc1.detune;
  bytes[i++] = config.osc1.color;
  bytes[i++] = config.osc1.volume;
  
  // Osc 2
  bytes[i++] = oscModeToNumber(config.osc2.mode);
  bytes[i++] = config.osc2.ringmod ? 1 : 0;
  bytes[i++] = config.osc2.transpose;
  bytes[i++] = config.osc2.detune;
  bytes[i++] = config.osc2.color;
  bytes[i++] = config.osc2.volume;
  
  // Osc 3
  bytes[i++] = oscModeToNumber(config.osc3.mode);
  bytes[i++] = config.osc3.ringmod ? 1 : 0;
  bytes[i++] = config.osc3.transpose;
  bytes[i++] = config.osc3.detune;
  bytes[i++] = config.osc3.color;
  bytes[i++] = config.osc3.volume;
  
  // Filter 1
  bytes[i++] = filterModeToNumber(config.filter1.mode);
  bytes[i++] = config.filter1.cutoff;
  bytes[i++] = config.filter1.resonance;
  
  // Filter 2
  bytes[i++] = filterModeToNumber(config.filter2.mode);
  bytes[i++] = config.filter2.cutoff;
  bytes[i++] = config.filter2.resonance;
  
  // Routing
  bytes[i++] = filterRoutingToNumber(config.filterRouting);
  bytes[i++] = config.filterBalance;
  
  // Voice distortion
  bytes[i++] = distModeToNumber(config.voiceDistortion.mode);
  bytes[i++] = config.voiceDistortion.inGain;
  bytes[i++] = config.voiceDistortion.param1;
  bytes[i++] = config.voiceDistortion.param2;
  
  // Amp envelope
  bytes[i++] = config.ampEnvelope.attack;
  bytes[i++] = config.ampEnvelope.decay;
  bytes[i++] = config.ampEnvelope.sustain;
  bytes[i++] = config.ampEnvelope.sustainTime;
  bytes[i++] = config.ampEnvelope.release;
  bytes[i++] = config.ampEnvelope.amplify;
  
  // Mod envelope
  bytes[i++] = config.modEnvelope.attack;
  bytes[i++] = config.modEnvelope.decay;
  bytes[i++] = config.modEnvelope.sustain;
  bytes[i++] = config.modEnvelope.sustainTime;
  bytes[i++] = config.modEnvelope.release;
  bytes[i++] = config.modEnvelope.amplify;
  
  // LFO 1
  bytes[i++] = lfoModeToNumber(config.lfo1.mode);
  bytes[i++] = config.lfo1.keySync ? 1 : 0;
  bytes[i++] = config.lfo1.envMode ? 1 : 0;
  bytes[i++] = config.lfo1.rate;
  bytes[i++] = config.lfo1.phase;
  bytes[i++] = lfoPolarityToNumber(config.lfo1.polarity);
  bytes[i++] = config.lfo1.amplify;
  
  // LFO 2
  bytes[i++] = lfoModeToNumber(config.lfo2.mode);
  bytes[i++] = config.lfo2.keySync ? 1 : 0;
  bytes[i++] = config.lfo2.envMode ? 1 : 0;
  bytes[i++] = config.lfo2.rate;
  bytes[i++] = config.lfo2.phase;
  bytes[i++] = lfoPolarityToNumber(config.lfo2.polarity);
  bytes[i++] = config.lfo2.amplify;
  
  // Globals
  bytes[i++] = keySyncToNumber(config.voice.keySync);
  bytes[i++] = config.voice.channelVolume;
  bytes[i++] = config.voice.auxARecv;
  bytes[i++] = config.voice.auxBRecv;
  bytes[i++] = config.voice.auxASend;
  bytes[i++] = config.voice.auxBSend;
  bytes[i++] = config.voice.reverb;
  bytes[i++] = config.voice.delay;
  bytes[i++] = config.voice.fxRoute === 'chorusThenDist' ? 1 : 0;
  bytes[i++] = config.voice.boost;
  
  // Channel distortion
  bytes[i++] = distModeToNumber(config.channelDistortion.mode);
  bytes[i++] = config.channelDistortion.inGain;
  bytes[i++] = config.channelDistortion.param1;
  bytes[i++] = config.channelDistortion.param2;
  
  // Chorus/Flanger
  bytes[i++] = config.chorusFlanger.amount;
  bytes[i++] = config.chorusFlanger.feedback;
  bytes[i++] = config.chorusFlanger.delayL;
  bytes[i++] = config.chorusFlanger.delayR;
  bytes[i++] = config.chorusFlanger.modRate;
  bytes[i++] = config.chorusFlanger.modDepth;
  bytes[i++] = config.chorusFlanger.modPhase;
  
  // Compressor
  bytes[i++] = compModeToNumber(config.compressor.mode);
  bytes[i++] = config.compressor.stereoLink ? 1 : 0;
  bytes[i++] = config.compressor.autoGain ? 1 : 0;
  bytes[i++] = config.compressor.lookahead;
  bytes[i++] = config.compressor.threshold;
  bytes[i++] = config.compressor.ratio;
  bytes[i++] = config.compressor.attack;
  bytes[i++] = config.compressor.release;
  bytes[i++] = config.compressor.outGain;
  
  // Max poly
  bytes[i++] = config.voice.maxPoly;
  
  // Mod matrix
  bytes[i++] = config.modMatrix.length; // Number of mods
  for (const mod of config.modMatrix) {
    bytes[i++] = modSourceToNumber(mod.source);
    bytes[i++] = mod.amount;
    bytes[i++] = mod.dest;
  }
  
  return bytes.slice(0, i);
}

// Helper conversion functions
function oscModeToNumber(mode: V2OscMode): number {
  return ['off', 'saw', 'pulse', 'sin', 'noise', 'fm', 'auxA', 'auxB'].indexOf(mode);
}

function filterModeToNumber(mode: V2FilterMode): number {
  return ['off', 'low', 'band', 'high', 'notch', 'all', 'moogL', 'moogH'].indexOf(mode);
}

function filterRoutingToNumber(routing: V2FilterRouting): number {
  return ['single', 'serial', 'parallel'].indexOf(routing);
}

function distModeToNumber(mode: V2DistMode): number {
  return ['off', 'overdrive', 'clip', 'bitcrush', 'decimate', 'lpf', 'bpf', 'hpf', 'notch', 'allpass', 'moogL'].indexOf(mode);
}

function lfoModeToNumber(mode: V2LFOMode): number {
  return ['saw', 'tri', 'pulse', 'sin', 'sampleHold'].indexOf(mode);
}

function lfoPolarityToNumber(polarity: V2LFOPolarity): number {
  return ['positive', 'negative', 'bipolar'].indexOf(polarity);
}

function keySyncToNumber(keySync: V2KeySync): number {
  return ['none', 'osc', 'full'].indexOf(keySync);
}

function compModeToNumber(mode: 'off' | 'peak' | 'rms'): number {
  return ['off', 'peak', 'rms'].indexOf(mode);
}

function modSourceToNumber(source: V2ModSource): number {
  const sources: V2ModSource[] = [
    'velocity', 'modulation', 'breath', 
    'ctl3', 'ctl4', 'ctl5', 'ctl6', 'volume',
    'ampEG', 'eg2', 'lfo1', 'lfo2', 'note'
  ];
  return sources.indexOf(source);
}
