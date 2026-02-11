/**
 * NKS Parameter Maps for ALL DEViLBOX Synths
 *
 * Each synth has its parameters mapped to NKS pages (8 params per page)
 * This enables hardware control via Komplete Kontrol, Maschine, etc.
 */

import type { NKSParameter, NKSPage, NKS2PDI, NKS2Parameter, NKS2PerformanceSection, NKS2SynthProfile, NKS2Navigation } from './types';
import { NKSParameterType, NKSSection } from './types';
import type { SynthType } from '@typedefs/instrument';

// ============================================================================
// TB-303 (Acid Bass)
// ============================================================================
export const TB303_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Filter & Synthesis
  { id: 'tb303.cutoff', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 74, isAutomatable: true },
  { id: 'tb303.resonance', name: 'Resonance', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 71, isAutomatable: true },
  { id: 'tb303.envMod', name: 'Env Mod', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 102, isAutomatable: true },
  { id: 'tb303.decay', name: 'Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 103, isAutomatable: true },
  { id: 'tb303.accent', name: 'Accent', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 4, ccNumber: 104, isAutomatable: true },
  { id: 'tb303.tuning', name: 'Tuning', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: -1, max: 1, defaultValue: 0, unit: 'semi', formatString: '%.1f', page: 0, index: 5, ccNumber: 105, isAutomatable: true },
  { id: 'tb303.waveform', name: 'Waveform', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 1, defaultValue: 0, valueStrings: ['Saw', 'Square'], page: 0, index: 6, ccNumber: 106, isAutomatable: true },
  { id: 'tb303.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: 'dB', formatString: '%.1f', page: 0, index: 7, ccNumber: 7, isAutomatable: true },
  // Page 1: Effects
  { id: 'tb303.distortion', name: 'Distortion', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 1, index: 0, ccNumber: 94, isAutomatable: true },
  { id: 'tb303.delay.time', name: 'Delay Time', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.375, unit: 'ms', formatString: '%.0f', page: 1, index: 1, ccNumber: 85, isAutomatable: true },
  { id: 'tb303.delay.feedback', name: 'Delay Fdbk', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.4, unit: '%', formatString: '%.0f%%', page: 1, index: 2, ccNumber: 86, isAutomatable: true },
  { id: 'tb303.delay.mix', name: 'Delay Mix', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 1, index: 3, ccNumber: 87, isAutomatable: true },
  { id: 'tb303.reverb.size', name: 'Reverb Size', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 4, ccNumber: 91, isAutomatable: true },
  { id: 'tb303.reverb.mix', name: 'Reverb Mix', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.2, unit: '%', formatString: '%.0f%%', page: 1, index: 5, ccNumber: 92, isAutomatable: true },
];

// ============================================================================
// DEXED (DX7 FM Synthesizer)
// ============================================================================
export const DEXED_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Algorithm & Global
  { id: 'dexed.algorithm', name: 'Algorithm', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 31, defaultValue: 0, page: 0, index: 0, isAutomatable: true },
  { id: 'dexed.feedback', name: 'Feedback', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 7, defaultValue: 0, page: 0, index: 1, isAutomatable: true },
  { id: 'dexed.lfoSpeed', name: 'LFO Speed', section: NKSSection.LFO, type: NKSParameterType.INT, min: 0, max: 99, defaultValue: 35, page: 0, index: 2, isAutomatable: true },
  { id: 'dexed.lfoPitchModDepth', name: 'LFO Pitch', section: NKSSection.LFO, type: NKSParameterType.INT, min: 0, max: 99, defaultValue: 0, page: 0, index: 3, isAutomatable: true },
  { id: 'dexed.lfoAmpModDepth', name: 'LFO Amp', section: NKSSection.LFO, type: NKSParameterType.INT, min: 0, max: 99, defaultValue: 0, page: 0, index: 4, isAutomatable: true },
  { id: 'dexed.lfoWave', name: 'LFO Wave', section: NKSSection.LFO, type: NKSParameterType.SELECTOR, min: 0, max: 5, defaultValue: 0, valueStrings: ['Triangle', 'Saw Down', 'Saw Up', 'Square', 'Sine', 'S&H'], page: 0, index: 5, isAutomatable: true },
  { id: 'dexed.transpose', name: 'Transpose', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: -24, max: 24, defaultValue: 0, unit: 'semi', page: 0, index: 6, isAutomatable: true },
  { id: 'dexed.oscSync', name: 'Osc Sync', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 1, page: 0, index: 7, isAutomatable: true },
  // Page 1-6: Operators 1-6 (each has Level, Coarse, Fine, Detune, R1, R2, R3, R4)
  ...generateDexedOperatorPages(),
];

function generateDexedOperatorPages(): NKSParameter[] {
  const params: NKSParameter[] = [];
  for (let op = 0; op < 6; op++) {
    const page = op + 1;
    params.push(
      { id: `dexed.op${op + 1}.level`, name: `OP${op + 1} Level`, section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 99, defaultValue: op === 0 ? 99 : 0, page, index: 0, isAutomatable: true },
      { id: `dexed.op${op + 1}.coarse`, name: `OP${op + 1} Coarse`, section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 31, defaultValue: 1, page, index: 1, isAutomatable: true },
      { id: `dexed.op${op + 1}.fine`, name: `OP${op + 1} Fine`, section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 99, defaultValue: 0, page, index: 2, isAutomatable: true },
      { id: `dexed.op${op + 1}.detune`, name: `OP${op + 1} Detune`, section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 14, defaultValue: 7, page, index: 3, isAutomatable: true },
      { id: `dexed.op${op + 1}.egRate1`, name: `OP${op + 1} R1`, section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 99, defaultValue: 99, page, index: 4, isAutomatable: true },
      { id: `dexed.op${op + 1}.egRate2`, name: `OP${op + 1} R2`, section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 99, defaultValue: 99, page, index: 5, isAutomatable: true },
      { id: `dexed.op${op + 1}.egRate3`, name: `OP${op + 1} R3`, section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 99, defaultValue: 99, page, index: 6, isAutomatable: true },
      { id: `dexed.op${op + 1}.egRate4`, name: `OP${op + 1} R4`, section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 99, defaultValue: 99, page, index: 7, isAutomatable: true },
    );
  }
  return params;
}

// ============================================================================
// OBXd (Oberheim OB-X)
// ============================================================================
export const OBXD_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Oscillators
  { id: 'obxd.osc1Waveform', name: 'Osc1 Wave', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 3, defaultValue: 0, valueStrings: ['Saw', 'Pulse', 'Triangle', 'Noise'], page: 0, index: 0, isAutomatable: true },
  { id: 'obxd.osc1Octave', name: 'Osc1 Oct', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: -2, max: 2, defaultValue: 0, page: 0, index: 1, isAutomatable: true },
  { id: 'obxd.osc1PulseWidth', name: 'Osc1 PW', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true },
  { id: 'obxd.osc1Level', name: 'Osc1 Level', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 1, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true },
  { id: 'obxd.osc2Waveform', name: 'Osc2 Wave', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 3, defaultValue: 0, valueStrings: ['Saw', 'Pulse', 'Triangle', 'Noise'], page: 0, index: 4, isAutomatable: true },
  { id: 'obxd.osc2Octave', name: 'Osc2 Oct', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: -2, max: 2, defaultValue: 0, page: 0, index: 5, isAutomatable: true },
  { id: 'obxd.osc2Detune', name: 'Osc2 Detune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: -1, max: 1, defaultValue: 0.1, unit: 'semi', formatString: '%.2f', page: 0, index: 6, isAutomatable: true },
  { id: 'obxd.osc2Level', name: 'Osc2 Level', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
  // Page 1: Filter
  { id: 'obxd.filterCutoff', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 1, index: 0, isAutomatable: true },
  { id: 'obxd.filterResonance', name: 'Resonance', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 1, index: 1, isAutomatable: true },
  { id: 'obxd.filterEnvAmount', name: 'Env Amount', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 2, isAutomatable: true },
  { id: 'obxd.filterKeyTrack', name: 'Key Track', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 1, index: 3, isAutomatable: true },
  { id: 'obxd.filterAttack', name: 'Flt Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.01, unit: 's', formatString: '%.2f', page: 1, index: 4, isAutomatable: true },
  { id: 'obxd.filterDecay', name: 'Flt Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 1, index: 5, isAutomatable: true },
  { id: 'obxd.filterSustain', name: 'Flt Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 1, index: 6, isAutomatable: true },
  { id: 'obxd.filterRelease', name: 'Flt Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 1, index: 7, isAutomatable: true },
  // Page 2: Amp Envelope & Global
  { id: 'obxd.ampAttack', name: 'Amp Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.01, unit: 's', formatString: '%.2f', page: 2, index: 0, isAutomatable: true },
  { id: 'obxd.ampDecay', name: 'Amp Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.2, unit: 's', formatString: '%.2f', page: 2, index: 1, isAutomatable: true },
  { id: 'obxd.ampSustain', name: 'Amp Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 2, index: 2, isAutomatable: true },
  { id: 'obxd.ampRelease', name: 'Amp Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 2, index: 3, isAutomatable: true },
  { id: 'obxd.masterVolume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 2, index: 4, isAutomatable: true },
  { id: 'obxd.portamento', name: 'Portamento', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: 's', formatString: '%.2f', page: 2, index: 5, isAutomatable: true },
  { id: 'obxd.unison', name: 'Unison', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 2, index: 6, isAutomatable: true },
  { id: 'obxd.unisonDetune', name: 'Uni Detune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.1, unit: '%', formatString: '%.0f%%', page: 2, index: 7, isAutomatable: true },
  // Page 3: LFO
  { id: 'obxd.lfoRate', name: 'LFO Rate', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.2, unit: 'Hz', formatString: '%.1f', page: 3, index: 0, isAutomatable: true },
  { id: 'obxd.lfoWaveform', name: 'LFO Wave', section: NKSSection.LFO, type: NKSParameterType.SELECTOR, min: 0, max: 4, defaultValue: 0, valueStrings: ['Sine', 'Triangle', 'Saw', 'Square', 'S&H'], page: 3, index: 1, isAutomatable: true },
  { id: 'obxd.lfoOscAmount', name: 'LFO>Pitch', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 3, index: 2, isAutomatable: true },
  { id: 'obxd.lfoFilterAmount', name: 'LFO>Filter', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 3, index: 3, isAutomatable: true },
  { id: 'obxd.lfoAmpAmount', name: 'LFO>Amp', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 3, index: 4, isAutomatable: true },
  { id: 'obxd.lfoPwAmount', name: 'LFO>PW', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 3, index: 5, isAutomatable: true },
  { id: 'obxd.oscSync', name: 'Osc Sync', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 3, index: 6, isAutomatable: true },
  { id: 'obxd.oscXor', name: 'Ring Mod', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 3, index: 7, isAutomatable: true },
];

// ============================================================================
// DUB SIREN
// ============================================================================
export const DUBSIREN_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Oscillator & LFO
  { id: 'dubsiren.oscillator.type', name: 'Osc Type', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 3, defaultValue: 0, valueStrings: ['Sine', 'Square', 'Saw', 'Triangle'], page: 0, index: 0, isAutomatable: true },
  { id: 'dubsiren.oscillator.frequency', name: 'Frequency', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 60, max: 1000, defaultValue: 440, unit: 'Hz', formatString: '%.0f', page: 0, index: 1, isAutomatable: true },
  { id: 'dubsiren.lfo.enabled', name: 'LFO On', section: NKSSection.LFO, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 1, page: 0, index: 2, isAutomatable: true },
  { id: 'dubsiren.lfo.type', name: 'LFO Type', section: NKSSection.LFO, type: NKSParameterType.SELECTOR, min: 0, max: 3, defaultValue: 1, valueStrings: ['Sine', 'Square', 'Saw', 'Triangle'], page: 0, index: 3, isAutomatable: true },
  { id: 'dubsiren.lfo.rate', name: 'LFO Rate', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 20, defaultValue: 2, unit: 'Hz', formatString: '%.1f', page: 0, index: 4, isAutomatable: true },
  { id: 'dubsiren.lfo.depth', name: 'LFO Depth', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1000, defaultValue: 100, unit: 'Hz', formatString: '%.0f', page: 0, index: 5, isAutomatable: true },
  { id: 'dubsiren.filter.enabled', name: 'Filter On', section: NKSSection.FILTER, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 1, page: 0, index: 6, isAutomatable: true },
  { id: 'dubsiren.filter.frequency', name: 'Filter Freq', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 20, max: 20000, defaultValue: 2000, unit: 'Hz', formatString: '%.0f', page: 0, index: 7, isAutomatable: true },
  // Page 1: Effects
  { id: 'dubsiren.delay.enabled', name: 'Delay On', section: NKSSection.EFFECTS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 1, page: 1, index: 0, isAutomatable: true },
  { id: 'dubsiren.delay.time', name: 'Delay Time', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 1, index: 1, isAutomatable: true },
  { id: 'dubsiren.delay.feedback', name: 'Delay Fdbk', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.4, unit: '%', formatString: '%.0f%%', page: 1, index: 2, isAutomatable: true },
  { id: 'dubsiren.delay.wet', name: 'Delay Mix', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 1, index: 3, isAutomatable: true },
  { id: 'dubsiren.reverb.enabled', name: 'Reverb On', section: NKSSection.EFFECTS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 1, page: 1, index: 4, isAutomatable: true },
  { id: 'dubsiren.reverb.decay', name: 'Reverb Dec', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0.1, max: 10, defaultValue: 1.5, unit: 's', formatString: '%.1f', page: 1, index: 5, isAutomatable: true },
  { id: 'dubsiren.reverb.wet', name: 'Reverb Mix', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.1, unit: '%', formatString: '%.0f%%', page: 1, index: 6, isAutomatable: true },
];

// ============================================================================
// SPACE LASER
// ============================================================================
export const SPACELASER_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Laser & FM
  { id: 'spacelaser.laser.startFreq', name: 'Start Freq', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 100, max: 10000, defaultValue: 5000, unit: 'Hz', formatString: '%.0f', page: 0, index: 0, isAutomatable: true },
  { id: 'spacelaser.laser.endFreq', name: 'End Freq', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 20, max: 2000, defaultValue: 100, unit: 'Hz', formatString: '%.0f', page: 0, index: 1, isAutomatable: true },
  { id: 'spacelaser.laser.sweepTime', name: 'Sweep Time', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 10, max: 2000, defaultValue: 200, unit: 'ms', formatString: '%.0f', page: 0, index: 2, isAutomatable: true },
  { id: 'spacelaser.laser.sweepCurve', name: 'Curve', section: NKSSection.ENVELOPE, type: NKSParameterType.SELECTOR, min: 0, max: 1, defaultValue: 0, valueStrings: ['Exp', 'Linear'], page: 0, index: 3, isAutomatable: true },
  { id: 'spacelaser.fm.amount', name: 'FM Amount', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 100, defaultValue: 0, unit: '%', formatString: '%.0f', page: 0, index: 4, isAutomatable: true },
  { id: 'spacelaser.fm.ratio', name: 'FM Ratio', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0.5, max: 16, defaultValue: 1, formatString: '%.2f', page: 0, index: 5, isAutomatable: true },
  { id: 'spacelaser.noise.amount', name: 'Noise', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 100, defaultValue: 0, unit: '%', formatString: '%.0f', page: 0, index: 6, isAutomatable: true },
  { id: 'spacelaser.filter.cutoff', name: 'Filter', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 20, max: 20000, defaultValue: 20000, unit: 'Hz', formatString: '%.0f', page: 0, index: 7, isAutomatable: true },
  // Page 1: Effects
  { id: 'spacelaser.delay.enabled', name: 'Delay On', section: NKSSection.EFFECTS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 1, index: 0, isAutomatable: true },
  { id: 'spacelaser.delay.time', name: 'Delay Time', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.25, unit: 's', formatString: '%.2f', page: 1, index: 1, isAutomatable: true },
  { id: 'spacelaser.delay.feedback', name: 'Delay Fdbk', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 1, index: 2, isAutomatable: true },
  { id: 'spacelaser.delay.wet', name: 'Delay Mix', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 1, index: 3, isAutomatable: true },
  { id: 'spacelaser.reverb.enabled', name: 'Reverb On', section: NKSSection.EFFECTS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 1, index: 4, isAutomatable: true },
  { id: 'spacelaser.reverb.decay', name: 'Reverb Dec', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0.1, max: 10, defaultValue: 1.5, unit: 's', formatString: '%.1f', page: 1, index: 5, isAutomatable: true },
  { id: 'spacelaser.reverb.wet', name: 'Reverb Mix', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.2, unit: '%', formatString: '%.0f%%', page: 1, index: 6, isAutomatable: true },
];

// ============================================================================
// SYNARE 3 (Electronic Percussion)
// ============================================================================
export const SYNARE_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Oscillator & Filter
  { id: 'synare.oscillator.tune', name: 'Tune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 20, max: 1000, defaultValue: 200, unit: 'Hz', formatString: '%.0f', page: 0, index: 0, isAutomatable: true },
  { id: 'synare.oscillator.fine', name: 'Fine Tune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: -100, max: 100, defaultValue: 0, unit: 'ct', formatString: '%.0f', page: 0, index: 1, isAutomatable: true },
  { id: 'synare.oscillator2.enabled', name: 'Osc2 On', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 0, index: 2, isAutomatable: true },
  { id: 'synare.oscillator2.detune', name: 'Osc2 Detune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: -24, max: 24, defaultValue: 7, unit: 'semi', formatString: '%.0f', page: 0, index: 3, isAutomatable: true },
  { id: 'synare.filter.cutoff', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 20, max: 20000, defaultValue: 2000, unit: 'Hz', formatString: '%.0f', page: 0, index: 4, isAutomatable: true },
  { id: 'synare.filter.resonance', name: 'Resonance', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 100, defaultValue: 20, unit: '%', formatString: '%.0f', page: 0, index: 5, isAutomatable: true },
  { id: 'synare.filter.envMod', name: 'Flt Env', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 100, defaultValue: 50, unit: '%', formatString: '%.0f', page: 0, index: 6, isAutomatable: true },
  { id: 'synare.filter.decay', name: 'Flt Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 10, max: 2000, defaultValue: 200, unit: 'ms', formatString: '%.0f', page: 0, index: 7, isAutomatable: true },
  // Page 1: Envelope & Sweep
  { id: 'synare.envelope.decay', name: 'Amp Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 10, max: 2000, defaultValue: 300, unit: 'ms', formatString: '%.0f', page: 1, index: 0, isAutomatable: true },
  { id: 'synare.envelope.sustain', name: 'Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 1, index: 1, isAutomatable: true },
  { id: 'synare.sweep.enabled', name: 'Sweep On', section: NKSSection.MODULATION, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 1, page: 1, index: 2, isAutomatable: true },
  { id: 'synare.sweep.amount', name: 'Sweep Amt', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 48, defaultValue: 12, unit: 'semi', formatString: '%.0f', page: 1, index: 3, isAutomatable: true },
  { id: 'synare.sweep.time', name: 'Sweep Time', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 1, max: 500, defaultValue: 50, unit: 'ms', formatString: '%.0f', page: 1, index: 4, isAutomatable: true },
  { id: 'synare.noise.enabled', name: 'Noise On', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 1, index: 5, isAutomatable: true },
  { id: 'synare.noise.mix', name: 'Noise Mix', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 1, index: 6, isAutomatable: true },
  { id: 'synare.noise.color', name: 'Noise Color', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 100, defaultValue: 50, unit: '%', formatString: '%.0f', page: 1, index: 7, isAutomatable: true },
];

// ============================================================================
// V2 SYNTH (Farbrausch)
// ============================================================================
export const V2_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Oscillators
  { id: 'v2.osc1.mode', name: 'Osc1 Mode', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 7, defaultValue: 1, valueStrings: ['Off', 'Saw/Tri', 'Pulse', 'Sin', 'Noise', 'XX', 'AuxA', 'AuxB'], page: 0, index: 0, isAutomatable: true },
  { id: 'v2.osc1.transpose', name: 'Osc1 Trans', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: -64, max: 63, defaultValue: 0, unit: 'semi', page: 0, index: 1, isAutomatable: true },
  { id: 'v2.osc1.color', name: 'Osc1 Color', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 64, page: 0, index: 2, isAutomatable: true },
  { id: 'v2.osc1.level', name: 'Osc1 Level', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 127, page: 0, index: 3, isAutomatable: true },
  { id: 'v2.osc2.mode', name: 'Osc2 Mode', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 7, defaultValue: 0, valueStrings: ['!Off', 'Tri', 'Pulse', 'Sin', 'Noise', 'FM', 'AuxA', 'AuxB'], page: 0, index: 4, isAutomatable: true },
  { id: 'v2.osc2.transpose', name: 'Osc2 Trans', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: -64, max: 63, defaultValue: 0, unit: 'semi', page: 0, index: 5, isAutomatable: true },
  { id: 'v2.osc2.detune', name: 'Osc2 Detune', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: -64, max: 63, defaultValue: 10, page: 0, index: 6, isAutomatable: true },
  { id: 'v2.osc2.level', name: 'Osc2 Level', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 0, page: 0, index: 7, isAutomatable: true },
  // Page 1: Filter
  { id: 'v2.filter1.mode', name: 'Flt1 Mode', section: NKSSection.FILTER, type: NKSParameterType.SELECTOR, min: 0, max: 7, defaultValue: 1, valueStrings: ['Off', 'Low', 'Band', 'High', 'Notch', 'All', 'MoogL', 'MoogH'], page: 1, index: 0, isAutomatable: true },
  { id: 'v2.filter1.cutoff', name: 'Flt1 Cutoff', section: NKSSection.FILTER, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 127, page: 1, index: 1, isAutomatable: true },
  { id: 'v2.filter1.resonance', name: 'Flt1 Reso', section: NKSSection.FILTER, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 0, page: 1, index: 2, isAutomatable: true },
  { id: 'v2.filter2.mode', name: 'Flt2 Mode', section: NKSSection.FILTER, type: NKSParameterType.SELECTOR, min: 0, max: 7, defaultValue: 0, valueStrings: ['Off', 'Low', 'Band', 'High', 'Notch', 'All', 'MoogL', 'MoogH'], page: 1, index: 3, isAutomatable: true },
  { id: 'v2.filter2.cutoff', name: 'Flt2 Cutoff', section: NKSSection.FILTER, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 127, page: 1, index: 4, isAutomatable: true },
  { id: 'v2.filter2.resonance', name: 'Flt2 Reso', section: NKSSection.FILTER, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 0, page: 1, index: 5, isAutomatable: true },
  { id: 'v2.routing.mode', name: 'Routing', section: NKSSection.FILTER, type: NKSParameterType.SELECTOR, min: 0, max: 2, defaultValue: 0, valueStrings: ['Single', 'Serial', 'Parallel'], page: 1, index: 6, isAutomatable: true },
  { id: 'v2.routing.balance', name: 'Balance', section: NKSSection.FILTER, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 64, page: 1, index: 7, isAutomatable: true },
  // Page 2: Envelope
  { id: 'v2.envelope.attack', name: 'Amp Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 0, page: 2, index: 0, isAutomatable: true },
  { id: 'v2.envelope.decay', name: 'Amp Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 64, page: 2, index: 1, isAutomatable: true },
  { id: 'v2.envelope.sustain', name: 'Amp Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 127, page: 2, index: 2, isAutomatable: true },
  { id: 'v2.envelope.release', name: 'Amp Release', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 32, page: 2, index: 3, isAutomatable: true },
  { id: 'v2.envelope2.attack', name: 'Env2 Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 0, page: 2, index: 4, isAutomatable: true },
  { id: 'v2.envelope2.decay', name: 'Env2 Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 64, page: 2, index: 5, isAutomatable: true },
  { id: 'v2.lfo1.rate', name: 'LFO Rate', section: NKSSection.LFO, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 64, page: 2, index: 6, isAutomatable: true },
  { id: 'v2.lfo1.depth', name: 'LFO Depth', section: NKSSection.LFO, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 0, page: 2, index: 7, isAutomatable: true },
];

// ============================================================================
// MONO SYNTH
// ============================================================================
export const MONOSYNTH_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Oscillator & Filter
  { id: 'monosynth.oscillator.type', name: 'Waveform', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 4, defaultValue: 1, valueStrings: ['Sine', 'Square', 'Saw', 'Triangle', 'Pulse'], page: 0, index: 0, isAutomatable: true },
  { id: 'monosynth.oscillator.detune', name: 'Detune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: -100, max: 100, defaultValue: 0, unit: 'ct', formatString: '%.0f', page: 0, index: 1, isAutomatable: true },
  { id: 'monosynth.filter.frequency', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 20, max: 20000, defaultValue: 2000, unit: 'Hz', formatString: '%.0f', page: 0, index: 2, isAutomatable: true },
  { id: 'monosynth.filter.Q', name: 'Resonance', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 20, defaultValue: 1, formatString: '%.1f', page: 0, index: 3, isAutomatable: true },
  { id: 'monosynth.filterEnvelope.amount', name: 'Flt Env', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true },
  { id: 'monosynth.envelope.attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 2, defaultValue: 0.01, unit: 's', formatString: '%.2f', page: 0, index: 5, isAutomatable: true },
  { id: 'monosynth.envelope.decay', name: 'Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 2, defaultValue: 0.2, unit: 's', formatString: '%.2f', page: 0, index: 6, isAutomatable: true },
  { id: 'monosynth.envelope.sustain', name: 'Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
  // Page 1: More Envelope & Volume
  { id: 'monosynth.envelope.release', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 5, defaultValue: 0.5, unit: 's', formatString: '%.2f', page: 1, index: 0, isAutomatable: true },
  { id: 'monosynth.portamento', name: 'Portamento', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: 's', formatString: '%.2f', page: 1, index: 1, isAutomatable: true },
  { id: 'monosynth.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 1, index: 2, isAutomatable: true },
];

// ============================================================================
// DUO SYNTH
// ============================================================================
export const DUOSYNTH_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Voice 0
  { id: 'duosynth.voice0.oscillator.type', name: 'V0 Wave', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 4, defaultValue: 1, valueStrings: ['Sine', 'Square', 'Saw', 'Triangle', 'Pulse'], page: 0, index: 0, isAutomatable: true },
  { id: 'duosynth.voice0.filter.frequency', name: 'V0 Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 20, max: 20000, defaultValue: 2000, unit: 'Hz', formatString: '%.0f', page: 0, index: 1, isAutomatable: true },
  { id: 'duosynth.voice0.filter.Q', name: 'V0 Reso', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 20, defaultValue: 2, formatString: '%.1f', page: 0, index: 2, isAutomatable: true },
  { id: 'duosynth.voice0.envelope.attack', name: 'V0 Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 2, defaultValue: 0.01, unit: 's', formatString: '%.2f', page: 0, index: 3, isAutomatable: true },
  { id: 'duosynth.voice1.oscillator.type', name: 'V1 Wave', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 4, defaultValue: 2, valueStrings: ['Sine', 'Square', 'Saw', 'Triangle', 'Pulse'], page: 0, index: 4, isAutomatable: true },
  { id: 'duosynth.voice1.filter.frequency', name: 'V1 Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 20, max: 20000, defaultValue: 3000, unit: 'Hz', formatString: '%.0f', page: 0, index: 5, isAutomatable: true },
  { id: 'duosynth.voice1.filter.Q', name: 'V1 Reso', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 20, defaultValue: 2, formatString: '%.1f', page: 0, index: 6, isAutomatable: true },
  { id: 'duosynth.harmonicity', name: 'Harmonicity', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0.5, max: 4, defaultValue: 1, formatString: '%.2f', page: 0, index: 7, isAutomatable: true },
  // Page 1: Vibrato & Volume
  { id: 'duosynth.vibratoRate', name: 'Vib Rate', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 20, defaultValue: 5, unit: 'Hz', formatString: '%.1f', page: 1, index: 0, isAutomatable: true },
  { id: 'duosynth.vibratoAmount', name: 'Vib Amount', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 1, isAutomatable: true },
  { id: 'duosynth.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 1, index: 2, isAutomatable: true },
];

// ============================================================================
// POLY SYNTH
// ============================================================================
export const POLYSYNTH_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Oscillator & Filter
  { id: 'polysynth.oscillator.type', name: 'Waveform', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 4, defaultValue: 1, valueStrings: ['Sine', 'Square', 'Saw', 'Triangle', 'Pulse'], page: 0, index: 0, isAutomatable: true },
  { id: 'polysynth.oscillator.detune', name: 'Detune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: -100, max: 100, defaultValue: 0, unit: 'ct', formatString: '%.0f', page: 0, index: 1, isAutomatable: true },
  { id: 'polysynth.filter.frequency', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 20, max: 20000, defaultValue: 5000, unit: 'Hz', formatString: '%.0f', page: 0, index: 2, isAutomatable: true },
  { id: 'polysynth.filter.Q', name: 'Resonance', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 20, defaultValue: 1, formatString: '%.1f', page: 0, index: 3, isAutomatable: true },
  { id: 'polysynth.envelope.attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 2, defaultValue: 0.01, unit: 's', formatString: '%.2f', page: 0, index: 4, isAutomatable: true },
  { id: 'polysynth.envelope.decay', name: 'Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 2, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 0, index: 5, isAutomatable: true },
  { id: 'polysynth.envelope.sustain', name: 'Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true },
  { id: 'polysynth.envelope.release', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 5, defaultValue: 0.5, unit: 's', formatString: '%.2f', page: 0, index: 7, isAutomatable: true },
  // Page 1: Voices & Volume
  { id: 'polysynth.maxPolyphony', name: 'Voices', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 1, max: 32, defaultValue: 8, page: 1, index: 0, isAutomatable: true },
  { id: 'polysynth.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 1, index: 1, isAutomatable: true },
];

// ============================================================================
// FM SYNTH
// ============================================================================
export const FMSYNTH_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Modulators
  { id: 'fmsynth.modulationIndex', name: 'Mod Index', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 100, defaultValue: 10, formatString: '%.1f', page: 0, index: 0, isAutomatable: true },
  { id: 'fmsynth.harmonicity', name: 'Harmonicity', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0.5, max: 8, defaultValue: 1, formatString: '%.2f', page: 0, index: 1, isAutomatable: true },
  { id: 'fmsynth.modulationEnvelope.attack', name: 'Mod Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 2, defaultValue: 0.01, unit: 's', formatString: '%.2f', page: 0, index: 2, isAutomatable: true },
  { id: 'fmsynth.modulationEnvelope.decay', name: 'Mod Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 2, defaultValue: 0.5, unit: 's', formatString: '%.2f', page: 0, index: 3, isAutomatable: true },
  { id: 'fmsynth.modulationEnvelope.sustain', name: 'Mod Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true },
  { id: 'fmsynth.envelope.attack', name: 'Amp Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 2, defaultValue: 0.01, unit: 's', formatString: '%.2f', page: 0, index: 5, isAutomatable: true },
  { id: 'fmsynth.envelope.decay', name: 'Amp Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 2, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 0, index: 6, isAutomatable: true },
  { id: 'fmsynth.envelope.sustain', name: 'Amp Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// AM SYNTH
// ============================================================================
export const AMSYNTH_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'amsynth.harmonicity', name: 'Harmonicity', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0.5, max: 4, defaultValue: 1, formatString: '%.2f', page: 0, index: 0, isAutomatable: true },
  { id: 'amsynth.modulationEnvelope.attack', name: 'Mod Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 2, defaultValue: 0.01, unit: 's', formatString: '%.2f', page: 0, index: 1, isAutomatable: true },
  { id: 'amsynth.modulationEnvelope.decay', name: 'Mod Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 2, defaultValue: 0.5, unit: 's', formatString: '%.2f', page: 0, index: 2, isAutomatable: true },
  { id: 'amsynth.envelope.attack', name: 'Amp Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 2, defaultValue: 0.01, unit: 's', formatString: '%.2f', page: 0, index: 3, isAutomatable: true },
  { id: 'amsynth.envelope.decay', name: 'Amp Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 2, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 0, index: 4, isAutomatable: true },
  { id: 'amsynth.envelope.sustain', name: 'Amp Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true },
  { id: 'amsynth.envelope.release', name: 'Amp Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 5, defaultValue: 0.5, unit: 's', formatString: '%.2f', page: 0, index: 6, isAutomatable: true },
  { id: 'amsynth.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// MEMBRANE SYNTH (Drums)
// ============================================================================
export const MEMBRANESYNTH_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'membranesynth.pitchDecay', name: 'Pitch Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 0.5, defaultValue: 0.05, unit: 's', formatString: '%.3f', page: 0, index: 0, isAutomatable: true },
  { id: 'membranesynth.octaves', name: 'Octaves', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0.5, max: 8, defaultValue: 4, formatString: '%.1f', page: 0, index: 1, isAutomatable: true },
  { id: 'membranesynth.envelope.attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 0.1, defaultValue: 0.001, unit: 's', formatString: '%.3f', page: 0, index: 2, isAutomatable: true },
  { id: 'membranesynth.envelope.decay', name: 'Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0.01, max: 2, defaultValue: 0.4, unit: 's', formatString: '%.2f', page: 0, index: 3, isAutomatable: true },
  { id: 'membranesynth.envelope.sustain', name: 'Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.01, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true },
  { id: 'membranesynth.envelope.release', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0.01, max: 2, defaultValue: 1, unit: 's', formatString: '%.2f', page: 0, index: 5, isAutomatable: true },
  { id: 'membranesynth.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.8, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true },
];

// ============================================================================
// METAL SYNTH (Cymbals/Bells)
// ============================================================================
export const METALSYNTH_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'metalsynth.frequency', name: 'Frequency', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 20, max: 8000, defaultValue: 200, unit: 'Hz', formatString: '%.0f', page: 0, index: 0, isAutomatable: true },
  { id: 'metalsynth.harmonicity', name: 'Harmonicity', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 1, max: 10, defaultValue: 5.1, formatString: '%.1f', page: 0, index: 1, isAutomatable: true },
  { id: 'metalsynth.modulationIndex', name: 'Mod Index', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 100, defaultValue: 32, formatString: '%.0f', page: 0, index: 2, isAutomatable: true },
  { id: 'metalsynth.resonance', name: 'Resonance', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 7000, defaultValue: 4000, unit: 'Hz', formatString: '%.0f', page: 0, index: 3, isAutomatable: true },
  { id: 'metalsynth.octaves', name: 'Octaves', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0.5, max: 4, defaultValue: 1.5, formatString: '%.1f', page: 0, index: 4, isAutomatable: true },
  { id: 'metalsynth.envelope.attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 0.1, defaultValue: 0.001, unit: 's', formatString: '%.3f', page: 0, index: 5, isAutomatable: true },
  { id: 'metalsynth.envelope.decay', name: 'Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0.01, max: 4, defaultValue: 1.4, unit: 's', formatString: '%.2f', page: 0, index: 6, isAutomatable: true },
  { id: 'metalsynth.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// NOISE SYNTH
// ============================================================================
export const NOISESYNTH_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'noisesynth.noise.type', name: 'Noise Type', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 2, defaultValue: 0, valueStrings: ['White', 'Pink', 'Brown'], page: 0, index: 0, isAutomatable: true },
  { id: 'noisesynth.envelope.attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 2, defaultValue: 0.005, unit: 's', formatString: '%.3f', page: 0, index: 1, isAutomatable: true },
  { id: 'noisesynth.envelope.decay', name: 'Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0.01, max: 2, defaultValue: 0.1, unit: 's', formatString: '%.2f', page: 0, index: 2, isAutomatable: true },
  { id: 'noisesynth.envelope.sustain', name: 'Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true },
  { id: 'noisesynth.envelope.release', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0.01, max: 2, defaultValue: 0.1, unit: 's', formatString: '%.2f', page: 0, index: 4, isAutomatable: true },
  { id: 'noisesynth.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true },
];

// ============================================================================
// PLUCK SYNTH
// ============================================================================
export const PLUCKSYNTH_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'plucksynth.attackNoise', name: 'Attack Noise', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 1, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true },
  { id: 'plucksynth.resonance', name: 'Resonance', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.9, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true },
  { id: 'plucksynth.dampening', name: 'Dampening', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 1000, max: 10000, defaultValue: 4000, unit: 'Hz', formatString: '%.0f', page: 0, index: 2, isAutomatable: true },
  { id: 'plucksynth.release', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0.1, max: 5, defaultValue: 1, unit: 's', formatString: '%.2f', page: 0, index: 3, isAutomatable: true },
  { id: 'plucksynth.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true },
];

// ============================================================================
// SAMPLER
// ============================================================================
export const SAMPLER_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'sampler.attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 2, defaultValue: 0, unit: 's', formatString: '%.3f', page: 0, index: 0, isAutomatable: true },
  { id: 'sampler.release', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 5, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 0, index: 1, isAutomatable: true },
  { id: 'sampler.baseUrl', name: 'Sample', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 0, defaultValue: 0, page: 0, index: 2, isAutomatable: false },
  { id: 'sampler.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true },
];

// ============================================================================
// SAM SPEECH SYNTH
// ============================================================================
export const SAM_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'sam.speed', name: 'Speed', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 20, max: 200, defaultValue: 72, page: 0, index: 0, isAutomatable: true },
  { id: 'sam.pitch', name: 'Pitch', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 20, max: 200, defaultValue: 64, page: 0, index: 1, isAutomatable: true },
  { id: 'sam.mouth', name: 'Mouth', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 255, defaultValue: 128, page: 0, index: 2, isAutomatable: true },
  { id: 'sam.throat', name: 'Throat', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 255, defaultValue: 128, page: 0, index: 3, isAutomatable: true },
  { id: 'sam.singMode', name: 'Sing Mode', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 0, index: 4, isAutomatable: true },
  { id: 'sam.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true },
];

// ============================================================================
// SUPERSAW
// ============================================================================
export const SUPERSAW_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'supersaw.detune', name: 'Detune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 100, defaultValue: 30, unit: 'ct', formatString: '%.0f', page: 0, index: 0, isAutomatable: true },
  { id: 'supersaw.mix', name: 'Mix', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true },
  { id: 'supersaw.voices', name: 'Voices', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 1, max: 7, defaultValue: 7, page: 0, index: 2, isAutomatable: true },
  { id: 'supersaw.filter.cutoff', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 20, max: 20000, defaultValue: 8000, unit: 'Hz', formatString: '%.0f', page: 0, index: 3, isAutomatable: true },
  { id: 'supersaw.filter.resonance', name: 'Resonance', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true },
  { id: 'supersaw.envelope.attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 2, defaultValue: 0.01, unit: 's', formatString: '%.2f', page: 0, index: 5, isAutomatable: true },
  { id: 'supersaw.envelope.release', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 5, defaultValue: 0.5, unit: 's', formatString: '%.2f', page: 0, index: 6, isAutomatable: true },
  { id: 'supersaw.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// ORGAN (Drawbar)
// ============================================================================
export const ORGAN_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'organ.drawbar1', name: '16\'', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.8, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true },
  { id: 'organ.drawbar2', name: '5 1/3\'', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.8, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true },
  { id: 'organ.drawbar3', name: '8\'', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.8, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true },
  { id: 'organ.drawbar4', name: '4\'', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true },
  { id: 'organ.drawbar5', name: '2 2/3\'', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true },
  { id: 'organ.drawbar6', name: '2\'', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true },
  { id: 'organ.percussion', name: 'Percussion', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 0, index: 6, isAutomatable: true },
  { id: 'organ.vibrato', name: 'Vibrato', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// DRUM MACHINE (808/909 style)
// ============================================================================
export const DRUMMACHINE_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'drummachine.kick.tune', name: 'Kick Tune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 20, max: 200, defaultValue: 60, unit: 'Hz', formatString: '%.0f', page: 0, index: 0, isAutomatable: true },
  { id: 'drummachine.kick.decay', name: 'Kick Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0.05, max: 2, defaultValue: 0.5, unit: 's', formatString: '%.2f', page: 0, index: 1, isAutomatable: true },
  { id: 'drummachine.snare.tune', name: 'Snare Tune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 100, max: 400, defaultValue: 200, unit: 'Hz', formatString: '%.0f', page: 0, index: 2, isAutomatable: true },
  { id: 'drummachine.snare.snappy', name: 'Snare Snap', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true },
  { id: 'drummachine.hihat.decay', name: 'HiHat Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0.01, max: 1, defaultValue: 0.1, unit: 's', formatString: '%.2f', page: 0, index: 4, isAutomatable: true },
  { id: 'drummachine.tone', name: 'Tone', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true },
  { id: 'drummachine.accent', name: 'Accent', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true },
  { id: 'drummachine.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.8, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// CHIP SYNTH (8-bit style)
// ============================================================================
export const CHIPSYNTH_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'chipsynth.waveform', name: 'Waveform', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 4, defaultValue: 1, valueStrings: ['Square', 'Pulse25', 'Pulse12', 'Triangle', 'Noise'], page: 0, index: 0, isAutomatable: true },
  { id: 'chipsynth.duty', name: 'Duty', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true },
  { id: 'chipsynth.pitchBend', name: 'Pitch Bend', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: -24, max: 24, defaultValue: 0, unit: 'semi', page: 0, index: 2, isAutomatable: true },
  { id: 'chipsynth.vibrato', name: 'Vibrato', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true },
  { id: 'chipsynth.arpSpeed', name: 'Arp Speed', section: NKSSection.ARP, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true },
  { id: 'chipsynth.envelope.attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: 's', formatString: '%.2f', page: 0, index: 5, isAutomatable: true },
  { id: 'chipsynth.envelope.decay', name: 'Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 0, index: 6, isAutomatable: true },
  { id: 'chipsynth.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// PWM SYNTH
// ============================================================================
export const PWMSYNTH_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'pwmsynth.pulseWidth', name: 'Pulse Width', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0.01, max: 0.99, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true },
  { id: 'pwmsynth.lfo.rate', name: 'LFO Rate', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0.1, max: 20, defaultValue: 2, unit: 'Hz', formatString: '%.1f', page: 0, index: 1, isAutomatable: true },
  { id: 'pwmsynth.lfo.depth', name: 'LFO Depth', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 0.49, defaultValue: 0.2, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true },
  { id: 'pwmsynth.filter.cutoff', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 20, max: 20000, defaultValue: 5000, unit: 'Hz', formatString: '%.0f', page: 0, index: 3, isAutomatable: true },
  { id: 'pwmsynth.filter.resonance', name: 'Resonance', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true },
  { id: 'pwmsynth.envelope.attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 2, defaultValue: 0.01, unit: 's', formatString: '%.2f', page: 0, index: 5, isAutomatable: true },
  { id: 'pwmsynth.envelope.release', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 5, defaultValue: 0.5, unit: 's', formatString: '%.2f', page: 0, index: 6, isAutomatable: true },
  { id: 'pwmsynth.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// WOBBLE BASS
// ============================================================================
export const WOBBLEBASS_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'wobblebass.lfo.rate', name: 'Wobble Rate', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0.1, max: 20, defaultValue: 4, unit: 'Hz', formatString: '%.1f', page: 0, index: 0, isAutomatable: true },
  { id: 'wobblebass.lfo.depth', name: 'Wobble Depth', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.8, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true },
  { id: 'wobblebass.filter.cutoff', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 20, max: 5000, defaultValue: 800, unit: 'Hz', formatString: '%.0f', page: 0, index: 2, isAutomatable: true },
  { id: 'wobblebass.filter.resonance', name: 'Resonance', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.6, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true },
  { id: 'wobblebass.distortion', name: 'Distortion', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true },
  { id: 'wobblebass.envelope.attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.01, unit: 's', formatString: '%.2f', page: 0, index: 5, isAutomatable: true },
  { id: 'wobblebass.envelope.release', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 2, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 0, index: 6, isAutomatable: true },
  { id: 'wobblebass.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.8, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// STRING MACHINE
// ============================================================================
export const STRINGMACHINE_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'stringmachine.ensemble', name: 'Ensemble', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true },
  { id: 'stringmachine.detune', name: 'Detune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 50, defaultValue: 15, unit: 'ct', formatString: '%.0f', page: 0, index: 1, isAutomatable: true },
  { id: 'stringmachine.voices', name: 'Voices', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 2, max: 8, defaultValue: 4, page: 0, index: 2, isAutomatable: true },
  { id: 'stringmachine.filter.cutoff', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 20, max: 10000, defaultValue: 3000, unit: 'Hz', formatString: '%.0f', page: 0, index: 3, isAutomatable: true },
  { id: 'stringmachine.envelope.attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 3, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 0, index: 4, isAutomatable: true },
  { id: 'stringmachine.envelope.release', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 5, defaultValue: 1, unit: 's', formatString: '%.2f', page: 0, index: 5, isAutomatable: true },
  { id: 'stringmachine.chorus', name: 'Chorus', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true },
  { id: 'stringmachine.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// FORMANT SYNTH (Vowel)
// ============================================================================
export const FORMANTSYNTH_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'formantsynth.vowel', name: 'Vowel', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 4, defaultValue: 0, valueStrings: ['A', 'E', 'I', 'O', 'U'], page: 0, index: 0, isAutomatable: true },
  { id: 'formantsynth.formant1', name: 'Formant 1', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 200, max: 2000, defaultValue: 800, unit: 'Hz', formatString: '%.0f', page: 0, index: 1, isAutomatable: true },
  { id: 'formantsynth.formant2', name: 'Formant 2', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 500, max: 4000, defaultValue: 1200, unit: 'Hz', formatString: '%.0f', page: 0, index: 2, isAutomatable: true },
  { id: 'formantsynth.nasality', name: 'Nasality', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true },
  { id: 'formantsynth.vibrato', name: 'Vibrato', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.2, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true },
  { id: 'formantsynth.envelope.attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 2, defaultValue: 0.1, unit: 's', formatString: '%.2f', page: 0, index: 5, isAutomatable: true },
  { id: 'formantsynth.envelope.release', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 3, defaultValue: 0.5, unit: 's', formatString: '%.2f', page: 0, index: 6, isAutomatable: true },
  { id: 'formantsynth.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// GRANULAR SYNTH
// ============================================================================
export const GRANULAR_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'granular.grainSize', name: 'Grain Size', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0.01, max: 0.5, defaultValue: 0.1, unit: 's', formatString: '%.2f', page: 0, index: 0, isAutomatable: true },
  { id: 'granular.overlap', name: 'Overlap', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0.1, max: 2, defaultValue: 0.5, formatString: '%.2f', page: 0, index: 1, isAutomatable: true },
  { id: 'granular.playbackRate', name: 'Speed', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0.25, max: 4, defaultValue: 1, formatString: '%.2f', page: 0, index: 2, isAutomatable: true },
  { id: 'granular.detune', name: 'Detune', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: -1200, max: 1200, defaultValue: 0, unit: 'ct', page: 0, index: 3, isAutomatable: true },
  { id: 'granular.drift', name: 'Drift', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true },
  { id: 'granular.reverse', name: 'Reverse', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 0, index: 5, isAutomatable: true },
  { id: 'granular.loop', name: 'Loop', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 1, page: 0, index: 6, isAutomatable: true },
  { id: 'granular.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// WAVETABLE SYNTH
// ============================================================================
export const WAVETABLE_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'wavetable.tablePosition', name: 'Position', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true },
  { id: 'wavetable.morphSpeed', name: 'Morph Speed', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 10, defaultValue: 0, unit: 'Hz', formatString: '%.1f', page: 0, index: 1, isAutomatable: true },
  { id: 'wavetable.filter.cutoff', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 20, max: 20000, defaultValue: 10000, unit: 'Hz', formatString: '%.0f', page: 0, index: 2, isAutomatable: true },
  { id: 'wavetable.filter.resonance', name: 'Resonance', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true },
  { id: 'wavetable.envelope.attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 2, defaultValue: 0.01, unit: 's', formatString: '%.2f', page: 0, index: 4, isAutomatable: true },
  { id: 'wavetable.envelope.decay', name: 'Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 2, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 0, index: 5, isAutomatable: true },
  { id: 'wavetable.envelope.sustain', name: 'Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true },
  { id: 'wavetable.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// GENERIC FM CHIP PARAMETERS (Furnace OPN/OPL/OPM style)
// ============================================================================
export const FURNACE_FM_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'furnace.algorithm', name: 'Algorithm', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 7, defaultValue: 0, page: 0, index: 0, isAutomatable: true },
  { id: 'furnace.feedback', name: 'Feedback', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 7, defaultValue: 0, page: 0, index: 1, isAutomatable: true },
  { id: 'furnace.op1.level', name: 'OP1 Level', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 99, page: 0, index: 2, isAutomatable: true },
  { id: 'furnace.op1.mult', name: 'OP1 Mult', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 15, defaultValue: 1, page: 0, index: 3, isAutomatable: true },
  { id: 'furnace.op2.level', name: 'OP2 Level', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 0, page: 0, index: 4, isAutomatable: true },
  { id: 'furnace.op2.mult', name: 'OP2 Mult', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 15, defaultValue: 1, page: 0, index: 5, isAutomatable: true },
  { id: 'furnace.lfoRate', name: 'LFO Rate', section: NKSSection.LFO, type: NKSParameterType.INT, min: 0, max: 7, defaultValue: 0, page: 0, index: 6, isAutomatable: true },
  { id: 'furnace.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// GENERIC PSG CHIP PARAMETERS (Furnace NES/GB/PSG style)
// ============================================================================
export const FURNACE_PSG_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'furnace.duty', name: 'Duty Cycle', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 3, defaultValue: 2, valueStrings: ['12.5%', '25%', '50%', '75%'], page: 0, index: 0, isAutomatable: true },
  { id: 'furnace.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.INT, min: 0, max: 15, defaultValue: 15, page: 0, index: 1, isAutomatable: true },
  { id: 'furnace.arpSpeed', name: 'Arp Speed', section: NKSSection.ARP, type: NKSParameterType.INT, min: 0, max: 15, defaultValue: 0, page: 0, index: 2, isAutomatable: true },
  { id: 'furnace.pitchSlide', name: 'Pitch Slide', section: NKSSection.MODULATION, type: NKSParameterType.INT, min: -127, max: 127, defaultValue: 0, page: 0, index: 3, isAutomatable: true },
  { id: 'furnace.vibrato', name: 'Vibrato', section: NKSSection.LFO, type: NKSParameterType.INT, min: 0, max: 15, defaultValue: 0, page: 0, index: 4, isAutomatable: true },
  { id: 'furnace.noise', name: 'Noise', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 0, index: 5, isAutomatable: true },
  { id: 'furnace.envelope', name: 'Env Mode', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 7, defaultValue: 0, page: 0, index: 6, isAutomatable: true },
];

// ============================================================================
// GENERIC BUZZMACHINE PARAMETERS
// ============================================================================
export const BUZZMACHINE_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'buzzmachine.param0', name: 'Param 1', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true },
  { id: 'buzzmachine.param1', name: 'Param 2', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true },
  { id: 'buzzmachine.param2', name: 'Param 3', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true },
  { id: 'buzzmachine.param3', name: 'Param 4', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true },
  { id: 'buzzmachine.param4', name: 'Param 5', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true },
  { id: 'buzzmachine.param5', name: 'Param 6', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true },
  { id: 'buzzmachine.param6', name: 'Param 7', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true },
  { id: 'buzzmachine.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// GENERIC PARAMETERS (for synths without specific mapping)
// ============================================================================
export const GENERIC_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'generic.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 7, isAutomatable: true },
  { id: 'generic.pan', name: 'Pan', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: -1, max: 1, defaultValue: 0, formatString: '%.2f', page: 0, index: 1, ccNumber: 10, isAutomatable: true },
];

// ============================================================================
// SYNTH TYPE TO PARAMETER MAP
// ============================================================================
export const SYNTH_PARAMETER_MAPS: Partial<Record<SynthType, NKSParameter[]>> = {
  // Core synths
  'TB303': TB303_NKS_PARAMETERS,
  'Dexed': DEXED_NKS_PARAMETERS,
  'OBXd': OBXD_NKS_PARAMETERS,
  'DubSiren': DUBSIREN_NKS_PARAMETERS,
  'SpaceLaser': SPACELASER_NKS_PARAMETERS,
  'Synare': SYNARE_NKS_PARAMETERS,
  'V2': V2_NKS_PARAMETERS,
  'Sam': SAM_NKS_PARAMETERS,

  // Tone.js synths
  'MonoSynth': MONOSYNTH_NKS_PARAMETERS,
  'DuoSynth': DUOSYNTH_NKS_PARAMETERS,
  'PolySynth': POLYSYNTH_NKS_PARAMETERS,
  'Synth': POLYSYNTH_NKS_PARAMETERS,
  'FMSynth': FMSYNTH_NKS_PARAMETERS,
  'AMSynth': AMSYNTH_NKS_PARAMETERS,
  'MembraneSynth': MEMBRANESYNTH_NKS_PARAMETERS,
  'MetalSynth': METALSYNTH_NKS_PARAMETERS,
  'NoiseSynth': NOISESYNTH_NKS_PARAMETERS,
  'PluckSynth': PLUCKSYNTH_NKS_PARAMETERS,
  'Sampler': SAMPLER_NKS_PARAMETERS,
  'Player': SAMPLER_NKS_PARAMETERS,

  // Additional DEViLBOX synths
  'SuperSaw': SUPERSAW_NKS_PARAMETERS,
  'Organ': ORGAN_NKS_PARAMETERS,
  'DrumMachine': DRUMMACHINE_NKS_PARAMETERS,
  'ChipSynth': CHIPSYNTH_NKS_PARAMETERS,
  'PWMSynth': PWMSYNTH_NKS_PARAMETERS,
  'WobbleBass': WOBBLEBASS_NKS_PARAMETERS,
  'StringMachine': STRINGMACHINE_NKS_PARAMETERS,
  'FormantSynth': FORMANTSYNTH_NKS_PARAMETERS,
  'GranularSynth': GRANULAR_NKS_PARAMETERS,
  'Wavetable': WAVETABLE_NKS_PARAMETERS,

  // Buzzmachines - TB-303 style uses TB303 params
  'Buzz3o3': TB303_NKS_PARAMETERS,
  'BuzzM3': BUZZMACHINE_NKS_PARAMETERS,
  'Buzz4FM2F': FURNACE_FM_NKS_PARAMETERS,
  'BuzzDynamite6': BUZZMACHINE_NKS_PARAMETERS,
  'BuzzKick': BUZZMACHINE_NKS_PARAMETERS,
  'BuzzKickXP': BUZZMACHINE_NKS_PARAMETERS,
  'BuzzTrilok': BUZZMACHINE_NKS_PARAMETERS,
  'BuzzNoise': NOISESYNTH_NKS_PARAMETERS,
  'BuzzFreqBomb': BUZZMACHINE_NKS_PARAMETERS,
  'BuzzDTMF': BUZZMACHINE_NKS_PARAMETERS,
  'Buzzmachine': BUZZMACHINE_NKS_PARAMETERS,

  // Furnace FM chips - use FM params
  'Furnace': FURNACE_FM_NKS_PARAMETERS,
  'FurnaceOPN': FURNACE_FM_NKS_PARAMETERS,
  'FurnaceOPN2203': FURNACE_FM_NKS_PARAMETERS,
  'FurnaceOPNA': FURNACE_FM_NKS_PARAMETERS,
  'FurnaceOPNB': FURNACE_FM_NKS_PARAMETERS,
  'FurnaceOPNBB': FURNACE_FM_NKS_PARAMETERS,
  'FurnaceOPM': FURNACE_FM_NKS_PARAMETERS,
  'FurnaceOPL': FURNACE_FM_NKS_PARAMETERS,
  'FurnaceOPLL': FURNACE_FM_NKS_PARAMETERS,
  'FurnaceOPL4': FURNACE_FM_NKS_PARAMETERS,
  'FurnaceOPZ': FURNACE_FM_NKS_PARAMETERS,
  'FurnaceY8950': FURNACE_FM_NKS_PARAMETERS,
  'FurnaceESFM': FURNACE_FM_NKS_PARAMETERS,
  'FurnaceVRC7': FURNACE_FM_NKS_PARAMETERS,

  // Furnace PSG/Console chips - use PSG params
  'FurnaceNES': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceGB': FURNACE_PSG_NKS_PARAMETERS,
  'FurnacePSG': FURNACE_PSG_NKS_PARAMETERS,
  'FurnacePCE': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceSNES': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceVB': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceLynx': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceSWAN': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceNDS': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceGBA': FURNACE_PSG_NKS_PARAMETERS,
  'FurnacePOKEMINI': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceVRC6': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceN163': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceFDS': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceMMC5': FURNACE_PSG_NKS_PARAMETERS,

  // Furnace Computer chips
  'FurnaceC64': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceSID6581': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceSID8580': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceAY': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceAY8930': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceVIC': FURNACE_PSG_NKS_PARAMETERS,
  'FurnacePET': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceSAA': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceTED': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceDAVE': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceVERA': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceSCC': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceTIA': FURNACE_PSG_NKS_PARAMETERS,
  'FurnacePOKEY': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceZXBEEPER': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceAMIGA': FURNACE_PSG_NKS_PARAMETERS,
  'FurnacePCSPKR': FURNACE_PSG_NKS_PARAMETERS,

  // Furnace Arcade PCM chips
  'FurnaceSEGAPCM': SAMPLER_NKS_PARAMETERS,
  'FurnaceQSOUND': SAMPLER_NKS_PARAMETERS,
  'FurnaceES5506': SAMPLER_NKS_PARAMETERS,
  'FurnaceRF5C68': SAMPLER_NKS_PARAMETERS,
  'FurnaceC140': SAMPLER_NKS_PARAMETERS,
  'FurnaceK007232': SAMPLER_NKS_PARAMETERS,
  'FurnaceK053260': SAMPLER_NKS_PARAMETERS,
  'FurnaceGA20': SAMPLER_NKS_PARAMETERS,
  'FurnaceOKI': SAMPLER_NKS_PARAMETERS,
  'FurnaceYMZ280B': SAMPLER_NKS_PARAMETERS,
  'FurnaceX1_010': SAMPLER_NKS_PARAMETERS,
  'FurnaceBUBBLE': SAMPLER_NKS_PARAMETERS,
  'FurnaceMULTIPCM': SAMPLER_NKS_PARAMETERS,
  'FurnaceMSM6258': SAMPLER_NKS_PARAMETERS,
  'FurnaceMSM5232': SAMPLER_NKS_PARAMETERS,
  'FurnaceNAMCO': FURNACE_PSG_NKS_PARAMETERS,

  // Furnace Other chips
  'FurnaceSM8521': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceT6W28': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceSUPERVISION': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceUPD1771': FURNACE_PSG_NKS_PARAMETERS,
  'FurnacePONG': FURNACE_PSG_NKS_PARAMETERS,
  'FurnacePV1000': FURNACE_PSG_NKS_PARAMETERS,
  'FurnaceSU': FURNACE_PSG_NKS_PARAMETERS,
  'FurnacePOWERNOISE': NOISESYNTH_NKS_PARAMETERS,
  'FurnaceSCVTONE': FURNACE_PSG_NKS_PARAMETERS,
  'FurnacePCMDAC': SAMPLER_NKS_PARAMETERS,

  // V2 variants
  'V2Speech': V2_NKS_PARAMETERS,

  // Buzzmachine additions
  'Buzz3o3DF': TB303_NKS_PARAMETERS,
  'BuzzM4': BUZZMACHINE_NKS_PARAMETERS,

  // VSTBridge synths (use closest equivalent until auto-profiled)
  'DexedBridge': DEXED_NKS_PARAMETERS,
  'TonewheelOrgan': ORGAN_NKS_PARAMETERS,
  'Melodica': MONOSYNTH_NKS_PARAMETERS,
  'Vital': POLYSYNTH_NKS_PARAMETERS,
  'Odin2': POLYSYNTH_NKS_PARAMETERS,
  'Surge': POLYSYNTH_NKS_PARAMETERS,
  'Monique': MONOSYNTH_NKS_PARAMETERS,

  // WAM plugin (generic until auto-profiled at runtime)
  'WAM': GENERIC_NKS_PARAMETERS,

  // Multi-sample / Module playback
  'DrumKit': DRUMMACHINE_NKS_PARAMETERS,
  'ChiptuneModule': SAMPLER_NKS_PARAMETERS,

  // MAME dedicated synth engines
  'CEM3394': MONOSYNTH_NKS_PARAMETERS,
  'SCSP': FURNACE_FM_NKS_PARAMETERS,

  // MAME synths (FM-based)
  'MAMEVFX': FURNACE_FM_NKS_PARAMETERS,
  'MAMEDOC': FURNACE_FM_NKS_PARAMETERS,
  'MAMERSA': POLYSYNTH_NKS_PARAMETERS,
  'MAMESWP30': FURNACE_FM_NKS_PARAMETERS,
  'CZ101': FURNACE_FM_NKS_PARAMETERS,
  'MAMEYMF271': FURNACE_FM_NKS_PARAMETERS,
  'MAMEYMOPQ': FURNACE_FM_NKS_PARAMETERS,
  'MAMEVASynth': MONOSYNTH_NKS_PARAMETERS,

  // MAME synths (PCM/sample-based)
  'MAMEAICA': SAMPLER_NKS_PARAMETERS,
  'MAMEC352': SAMPLER_NKS_PARAMETERS,
  'MAMEES5503': SAMPLER_NKS_PARAMETERS,
  'MAMEICS2115': SAMPLER_NKS_PARAMETERS,
  'MAMEK054539': SAMPLER_NKS_PARAMETERS,
  'MAMERF5C400': SAMPLER_NKS_PARAMETERS,
  'MAMETR707': DRUMMACHINE_NKS_PARAMETERS,
  'MAMESNKWave': FURNACE_PSG_NKS_PARAMETERS,

  // MAME synths (PSG/simple oscillator)
  'MAMEASC': FURNACE_PSG_NKS_PARAMETERS,
  'MAMEAstrocade': FURNACE_PSG_NKS_PARAMETERS,
  'MAMESN76477': NOISESYNTH_NKS_PARAMETERS,
  'MAMETIA': FURNACE_PSG_NKS_PARAMETERS,
  'MAMETMS36XX': FURNACE_PSG_NKS_PARAMETERS,
  'MAMEMSM5232': FURNACE_PSG_NKS_PARAMETERS,

  // MAME synths (speech synthesis)
  'MAMEMEA8000': GENERIC_NKS_PARAMETERS,
  'MAMESP0250': GENERIC_NKS_PARAMETERS,
  'MAMETMS5220': GENERIC_NKS_PARAMETERS,
  'MAMEUPD931': GENERIC_NKS_PARAMETERS,
  'MAMEUPD933': GENERIC_NKS_PARAMETERS,
  'MAMEVotrax': GENERIC_NKS_PARAMETERS,
};

/**
 * Get NKS parameters for a synth type
 */
export function getNKSParametersForSynth(synthType: SynthType): NKSParameter[] {
  return SYNTH_PARAMETER_MAPS[synthType] || GENERIC_NKS_PARAMETERS;
}

/**
 * Build NKS pages from parameters
 */
export function buildNKSPages(parameters: NKSParameter[]): NKSPage[] {
  const pageMap = new Map<number, NKSParameter[]>();

  for (const param of parameters) {
    if (!pageMap.has(param.page)) {
      pageMap.set(param.page, []);
    }
    pageMap.get(param.page)!.push(param);
  }

  const pages: NKSPage[] = [];
  for (const [pageNum, params] of pageMap.entries()) {
    params.sort((a, b) => a.index - b.index);

    // Get page name from most common section
    const sections = params.map(p => p.section);
    const sectionCounts = new Map<string, number>();
    for (const section of sections) {
      sectionCounts.set(section, (sectionCounts.get(section) || 0) + 1);
    }
    let maxSection: NKSSection = sections[0];
    let maxCount = 0;
    for (const [section, count] of sectionCounts.entries()) {
      if (count > maxCount) {
        maxSection = section as NKSSection;
        maxCount = count;
      }
    }

    pages.push({
      id: `page_${pageNum}`,
      name: `${maxSection} ${pageNum + 1}`,
      parameters: params,
    });
  }

  pages.sort((a, b) => {
    const aNum = parseInt(a.id.split('_')[1]);
    const bNum = parseInt(b.id.split('_')[1]);
    return aNum - bNum;
  });

  return pages;
}

/**
 * Format parameter value for display
 */
export function formatNKSValue(param: NKSParameter, value: number): string {
  switch (param.type) {
    case NKSParameterType.BOOLEAN:
      return value >= 0.5 ? 'On' : 'Off';

    case NKSParameterType.SELECTOR:
      if (param.valueStrings) {
        const index = Math.round(value * (param.valueStrings.length - 1));
        return param.valueStrings[Math.min(index, param.valueStrings.length - 1)] || '';
      }
      return String(Math.round(value));

    case NKSParameterType.INT:
      return String(Math.round(value * (param.max - param.min) + param.min));

    case NKSParameterType.FLOAT:
    default: {
      const scaledValue = value * (param.max - param.min) + param.min;
      const formatted = param.formatString
        ? param.formatString.replace('%.0f', String(Math.round(scaledValue)))
                          .replace('%.1f', scaledValue.toFixed(1))
                          .replace('%.2f', scaledValue.toFixed(2))
                          .replace('%.3f', scaledValue.toFixed(3))
        : scaledValue.toFixed(2);

      return param.unit ? `${formatted}${param.unit}` : formatted;
    }
  }
}

// ============================================================================
// NKS2 PDI INFERENCE
// Automatically derive NKS2 PDI from existing NKS1 parameter types
// ============================================================================

/**
 * Infer NKS2 PDI from an NKS1 parameter definition.
 * This allows existing parameter maps to work with NKS2 without rewriting.
 */
export function inferNKS2PDI(param: NKSParameter): NKS2PDI {
  // If param already has explicit PDI, use it
  if (param.pdi) return param.pdi;

  switch (param.type) {
    case NKSParameterType.BOOLEAN:
      return { type: 'toggle', style: 'power' };

    case NKSParameterType.SELECTOR: {
      const count = param.valueStrings?.length ?? Math.round(param.max - param.min + 1);
      // Detect waveform and filter type selectors by name
      const lowerName = param.name.toLowerCase();
      let style: NKS2PDI['style'] = 'menu';
      if (lowerName.includes('wave') || lowerName.includes('osc type') || lowerName.includes('waveform')) {
        style = 'waveform';
      } else if (lowerName.includes('filter') && (lowerName.includes('mode') || lowerName.includes('type'))) {
        style = 'filterType';
      }
      return {
        type: 'discrete',
        style,
        value_count: count,
        display_values: param.valueStrings,
      };
    }

    case NKSParameterType.INT: {
      const isBipolar = param.min < 0;
      return {
        type: isBipolar ? 'discrete_bipolar' : 'discrete',
        style: 'value',
        value_count: Math.round(param.max - param.min + 1),
      };
    }

    case NKSParameterType.FLOAT:
    default: {
      const isBipolar = param.min < 0;
      return {
        type: isBipolar ? 'continuous_bipolar' : 'continuous',
        style: 'knob',
      };
    }
  }
}

// ============================================================================
// ENGINE PARAM MAPPING
// Maps NKS parameter IDs to MappableParameter strings used by parameterRouter.
// Only needed for params that have a direct route; others fall through to
// generic config-path routing.
// ============================================================================

const ENGINE_PARAM_MAP: Record<string, string> = {
  // TB303
  'tb303.cutoff': 'cutoff',
  'tb303.resonance': 'resonance',
  'tb303.envMod': 'envMod',
  'tb303.decay': 'decay',
  'tb303.accent': 'accent',
  'tb303.volume': 'mixer.volume',

  // DubSiren
  'dubsiren.oscillator.frequency': 'siren.osc.frequency',
  'dubsiren.lfo.rate': 'siren.lfo.rate',
  'dubsiren.lfo.depth': 'siren.lfo.depth',
  'dubsiren.delay.time': 'siren.delay.time',
  'dubsiren.delay.feedback': 'siren.delay.feedback',
  'dubsiren.delay.wet': 'siren.delay.wet',
  'dubsiren.filter.frequency': 'siren.filter.frequency',
  'dubsiren.reverb.wet': 'siren.reverb.wet',

  // Furnace FM
  'furnace.algorithm': 'furnace.algorithm',
  'furnace.feedback': 'furnace.feedback',
  'furnace.op1.level': 'furnace.op1TL',
  'furnace.lfoRate': 'furnace.fms',

  // V2
  'v2.osc1.level': 'v2.osc1Level',
  'v2.filter1.cutoff': 'v2.filter1Cutoff',
  'v2.filter1.resonance': 'v2.filter1Reso',
  'v2.envelope.attack': 'v2.envAttack',
  'v2.envelope.decay': 'v2.envDecay',
  'v2.envelope.sustain': 'v2.envSustain',
  'v2.envelope.release': 'v2.envRelease',
  'v2.lfo1.depth': 'v2.lfo1Depth',

  // Synare
  'synare.oscillator.tune': 'synare.tune',
  'synare.oscillator2.mix': 'synare.osc2Mix',
  'synare.filter.cutoff': 'synare.filterCutoff',
  'synare.filter.resonance': 'synare.filterReso',
  'synare.filter.envMod': 'synare.filterEnvMod',
  'synare.filter.decay': 'synare.filterDecay',
  'synare.sweep.amount': 'synare.sweepAmount',
  'synare.sweep.time': 'synare.sweepTime',

  // Dexed
  'dexed.algorithm': 'dexed.algorithm',
  'dexed.feedback': 'dexed.feedback',
  'dexed.lfoSpeed': 'dexed.lfoSpeed',
  'dexed.lfoPitchModDepth': 'dexed.lfoPitchMod',
  'dexed.lfoAmpModDepth': 'dexed.lfoAmpMod',
  'dexed.transpose': 'dexed.transpose',

  // OBXd
  'obxd.filterCutoff': 'obxd.filterCutoff',
  'obxd.filterResonance': 'obxd.filterReso',
  'obxd.filterEnvAmount': 'obxd.filterEnv',
  'obxd.ampAttack': 'obxd.ampAttack',
  'obxd.ampDecay': 'obxd.ampDecay',
  'obxd.masterVolume': 'obxd.volume',
  'obxd.osc1Level': 'obxd.osc1Level',
  'obxd.osc2Level': 'obxd.osc2Level',

  // SpaceLaser
  'spacelaser.laser.startFreq': 'spacelaser.startFreq',
  'spacelaser.laser.endFreq': 'spacelaser.endFreq',
  'spacelaser.laser.sweepTime': 'spacelaser.sweepTime',
  'spacelaser.fm.amount': 'spacelaser.fmAmount',
  'spacelaser.fm.ratio': 'spacelaser.fmRatio',
  'spacelaser.filter.cutoff': 'spacelaser.filterCutoff',
  'spacelaser.filter.resonance': 'spacelaser.filterReso',
  'spacelaser.delay.wet': 'spacelaser.delayWet',

  // SAM
  'sam.speed': 'sam.speed',
  'sam.pitch': 'sam.pitch',
  'sam.mouth': 'sam.mouth',
  'sam.throat': 'sam.throat',

  // Generic
  'generic.volume': 'mixer.volume',
  'generic.pan': 'mixer.pan',
};

/**
 * Get the engine parameter key for an NKS parameter ID.
 * Returns the param.engineParam if set, then checks the ENGINE_PARAM_MAP,
 * finally falls back to the parameter ID itself.
 */
export function getEngineParam(param: NKSParameter): string {
  if (param.engineParam) return param.engineParam;
  return ENGINE_PARAM_MAP[param.id] || param.id;
}

// ============================================================================
// NKS2 PROFILE BUILDER
// Convert existing NKS1 parameter arrays to full NKS2 profiles
// ============================================================================

/**
 * Convert an NKS1 parameter to an NKS2 parameter.
 */
export function toNKS2Parameter(param: NKSParameter): NKS2Parameter {
  return {
    id: param.id,
    name: param.name,
    pdi: inferNKS2PDI(param),
    defaultValue: param.defaultValue,
    unit: param.unit,
    ccNumber: param.ccNumber,
    engineParam: getEngineParam(param),
  };
}

/**
 * Build an NKS2 synth profile from an NKS1 parameter array.
 * Performance mode uses page 0 (first 8 params).
 * Additional pages become additional performance sections or edit groups.
 */
export function buildNKS2Profile(synthType: SynthType): NKS2SynthProfile {
  const nks1Params = getNKSParametersForSynth(synthType);
  const nks2Params = nks1Params.map(toNKS2Parameter);

  // Build performance sections from NKS1 pages
  const pages = buildNKSPages(nks1Params);
  const performance: NKS2PerformanceSection[] = pages.slice(0, 2).map(page => ({
    name: page.name,
    parameters: page.parameters.map(toNKS2Parameter),
  }));

  // Remaining pages become edit groups (if any)
  const editGroups = pages.length > 2
    ? pages.slice(2).map(page => ({
        name: page.name,
        sections: [{ name: page.name, parameters: page.parameters.map(toNKS2Parameter) }],
      }))
    : undefined;

  const navigation: NKS2Navigation = {
    performance,
    editGroups,
  };

  return {
    synthType,
    parameters: nks2Params,
    navigation,
  };
}

/**
 * Get an NKS2 synth profile for any synth type.
 * Cached for performance since profiles are computed from static data.
 */
const profileCache = new Map<string, NKS2SynthProfile>();

export function getNKS2Profile(synthType: SynthType): NKS2SynthProfile {
  let profile = profileCache.get(synthType);
  if (!profile) {
    profile = buildNKS2Profile(synthType);
    profileCache.set(synthType, profile);
  }
  return profile;
}

/**
 * Get Performance mode parameters for a synth (first 8-16 most important params).
 * This is what hardware knobs should map to.
 */
export function getPerformanceParams(synthType: SynthType): NKS2Parameter[] {
  const profile = getNKS2Profile(synthType);
  return profile.navigation.performance.flatMap(s => s.parameters).slice(0, 16);
}

/**
 * Get the first 8 performance params (for 8-knob controllers like Akai MPK Mini).
 */
export function getKnob8Params(synthType: SynthType): NKS2Parameter[] {
  return getPerformanceParams(synthType).slice(0, 8);
}
