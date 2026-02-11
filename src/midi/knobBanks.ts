import type { MappableParameter, KnobBankMode } from './types';
import type { SynthType } from '../types/instrument';

export interface KnobAssignment {
  cc: number;
  param: MappableParameter;
  label: string;
}

export interface JoystickAxisMapping {
  param: MappableParameter;
  min: number;
  max: number;
  curve: 'linear' | 'log';
}

export interface JoystickMapping {
  x: JoystickAxisMapping;
  y: JoystickAxisMapping;
}

export const KNOB_BANKS: Record<KnobBankMode, KnobAssignment[]> = {
  '303': [
    { cc: 70, param: 'cutoff', label: 'Cutoff' },
    { cc: 71, param: 'resonance', label: 'Resonance' },
    { cc: 72, param: 'envMod', label: 'Env Mod' },
    { cc: 73, param: 'decay', label: 'Decay' },
    { cc: 74, param: 'accent', label: 'Accent' },
    { cc: 75, param: 'overdrive', label: 'Drive' },
    { cc: 76, param: 'slideTime', label: 'Slide' },
    { cc: 77, param: 'mixer.volume', label: 'Volume' },
  ],
  'Siren': [
    { cc: 70, param: 'siren.osc.frequency', label: 'Osc Freq' },
    { cc: 71, param: 'siren.lfo.rate', label: 'LFO Rate' },
    { cc: 72, param: 'siren.lfo.depth', label: 'LFO Depth' },
    { cc: 73, param: 'siren.delay.time', label: 'Delay Time' },
    { cc: 74, param: 'siren.delay.feedback', label: 'Feedback' },
    { cc: 75, param: 'siren.delay.wet', label: 'Delay Mix' },
    { cc: 76, param: 'siren.filter.frequency', label: 'Filter' },
    { cc: 77, param: 'siren.reverb.wet', label: 'Reverb' },
  ],
  'Furnace': [
    { cc: 70, param: 'furnace.algorithm', label: 'Algorithm' },
    { cc: 71, param: 'furnace.feedback', label: 'Feedback' },
    { cc: 72, param: 'furnace.op1TL', label: 'Op1 TL' },
    { cc: 73, param: 'furnace.op1AR', label: 'Op1 AR' },
    { cc: 74, param: 'furnace.op1DR', label: 'Op1 DR' },
    { cc: 75, param: 'furnace.op1SL', label: 'Op1 SL' },
    { cc: 76, param: 'furnace.op1RR', label: 'Op1 RR' },
    { cc: 77, param: 'furnace.fms', label: 'FM Sens' },
  ],
  'V2': [
    { cc: 70, param: 'v2.osc1Level', label: 'Osc1 Lvl' },
    { cc: 71, param: 'v2.filter1Cutoff', label: 'Cutoff' },
    { cc: 72, param: 'v2.filter1Reso', label: 'Reso' },
    { cc: 73, param: 'v2.envAttack', label: 'Attack' },
    { cc: 74, param: 'v2.envDecay', label: 'Decay' },
    { cc: 75, param: 'v2.envSustain', label: 'Sustain' },
    { cc: 76, param: 'v2.envRelease', label: 'Release' },
    { cc: 77, param: 'v2.lfo1Depth', label: 'LFO Dep' },
  ],
  'Synare': [
    { cc: 70, param: 'synare.tune', label: 'Tune' },
    { cc: 71, param: 'synare.osc2Mix', label: 'Osc2 Mix' },
    { cc: 72, param: 'synare.filterCutoff', label: 'Cutoff' },
    { cc: 73, param: 'synare.filterReso', label: 'Reso' },
    { cc: 74, param: 'synare.filterEnvMod', label: 'Env Mod' },
    { cc: 75, param: 'synare.filterDecay', label: 'Flt Dcy' },
    { cc: 76, param: 'synare.sweepAmount', label: 'Sweep' },
    { cc: 77, param: 'synare.sweepTime', label: 'Swp Time' },
  ],
  'Dexed': [
    { cc: 70, param: 'dexed.algorithm', label: 'Algorithm' },
    { cc: 71, param: 'dexed.feedback', label: 'Feedback' },
    { cc: 72, param: 'dexed.op1Level', label: 'Op1 Lvl' },
    { cc: 73, param: 'dexed.op1Coarse', label: 'Op1 Coarse' },
    { cc: 74, param: 'dexed.lfoSpeed', label: 'LFO Spd' },
    { cc: 75, param: 'dexed.lfoPitchMod', label: 'LFO Pitch' },
    { cc: 76, param: 'dexed.lfoAmpMod', label: 'LFO Amp' },
    { cc: 77, param: 'dexed.transpose', label: 'Transpose' },
  ],
  'OBXd': [
    { cc: 70, param: 'obxd.osc1Level', label: 'Osc1 Lvl' },
    { cc: 71, param: 'obxd.osc2Level', label: 'Osc2 Lvl' },
    { cc: 72, param: 'obxd.filterCutoff', label: 'Cutoff' },
    { cc: 73, param: 'obxd.filterReso', label: 'Reso' },
    { cc: 74, param: 'obxd.filterEnv', label: 'Flt Env' },
    { cc: 75, param: 'obxd.ampAttack', label: 'Attack' },
    { cc: 76, param: 'obxd.ampDecay', label: 'Decay' },
    { cc: 77, param: 'obxd.volume', label: 'Volume' },
  ],
  'SpaceLaser': [
    { cc: 70, param: 'spacelaser.startFreq', label: 'Start Hz' },
    { cc: 71, param: 'spacelaser.endFreq', label: 'End Hz' },
    { cc: 72, param: 'spacelaser.sweepTime', label: 'Sweep' },
    { cc: 73, param: 'spacelaser.fmAmount', label: 'FM Amt' },
    { cc: 74, param: 'spacelaser.fmRatio', label: 'FM Ratio' },
    { cc: 75, param: 'spacelaser.filterCutoff', label: 'Cutoff' },
    { cc: 76, param: 'spacelaser.filterReso', label: 'Reso' },
    { cc: 77, param: 'spacelaser.delayWet', label: 'Delay' },
  ],
  'SAM': [
    { cc: 70, param: 'sam.pitch', label: 'Pitch' },
    { cc: 71, param: 'sam.speed', label: 'Speed' },
    { cc: 72, param: 'sam.mouth', label: 'Mouth' },
    { cc: 73, param: 'sam.throat', label: 'Throat' },
    { cc: 74, param: 'mixer.volume', label: 'Volume' },
    { cc: 75, param: 'mixer.volume', label: '-' },
    { cc: 76, param: 'mixer.volume', label: '-' },
    { cc: 77, param: 'mixer.volume', label: '-' },
  ],
  'Organ': [
    { cc: 70, param: 'organ.drawbar16', label: "16'" },
    { cc: 71, param: 'organ.drawbar8', label: "8'" },
    { cc: 72, param: 'organ.drawbar4', label: "4'" },
    { cc: 73, param: 'organ.percussion', label: 'Perc' },
    { cc: 74, param: 'organ.vibratoType', label: 'Vib Type' },
    { cc: 75, param: 'organ.vibratoDepth', label: 'Vib Dep' },
    { cc: 76, param: 'organ.overdrive', label: 'Drive' },
    { cc: 77, param: 'organ.volume', label: 'Volume' },
  ],
  'Melodica': [
    { cc: 70, param: 'melodica.breath', label: 'Breath' },
    { cc: 71, param: 'melodica.brightness', label: 'Bright' },
    { cc: 72, param: 'melodica.vibratoRate', label: 'Vib Rate' },
    { cc: 73, param: 'melodica.vibratoDepth', label: 'Vib Dep' },
    { cc: 74, param: 'melodica.detune', label: 'Detune' },
    { cc: 75, param: 'melodica.portamento', label: 'Porta' },
    { cc: 76, param: 'melodica.attack', label: 'Attack' },
    { cc: 77, param: 'melodica.volume', label: 'Volume' },
  ],
  'FX': [
    { cc: 70, param: 'echo.rate', label: 'Echo Rate' },
    { cc: 71, param: 'echo.intensity', label: 'Intensity' },
    { cc: 72, param: 'echo.echoVolume', label: 'Echo Vol' },
    { cc: 73, param: 'echo.reverbVolume', label: 'Rev Vol' },
    { cc: 74, param: 'echo.mode', label: 'Echo Mode' },
    { cc: 75, param: 'biphase.rateA', label: 'Phase A' },
    { cc: 76, param: 'biphase.feedback', label: 'Phase FB' },
    { cc: 77, param: 'biphase.routing', label: 'Routing' },
  ],
  'Mixer': [
    { cc: 70, param: 'mixer.volume', label: 'Vol 1' },
    { cc: 71, param: 'mixer.volume', label: 'Vol 2' },
    { cc: 72, param: 'mixer.volume', label: 'Vol 3' },
    { cc: 73, param: 'mixer.volume', label: 'Vol 4' },
    { cc: 74, param: 'mixer.pan', label: 'Pan 1' },
    { cc: 75, param: 'mixer.pan', label: 'Pan 2' },
    { cc: 76, param: 'mixer.pan', label: 'Pan 3' },
    { cc: 77, param: 'mixer.pan', label: 'Pan 4' },
  ],
};

/** Joystick axis mappings per bank (X = pitch bend, Y = CC1 mod wheel) */
export const JOYSTICK_MAP: Partial<Record<KnobBankMode, JoystickMapping>> = {
  '303': {
    x: { param: 'cutoff', min: 0, max: 1, curve: 'linear' },
    y: { param: 'resonance', min: 0, max: 1, curve: 'linear' },
  },
  'Siren': {
    x: { param: 'siren.osc.frequency', min: 60, max: 1500, curve: 'linear' },
    y: { param: 'siren.lfo.rate', min: 0.1, max: 20, curve: 'linear' },
  },
  'Furnace': {
    x: { param: 'furnace.fms', min: 0, max: 7, curve: 'linear' },
    y: { param: 'furnace.op1SL', min: 0, max: 15, curve: 'linear' },
  },
  'V2': {
    x: { param: 'v2.filter1Cutoff', min: 0, max: 127, curve: 'linear' },
    y: { param: 'v2.filter1Reso', min: 0, max: 127, curve: 'linear' },
  },
  'Synare': {
    x: { param: 'synare.filterCutoff', min: 20, max: 20000, curve: 'log' },
    y: { param: 'synare.filterEnvMod', min: 0, max: 100, curve: 'linear' },
  },
  'Dexed': {
    x: { param: 'dexed.lfoPitchMod', min: 0, max: 99, curve: 'linear' },
    y: { param: 'dexed.lfoAmpMod', min: 0, max: 99, curve: 'linear' },
  },
  'OBXd': {
    x: { param: 'obxd.filterCutoff', min: 0, max: 1, curve: 'linear' },
    y: { param: 'obxd.filterReso', min: 0, max: 1, curve: 'linear' },
  },
  'SpaceLaser': {
    x: { param: 'spacelaser.fmAmount', min: 0, max: 100, curve: 'linear' },
    y: { param: 'spacelaser.filterCutoff', min: 20, max: 20000, curve: 'log' },
  },
  'SAM': {
    x: { param: 'sam.pitch', min: 0, max: 255, curve: 'linear' },
    y: { param: 'sam.speed', min: 0, max: 255, curve: 'linear' },
  },
  'Organ': {
    x: { param: 'organ.vibratoDepth', min: 0, max: 1, curve: 'linear' },
    y: { param: 'organ.overdrive', min: 0, max: 1, curve: 'linear' },
  },
  'Melodica': {
    x: { param: 'melodica.vibratoRate', min: 0, max: 10, curve: 'linear' },
    y: { param: 'melodica.brightness', min: 0, max: 1, curve: 'linear' },
  },
};

/** Map a SynthType to the appropriate knob bank for auto-switching */
export function getKnobBankForSynth(synthType: SynthType): KnobBankMode | null {
  // TB-303 variants
  if (synthType === 'TB303' || synthType === 'Buzz3o3' || synthType === 'Buzz3o3DF') return '303';

  // DubSiren
  if (synthType === 'DubSiren') return 'Siren';

  // Furnace chips (all start with "Furnace")
  if (synthType.startsWith('Furnace')) return 'Furnace';

  // V2 variants
  if (synthType === 'V2' || synthType === 'V2Speech') return 'V2';

  // Synare percussion
  if (synthType === 'Synare') return 'Synare';

  // Dexed DX7
  if (synthType === 'Dexed' || synthType === 'DexedBridge') return 'Dexed';

  // OBXd
  if (synthType === 'OBXd') return 'OBXd';

  // SpaceLaser
  if (synthType === 'SpaceLaser') return 'SpaceLaser';

  // SAM speech
  if (synthType === 'Sam') return 'SAM';

  // VSTBridge: TonewheelOrgan
  if (synthType === 'TonewheelOrgan') return 'Organ';

  // VSTBridge: Melodica
  if (synthType === 'Melodica') return 'Melodica';

  return null;
}

// ============================================================================
// NKS2-BASED KNOB BANK GENERATION
// Derives knob assignments from NKS2 performance profiles for any synth.
// Falls back to legacy KNOB_BANKS for synths with hardcoded banks.
// ============================================================================

import { getKnob8Params, getPerformanceParams } from './nks/synthParameterMaps';

/** CC numbers for the 8 knobs on Akai MPK Mini MK3 (CC 70-77) */
const KNOB_CC_START = 70;

/**
 * Generate a KnobAssignment array from NKS2 Performance mode params.
 * Returns 8 assignments mapped to CC 70-77.
 */
export function getKnobBankFromNKS2(synthType: SynthType): KnobAssignment[] {
  const nks2Params = getKnob8Params(synthType);

  return nks2Params.map((param, index) => ({
    cc: KNOB_CC_START + index,
    param: param.engineParam as MappableParameter,
    label: param.name.substring(0, 10), // Truncate for LCD display
  }));
}

/**
 * Get knob assignments for a synth, checking NKS2 first, legacy fallback second.
 * This is the unified entry point for the MIDI store.
 */
export function getKnobAssignmentsForSynth(synthType: SynthType): KnobAssignment[] {
  // 1. Check if there's a legacy knob bank for this synth
  const legacyBank = getKnobBankForSynth(synthType);
  if (legacyBank) {
    return KNOB_BANKS[legacyBank];
  }

  // 2. Fall back to NKS2-generated assignments
  const nks2Bank = getKnobBankFromNKS2(synthType);
  if (nks2Bank.length > 0) {
    return nks2Bank;
  }

  // 3. Last resort: mixer controls
  return KNOB_BANKS['Mixer'];
}

/**
 * Get the display name for a synth's current knob page.
 * Used for LCD display on hardware controllers.
 */
export function getKnobPageName(synthType: SynthType): string {
  const legacyBank = getKnobBankForSynth(synthType);
  if (legacyBank) return legacyBank;
  return synthType;
}

/**
 * Get knob assignments for a specific page of an NKS2 profile.
 * page 0 = params [0..7], page 1 = params [8..15].
 * Falls back to legacy KNOB_BANKS (1 page only) or Mixer as last resort.
 */
export function getKnobAssignmentsForPage(synthType: SynthType, page: number): KnobAssignment[] {
  // Legacy synths with hardcoded banks: always 1 page
  const legacyBank = getKnobBankForSynth(synthType);
  if (legacyBank) {
    return page === 0 ? KNOB_BANKS[legacyBank] : [];
  }

  // NKS2: get all performance params (up to 16), slice into 8-knob pages
  const allParams = getPerformanceParams(synthType);
  if (allParams.length === 0) {
    return page === 0 ? KNOB_BANKS['Mixer'] : [];
  }

  const start = page * 8;
  const pageParams = allParams.slice(start, start + 8);
  return pageParams.map((param, index) => ({
    cc: KNOB_CC_START + index,
    param: param.engineParam as MappableParameter,
    label: param.name.substring(0, 10),
  }));
}

/**
 * Get total page count for a synth's NKS2 profile.
 * Legacy synths = 1 page. NKS2 synths = ceil(performanceParams / 8).
 */
export function getKnobPageCount(synthType: SynthType): number {
  const legacyBank = getKnobBankForSynth(synthType);
  if (legacyBank) return 1;

  const allParams = getPerformanceParams(synthType);
  if (allParams.length === 0) return 1; // Mixer fallback = 1 page
  return Math.ceil(allParams.length / 8);
}
