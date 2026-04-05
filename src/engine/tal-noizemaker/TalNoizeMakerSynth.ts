/**
 * TalNoizeMakerSynth.ts - TAL-NoiseMaker virtual analog WASM engine for DEViLBOX
 *
 * Features:
 * - 3 oscillators (saw/pulse/noise + triangle/sine on osc2) with sync, FM, ring mod
 * - Sub oscillator (osc3)
 * - Multi-mode filter (LP24/LP18/LP12/LP6/HP24/BP24/Notch/SVF-LP/SVF-HP/SVF-BP/Moog24)
 * - 2 ADSR envelopes (amp + filter) + Free AD envelope
 * - 2 LFOs with sync and 8 destinations each
 * - Chorus, reverb, delay effects
 * - Bitcrusher, high-pass, vintage noise
 * - Portamento, velocity mod, pitchwheel, detune
 * - 92 parameters (matching TAL-NoiseMaker Params.h indices)
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { loadNativePatch, captureNativeState } from '@/engine/common/NativePatchLoader';
import { TAL_NATIVE_FACTORY_PRESETS, TAL_ALL_FACTORY_PRESETS } from './talNativePresets';
export { TAL_NATIVE_FACTORY_PRESETS, TAL_ALL_FACTORY_PRESETS };

/**
 * Parameter indices matching the C++ SYNTHPARAMETERS enum in Params.h.
 * All values are normalized 0.0-1.0 and sent directly to the WASM engine.
 */
export const TalNMParam = {
  UNUSED1: 0,
  VOLUME: 1,
  FILTERTYPE: 2,
  CUTOFF: 3,
  RESONANCE: 4,
  KEYFOLLOW: 5,
  FILTERCONTOUR: 6,
  FILTERATTACK: 7,
  FILTERDECAY: 8,
  FILTERSUSTAIN: 9,
  FILTERRELEASE: 10,
  AMPATTACK: 11,
  AMPDECAY: 12,
  AMPSUSTAIN: 13,
  AMPRELEASE: 14,
  OSC1VOLUME: 15,
  OSC2VOLUME: 16,
  OSC3VOLUME: 17,
  OSCMASTERTUNE: 18,
  OSC1TUNE: 19,
  OSC2TUNE: 20,
  OSC1FINETUNE: 21,
  OSC2FINETUNE: 22,
  OSC1WAVEFORM: 23,
  OSC2WAVEFORM: 24,
  OSCSYNC: 25,
  LFO1WAVEFORM: 26,
  LFO2WAVEFORM: 27,
  LFO1RATE: 28,
  LFO2RATE: 29,
  LFO1AMOUNT: 30,
  LFO2AMOUNT: 31,
  LFO1DESTINATION: 32,
  LFO2DESTINATION: 33,
  LFO1PHASE: 34,
  LFO2PHASE: 35,
  OSC2FM: 36,
  OSC2PHASE: 37,
  OSC1PW: 38,
  OSC1PHASE: 39,
  TRANSPOSE: 40,
  FREEADATTACK: 41,
  FREEADDECAY: 42,
  FREEADAMOUNT: 43,
  FREEADDESTINATION: 44,
  LFO1SYNC: 45,
  LFO1KEYTRIGGER: 46,
  LFO2SYNC: 47,
  LFO2KEYTRIGGER: 48,
  PORTAMENTO: 49,
  PORTAMENTOMODE: 50,
  VOICES: 51,
  VELOCITYVOLUME: 52,
  VELOCITYCONTOUR: 53,
  VELOCITYCUTOFF: 54,
  PITCHWHEELCUTOFF: 55,
  PITCHWHEELPITCH: 56,
  RINGMODULATION: 57,
  CHORUS1ENABLE: 58,
  CHORUS2ENABLE: 59,
  REVERBWET: 60,
  REVERBDECAY: 61,
  REVERBPREDELAY: 62,
  REVERBHIGHCUT: 63,
  REVERBLOWCUT: 64,
  OSCBITCRUSHER: 65,
  HIGHPASS: 66,
  DETUNE: 67,
  VINTAGENOISE: 68,
  PANIC: 69,
  UNUSED2: 70,
  ENVELOPEEDITORDEST1: 71,
  ENVELOPEEDITORSPEED: 72,
  ENVELOPEEDITORAMOUNT: 73,
  ENVELOPEONESHOT: 74,
  ENVELOPEFIXTEMPO: 75,
  ENVELOPERESET: 76,
  TAB1OPEN: 77,
  TAB2OPEN: 78,
  TAB3OPEN: 79,
  TAB4OPEN: 80,
  FILTERDRIVE: 81,
  DELAYWET: 82,
  DELAYTIME: 83,
  DELAYSYNC: 84,
  DELAYFACTORL: 85,
  DELAYFACTORR: 86,
  DELAYHIGHSHELF: 87,
  DELAYLOWSHELF: 88,
  DELAYFEEDBACK: 89,
  NUMPARAM: 92,
} as const;

export const TAL_NM_PARAM_NAMES: Record<number, string> = {
  [TalNMParam.VOLUME]: 'Volume',
  [TalNMParam.FILTERTYPE]: 'Filter Type',
  [TalNMParam.CUTOFF]: 'Cutoff',
  [TalNMParam.RESONANCE]: 'Resonance',
  [TalNMParam.KEYFOLLOW]: 'Key Follow',
  [TalNMParam.FILTERCONTOUR]: 'Filter Contour',
  [TalNMParam.FILTERATTACK]: 'Filter Attack',
  [TalNMParam.FILTERDECAY]: 'Filter Decay',
  [TalNMParam.FILTERSUSTAIN]: 'Filter Sustain',
  [TalNMParam.FILTERRELEASE]: 'Filter Release',
  [TalNMParam.AMPATTACK]: 'Amp Attack',
  [TalNMParam.AMPDECAY]: 'Amp Decay',
  [TalNMParam.AMPSUSTAIN]: 'Amp Sustain',
  [TalNMParam.AMPRELEASE]: 'Amp Release',
  [TalNMParam.OSC1VOLUME]: 'Osc1 Volume',
  [TalNMParam.OSC2VOLUME]: 'Osc2 Volume',
  [TalNMParam.OSC3VOLUME]: 'Sub Osc Volume',
  [TalNMParam.OSCMASTERTUNE]: 'Master Tune',
  [TalNMParam.OSC1TUNE]: 'Osc1 Tune',
  [TalNMParam.OSC2TUNE]: 'Osc2 Tune',
  [TalNMParam.OSC1FINETUNE]: 'Osc1 Fine Tune',
  [TalNMParam.OSC2FINETUNE]: 'Osc2 Fine Tune',
  [TalNMParam.OSC1WAVEFORM]: 'Osc1 Waveform',
  [TalNMParam.OSC2WAVEFORM]: 'Osc2 Waveform',
  [TalNMParam.OSCSYNC]: 'Osc Sync',
  [TalNMParam.LFO1WAVEFORM]: 'LFO1 Waveform',
  [TalNMParam.LFO2WAVEFORM]: 'LFO2 Waveform',
  [TalNMParam.LFO1RATE]: 'LFO1 Rate',
  [TalNMParam.LFO2RATE]: 'LFO2 Rate',
  [TalNMParam.LFO1AMOUNT]: 'LFO1 Amount',
  [TalNMParam.LFO2AMOUNT]: 'LFO2 Amount',
  [TalNMParam.LFO1DESTINATION]: 'LFO1 Destination',
  [TalNMParam.LFO2DESTINATION]: 'LFO2 Destination',
  [TalNMParam.LFO1PHASE]: 'LFO1 Phase',
  [TalNMParam.LFO2PHASE]: 'LFO2 Phase',
  [TalNMParam.OSC2FM]: 'Osc2 FM',
  [TalNMParam.OSC2PHASE]: 'Osc2 Phase',
  [TalNMParam.OSC1PW]: 'Osc1 Pulse Width',
  [TalNMParam.OSC1PHASE]: 'Osc1 Phase',
  [TalNMParam.TRANSPOSE]: 'Transpose',
  [TalNMParam.FREEADATTACK]: 'Free AD Attack',
  [TalNMParam.FREEADDECAY]: 'Free AD Decay',
  [TalNMParam.FREEADAMOUNT]: 'Free AD Amount',
  [TalNMParam.FREEADDESTINATION]: 'Free AD Dest',
  [TalNMParam.LFO1SYNC]: 'LFO1 Sync',
  [TalNMParam.LFO1KEYTRIGGER]: 'LFO1 Key Trigger',
  [TalNMParam.LFO2SYNC]: 'LFO2 Sync',
  [TalNMParam.LFO2KEYTRIGGER]: 'LFO2 Key Trigger',
  [TalNMParam.PORTAMENTO]: 'Portamento',
  [TalNMParam.PORTAMENTOMODE]: 'Portamento Mode',
  [TalNMParam.VOICES]: 'Voices',
  [TalNMParam.VELOCITYVOLUME]: 'Velocity Volume',
  [TalNMParam.VELOCITYCONTOUR]: 'Velocity Contour',
  [TalNMParam.VELOCITYCUTOFF]: 'Velocity Cutoff',
  [TalNMParam.PITCHWHEELCUTOFF]: 'PitchWheel Cutoff',
  [TalNMParam.PITCHWHEELPITCH]: 'PitchWheel Pitch',
  [TalNMParam.RINGMODULATION]: 'Ring Modulation',
  [TalNMParam.CHORUS1ENABLE]: 'Chorus 1',
  [TalNMParam.CHORUS2ENABLE]: 'Chorus 2',
  [TalNMParam.REVERBWET]: 'Reverb Wet',
  [TalNMParam.REVERBDECAY]: 'Reverb Decay',
  [TalNMParam.REVERBPREDELAY]: 'Reverb Pre-Delay',
  [TalNMParam.REVERBHIGHCUT]: 'Reverb High Cut',
  [TalNMParam.REVERBLOWCUT]: 'Reverb Low Cut',
  [TalNMParam.OSCBITCRUSHER]: 'Bitcrusher',
  [TalNMParam.HIGHPASS]: 'High Pass',
  [TalNMParam.DETUNE]: 'Detune',
  [TalNMParam.VINTAGENOISE]: 'Vintage Noise',
  [TalNMParam.FILTERDRIVE]: 'Filter Drive',
  [TalNMParam.DELAYWET]: 'Delay Wet',
  [TalNMParam.DELAYTIME]: 'Delay Time',
  [TalNMParam.DELAYSYNC]: 'Delay Sync',
  [TalNMParam.DELAYFACTORL]: 'Delay Factor L',
  [TalNMParam.DELAYFACTORR]: 'Delay Factor R',
  [TalNMParam.DELAYHIGHSHELF]: 'Delay High Shelf',
  [TalNMParam.DELAYLOWSHELF]: 'Delay Low Shelf',
  [TalNMParam.DELAYFEEDBACK]: 'Delay Feedback',
};

/** Default parameter values matching TalPreset.h defaults, keyed by WASM index. */
export const DEFAULT_TAL_NM_PARAMS: Record<number, number> = {
  [TalNMParam.VOLUME]: 0.5,
  [TalNMParam.FILTERTYPE]: 1.0,
  [TalNMParam.CUTOFF]: 1.0,
  [TalNMParam.OSC1VOLUME]: 0.8,
  [TalNMParam.OSC2VOLUME]: 0.0,
  [TalNMParam.OSC3VOLUME]: 0.8,
  [TalNMParam.OSCMASTERTUNE]: 0.5,
  [TalNMParam.OSC1TUNE]: 0.25,
  [TalNMParam.OSC2TUNE]: 0.5,
  [TalNMParam.OSC1FINETUNE]: 0.5,
  [TalNMParam.OSC2FINETUNE]: 0.5,
  [TalNMParam.OSC1WAVEFORM]: 1.0,
  [TalNMParam.OSC2WAVEFORM]: 1.0,
  [TalNMParam.FILTERCONTOUR]: 0.5,
  [TalNMParam.FILTERSUSTAIN]: 1.0,
  [TalNMParam.AMPSUSTAIN]: 1.0,
  [TalNMParam.VOICES]: 1.0,
  [TalNMParam.PORTAMENTOMODE]: 1.0,
  [TalNMParam.LFO1AMOUNT]: 0.5,
  [TalNMParam.LFO2AMOUNT]: 0.5,
  [TalNMParam.LFO1DESTINATION]: 1.0,
  [TalNMParam.LFO2DESTINATION]: 1.0,
  [TalNMParam.OSC1PW]: 0.5,
  [TalNMParam.OSC1PHASE]: 0.5,
  [TalNMParam.TRANSPOSE]: 0.5,
  [TalNMParam.FREEADDESTINATION]: 1.0,
  [TalNMParam.REVERBDECAY]: 0.5,
  [TalNMParam.REVERBLOWCUT]: 1.0,
  [TalNMParam.OSCBITCRUSHER]: 1.0,
  [TalNMParam.ENVELOPEEDITORDEST1]: 1.0,
  [TalNMParam.ENVELOPEEDITORSPEED]: 1.0,
};

/** Friendly config interface for presets */
export interface TalNoizeMakerConfig {
  volume?: number;
  filterType?: number;
  cutoff?: number;
  resonance?: number;
  keyFollow?: number;
  filterContour?: number;
  filterAttack?: number;
  filterDecay?: number;
  filterSustain?: number;
  filterRelease?: number;
  ampAttack?: number;
  ampDecay?: number;
  ampSustain?: number;
  ampRelease?: number;
  osc1Volume?: number;
  osc2Volume?: number;
  osc3Volume?: number;
  masterTune?: number;
  osc1Tune?: number;
  osc2Tune?: number;
  osc1FineTune?: number;
  osc2FineTune?: number;
  osc1Waveform?: number;
  osc2Waveform?: number;
  oscSync?: number;
  lfo1Waveform?: number;
  lfo2Waveform?: number;
  lfo1Rate?: number;
  lfo2Rate?: number;
  lfo1Amount?: number;
  lfo2Amount?: number;
  lfo1Destination?: number;
  lfo2Destination?: number;
  lfo1Phase?: number;
  lfo2Phase?: number;
  osc2FM?: number;
  osc2Phase?: number;
  osc1PW?: number;
  osc1Phase?: number;
  transpose?: number;
  freeAdAttack?: number;
  freeAdDecay?: number;
  freeAdAmount?: number;
  freeAdDestination?: number;
  lfo1Sync?: number;
  lfo1KeyTrigger?: number;
  lfo2Sync?: number;
  lfo2KeyTrigger?: number;
  portamento?: number;
  portamentoMode?: number;
  voices?: number;
  velocityVolume?: number;
  velocityContour?: number;
  velocityCutoff?: number;
  pitchwheelCutoff?: number;
  pitchwheelPitch?: number;
  ringModulation?: number;
  chorus1Enable?: number;
  chorus2Enable?: number;
  reverbWet?: number;
  reverbDecay?: number;
  reverbPreDelay?: number;
  reverbHighCut?: number;
  reverbLowCut?: number;
  oscBitcrusher?: number;
  highPass?: number;
  detune?: number;
  vintageNoise?: number;
  filterDrive?: number;
  delayWet?: number;
  delayTime?: number;
  delaySync?: number;
  delayFactorL?: number;
  delayFactorR?: number;
  delayHighShelf?: number;
  delayLowShelf?: number;
  delayFeedback?: number;
}

/** Maps config keys to WASM parameter indices */
const CONFIG_TO_INDEX: Record<string, number> = {
  volume: TalNMParam.VOLUME,
  filterType: TalNMParam.FILTERTYPE,
  cutoff: TalNMParam.CUTOFF,
  resonance: TalNMParam.RESONANCE,
  keyFollow: TalNMParam.KEYFOLLOW,
  filterContour: TalNMParam.FILTERCONTOUR,
  filterAttack: TalNMParam.FILTERATTACK,
  filterDecay: TalNMParam.FILTERDECAY,
  filterSustain: TalNMParam.FILTERSUSTAIN,
  filterRelease: TalNMParam.FILTERRELEASE,
  ampAttack: TalNMParam.AMPATTACK,
  ampDecay: TalNMParam.AMPDECAY,
  ampSustain: TalNMParam.AMPSUSTAIN,
  ampRelease: TalNMParam.AMPRELEASE,
  osc1Volume: TalNMParam.OSC1VOLUME,
  osc2Volume: TalNMParam.OSC2VOLUME,
  osc3Volume: TalNMParam.OSC3VOLUME,
  masterTune: TalNMParam.OSCMASTERTUNE,
  osc1Tune: TalNMParam.OSC1TUNE,
  osc2Tune: TalNMParam.OSC2TUNE,
  osc1FineTune: TalNMParam.OSC1FINETUNE,
  osc2FineTune: TalNMParam.OSC2FINETUNE,
  osc1Waveform: TalNMParam.OSC1WAVEFORM,
  osc2Waveform: TalNMParam.OSC2WAVEFORM,
  oscSync: TalNMParam.OSCSYNC,
  lfo1Waveform: TalNMParam.LFO1WAVEFORM,
  lfo2Waveform: TalNMParam.LFO2WAVEFORM,
  lfo1Rate: TalNMParam.LFO1RATE,
  lfo2Rate: TalNMParam.LFO2RATE,
  lfo1Amount: TalNMParam.LFO1AMOUNT,
  lfo2Amount: TalNMParam.LFO2AMOUNT,
  lfo1Destination: TalNMParam.LFO1DESTINATION,
  lfo2Destination: TalNMParam.LFO2DESTINATION,
  lfo1Phase: TalNMParam.LFO1PHASE,
  lfo2Phase: TalNMParam.LFO2PHASE,
  osc2FM: TalNMParam.OSC2FM,
  osc2Phase: TalNMParam.OSC2PHASE,
  osc1PW: TalNMParam.OSC1PW,
  osc1Phase: TalNMParam.OSC1PHASE,
  transpose: TalNMParam.TRANSPOSE,
  freeAdAttack: TalNMParam.FREEADATTACK,
  freeAdDecay: TalNMParam.FREEADDECAY,
  freeAdAmount: TalNMParam.FREEADAMOUNT,
  freeAdDestination: TalNMParam.FREEADDESTINATION,
  lfo1Sync: TalNMParam.LFO1SYNC,
  lfo1KeyTrigger: TalNMParam.LFO1KEYTRIGGER,
  lfo2Sync: TalNMParam.LFO2SYNC,
  lfo2KeyTrigger: TalNMParam.LFO2KEYTRIGGER,
  portamento: TalNMParam.PORTAMENTO,
  portamentoMode: TalNMParam.PORTAMENTOMODE,
  voices: TalNMParam.VOICES,
  velocityVolume: TalNMParam.VELOCITYVOLUME,
  velocityContour: TalNMParam.VELOCITYCONTOUR,
  velocityCutoff: TalNMParam.VELOCITYCUTOFF,
  pitchwheelCutoff: TalNMParam.PITCHWHEELCUTOFF,
  pitchwheelPitch: TalNMParam.PITCHWHEELPITCH,
  ringModulation: TalNMParam.RINGMODULATION,
  chorus1Enable: TalNMParam.CHORUS1ENABLE,
  chorus2Enable: TalNMParam.CHORUS2ENABLE,
  reverbWet: TalNMParam.REVERBWET,
  reverbDecay: TalNMParam.REVERBDECAY,
  reverbPreDelay: TalNMParam.REVERBPREDELAY,
  reverbHighCut: TalNMParam.REVERBHIGHCUT,
  reverbLowCut: TalNMParam.REVERBLOWCUT,
  oscBitcrusher: TalNMParam.OSCBITCRUSHER,
  highPass: TalNMParam.HIGHPASS,
  detune: TalNMParam.DETUNE,
  vintageNoise: TalNMParam.VINTAGENOISE,
  filterDrive: TalNMParam.FILTERDRIVE,
  delayWet: TalNMParam.DELAYWET,
  delayTime: TalNMParam.DELAYTIME,
  delaySync: TalNMParam.DELAYSYNC,
  delayFactorL: TalNMParam.DELAYFACTORL,
  delayFactorR: TalNMParam.DELAYFACTORR,
  delayHighShelf: TalNMParam.DELAYHIGHSHELF,
  delayLowShelf: TalNMParam.DELAYLOWSHELF,
  delayFeedback: TalNMParam.DELAYFEEDBACK,
};

export const TAL_NOIZEMAKER_PRESETS: Record<string, Partial<TalNoizeMakerConfig>> = {
  'Init': {},
  'Fat Bass': {
    osc1Volume: 0.9, osc1Waveform: 1.0,
    osc3Volume: 0.7,
    cutoff: 0.25, resonance: 0.6, filterDrive: 0.3,
    filterContour: 0.8, filterDecay: 0.25, filterSustain: 0.1, filterRelease: 0.1,
    ampDecay: 0.2, ampSustain: 0.7, ampRelease: 0.1,
    voices: 0.0,
  },
  'Acid Squelch': {
    osc1Volume: 0.9, osc1Waveform: 0.5, osc1PW: 0.4,
    filterType: 1.0, cutoff: 0.15, resonance: 0.85, filterDrive: 0.7,
    filterContour: 0.9, filterDecay: 0.2, filterSustain: 0.0, filterRelease: 0.15,
    ampDecay: 0.3, ampSustain: 0.6, ampRelease: 0.15,
    voices: 0.0, portamento: 0.15,
  },
  'SuperSaw Lead': {
    osc1Volume: 0.8, osc1Waveform: 1.0,
    osc2Volume: 0.7, osc2Waveform: 1.0, osc2FineTune: 0.52,
    cutoff: 0.55, resonance: 0.15,
    filterContour: 0.65, filterAttack: 0.05, filterDecay: 0.4,
    filterSustain: 0.4, filterRelease: 0.3,
    ampAttack: 0.05, ampDecay: 0.3, ampSustain: 0.8, ampRelease: 0.3,
    detune: 0.35, chorus1Enable: 1.0,
    voices: 1.0,
  },
  'Lush Pad': {
    osc1Volume: 0.6, osc2Volume: 0.5, osc2Waveform: 0.5, osc2FineTune: 0.48,
    cutoff: 0.4, resonance: 0.1,
    filterAttack: 0.5, filterDecay: 0.6, filterSustain: 0.6, filterRelease: 0.5,
    ampAttack: 0.6, ampDecay: 0.4, ampSustain: 0.8, ampRelease: 0.6,
    reverbWet: 0.5, reverbDecay: 0.7,
    chorus1Enable: 1.0, chorus2Enable: 1.0,
    voices: 1.0,
  },
  'Wobble Bass': {
    osc1Volume: 0.9, osc1Waveform: 1.0,
    osc3Volume: 0.5,
    cutoff: 0.2, resonance: 0.5, filterDrive: 0.4,
    filterContour: 0.7, filterDecay: 0.3, filterSustain: 0.2, filterRelease: 0.1,
    ampDecay: 0.2, ampSustain: 0.8, ampRelease: 0.15,
    lfo1Rate: 0.35, lfo1Amount: 0.7, lfo1Destination: 0.25, lfo1Sync: 1.0,
    voices: 0.0,
  },
  'Trance Pad': {
    osc1Volume: 0.7, osc1Waveform: 1.0,
    osc2Volume: 0.6, osc2Waveform: 1.0, osc2FineTune: 0.47,
    cutoff: 0.35, resonance: 0.15,
    filterContour: 0.4, filterAttack: 0.6, filterDecay: 0.7, filterSustain: 0.55, filterRelease: 0.6,
    ampAttack: 0.65, ampDecay: 0.5, ampSustain: 0.8, ampRelease: 0.6,
    detune: 0.3, chorus1Enable: 1.0, chorus2Enable: 1.0,
    reverbWet: 0.5, reverbDecay: 0.65,
    voices: 1.0,
  },
  'Pluck Bass': {
    osc1Volume: 0.85, osc1Waveform: 0.5, osc1PW: 0.35,
    osc3Volume: 0.6,
    cutoff: 0.4, resonance: 0.35, filterDrive: 0.2,
    filterContour: 0.75, filterDecay: 0.15, filterSustain: 0.05, filterRelease: 0.08,
    ampDecay: 0.18, ampSustain: 0.4, ampRelease: 0.08,
    voices: 0.0,
  },
  'Noise Hit': {
    osc1Volume: 0.3, osc1Waveform: 0.0,
    osc2Volume: 0.8, osc2Waveform: 1.0,
    cutoff: 0.6, resonance: 0.4, filterDrive: 0.5,
    filterContour: 0.85, filterDecay: 0.12, filterSustain: 0.0, filterRelease: 0.1,
    ampDecay: 0.15, ampSustain: 0.0, ampRelease: 0.1,
    oscBitcrusher: 0.6,
    voices: 0.0,
  },
  'Bit Crush': {
    osc1Volume: 0.8, osc1Waveform: 0.5, osc1PW: 0.5,
    cutoff: 0.5, resonance: 0.3, filterDrive: 0.4,
    filterContour: 0.5, filterDecay: 0.35, filterSustain: 0.3, filterRelease: 0.2,
    ampDecay: 0.3, ampSustain: 0.7, ampRelease: 0.15,
    oscBitcrusher: 0.3,
    voices: 0.0,
  },
  'Vintage Keys': {
    osc1Volume: 0.7, osc1Waveform: 0.5, osc1PW: 0.4,
    osc2Volume: 0.5, osc2Waveform: 0.0, osc2Tune: 0.75,
    cutoff: 0.5, resonance: 0.1,
    filterContour: 0.4, filterDecay: 0.4, filterSustain: 0.3, filterRelease: 0.25,
    ampDecay: 0.45, ampSustain: 0.6, ampRelease: 0.25,
    chorus1Enable: 1.0,
    reverbWet: 0.2, reverbDecay: 0.4,
    voices: 1.0,
  },
  'Detuned Lead': {
    osc1Volume: 0.85, osc1Waveform: 1.0,
    osc2Volume: 0.8, osc2Waveform: 1.0, osc2FineTune: 0.54,
    cutoff: 0.6, resonance: 0.25, filterDrive: 0.15,
    filterContour: 0.55, filterAttack: 0.02, filterDecay: 0.3, filterSustain: 0.45, filterRelease: 0.2,
    ampAttack: 0.02, ampDecay: 0.25, ampSustain: 0.8, ampRelease: 0.2,
    detune: 0.4,
    voices: 0.0, portamento: 0.08,
  },
  'FM Stab': {
    osc1Volume: 0.8, osc1Waveform: 0.5, osc1PW: 0.45,
    osc2Volume: 0.6, osc2Waveform: 0.0, osc2Tune: 0.75, osc2FM: 0.6,
    cutoff: 0.7, resonance: 0.2,
    filterContour: 0.7, filterDecay: 0.18, filterSustain: 0.1, filterRelease: 0.12,
    ampDecay: 0.2, ampSustain: 0.3, ampRelease: 0.12,
    voices: 1.0,
  },
  'Dark Bass': {
    osc1Volume: 0.95, osc1Waveform: 1.0,
    osc3Volume: 0.8,
    cutoff: 0.15, resonance: 0.45, filterDrive: 0.5,
    filterContour: 0.6, filterDecay: 0.3, filterSustain: 0.15, filterRelease: 0.1,
    ampDecay: 0.25, ampSustain: 0.75, ampRelease: 0.1,
    highPass: 0.0,
    voices: 0.0,
  },
  'Ring Bell': {
    osc1Volume: 0.7, osc1Waveform: 0.0, osc1Tune: 0.75,
    osc2Volume: 0.7, osc2Waveform: 0.0, osc2Tune: 0.5,
    ringModulation: 0.8,
    cutoff: 0.8, resonance: 0.1,
    filterContour: 0.3, filterDecay: 0.6, filterSustain: 0.05, filterRelease: 0.5,
    ampDecay: 0.7, ampSustain: 0.02, ampRelease: 0.6,
    reverbWet: 0.45, reverbDecay: 0.65,
    voices: 1.0,
  },
  'Sync Scream': {
    osc1Volume: 0.85, osc1Waveform: 1.0,
    osc2Volume: 0.0, osc2Waveform: 1.0, osc2Tune: 0.65,
    oscSync: 1.0,
    cutoff: 0.6, resonance: 0.4, filterDrive: 0.3,
    filterContour: 0.7, filterAttack: 0.02, filterDecay: 0.3, filterSustain: 0.4, filterRelease: 0.2,
    ampAttack: 0.01, ampDecay: 0.2, ampSustain: 0.8, ampRelease: 0.15,
    lfo1Rate: 0.3, lfo1Amount: 0.4, lfo1Destination: 0.5,
    voices: 0.0,
  },
  'Atmospheric': {
    osc1Volume: 0.5, osc1Waveform: 1.0,
    osc2Volume: 0.4, osc2Waveform: 0.5, osc2FineTune: 0.47,
    cutoff: 0.3, resonance: 0.2,
    filterContour: 0.2, filterAttack: 0.8, filterDecay: 0.7, filterSustain: 0.5, filterRelease: 0.7,
    ampAttack: 0.85, ampDecay: 0.6, ampSustain: 0.75, ampRelease: 0.8,
    reverbWet: 0.6, reverbDecay: 0.8,
    delayWet: 0.3, delayTime: 0.4, delayFeedback: 0.45,
    chorus1Enable: 1.0,
    voices: 1.0,
  },
  'Retro Poly': {
    osc1Volume: 0.7, osc1Waveform: 0.5, osc1PW: 0.3,
    osc2Volume: 0.6, osc2Waveform: 1.0, osc2FineTune: 0.52,
    cutoff: 0.45, resonance: 0.15,
    filterContour: 0.5, filterAttack: 0.05, filterDecay: 0.45, filterSustain: 0.4, filterRelease: 0.35,
    ampAttack: 0.05, ampDecay: 0.4, ampSustain: 0.7, ampRelease: 0.35,
    chorus1Enable: 1.0,
    voices: 1.0,
  },
  'Distorted Mono': {
    osc1Volume: 0.9, osc1Waveform: 1.0,
    osc2Volume: 0.85, osc2Waveform: 0.5, osc2FineTune: 0.53,
    cutoff: 0.45, resonance: 0.5, filterDrive: 0.75,
    filterContour: 0.65, filterDecay: 0.25, filterSustain: 0.3, filterRelease: 0.15,
    ampDecay: 0.2, ampSustain: 0.8, ampRelease: 0.12,
    oscBitcrusher: 0.7,
    voices: 0.0, portamento: 0.05,
  },
  'Pulsating': {
    osc1Volume: 0.75, osc1Waveform: 0.5, osc1PW: 0.5,
    osc2Volume: 0.6, osc2Waveform: 0.5, osc2FineTune: 0.48,
    cutoff: 0.4, resonance: 0.25,
    filterContour: 0.3, filterDecay: 0.5, filterSustain: 0.5, filterRelease: 0.4,
    ampAttack: 0.3, ampDecay: 0.4, ampSustain: 0.75, ampRelease: 0.4,
    lfo1Rate: 0.25, lfo1Amount: 0.5, lfo1Destination: 0.25, lfo1Sync: 1.0,
    lfo2Rate: 0.15, lfo2Amount: 0.3, lfo2Destination: 0.5,
    chorus1Enable: 1.0,
    voices: 1.0,
  },
};

// Native factory presets re-exported above from talNativePresets.ts

export class TalNoizeMakerEngine implements DevilboxSynth {
  readonly name = 'TalNoizeMakerEngine';
  readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private params: Record<number, number> = {};
  private isInitialized = false;
  private pendingNotes: Array<{ note: number; velocity: number }> = [];
  private pendingPatch: number[] | null = null;

  private static isWorkletLoaded = false;
  private static workletLoadPromise: Promise<void> | null = null;
  private _initPromise: Promise<void>;

  constructor(config: Partial<TalNoizeMakerConfig> = {}) {
    this.output = getDevilboxAudioContext().createGain();
    this.params = { ...DEFAULT_TAL_NM_PARAMS };
    for (const [key, value] of Object.entries(config)) {
      const idx = CONFIG_TO_INDEX[key];
      if (idx !== undefined && typeof value === 'number') {
        this.params[idx] = value;
      }
    }
    this._initPromise = this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      const rawContext = getDevilboxAudioContext();
      const baseUrl = import.meta.env.BASE_URL || '/';

      if (!TalNoizeMakerEngine.isWorkletLoaded) {
        if (!TalNoizeMakerEngine.workletLoadPromise) {
          TalNoizeMakerEngine.workletLoadPromise = rawContext.audioWorklet.addModule(
            `${baseUrl}tal-noisemaker/TalNoizeMaker.worklet.js`
          );
        }
        await TalNoizeMakerEngine.workletLoadPromise;
        TalNoizeMakerEngine.isWorkletLoaded = true;
      }

      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}tal-noisemaker/TalNoizeMaker.wasm`),
        fetch(`${baseUrl}tal-noisemaker/TalNoizeMaker.js`)
      ]);

      if (!wasmResponse.ok) throw new Error(`Failed to load TalNoizeMaker.wasm: ${wasmResponse.status}`);
      if (!jsResponse.ok) throw new Error(`Failed to load TalNoizeMaker.js: ${jsResponse.status}`);

      const [wasmBinary, jsCodeRaw] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text()
      ]);

      const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
      const jsCode = urlPolyfill + jsCodeRaw
        .replace(/import\.meta\.url/g, `"${baseUrl}tal-noisemaker/"`)
        .replace(/export\s+default\s+\w+;?\s*$/, '')
        .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
        .replace(/(wasmMemory\s*=\s*wasmExports\[['"][\w]+['"]\])/, '$1;Module["wasmMemory"]=wasmMemory')
        .replace(/new\s+URL\(([^,]+),\s*([^)]+)\)\.href/g, '($2 + $1)');

      this._worklet = new AudioWorkletNode(rawContext, 'tal-noizemaker-processor', {
        outputChannelCount: [2],
        numberOfOutputs: 1,
      });

      this._worklet.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isInitialized = true;
          if (this.pendingPatch) {
            void loadNativePatch(this._worklet!, this.pendingPatch).catch(() => {});
            this.pendingPatch = null;
          } else {
            this.sendAllParams();
          }
          for (const { note, velocity } of this.pendingNotes) {
            this._worklet!.port.postMessage({ type: 'noteOn', note, velocity });
          }
          this.pendingNotes = [];
        } else if (event.data.type === 'error') {
          console.error('TalNoizeMaker error:', event.data.message);
        }
      };

      this._worklet.port.postMessage({
        type: 'init', wasmBinary, jsCode, sampleRate: rawContext.sampleRate,
      });

      this._worklet.connect(this.output);

      try {
        const keepalive = rawContext.createGain();
        keepalive.gain.value = 0;
        this._worklet.connect(keepalive);
        keepalive.connect(rawContext.destination);
      } catch { /* keepalive failed */ }

    } catch (error) {
      console.error('Failed to initialize TalNoizeMaker:', error);
      throw error;
    }
  }

  private sendAllParams(): void {
    if (!this._worklet || !this.isInitialized) return;
    for (const [indexStr, value] of Object.entries(this.params)) {
      const index = Number(indexStr);
      this._worklet.port.postMessage({ type: 'setParam', index, value });
    }
  }

  triggerAttack(frequency: number | string, _time?: number, velocity?: number): this {
    const note = typeof frequency === 'string'
      ? noteToMidi(frequency)
      : Math.round(12 * Math.log2(frequency / 440) + 69);
    const vel = Math.round((velocity ?? 0.8) * 127);
    if (!this.isInitialized || !this._worklet) {
      this.pendingNotes.push({ note, velocity: vel });
      return this;
    }
    this._worklet.port.postMessage({ type: 'noteOn', note, velocity: vel });
    return this;
  }

  triggerRelease(frequency?: number | string, _time?: number): this {
    if (!this._worklet || !this.isInitialized) {
      // Clear pending notes to prevent stuck notes when noteOff arrives before init
      if (frequency !== undefined) {
        const note = typeof frequency === 'string'
          ? noteToMidi(frequency)
          : Math.round(12 * Math.log2(frequency / 440) + 69);
        this.pendingNotes = this.pendingNotes.filter(p => p.note !== note);
      } else {
        this.pendingNotes = [];
      }
      return this;
    }
    if (frequency !== undefined) {
      const note = typeof frequency === 'string'
        ? noteToMidi(frequency)
        : Math.round(12 * Math.log2(frequency / 440) + 69);
      this._worklet.port.postMessage({ type: 'noteOff', note });
    } else {
      this._worklet.port.postMessage({ type: 'allNotesOff' });
    }
    return this;
  }

  set(param: string | number, value: number): void {
    let index: number;
    if (typeof param === 'number') {
      index = param;
    } else {
      index = CONFIG_TO_INDEX[param];
      if (index === undefined) return;
    }
    this.params[index] = value;
    if (this._worklet && this.isInitialized) {
      this._worklet.port.postMessage({ type: 'setParam', index, value });
    }
  }

  get(param: string | number): number | undefined {
    const index = typeof param === 'number' ? param : CONFIG_TO_INDEX[param];
    return index !== undefined ? this.params[index] : undefined;
  }

  setPreset(name: string): void {
    const preset = TAL_NOIZEMAKER_PRESETS[name];
    if (!preset) return;
    this.params = { ...DEFAULT_TAL_NM_PARAMS };
    for (const [key, value] of Object.entries(preset)) {
      const idx = CONFIG_TO_INDEX[key];
      if (idx !== undefined && typeof value === 'number') {
        this.params[idx] = value;
      }
    }
    this.sendAllParams();
  }

  /**
   * Load a native patch (complete engine state snapshot).
   * If not yet initialized, queues the patch for loading on ready.
   */
  loadPatch(values: number[]): void {
    if (this.isInitialized && this._worklet) {
      void loadNativePatch(this._worklet, values).catch(() => {});
    } else {
      this.pendingPatch = values;
    }
  }

  /**
   * Load a native preset by name from the TAL_NATIVE_FACTORY_PRESETS map.
   */
  loadNativePreset(name: string): void {
    const preset = TAL_NATIVE_FACTORY_PRESETS.find(p => p.name === name);
    if (preset) {
      this.loadPatch(preset.values);
    } else {
      console.warn(`[TalNoizeMaker] Native preset not found: ${name}`);
    }
  }

  /**
   * Capture the current complete engine state (for preset creation).
   */
  async getState(): Promise<number[] | null> {
    if (!this.isInitialized || !this._worklet) return null;
    try {
      const result = await captureNativeState(this._worklet);
      return result.values;
    } catch {
      return null;
    }
  }

  dispose(): void {
    if (this._worklet) {
      this._worklet.port.postMessage({ type: 'dispose' });
      this._worklet.disconnect();
      this._worklet = null;
    }
    this.isInitialized = false;
  }
}

/**
 * TalNoizeMakerSynthImpl — alias used by CommunitySynthFactory.
 */
export class TalNoizeMakerSynthImpl extends TalNoizeMakerEngine {
  async init(): Promise<void> {
    return this.ensureInitialized();
  }

  applyConfig(config: Partial<TalNoizeMakerConfig>): void {
    const prev = (this as any).config as Record<string, number | undefined>;
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'number' && value !== prev[key]) {
        this.set(key, value);
      }
    }
  }
}

// Compatibility aliases for existing code
export const TalNoizeMakerParam = TalNMParam;
export const TAL_NOIZEMAKER_PARAM_NAMES = TAL_NM_PARAM_NAMES;

/** Compat: config-key-based defaults for UI components */
export const DEFAULT_TAL_NOIZEMAKER: TalNoizeMakerConfig = {
  volume: DEFAULT_TAL_NM_PARAMS[TalNMParam.VOLUME],
  filterType: DEFAULT_TAL_NM_PARAMS[TalNMParam.FILTERTYPE],
  cutoff: DEFAULT_TAL_NM_PARAMS[TalNMParam.CUTOFF],
  osc1Volume: DEFAULT_TAL_NM_PARAMS[TalNMParam.OSC1VOLUME],
  osc2Volume: DEFAULT_TAL_NM_PARAMS[TalNMParam.OSC2VOLUME] ?? 0,
  osc3Volume: DEFAULT_TAL_NM_PARAMS[TalNMParam.OSC3VOLUME],
  masterTune: DEFAULT_TAL_NM_PARAMS[TalNMParam.OSCMASTERTUNE],
  osc1Tune: DEFAULT_TAL_NM_PARAMS[TalNMParam.OSC1TUNE],
  osc2Tune: DEFAULT_TAL_NM_PARAMS[TalNMParam.OSC2TUNE],
  osc1FineTune: DEFAULT_TAL_NM_PARAMS[TalNMParam.OSC1FINETUNE],
  osc2FineTune: DEFAULT_TAL_NM_PARAMS[TalNMParam.OSC2FINETUNE],
  osc1Waveform: DEFAULT_TAL_NM_PARAMS[TalNMParam.OSC1WAVEFORM],
  osc2Waveform: DEFAULT_TAL_NM_PARAMS[TalNMParam.OSC2WAVEFORM],
  filterContour: DEFAULT_TAL_NM_PARAMS[TalNMParam.FILTERCONTOUR],
  filterSustain: DEFAULT_TAL_NM_PARAMS[TalNMParam.FILTERSUSTAIN],
  ampSustain: DEFAULT_TAL_NM_PARAMS[TalNMParam.AMPSUSTAIN],
  voices: DEFAULT_TAL_NM_PARAMS[TalNMParam.VOICES],
  portamentoMode: DEFAULT_TAL_NM_PARAMS[TalNMParam.PORTAMENTOMODE],
  lfo1Amount: DEFAULT_TAL_NM_PARAMS[TalNMParam.LFO1AMOUNT],
  lfo2Amount: DEFAULT_TAL_NM_PARAMS[TalNMParam.LFO2AMOUNT],
  lfo1Destination: DEFAULT_TAL_NM_PARAMS[TalNMParam.LFO1DESTINATION],
  lfo2Destination: DEFAULT_TAL_NM_PARAMS[TalNMParam.LFO2DESTINATION],
  osc1PW: DEFAULT_TAL_NM_PARAMS[TalNMParam.OSC1PW],
  osc1Phase: DEFAULT_TAL_NM_PARAMS[TalNMParam.OSC1PHASE],
  transpose: DEFAULT_TAL_NM_PARAMS[TalNMParam.TRANSPOSE],
  freeAdDestination: DEFAULT_TAL_NM_PARAMS[TalNMParam.FREEADDESTINATION],
  reverbDecay: DEFAULT_TAL_NM_PARAMS[TalNMParam.REVERBDECAY],
  reverbLowCut: DEFAULT_TAL_NM_PARAMS[TalNMParam.REVERBLOWCUT],
  oscBitcrusher: DEFAULT_TAL_NM_PARAMS[TalNMParam.OSCBITCRUSHER],
};
