/**
 * NKS Parameter Maps for ALL DEViLBOX Synths
 *
 * Each synth has its parameters mapped to NKS pages (8 params per page)
 * This enables hardware control via Komplete Kontrol, Maschine, etc.
 */

import type { NKSParameter, NKSPage, NKS2PDI, NKS2Parameter, NKS2PerformanceSection, NKS2EditGroup, NKS2EditSection, NKS2SynthProfile, NKS2Navigation } from './types';
import { NKSParameterType, NKSSection } from './types';
import type { SynthType } from '@typedefs/instrument';

// ============================================================================
// TB-303 (Acid Bass)
// ============================================================================
export const TB303_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Filter & Synthesis
  { id: 'tb303.cutoff', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 74, isAutomatable: true, accessibilityName: 'Filter Cutoff Frequency' },
  { id: 'tb303.resonance', name: 'Resonance', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 71, isAutomatable: true, accessibilityName: 'Filter Resonance' },
  { id: 'tb303.envMod', name: 'Env Mod', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 102, isAutomatable: true, accessibilityName: 'Filter Envelope Modulation Depth' },
  { id: 'tb303.decay', name: 'Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 103, isAutomatable: true, accessibilityName: 'Filter Envelope Decay Time' },
  { id: 'tb303.accent', name: 'Accent', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 4, ccNumber: 104, isAutomatable: true, accessibilityName: 'Accent Amount' },
  { id: 'tb303.tuning', name: 'Tuning', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: -1, max: 1, defaultValue: 0, unit: 'semi', formatString: '%.1f', page: 0, index: 5, ccNumber: 105, isAutomatable: true, accessibilityName: 'Master Tuning' },
  { id: 'tb303.waveform', name: 'Waveform', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 1, defaultValue: 0, valueStrings: ['Saw', 'Square'], page: 0, index: 6, ccNumber: 106, isAutomatable: true, accessibilityName: 'Oscillator Waveform' },
  { id: 'tb303.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: 'dB', formatString: '%.1f', page: 0, index: 7, ccNumber: 7, isAutomatable: true, accessibilityName: 'Master Volume' },
  // Page 1: Effects
  { id: 'tb303.distortion', name: 'Distortion', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 1, index: 0, ccNumber: 94, isAutomatable: true, accessibilityName: 'Distortion Amount' },
  { id: 'tb303.delay.time', name: 'Delay Time', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.375, unit: 'ms', formatString: '%.0f', page: 1, index: 1, ccNumber: 85, isAutomatable: true, accessibilityName: 'Delay Time' },
  { id: 'tb303.delay.feedback', name: 'Delay Fdbk', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.4, unit: '%', formatString: '%.0f%%', page: 1, index: 2, ccNumber: 86, isAutomatable: true, accessibilityName: 'Delay Feedback Amount' },
  { id: 'tb303.delay.mix', name: 'Delay Mix', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 1, index: 3, ccNumber: 87, isAutomatable: true, accessibilityName: 'Delay Wet Dry Mix' },
  { id: 'tb303.reverb.size', name: 'Reverb Size', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 4, ccNumber: 91, isAutomatable: true, accessibilityName: 'Reverb Room Size' },
  { id: 'tb303.reverb.mix', name: 'Reverb Mix', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.2, unit: '%', formatString: '%.0f%%', page: 1, index: 5, ccNumber: 92, isAutomatable: true, accessibilityName: 'Reverb Wet Dry Mix' },
];

// ============================================================================
// DEXED (DX7 FM Synthesizer)
// ============================================================================
export const DEXED_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Algorithm & Global
  { id: 'dexed.algorithm', name: 'Algorithm', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 31, defaultValue: 0, page: 0, index: 0, isAutomatable: true, accessibilityName: 'FM Algorithm' },
  { id: 'dexed.feedback', name: 'Feedback', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 7, defaultValue: 0, page: 0, index: 1, isAutomatable: true, accessibilityName: 'Operator Feedback Amount' },
  { id: 'dexed.lfoSpeed', name: 'LFO Speed', section: NKSSection.LFO, type: NKSParameterType.INT, min: 0, max: 99, defaultValue: 35, page: 0, index: 2, isAutomatable: true, accessibilityName: 'LFO Speed' },
  { id: 'dexed.lfoPitchModDepth', name: 'LFO Pitch', section: NKSSection.LFO, type: NKSParameterType.INT, min: 0, max: 99, defaultValue: 0, page: 0, index: 3, isAutomatable: true, accessibilityName: 'LFO Pitch Modulation Depth' },
  { id: 'dexed.lfoAmpModDepth', name: 'LFO Amp', section: NKSSection.LFO, type: NKSParameterType.INT, min: 0, max: 99, defaultValue: 0, page: 0, index: 4, isAutomatable: true, accessibilityName: 'LFO Amplitude Modulation Depth' },
  { id: 'dexed.lfoWave', name: 'LFO Wave', section: NKSSection.LFO, type: NKSParameterType.SELECTOR, min: 0, max: 5, defaultValue: 0, valueStrings: ['Triangle', 'Saw Down', 'Saw Up', 'Square', 'Sine', 'S&H'], page: 0, index: 5, isAutomatable: true, accessibilityName: 'LFO Waveform' },
  { id: 'dexed.transpose', name: 'Transpose', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: -24, max: 24, defaultValue: 0, unit: 'semi', page: 0, index: 6, isAutomatable: true, accessibilityName: 'Global Transpose' },
  { id: 'dexed.oscSync', name: 'Osc Sync', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 1, page: 0, index: 7, isAutomatable: true, accessibilityName: 'Oscillator Key Sync' },
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
  { id: 'obxd.osc1Waveform', name: 'Osc1 Wave', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 3, defaultValue: 0, valueStrings: ['Saw', 'Pulse', 'Triangle', 'Noise'], page: 0, index: 0, isAutomatable: true, accessibilityName: 'Oscillator 1 Waveform' },
  { id: 'obxd.osc1Octave', name: 'Osc1 Oct', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: -2, max: 2, defaultValue: 0, page: 0, index: 1, isAutomatable: true, accessibilityName: 'Oscillator 1 Octave' },
  { id: 'obxd.osc1PulseWidth', name: 'Osc1 PW', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true, accessibilityName: 'Oscillator 1 Pulse Width' },
  { id: 'obxd.osc1Level', name: 'Osc1 Level', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 1, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true, accessibilityName: 'Oscillator 1 Level' },
  { id: 'obxd.osc2Waveform', name: 'Osc2 Wave', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 3, defaultValue: 0, valueStrings: ['Saw', 'Pulse', 'Triangle', 'Noise'], page: 0, index: 4, isAutomatable: true, accessibilityName: 'Oscillator 2 Waveform' },
  { id: 'obxd.osc2Octave', name: 'Osc2 Oct', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: -2, max: 2, defaultValue: 0, page: 0, index: 5, isAutomatable: true, accessibilityName: 'Oscillator 2 Octave' },
  { id: 'obxd.osc2Detune', name: 'Osc2 Detune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: -1, max: 1, defaultValue: 0.1, unit: 'semi', formatString: '%.2f', page: 0, index: 6, isAutomatable: true, accessibilityName: 'Oscillator 2 Detune' },
  { id: 'obxd.osc2Level', name: 'Osc2 Level', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true, accessibilityName: 'Oscillator 2 Level' },
  // Page 1: Filter
  { id: 'obxd.filterCutoff', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 1, index: 0, isAutomatable: true, accessibilityName: 'Filter Cutoff Frequency' },
  { id: 'obxd.filterResonance', name: 'Resonance', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 1, index: 1, isAutomatable: true, accessibilityName: 'Filter Resonance' },
  { id: 'obxd.filterEnvAmount', name: 'Env Amount', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 2, isAutomatable: true, accessibilityName: 'Filter Envelope Amount' },
  { id: 'obxd.filterKeyTrack', name: 'Key Track', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 1, index: 3, isAutomatable: true, accessibilityName: 'Filter Keyboard Tracking' },
  { id: 'obxd.filterAttack', name: 'Flt Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.01, unit: 's', formatString: '%.2f', page: 1, index: 4, isAutomatable: true, accessibilityName: 'Filter Envelope Attack Time' },
  { id: 'obxd.filterDecay', name: 'Flt Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 1, index: 5, isAutomatable: true, accessibilityName: 'Filter Envelope Decay Time' },
  { id: 'obxd.filterSustain', name: 'Flt Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 1, index: 6, isAutomatable: true, accessibilityName: 'Filter Envelope Sustain Level' },
  { id: 'obxd.filterRelease', name: 'Flt Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 1, index: 7, isAutomatable: true, accessibilityName: 'Filter Envelope Release Time' },
  // Page 2: Amp Envelope & Global
  { id: 'obxd.ampAttack', name: 'Amp Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.01, unit: 's', formatString: '%.2f', page: 2, index: 0, isAutomatable: true, accessibilityName: 'Amplifier Envelope Attack Time' },
  { id: 'obxd.ampDecay', name: 'Amp Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.2, unit: 's', formatString: '%.2f', page: 2, index: 1, isAutomatable: true, accessibilityName: 'Amplifier Envelope Decay Time' },
  { id: 'obxd.ampSustain', name: 'Amp Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 2, index: 2, isAutomatable: true, accessibilityName: 'Amplifier Envelope Sustain Level' },
  { id: 'obxd.ampRelease', name: 'Amp Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 2, index: 3, isAutomatable: true, accessibilityName: 'Amplifier Envelope Release Time' },
  { id: 'obxd.masterVolume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 2, index: 4, isAutomatable: true, accessibilityName: 'Master Volume' },
  { id: 'obxd.portamento', name: 'Portamento', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: 's', formatString: '%.2f', page: 2, index: 5, isAutomatable: true, accessibilityName: 'Portamento Time' },
  { id: 'obxd.unison', name: 'Unison', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 2, index: 6, isAutomatable: true, accessibilityName: 'Unison Enable' },
  { id: 'obxd.unisonDetune', name: 'Uni Detune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.1, unit: '%', formatString: '%.0f%%', page: 2, index: 7, isAutomatable: true, accessibilityName: 'Unison Detune Amount' },
  // Page 3: LFO
  { id: 'obxd.lfoRate', name: 'LFO Rate', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.2, unit: 'Hz', formatString: '%.1f', page: 3, index: 0, isAutomatable: true, accessibilityName: 'LFO Rate' },
  { id: 'obxd.lfoWaveform', name: 'LFO Wave', section: NKSSection.LFO, type: NKSParameterType.SELECTOR, min: 0, max: 4, defaultValue: 0, valueStrings: ['Sine', 'Triangle', 'Saw', 'Square', 'S&H'], page: 3, index: 1, isAutomatable: true, accessibilityName: 'LFO Waveform' },
  { id: 'obxd.lfoOscAmount', name: 'LFO>Pitch', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 3, index: 2, isAutomatable: true, accessibilityName: 'LFO to Pitch Amount' },
  { id: 'obxd.lfoFilterAmount', name: 'LFO>Filter', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 3, index: 3, isAutomatable: true, accessibilityName: 'LFO to Filter Amount' },
  { id: 'obxd.lfoAmpAmount', name: 'LFO>Amp', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 3, index: 4, isAutomatable: true, accessibilityName: 'LFO to Amplitude Amount' },
  { id: 'obxd.lfoPwAmount', name: 'LFO>PW', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 3, index: 5, isAutomatable: true, accessibilityName: 'LFO to Pulse Width Amount' },
  { id: 'obxd.oscSync', name: 'Osc Sync', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 3, index: 6, isAutomatable: true, accessibilityName: 'Oscillator Sync Enable' },
  { id: 'obxd.oscXor', name: 'Ring Mod', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 3, index: 7, isAutomatable: true, accessibilityName: 'Ring Modulation Enable' },
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
  { id: 'v2.osc1.mode', name: 'Osc1 Mode', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 7, defaultValue: 1, valueStrings: ['Off', 'Saw/Tri', 'Pulse', 'Sin', 'Noise', 'XX', 'AuxA', 'AuxB'], page: 0, index: 0, isAutomatable: true, accessibilityName: 'Oscillator 1 Mode', subsection: 'Osc 1' },
  { id: 'v2.osc1.transpose', name: 'Osc1 Trans', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: -64, max: 63, defaultValue: 0, unit: 'semi', page: 0, index: 1, isAutomatable: true, accessibilityName: 'Oscillator 1 Transpose', subsection: 'Osc 1' },
  { id: 'v2.osc1.color', name: 'Osc1 Color', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 64, page: 0, index: 2, isAutomatable: true, accessibilityName: 'Oscillator 1 Color', subsection: 'Osc 1' },
  { id: 'v2.osc1.level', name: 'Osc1 Level', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 127, page: 0, index: 3, isAutomatable: true, accessibilityName: 'Oscillator 1 Level', subsection: 'Osc 1' },
  { id: 'v2.osc2.mode', name: 'Osc2 Mode', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 7, defaultValue: 0, valueStrings: ['!Off', 'Tri', 'Pulse', 'Sin', 'Noise', 'FM', 'AuxA', 'AuxB'], page: 0, index: 4, isAutomatable: true, accessibilityName: 'Oscillator 2 Mode', subsection: 'Osc 2' },
  { id: 'v2.osc2.transpose', name: 'Osc2 Trans', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: -64, max: 63, defaultValue: 0, unit: 'semi', page: 0, index: 5, isAutomatable: true, accessibilityName: 'Oscillator 2 Transpose', subsection: 'Osc 2' },
  { id: 'v2.osc2.detune', name: 'Osc2 Detune', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: -64, max: 63, defaultValue: 10, page: 0, index: 6, isAutomatable: true, accessibilityName: 'Oscillator 2 Detune', subsection: 'Osc 2' },
  { id: 'v2.osc2.level', name: 'Osc2 Level', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 0, page: 0, index: 7, isAutomatable: true, accessibilityName: 'Oscillator 2 Level', subsection: 'Osc 2' },
  // Page 1: Filter
  { id: 'v2.filter1.mode', name: 'Flt1 Mode', section: NKSSection.FILTER, type: NKSParameterType.SELECTOR, min: 0, max: 7, defaultValue: 1, valueStrings: ['Off', 'Low', 'Band', 'High', 'Notch', 'All', 'MoogL', 'MoogH'], page: 1, index: 0, isAutomatable: true, accessibilityName: 'Filter 1 Mode', subsection: 'Filter 1' },
  { id: 'v2.filter1.cutoff', name: 'Flt1 Cutoff', section: NKSSection.FILTER, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 127, page: 1, index: 1, isAutomatable: true, accessibilityName: 'Filter 1 Cutoff Frequency', subsection: 'Filter 1' },
  { id: 'v2.filter1.resonance', name: 'Flt1 Reso', section: NKSSection.FILTER, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 0, page: 1, index: 2, isAutomatable: true, accessibilityName: 'Filter 1 Resonance', subsection: 'Filter 1' },
  { id: 'v2.filter2.mode', name: 'Flt2 Mode', section: NKSSection.FILTER, type: NKSParameterType.SELECTOR, min: 0, max: 7, defaultValue: 0, valueStrings: ['Off', 'Low', 'Band', 'High', 'Notch', 'All', 'MoogL', 'MoogH'], page: 1, index: 3, isAutomatable: true, accessibilityName: 'Filter 2 Mode', subsection: 'Filter 2' },
  { id: 'v2.filter2.cutoff', name: 'Flt2 Cutoff', section: NKSSection.FILTER, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 127, page: 1, index: 4, isAutomatable: true, accessibilityName: 'Filter 2 Cutoff Frequency', subsection: 'Filter 2' },
  { id: 'v2.filter2.resonance', name: 'Flt2 Reso', section: NKSSection.FILTER, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 0, page: 1, index: 5, isAutomatable: true, accessibilityName: 'Filter 2 Resonance', subsection: 'Filter 2' },
  { id: 'v2.routing.mode', name: 'Routing', section: NKSSection.FILTER, type: NKSParameterType.SELECTOR, min: 0, max: 2, defaultValue: 0, valueStrings: ['Single', 'Serial', 'Parallel'], page: 1, index: 6, isAutomatable: true, accessibilityName: 'Filter Routing Mode' },
  { id: 'v2.routing.balance', name: 'Balance', section: NKSSection.FILTER, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 64, page: 1, index: 7, isAutomatable: true, accessibilityName: 'Filter Routing Balance' },
  // Page 2: Envelope
  { id: 'v2.envelope.attack', name: 'Amp Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 0, page: 2, index: 0, isAutomatable: true, accessibilityName: 'Amplifier Envelope Attack Time', subsection: 'Amp Env' },
  { id: 'v2.envelope.decay', name: 'Amp Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 64, page: 2, index: 1, isAutomatable: true, accessibilityName: 'Amplifier Envelope Decay Time', subsection: 'Amp Env' },
  { id: 'v2.envelope.sustain', name: 'Amp Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 127, page: 2, index: 2, isAutomatable: true, accessibilityName: 'Amplifier Envelope Sustain Level', subsection: 'Amp Env' },
  { id: 'v2.envelope.release', name: 'Amp Release', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 32, page: 2, index: 3, isAutomatable: true, accessibilityName: 'Amplifier Envelope Release Time', subsection: 'Amp Env' },
  { id: 'v2.envelope2.attack', name: 'Env2 Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 0, page: 2, index: 4, isAutomatable: true, accessibilityName: 'Modulation Envelope Attack Time', subsection: 'Mod Env' },
  { id: 'v2.envelope2.decay', name: 'Env2 Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 64, page: 2, index: 5, isAutomatable: true, accessibilityName: 'Modulation Envelope Decay Time', subsection: 'Mod Env' },
  { id: 'v2.lfo1.rate', name: 'LFO Rate', section: NKSSection.LFO, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 64, page: 2, index: 6, isAutomatable: true, accessibilityName: 'LFO Rate' },
  { id: 'v2.lfo1.depth', name: 'LFO Depth', section: NKSSection.LFO, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 0, page: 2, index: 7, isAutomatable: true, accessibilityName: 'LFO Depth' },
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
// BUZZMACHINE: FSM Kick (synthesized kick drum)
// ============================================================================
export const BUZZKICK_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'buzzkick.startFreq', name: 'Start Freq', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 1, max: 240, defaultValue: 198, page: 0, index: 0, isAutomatable: true },
  { id: 'buzzkick.endFreq', name: 'End Freq', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 1, max: 240, defaultValue: 64, page: 0, index: 1, isAutomatable: true },
  { id: 'buzzkick.toneDecay', name: 'Tone Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 1, max: 240, defaultValue: 46, page: 0, index: 2, isAutomatable: true },
  { id: 'buzzkick.toneShape', name: 'Tone Shape', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 1, max: 240, defaultValue: 27, page: 0, index: 3, isAutomatable: true },
  { id: 'buzzkick.ampDecay', name: 'Amp Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 1, max: 240, defaultValue: 55, page: 0, index: 4, isAutomatable: true },
  { id: 'buzzkick.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.8, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true },
];

// ============================================================================
// BUZZMACHINE: FSM KickXP (enhanced kick drum)
// ============================================================================
export const BUZZKICKXP_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'buzzkickxp.startFreq', name: 'Start Freq', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 1, max: 240, defaultValue: 198, page: 0, index: 0, isAutomatable: true },
  { id: 'buzzkickxp.endFreq', name: 'End Freq', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 1, max: 240, defaultValue: 64, page: 0, index: 1, isAutomatable: true },
  { id: 'buzzkickxp.buzzAmt', name: 'Buzz', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true },
  { id: 'buzzkickxp.clickAmt', name: 'Click', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true },
  { id: 'buzzkickxp.punchAmt', name: 'Punch', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true },
  { id: 'buzzkickxp.toneDecay', name: 'Tone Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.4, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true },
  { id: 'buzzkickxp.decayTime', name: 'Decay Time', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true },
  { id: 'buzzkickxp.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.8, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// BUZZMACHINE: Jeskola Trilok (bass drum)
// ============================================================================
export const BUZZTRILOK_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'buzztrilok.tone', name: 'BD Tone', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 64, page: 0, index: 0, isAutomatable: true },
  { id: 'buzztrilok.decay', name: 'BD Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 64, page: 0, index: 1, isAutomatable: true },
  { id: 'buzztrilok.volume', name: 'BD Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true },
];

// ============================================================================
// BUZZMACHINE: CyanPhase DTMF (phone tone generator)
// ============================================================================
export const BUZZDTMF_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'buzzdtmf.dialNumber', name: 'Dial #', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 11, defaultValue: 0, page: 0, index: 0, isAutomatable: true },
  { id: 'buzzdtmf.sustain', name: 'Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 254, defaultValue: 40, page: 0, index: 1, isAutomatable: true },
  { id: 'buzzdtmf.twist', name: 'Twist', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 40, defaultValue: 0, unit: 'dB', page: 0, index: 2, isAutomatable: true },
  { id: 'buzzdtmf.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.75, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true },
];

// ============================================================================
// BUZZMACHINE: Elenzil FrequencyBomb (oscillator + LFO)
// ============================================================================
export const BUZZFREQBOMB_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'buzzfreqbomb.freq', name: 'Frequency', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0.01, max: 655, defaultValue: 50, unit: 'Hz', formatString: '%.1f', page: 0, index: 0, isAutomatable: true },
  { id: 'buzzfreqbomb.waveform', name: 'Waveform', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 4, defaultValue: 0, valueStrings: ['Sine', 'Saw', 'Square', 'Triangle', 'Noise'], page: 0, index: 1, isAutomatable: true },
  { id: 'buzzfreqbomb.wavePower', name: 'Wave Power', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 1, max: 13, defaultValue: 1, page: 0, index: 2, isAutomatable: true },
  { id: 'buzzfreqbomb.lfoRate', name: 'LFO Rate', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0.01, max: 655, defaultValue: 10, unit: 's', formatString: '%.2f', page: 0, index: 3, isAutomatable: true },
  { id: 'buzzfreqbomb.lfoAmount', name: 'LFO Amount', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 65, defaultValue: 0, unit: 'Hz', formatString: '%.1f', page: 0, index: 4, isAutomatable: true },
  { id: 'buzzfreqbomb.freqAttack', name: 'Freq Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 655, defaultValue: 0.1, unit: 's', formatString: '%.2f', page: 0, index: 5, isAutomatable: true },
  { id: 'buzzfreqbomb.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true },
];

// ============================================================================
// BUZZMACHINE: Makk M3 (dual-osc mono synth, top 8 of 35 params)
// ============================================================================
export const BUZZM3_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'buzzm3.osc1Wave', name: 'Osc1 Wave', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 5, defaultValue: 1, valueStrings: ['Off', 'Saw', 'Pulse', 'Tri', 'Sin', 'Noise'], page: 0, index: 0, isAutomatable: true },
  { id: 'buzzm3.osc1PW', name: 'Osc1 PW', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 64, page: 0, index: 1, isAutomatable: true },
  { id: 'buzzm3.osc2Wave', name: 'Osc2 Wave', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 5, defaultValue: 0, valueStrings: ['Off', 'Saw', 'Pulse', 'Tri', 'Sin', 'Noise'], page: 0, index: 2, isAutomatable: true },
  { id: 'buzzm3.mix', name: 'Osc Mix', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 64, page: 0, index: 3, isAutomatable: true },
  { id: 'buzzm3.filterCutoff', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 100, page: 0, index: 4, isAutomatable: true },
  { id: 'buzzm3.filterReso', name: 'Resonance', section: NKSSection.FILTER, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 0, page: 0, index: 5, isAutomatable: true },
  { id: 'buzzm3.ampAttack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 0, page: 0, index: 6, isAutomatable: true },
  { id: 'buzzm3.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// BUZZMACHINE: Makk M4 (poly wavetable synth, top 8 of 37 params)
// ============================================================================
export const BUZZM4_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'buzzm4.osc1Wave', name: 'Osc1 Wave', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 99, defaultValue: 0, page: 0, index: 0, isAutomatable: true },
  { id: 'buzzm4.osc2Wave', name: 'Osc2 Wave', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 99, defaultValue: 0, page: 0, index: 1, isAutomatable: true },
  { id: 'buzzm4.oscMix', name: 'Osc Mix', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 64, page: 0, index: 2, isAutomatable: true },
  { id: 'buzzm4.filterCutoff', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 100, page: 0, index: 3, isAutomatable: true },
  { id: 'buzzm4.filterReso', name: 'Resonance', section: NKSSection.FILTER, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 0, page: 0, index: 4, isAutomatable: true },
  { id: 'buzzm4.ampAttack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 0, page: 0, index: 5, isAutomatable: true },
  { id: 'buzzm4.ampRelease', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 127, defaultValue: 30, page: 0, index: 6, isAutomatable: true },
  { id: 'buzzm4.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// BUZZMACHINE: MadBrain Dynamite6 (6-pipe additive, top 8 of 27 params)
// ============================================================================
export const BUZZDYNAMITE6_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'buzzdyn6.coarseTune', name: 'Coarse', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 1, max: 255, defaultValue: 128, page: 0, index: 0, isAutomatable: true },
  { id: 'buzzdyn6.pipe1Len', name: 'Pipe 1 Len', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 255, defaultValue: 128, page: 0, index: 1, isAutomatable: true },
  { id: 'buzzdyn6.pipe1Fdbk', name: 'Pipe 1 FB', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 255, defaultValue: 128, page: 0, index: 2, isAutomatable: true },
  { id: 'buzzdyn6.pipe1Filter', name: 'Pipe 1 Flt', section: NKSSection.FILTER, type: NKSParameterType.INT, min: 0, max: 255, defaultValue: 128, page: 0, index: 3, isAutomatable: true },
  { id: 'buzzdyn6.envAttack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 254, defaultValue: 4, page: 0, index: 4, isAutomatable: true },
  { id: 'buzzdyn6.envDecay', name: 'Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 1, max: 255, defaultValue: 255, page: 0, index: 5, isAutomatable: true },
  { id: 'buzzdyn6.routing', name: 'Routing', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 7, defaultValue: 0, page: 0, index: 6, isAutomatable: true },
  { id: 'buzzdyn6.amplification', name: 'Amplify', section: NKSSection.OUTPUT, type: NKSParameterType.INT, min: 1, max: 255, defaultValue: 32, page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// MAME: Votrax SC-01 (formant speech synthesis)
// ============================================================================
export const VOTRAX_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'votrax.phoneme', name: 'Phoneme', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 63, defaultValue: 0, page: 0, index: 0, isAutomatable: true },
  { id: 'votrax.inflection', name: 'Inflection', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 3, defaultValue: 0, valueStrings: ['Normal', 'Rise', 'Fall', 'Stress'], page: 0, index: 1, isAutomatable: true },
  { id: 'votrax.f1Override', name: 'F1 Formant', section: NKSSection.FILTER, type: NKSParameterType.INT, min: -1, max: 15, defaultValue: -1, page: 0, index: 2, isAutomatable: true },
  { id: 'votrax.f2Override', name: 'F2 Formant', section: NKSSection.FILTER, type: NKSParameterType.INT, min: -1, max: 15, defaultValue: -1, page: 0, index: 3, isAutomatable: true },
  { id: 'votrax.f3Override', name: 'F3 Formant', section: NKSSection.FILTER, type: NKSParameterType.INT, min: -1, max: 15, defaultValue: -1, page: 0, index: 4, isAutomatable: true },
  { id: 'votrax.stereoWidth', name: 'Stereo Wid', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true },
  { id: 'votrax.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.8, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true },
];

// ============================================================================
// MAME: TMS5220 Speak & Spell (LPC speech synthesis)
// ============================================================================
export const TMS5220_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'tms5220.chirpType', name: 'Chirp Type', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 2, defaultValue: 0, valueStrings: ['TMS5220', 'TMS5200', 'TI99'], page: 0, index: 0, isAutomatable: true },
  { id: 'tms5220.pitchIndex', name: 'Pitch', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 63, defaultValue: 32, page: 0, index: 1, isAutomatable: true },
  { id: 'tms5220.energyIndex', name: 'Energy', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 15, defaultValue: 10, page: 0, index: 2, isAutomatable: true },
  { id: 'tms5220.k1Index', name: 'K1 Formant', section: NKSSection.FILTER, type: NKSParameterType.INT, min: 0, max: 31, defaultValue: 15, page: 0, index: 3, isAutomatable: true },
  { id: 'tms5220.k2Index', name: 'K2 Formant', section: NKSSection.FILTER, type: NKSParameterType.INT, min: 0, max: 31, defaultValue: 15, page: 0, index: 4, isAutomatable: true },
  { id: 'tms5220.noiseMode', name: 'Noise', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 0, index: 5, isAutomatable: true },
  { id: 'tms5220.brightness', name: 'Brightness', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true },
  { id: 'tms5220.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.8, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// MAME: MEA8000 (Philips 4-formant speech synthesis)
// ============================================================================
export const MEA8000_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'mea8000.noiseMode', name: 'Noise Mode', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 0, index: 0, isAutomatable: true },
  { id: 'mea8000.f1Index', name: 'F1 Formant', section: NKSSection.FILTER, type: NKSParameterType.INT, min: 0, max: 7, defaultValue: 3, page: 0, index: 1, isAutomatable: true },
  { id: 'mea8000.f2Index', name: 'F2 Formant', section: NKSSection.FILTER, type: NKSParameterType.INT, min: 0, max: 7, defaultValue: 4, page: 0, index: 2, isAutomatable: true },
  { id: 'mea8000.f3Index', name: 'F3 Formant', section: NKSSection.FILTER, type: NKSParameterType.INT, min: 0, max: 7, defaultValue: 5, page: 0, index: 3, isAutomatable: true },
  { id: 'mea8000.bwIndex', name: 'Bandwidth', section: NKSSection.FILTER, type: NKSParameterType.SELECTOR, min: 0, max: 3, defaultValue: 0, valueStrings: ['Wide', 'Medium', 'Narrow', 'V.Narrow'], page: 0, index: 4, isAutomatable: true },
  { id: 'mea8000.amplitude', name: 'Amplitude', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.8, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true },
  { id: 'mea8000.interpTime', name: 'Interp Time', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0.1, max: 10, defaultValue: 1, formatString: '%.1f', page: 0, index: 6, isAutomatable: true },
  { id: 'mea8000.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.8, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// MAME: SP0250 (GI digital LPC speech)
// ============================================================================
export const SP0250_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'sp0250.vowel', name: 'Vowel', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 7, defaultValue: 0, valueStrings: ['AH', 'EE', 'IH', 'OH', 'OO', 'NN', 'ZZ', 'HH'], page: 0, index: 0, isAutomatable: true },
  { id: 'sp0250.voiced', name: 'Voiced', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 1, page: 0, index: 1, isAutomatable: true },
  { id: 'sp0250.brightness', name: 'Brightness', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true },
  { id: 'sp0250.filterMix', name: 'Filter Mix', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true },
  { id: 'sp0250.stereoWidth', name: 'Stereo Wid', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true },
  { id: 'sp0250.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.8, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true },
];

// ============================================================================
// MAME: UPD931 (NEC/Casio keyboard voice chip)
// ============================================================================
export const UPD931_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'upd931.waveA', name: 'Wave A', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 7, defaultValue: 0, page: 0, index: 0, isAutomatable: true },
  { id: 'upd931.waveB', name: 'Wave B', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 7, defaultValue: 1, page: 0, index: 1, isAutomatable: true },
  { id: 'upd931.modeA', name: 'Mode A', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 3, defaultValue: 0, valueStrings: ['Always', 'Alternate', 'Attack', 'Sustain'], page: 0, index: 2, isAutomatable: true },
  { id: 'upd931.modeB', name: 'Mode B', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 3, defaultValue: 0, valueStrings: ['Always', 'Alternate', 'Attack', 'Sustain'], page: 0, index: 3, isAutomatable: true },
  { id: 'upd931.mirror', name: 'Mirror', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 0, index: 4, isAutomatable: true },
  { id: 'upd931.invert', name: 'Invert', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 0, index: 5, isAutomatable: true },
  { id: 'upd931.keyScaling', name: 'Key Scale', section: NKSSection.MODULATION, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 0, index: 6, isAutomatable: true },
  { id: 'upd931.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.8, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// MAME: UPD933 (NEC/Casio CZ phase distortion chip)
// ============================================================================
export const UPD933_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'upd933.waveform1', name: 'Wave 1', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 7, defaultValue: 0, valueStrings: ['Saw', 'Square', 'Pulse', 'Silent', 'DblSine', 'Saw+Pls', 'Reso', 'DblPls'], page: 0, index: 0, isAutomatable: true },
  { id: 'upd933.waveform2', name: 'Wave 2', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 7, defaultValue: 0, valueStrings: ['Saw', 'Square', 'Pulse', 'Silent', 'DblSine', 'Saw+Pls', 'Reso', 'DblPls'], page: 0, index: 1, isAutomatable: true },
  { id: 'upd933.dcwDepth', name: 'DCW Depth', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true },
  { id: 'upd933.dcaRate', name: 'DCA Rate', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true },
  { id: 'upd933.dcwRate', name: 'DCW Rate', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true },
  { id: 'upd933.dcoDepth', name: 'Pitch Env', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true },
  { id: 'upd933.ringMod', name: 'Ring Mod', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 0, index: 6, isAutomatable: true },
  { id: 'upd933.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.8, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// MAME: CEM3394 (Curtis analog synth voice)
// ============================================================================
export const CEM3394_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'cem3394.waveSelect', name: 'Waveform', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 7, defaultValue: 2, valueStrings: ['Off', 'Tri', 'Saw', 'Tri+Saw', 'Pulse', 'Tri+Pls', 'Saw+Pls', 'All'], page: 0, index: 0, isAutomatable: true },
  { id: 'cem3394.pulseWidth', name: 'Pulse Wid', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true },
  { id: 'cem3394.filterCutoff', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.8, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true },
  { id: 'cem3394.filterReso', name: 'Resonance', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true },
  { id: 'cem3394.modAmount', name: 'Filter FM', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true },
  { id: 'cem3394.mixerBalance', name: 'Mix Bal', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true },
  { id: 'cem3394.vcoFreq', name: 'VCO Freq', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true },
  { id: 'cem3394.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.8, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// VSTBridge: Vital (top 8 params from 774)
// ============================================================================
export const VITAL_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'vital.osc1WaveFrame', name: 'Osc1 Wave', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true },
  { id: 'vital.filter1Cutoff', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true },
  { id: 'vital.filter1Reso', name: 'Resonance', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true },
  { id: 'vital.env1Attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: 's', formatString: '%.2f', page: 0, index: 3, isAutomatable: true },
  { id: 'vital.env1Decay', name: 'Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 0, index: 4, isAutomatable: true },
  { id: 'vital.env1Sustain', name: 'Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true },
  { id: 'vital.env1Release', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 0, index: 6, isAutomatable: true },
  { id: 'vital.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// VSTBridge: Odin2 (top 8 params from 119)
// ============================================================================
export const ODIN2_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'odin2.osc1Type', name: 'Osc1 Type', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 11, defaultValue: 0, page: 0, index: 0, isAutomatable: true },
  { id: 'odin2.filter1Freq', name: 'Flt Freq', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true },
  { id: 'odin2.filter1Reso', name: 'Flt Reso', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true },
  { id: 'odin2.env1Attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: 's', formatString: '%.2f', page: 0, index: 3, isAutomatable: true },
  { id: 'odin2.env1Decay', name: 'Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 0, index: 4, isAutomatable: true },
  { id: 'odin2.env1Sustain', name: 'Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true },
  { id: 'odin2.env1Release', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 0, index: 6, isAutomatable: true },
  { id: 'odin2.masterVol', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// VSTBridge: Surge XT (top 8 params from 766)
// ============================================================================
export const SURGE_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'surge.osc1Type', name: 'Osc Type', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 11, defaultValue: 0, page: 0, index: 0, isAutomatable: true },
  { id: 'surge.filterCutoff', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true },
  { id: 'surge.filterReso', name: 'Resonance', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true },
  { id: 'surge.envAttack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: 's', formatString: '%.2f', page: 0, index: 3, isAutomatable: true },
  { id: 'surge.envDecay', name: 'Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 0, index: 4, isAutomatable: true },
  { id: 'surge.envSustain', name: 'Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true },
  { id: 'surge.envRelease', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 0, index: 6, isAutomatable: true },
  { id: 'surge.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// VSTBridge: Monique (top 8 from 120 morphing monosynth params)
// ============================================================================
export const MONIQUE_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'monique.osc1Wave', name: 'Osc1 Wave', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true },
  { id: 'monique.filter1Cutoff', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true },
  { id: 'monique.filter1Reso', name: 'Resonance', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true },
  { id: 'monique.filter1Dist', name: 'Distortion', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true },
  { id: 'monique.envAttack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: 's', formatString: '%.2f', page: 0, index: 4, isAutomatable: true },
  { id: 'monique.envRelease', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: 's', formatString: '%.2f', page: 0, index: 5, isAutomatable: true },
  { id: 'monique.glide', name: 'Glide', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true },
  { id: 'monique.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// VSTBridge: TonewheelOrgan (9 drawbars + controls)
// ============================================================================
export const TONEWHEEL_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'tonewheel.drawbar16', name: "16'", section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 8, defaultValue: 8, page: 0, index: 0, isAutomatable: true },
  { id: 'tonewheel.drawbar8', name: "8'", section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 8, defaultValue: 8, page: 0, index: 1, isAutomatable: true },
  { id: 'tonewheel.drawbar4', name: "4'", section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 8, defaultValue: 0, page: 0, index: 2, isAutomatable: true },
  { id: 'tonewheel.percMode', name: 'Perc Mode', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 2, defaultValue: 0, valueStrings: ['Off', '2nd', '3rd'], page: 0, index: 3, isAutomatable: true },
  { id: 'tonewheel.vibratoType', name: 'Vib Type', section: NKSSection.LFO, type: NKSParameterType.SELECTOR, min: 0, max: 5, defaultValue: 0, valueStrings: ['V1', 'V2', 'V3', 'C1', 'C2', 'C3'], page: 0, index: 4, isAutomatable: true },
  { id: 'tonewheel.click', name: 'Click', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true },
  { id: 'tonewheel.overdrive', name: 'Overdrive', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true },
  { id: 'tonewheel.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
];

// ============================================================================
// VSTBridge: Melodica (reed instrument)
// ============================================================================
export const MELODICA_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'melodica.breath', name: 'Breath', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true },
  { id: 'melodica.brightness', name: 'Brightness', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true },
  { id: 'melodica.vibratoRate', name: 'Vib Rate', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 10, defaultValue: 4, unit: 'Hz', formatString: '%.1f', page: 0, index: 2, isAutomatable: true },
  { id: 'melodica.vibratoDepth', name: 'Vib Depth', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true },
  { id: 'melodica.detune', name: 'Detune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: -50, max: 50, defaultValue: 0, unit: 'ct', formatString: '%.0f', page: 0, index: 4, isAutomatable: true },
  { id: 'melodica.noise', name: 'Noise', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.1, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true },
  { id: 'melodica.portamento', name: 'Portamento', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true },
  { id: 'melodica.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true },
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

  // Buzzmachines - each with dedicated parameter maps
  'Buzz3o3': TB303_NKS_PARAMETERS,
  'BuzzM3': BUZZM3_NKS_PARAMETERS,
  'Buzz4FM2F': FURNACE_FM_NKS_PARAMETERS,
  'BuzzDynamite6': BUZZDYNAMITE6_NKS_PARAMETERS,
  'BuzzKick': BUZZKICK_NKS_PARAMETERS,
  'BuzzKickXP': BUZZKICKXP_NKS_PARAMETERS,
  'BuzzTrilok': BUZZTRILOK_NKS_PARAMETERS,
  'BuzzNoise': NOISESYNTH_NKS_PARAMETERS,
  'BuzzFreqBomb': BUZZFREQBOMB_NKS_PARAMETERS,
  'BuzzDTMF': BUZZDTMF_NKS_PARAMETERS,
  'Buzzmachine': BUZZM3_NKS_PARAMETERS,

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
  'BuzzM4': BUZZM4_NKS_PARAMETERS,

  // VSTBridge synths - dedicated parameter maps
  'DexedBridge': DEXED_NKS_PARAMETERS,
  'TonewheelOrgan': TONEWHEEL_NKS_PARAMETERS,
  'Melodica': MELODICA_NKS_PARAMETERS,
  'Vital': VITAL_NKS_PARAMETERS,
  'Odin2': ODIN2_NKS_PARAMETERS,
  'Surge': SURGE_NKS_PARAMETERS,
  'Monique': MONIQUE_NKS_PARAMETERS,

  // WAM plugin (generic until auto-profiled at runtime)
  'WAM': GENERIC_NKS_PARAMETERS,

  // Multi-sample / Module playback
  'DrumKit': DRUMMACHINE_NKS_PARAMETERS,
  'ChiptuneModule': SAMPLER_NKS_PARAMETERS,

  // MAME dedicated synth engines
  'CEM3394': CEM3394_NKS_PARAMETERS,
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

  // MAME synths (speech synthesis) - dedicated parameter maps
  'MAMEMEA8000': MEA8000_NKS_PARAMETERS,
  'MAMESP0250': SP0250_NKS_PARAMETERS,
  'MAMETMS5220': TMS5220_NKS_PARAMETERS,
  'MAMEUPD931': UPD931_NKS_PARAMETERS,
  'MAMEUPD933': UPD933_NKS_PARAMETERS,
  'MAMEVotrax': VOTRAX_NKS_PARAMETERS,
};

/**
 * Get NKS parameters for a synth type
 */
export function getNKSParametersForSynth(synthType: SynthType): NKSParameter[] {
  return SYNTH_PARAMETER_MAPS[synthType] || GENERIC_NKS_PARAMETERS;
}

// ============================================================================
// NKS2 PRODUCT VISUAL IDENTITY
// Per-synth color, shortname, and control color for NI hardware display
// ============================================================================

export interface SynthVisualIdentity {
  color: string;         // Background color (hex)
  controlColor: number;  // NI display accent color (0xRRGGBB)
  shortName: string;     // Max 12 chars per SDK spec
}

export const SYNTH_VISUAL_IDENTITY: Partial<Record<SynthType, SynthVisualIdentity>> = {
  'TB303':        { color: '#FF6600', controlColor: 0xFF6600, shortName: 'TB303' },
  'Dexed':        { color: '#3366FF', controlColor: 0x3366FF, shortName: 'Dexed' },
  'OBXd':         { color: '#CC3333', controlColor: 0xCC3333, shortName: 'OB-Xd' },
  'V2':           { color: '#8833CC', controlColor: 0x8833CC, shortName: 'V2 Synth' },
  'MonoSynth':    { color: '#00CC66', controlColor: 0x00CC66, shortName: 'MonoSynth' },
  'DuoSynth':     { color: '#009999', controlColor: 0x009999, shortName: 'DuoSynth' },
  'PolySynth':    { color: '#6633CC', controlColor: 0x6633CC, shortName: 'PolySynth' },
  'FMSynth':      { color: '#CC6600', controlColor: 0xCC6600, shortName: 'FM Synth' },
  'AMSynth':      { color: '#CC9900', controlColor: 0xCC9900, shortName: 'AM Synth' },
  'SuperSaw':     { color: '#FF3366', controlColor: 0xFF3366, shortName: 'SuperSaw' },
  'Organ':        { color: '#996633', controlColor: 0x996633, shortName: 'Organ' },
  'DrumMachine':  { color: '#CC0033', controlColor: 0xCC0033, shortName: 'DrumMachine' },
  'ChipSynth':    { color: '#33CC33', controlColor: 0x33CC33, shortName: 'ChipSynth' },
  'WobbleBass':   { color: '#FF0066', controlColor: 0xFF0066, shortName: 'WobbleBass' },
  'StringMachine': { color: '#663399', controlColor: 0x663399, shortName: 'StringMach' },
  'GranularSynth': { color: '#339999', controlColor: 0x339999, shortName: 'Granular' },
  'Wavetable':    { color: '#3399CC', controlColor: 0x3399CC, shortName: 'Wavetable' },
  'DubSiren':     { color: '#FF3300', controlColor: 0xFF3300, shortName: 'DubSiren' },
  'SpaceLaser':   { color: '#00CCFF', controlColor: 0x00CCFF, shortName: 'SpaceLaser' },
  'Synare':       { color: '#FF6633', controlColor: 0xFF6633, shortName: 'Synare' },
  'Vital':        { color: '#FF00CC', controlColor: 0xFF00CC, shortName: 'Vital' },
  'Odin2':        { color: '#6600CC', controlColor: 0x6600CC, shortName: 'Odin2' },
  'Surge':        { color: '#0066CC', controlColor: 0x0066CC, shortName: 'Surge' },
  'Monique':      { color: '#CC0066', controlColor: 0xCC0066, shortName: 'Monique' },
  'Sam':          { color: '#66CC00', controlColor: 0x66CC00, shortName: 'Sam' },
};

const DEFAULT_VISUAL_IDENTITY: SynthVisualIdentity = {
  color: '#1A1A2E', controlColor: 0x00DDFF, shortName: 'DEViLBOX',
};

export function getSynthVisualIdentity(synthType: SynthType): SynthVisualIdentity {
  return SYNTH_VISUAL_IDENTITY[synthType] || DEFAULT_VISUAL_IDENTITY;
}

/**
 * Build NKS pages from parameters
 */
export function buildNKSPages(parameters: NKSParameter[]): NKSPage[] {
  const pageMap = new Map<number, NKSParameter[]>();

  for (const param of parameters) {
    // Skip non-automatable params (e.g. sampler.baseUrl) — they aren't knob-mappable
    if (param.isAutomatable === false) continue;
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
// SDK-standard waveform display_values that trigger hardware icons on Kontrol MK3
const WAVEFORM_VALUE_MAP: Record<string, string> = {
  'saw': 'saw', 'sawtooth': 'saw', 'ramp': 'saw',
  'square': 'square', 'pulse': 'square', 'pwm': 'pwm',
  'triangle': 'triangle', 'tri': 'triangle',
  'sine': 'sine', 'sin': 'sine',
  'noise': 'noise', 's&h': 'noise', 'random': 'noise',
  'wavetable': 'wavetable', 'wt': 'wavetable',
  'fm': 'complex', 'complex': 'complex',
  'off': 'default',
};

// SDK-standard filter type display_values
const FILTER_VALUE_MAP: Record<string, string> = {
  'low': 'lo_pass', 'lowpass': 'lo_pass', 'lp': 'lo_pass', 'lpf': 'lo_pass', 'moogl': 'lo_pass',
  'high': 'hi_pass', 'highpass': 'hi_pass', 'hp': 'hi_pass', 'hpf': 'hi_pass', 'moogh': 'hi_pass',
  'band': 'band_pass', 'bandpass': 'band_pass', 'bp': 'band_pass', 'bpf': 'band_pass',
  'notch': 'band_reject', 'bandreject': 'band_reject', 'br': 'band_reject',
  'all': 'all_pass', 'allpass': 'all_pass', 'ap': 'all_pass',
  'comb': 'comb',
  'off': 'default',
};

/**
 * Map raw valueStrings to SDK-standard display_values for hardware icon rendering.
 */
function mapDisplayValues(valueStrings: string[], mapping: Record<string, string>): string[] {
  return valueStrings.map(v => {
    const key = v.toLowerCase().replace(/[^a-z0-9&]/g, '');
    return mapping[key] || 'default';
  });
}

export function inferNKS2PDI(param: NKSParameter): NKS2PDI {
  // If param already has explicit PDI, use it
  if (param.pdi) return param.pdi;

  switch (param.type) {
    case NKSParameterType.BOOLEAN: {
      // Detect tempo sync toggles
      const lowerName = param.name.toLowerCase();
      if (lowerName.includes('sync') || lowerName.includes('tempo')) {
        return { type: 'toggle', style: 'temposync' };
      }
      return { type: 'toggle', style: 'power' };
    }

    case NKSParameterType.SELECTOR: {
      const count = param.valueStrings?.length ?? Math.round(param.max - param.min + 1);
      const lowerName = param.name.toLowerCase();
      let style: NKS2PDI['style'] = count > 20 ? 'menuXL' : 'menu';
      let display_values = param.valueStrings;

      // Detect waveform selectors
      if (lowerName.includes('wave') || lowerName.includes('osc type') || lowerName.includes('waveform')
        || lowerName.includes('shape') || (lowerName.includes('osc') && lowerName.includes('mode'))) {
        style = 'waveform';
        if (param.valueStrings) {
          display_values = mapDisplayValues(param.valueStrings, WAVEFORM_VALUE_MAP);
        }
      // Detect filter type selectors
      } else if ((lowerName.includes('filt') || lowerName.includes('flt'))
        && (lowerName.includes('mode') || lowerName.includes('type') || lowerName.includes('select'))) {
        style = 'filterType';
        if (param.valueStrings) {
          display_values = mapDisplayValues(param.valueStrings, FILTER_VALUE_MAP);
        }
      // Detect LFO waveform selectors
      } else if (lowerName.includes('lfo') && (lowerName.includes('wave') || lowerName.includes('shape'))) {
        style = 'waveform';
        if (param.valueStrings) {
          display_values = mapDisplayValues(param.valueStrings, WAVEFORM_VALUE_MAP);
        }
      }

      return {
        type: 'discrete',
        style,
        value_count: count,
        display_values,
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
    ...(param.accessibilityName ? { accessibilityName: param.accessibilityName } : {}),
  };
}

// NKS2 Edit Group ordering — maps NKSSection to a display order and group name
const SECTION_GROUP_ORDER: Record<string, { order: number; groupName: string }> = {
  [NKSSection.SYNTHESIS]: { order: 0, groupName: 'Oscillator' },
  [NKSSection.FILTER]: { order: 1, groupName: 'Filter' },
  [NKSSection.ENVELOPE]: { order: 2, groupName: 'Envelope' },
  [NKSSection.LFO]: { order: 3, groupName: 'LFO' },
  [NKSSection.MODULATION]: { order: 4, groupName: 'Modulation' },
  [NKSSection.EFFECTS]: { order: 5, groupName: 'Effects' },
  [NKSSection.SEQUENCER]: { order: 6, groupName: 'Sequencer' },
  [NKSSection.ARP]: { order: 7, groupName: 'Arpeggiator' },
  [NKSSection.MACRO]: { order: 8, groupName: 'Macro' },
  [NKSSection.MIXER]: { order: 9, groupName: 'Mixer' },
  [NKSSection.OUTPUT]: { order: 10, groupName: 'Output' },
};

/**
 * Build proper hierarchical NKS2 Edit Groups from NKS1 parameters.
 * Groups params by NKSSection, then subdivides into subsections using
 * the param's `subsection` hint or auto-detected clusters (e.g., "Osc 1" vs "Osc 2",
 * "Amp Env" vs "Filter Env"). Enforces SDK limit of 48 params per group.
 */
export function buildNKS2EditGroups(nks1Params: NKSParameter[]): NKS2EditGroup[] {
  // Group params by their NKSSection
  const sectionMap = new Map<string, NKSParameter[]>();
  for (const param of nks1Params) {
    if (param.isAutomatable === false) continue;
    const key = param.section;
    if (!sectionMap.has(key)) sectionMap.set(key, []);
    sectionMap.get(key)!.push(param);
  }

  const editGroups: NKS2EditGroup[] = [];

  for (const [sectionKey, params] of sectionMap.entries()) {
    const groupInfo = SECTION_GROUP_ORDER[sectionKey] || { order: 99, groupName: sectionKey };

    // Subdivide into subsections by explicit `subsection` hint or auto-detect
    const subsectionMap = new Map<string, NKSParameter[]>();
    for (const param of params) {
      const sub = param.subsection || inferSubsection(param, sectionKey);
      if (!subsectionMap.has(sub)) subsectionMap.set(sub, []);
      subsectionMap.get(sub)!.push(param);
    }

    // Build sections preserving original param order (by page, then index)
    const sections: NKS2EditSection[] = [];
    for (const [subName, subParams] of subsectionMap.entries()) {
      subParams.sort((a, b) => a.page !== b.page ? a.page - b.page : a.index - b.index);
      sections.push({
        name: subName,
        parameters: subParams.map(toNKS2Parameter),
      });
    }

    // Enforce SDK limit: max 48 params per group. If over, split into numbered groups.
    const totalParams = sections.reduce((sum, s) => sum + s.parameters.length, 0);
    if (totalParams <= 48) {
      editGroups.push({ name: groupInfo.groupName, sections, _order: groupInfo.order } as NKS2EditGroup & { _order: number });
    } else {
      // Split sections into chunks that fit within 48 params
      let chunk: NKS2EditSection[] = [];
      let chunkCount = 0;
      let groupNum = 1;
      for (const section of sections) {
        if (chunkCount + section.parameters.length > 48 && chunk.length > 0) {
          editGroups.push({ name: `${groupInfo.groupName} ${groupNum}`, sections: chunk, _order: groupInfo.order + (groupNum - 1) * 0.01 } as NKS2EditGroup & { _order: number });
          groupNum++;
          chunk = [];
          chunkCount = 0;
        }
        chunk.push(section);
        chunkCount += section.parameters.length;
      }
      if (chunk.length > 0) {
        const name = groupNum > 1 ? `${groupInfo.groupName} ${groupNum}` : groupInfo.groupName;
        editGroups.push({ name, sections: chunk, _order: groupInfo.order + (groupNum - 1) * 0.01 } as NKS2EditGroup & { _order: number });
      }
    }
  }

  // Sort by synth-logical order (Osc → Filter → Env → LFO → FX → Output)
  editGroups.sort((a, b) => ((a as any)._order ?? 99) - ((b as any)._order ?? 99));

  // Strip internal _order property
  return editGroups.map(({ name, sections }) => ({ name, sections }));
}

/**
 * Auto-detect subsection from param name patterns when no explicit hint is set.
 * E.g., "Osc1 Wave" → "Osc 1", "Amp Attack" → "Amp Env", "Flt1 Cutoff" → "Filter 1"
 */
function inferSubsection(param: NKSParameter, sectionKey: string): string {
  const name = param.name;

  // Oscillator subsections: Osc1/Osc2 patterns
  if (sectionKey === NKSSection.SYNTHESIS) {
    if (/\bOsc\s*1\b/i.test(name)) return 'Osc 1';
    if (/\bOsc\s*2\b/i.test(name)) return 'Osc 2';
    if (/\bOsc\s*3\b/i.test(name)) return 'Osc 3';
  }

  // Filter subsections: Flt1/Flt2 or Filter 1/2
  if (sectionKey === NKSSection.FILTER) {
    if (/\bFlt\s*1\b/i.test(name) || /\bFilter\s*1\b/i.test(name)) return 'Filter 1';
    if (/\bFlt\s*2\b/i.test(name) || /\bFilter\s*2\b/i.test(name)) return 'Filter 2';
  }

  // Envelope subsections: Amp vs Filter envelopes
  if (sectionKey === NKSSection.ENVELOPE) {
    if (/\bAmp\b/i.test(name)) return 'Amp Env';
    if (/\bFlt\b/i.test(name) || /\bFilter\b/i.test(name) || /\bFil\b/i.test(name)) return 'Filter Env';
    if (/\bEnv\s*2\b/i.test(name) || /\bMod\s*Env\b/i.test(name)) return 'Mod Env';
    if (/\bEnv\s*3\b/i.test(name)) return 'Env 3';
  }

  // Effects subsections: Delay, Reverb, Distortion, Chorus, etc.
  if (sectionKey === NKSSection.EFFECTS) {
    if (/\bDelay\b/i.test(name)) return 'Delay';
    if (/\bReverb\b/i.test(name)) return 'Reverb';
    if (/\bDist\b/i.test(name) || /\bDrive\b/i.test(name)) return 'Distortion';
    if (/\bChorus\b/i.test(name)) return 'Chorus';
    if (/\bPhaser\b/i.test(name)) return 'Phaser';
    if (/\bFlanger\b/i.test(name)) return 'Flanger';
  }

  // LFO subsections
  if (sectionKey === NKSSection.LFO) {
    if (/\bLFO\s*1\b/i.test(name)) return 'LFO 1';
    if (/\bLFO\s*2\b/i.test(name)) return 'LFO 2';
    if (/\bLFO\s*3\b/i.test(name)) return 'LFO 3';
  }

  // Default: use the group name itself as subsection
  const groupInfo = SECTION_GROUP_ORDER[sectionKey];
  return groupInfo?.groupName || sectionKey;
}

/**
 * Build an NKS2 synth profile from an NKS1 parameter array.
 * Performance mode uses pages 0-1 (first 8-16 most important params).
 * Edit mode uses hierarchical groups organized by NKSSection with subsections.
 */
export function buildNKS2Profile(synthType: SynthType): NKS2SynthProfile {
  const nks1Params = getNKSParametersForSynth(synthType);
  const nks2Params = nks1Params.filter(p => p.isAutomatable !== false).map(toNKS2Parameter);

  // Build performance sections from NKS1 pages 0-1 (max 16 params)
  const pages = buildNKSPages(nks1Params);
  const performance: NKS2PerformanceSection[] = pages.slice(0, 2).map(page => ({
    name: page.name,
    parameters: page.parameters.map(toNKS2Parameter),
  }));

  // Build proper hierarchical edit groups from all params
  const editGroups = buildNKS2EditGroups(nks1Params);

  const navigation: NKS2Navigation = {
    performance,
    editGroups: editGroups.length > 0 ? editGroups : undefined,
  };

  return {
    synthType,
    parameters: nks2Params,
    navigation,
    controlColor: getSynthVisualIdentity(synthType).controlColor,
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
