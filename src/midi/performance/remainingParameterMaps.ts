/**
 * NKS Parameter Maps — Remaining Synth Types
 *
 * Drum machines (TR808/TR909), MAME chips, D50, playback engines,
 * demoscene synths (WaveSabre, Oidos, Tunefish), and ZXTune/Sc68.
 */
import type { NKSParameter } from './types';
import { NKSParameterType, NKSSection } from './types';

// ─────────────────────────────────────────────────────
// TR-808 Drum Machine
// ─────────────────────────────────────────────────────

export const TR808_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Kick, Snare, HiHat
  { id: 'tr808.kick.tune', name: 'Kick Tune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true, accessibilityName: 'Kick Drum Tune' },
  { id: 'tr808.kick.decay', name: 'Kick Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true, accessibilityName: 'Kick Drum Decay' },
  { id: 'tr808.kick.level', name: 'Kick Level', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.8, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 7, isAutomatable: true, accessibilityName: 'Kick Drum Level' },
  { id: 'tr808.snare.tune', name: 'Snare Tune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true, accessibilityName: 'Snare Drum Tune' },
  { id: 'tr808.snare.snappy', name: 'Snare Snap', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true, accessibilityName: 'Snare Drum Snappy' },
  { id: 'tr808.snare.decay', name: 'Snare Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true, accessibilityName: 'Snare Drum Decay' },
  { id: 'tr808.hihat.tune', name: 'HiHat Tune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true, accessibilityName: 'Hi-Hat Tune' },
  { id: 'tr808.hihat.decay', name: 'HiHat Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true, accessibilityName: 'Hi-Hat Decay' },
  // Page 1: Tom, Clap, Rim, Global
  { id: 'tr808.tom.tune', name: 'Tom Tune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 0, isAutomatable: true, accessibilityName: 'Tom Drum Tune' },
  { id: 'tr808.tom.decay', name: 'Tom Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 1, isAutomatable: true, accessibilityName: 'Tom Drum Decay' },
  { id: 'tr808.clap.tone', name: 'Clap Tone', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 2, isAutomatable: true, accessibilityName: 'Clap Tone' },
  { id: 'tr808.rim.tone', name: 'Rim Tone', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 3, isAutomatable: true, accessibilityName: 'Rimshot Tone' },
  { id: 'tr808.accent', name: 'Accent', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 4, isAutomatable: true, accessibilityName: 'Accent Amount' },
  { id: 'tr808.swing', name: 'Swing', section: NKSSection.SEQUENCER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 5, isAutomatable: true, accessibilityName: 'Swing Amount' },
  { id: 'tr808.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 1, index: 6, ccNumber: 7, isAutomatable: true, accessibilityName: 'Master Volume' },
  { id: 'tr808.tempo', name: 'Tempo', section: NKSSection.SEQUENCER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 7, isAutomatable: true, accessibilityName: 'Tempo' },
];

// ─────────────────────────────────────────────────────
// TR-909 Drum Machine
// ─────────────────────────────────────────────────────

export const TR909_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Kick, Snare, HiHat
  { id: 'tr909.kick.tune', name: 'Kick Tune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true, accessibilityName: 'Kick Drum Tune' },
  { id: 'tr909.kick.decay', name: 'Kick Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true, accessibilityName: 'Kick Drum Decay' },
  { id: 'tr909.kick.level', name: 'Kick Level', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.8, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 7, isAutomatable: true, accessibilityName: 'Kick Drum Level' },
  { id: 'tr909.snare.tune', name: 'Snare Tune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true, accessibilityName: 'Snare Drum Tune' },
  { id: 'tr909.snare.snappy', name: 'Snare Snap', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true, accessibilityName: 'Snare Drum Snappy' },
  { id: 'tr909.snare.decay', name: 'Snare Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true, accessibilityName: 'Snare Drum Decay' },
  { id: 'tr909.hihat.tune', name: 'HiHat Tune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true, accessibilityName: 'Hi-Hat Tune' },
  { id: 'tr909.hihat.decay', name: 'HiHat Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true, accessibilityName: 'Hi-Hat Decay' },
  // Page 1: Tom, Clap, Rim, Global
  { id: 'tr909.tom.tune', name: 'Tom Tune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 0, isAutomatable: true, accessibilityName: 'Tom Drum Tune' },
  { id: 'tr909.tom.decay', name: 'Tom Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 1, isAutomatable: true, accessibilityName: 'Tom Drum Decay' },
  { id: 'tr909.clap.tone', name: 'Clap Tone', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 2, isAutomatable: true, accessibilityName: 'Clap Tone' },
  { id: 'tr909.rim.tone', name: 'Rim Tone', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 3, isAutomatable: true, accessibilityName: 'Rimshot Tone' },
  { id: 'tr909.accent', name: 'Accent', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 4, isAutomatable: true, accessibilityName: 'Accent Amount' },
  { id: 'tr909.swing', name: 'Swing', section: NKSSection.SEQUENCER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 5, isAutomatable: true, accessibilityName: 'Swing Amount' },
  { id: 'tr909.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 1, index: 6, ccNumber: 7, isAutomatable: true, accessibilityName: 'Master Volume' },
  { id: 'tr909.tempo', name: 'Tempo', section: NKSSection.SEQUENCER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 7, isAutomatable: true, accessibilityName: 'Tempo' },
];

// ─────────────────────────────────────────────────────
// MAME CMI (Fairlight CMI)
// ─────────────────────────────────────────────────────

export const MAMECMI_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Amp, Envelope, Filter
  { id: 'mamecmi.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 7, isAutomatable: true, accessibilityName: 'Master Volume' },
  { id: 'mamecmi.attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.01, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 73, isAutomatable: true, accessibilityName: 'Amplitude Attack Time' },
  { id: 'mamecmi.decay', name: 'Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true, accessibilityName: 'Amplitude Decay Time' },
  { id: 'mamecmi.sustain', name: 'Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true, accessibilityName: 'Amplitude Sustain Level' },
  { id: 'mamecmi.release', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.2, unit: '%', formatString: '%.0f%%', page: 0, index: 4, ccNumber: 72, isAutomatable: true, accessibilityName: 'Amplitude Release Time' },
  { id: 'mamecmi.vibRate', name: 'Vib Rate', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true, accessibilityName: 'Vibrato Rate' },
  { id: 'mamecmi.vibDepth', name: 'Vib Depth', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true, accessibilityName: 'Vibrato Depth' },
  { id: 'mamecmi.filterCutoff', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 1.0, unit: '%', formatString: '%.0f%%', page: 0, index: 7, ccNumber: 74, isAutomatable: true, accessibilityName: 'Filter Cutoff Frequency' },
];

// ─────────────────────────────────────────────────────
// MAME PCM/Sample Chips (shared)
// Used by: MAMEFZPCM, MAMEHC55516, MAMEKS0164, MAMEMultiPCM,
//   MAMEPS1SPU, MAMERolandGP, MAMES14001A, MAMESWP00,
//   MAMESWP20, MAMEVLM5030, MAMEZSG2
// ─────────────────────────────────────────────────────

export const MAME_PCM_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Core sample playback controls
  { id: 'mamepcm.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 7, isAutomatable: true, accessibilityName: 'Master Volume' },
  { id: 'mamepcm.pan', name: 'Pan', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 10, isAutomatable: true, accessibilityName: 'Stereo Panning' },
  { id: 'mamepcm.attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 73, isAutomatable: true, accessibilityName: 'Amplitude Attack Time' },
  { id: 'mamepcm.release', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.1, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 72, isAutomatable: true, accessibilityName: 'Amplitude Release Time' },
  { id: 'mamepcm.tune', name: 'Tune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true, accessibilityName: 'Sample Pitch Tune' },
  { id: 'mamepcm.filterCutoff', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 1.0, unit: '%', formatString: '%.0f%%', page: 0, index: 5, ccNumber: 74, isAutomatable: true, accessibilityName: 'Filter Cutoff Frequency' },
  { id: 'mamepcm.resonance', name: 'Resonance', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 6, ccNumber: 71, isAutomatable: true, accessibilityName: 'Filter Resonance' },
  { id: 'mamepcm.reverb', name: 'Reverb', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true, accessibilityName: 'Reverb Send Level' },
];

// ─────────────────────────────────────────────────────
// Roland D-50 / Ensoniq VFX
// ─────────────────────────────────────────────────────

export const D50_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Core sound shaping
  { id: 'd50.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 7, isAutomatable: true, accessibilityName: 'Master Volume' },
  { id: 'd50.cutoff', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 74, isAutomatable: true, accessibilityName: 'Filter Cutoff Frequency' },
  { id: 'd50.resonance', name: 'Resonance', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 71, isAutomatable: true, accessibilityName: 'Filter Resonance' },
  { id: 'd50.attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.1, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 73, isAutomatable: true, accessibilityName: 'Amplitude Attack Time' },
  { id: 'd50.decay', name: 'Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.4, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true, accessibilityName: 'Amplitude Decay Time' },
  { id: 'd50.sustain', name: 'Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.6, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true, accessibilityName: 'Amplitude Sustain Level' },
  { id: 'd50.release', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 0, index: 6, ccNumber: 72, isAutomatable: true, accessibilityName: 'Amplitude Release Time' },
  { id: 'd50.chorus', name: 'Chorus', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true, accessibilityName: 'Chorus Depth' },
  // Page 1: Modulation & Effects
  { id: 'd50.reverbLevel', name: 'Reverb Lvl', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 1, index: 0, isAutomatable: true, accessibilityName: 'Reverb Level' },
  { id: 'd50.lfoRate', name: 'LFO Rate', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 1, index: 1, isAutomatable: true, accessibilityName: 'LFO Rate' },
  { id: 'd50.lfoDepth', name: 'LFO Depth', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 2, isAutomatable: true, accessibilityName: 'LFO Depth' },
  { id: 'd50.detune', name: 'Detune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 3, isAutomatable: true, accessibilityName: 'Oscillator Detune' },
  { id: 'd50.pan', name: 'Pan', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 4, ccNumber: 10, isAutomatable: true, accessibilityName: 'Stereo Panning' },
  { id: 'd50.brightness', name: 'Brightness', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 5, isAutomatable: true, accessibilityName: 'Tone Brightness' },
  { id: 'd50.tone', name: 'Tone', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 6, isAutomatable: true, accessibilityName: 'Tone Character' },
  { id: 'd50.portamento', name: 'Portamento', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 7, isAutomatable: true, accessibilityName: 'Portamento Time' },
];

// ─────────────────────────────────────────────────────
// ZXTune — Chiptune module playback
// ─────────────────────────────────────────────────────

export const ZXTUNE_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Playback controls
  { id: 'zxtune.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 7, isAutomatable: true, accessibilityName: 'Master Volume' },
  { id: 'zxtune.subsong', name: 'Subsong', section: NKSSection.SEQUENCER, type: NKSParameterType.INT, min: 0, max: 1, defaultValue: 0, formatString: '%.0f', page: 0, index: 1, isAutomatable: true, accessibilityName: 'Subsong Selection' },
  { id: 'zxtune.tempo', name: 'Tempo', section: NKSSection.SEQUENCER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true, accessibilityName: 'Playback Tempo' },
];

// ─────────────────────────────────────────────────────
// WaveSabre — Demoscene synth (Falcon/Slaughter)
// ─────────────────────────────────────────────────────

export const WAVESABRE_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Osc1, Filter, Amp
  { id: 'wavesabre.osc1Waveform', name: 'Osc1 Wave', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true, accessibilityName: 'Oscillator 1 Waveform' },
  { id: 'wavesabre.osc1Coarse', name: 'Osc1 Coarse', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true, accessibilityName: 'Oscillator 1 Coarse Tune' },
  { id: 'wavesabre.feedback', name: 'Feedback', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true, accessibilityName: 'Oscillator Feedback' },
  { id: 'wavesabre.cutoff', name: 'Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 1.0, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 74, isAutomatable: true, accessibilityName: 'Filter Cutoff Frequency' },
  { id: 'wavesabre.resonance', name: 'Resonance', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 4, ccNumber: 71, isAutomatable: true, accessibilityName: 'Filter Resonance' },
  { id: 'wavesabre.gain', name: 'Gain', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 5, ccNumber: 7, isAutomatable: true, accessibilityName: 'Output Gain' },
  { id: 'wavesabre.attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.01, unit: '%', formatString: '%.0f%%', page: 0, index: 6, ccNumber: 73, isAutomatable: true, accessibilityName: 'Amplitude Attack Time' },
  { id: 'wavesabre.release', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 0, index: 7, ccNumber: 72, isAutomatable: true, accessibilityName: 'Amplitude Release Time' },
  // Page 1: Osc2, Filter Env, Spread
  { id: 'wavesabre.osc2Waveform', name: 'Osc2 Wave', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 0, isAutomatable: true, accessibilityName: 'Oscillator 2 Waveform' },
  { id: 'wavesabre.osc2Coarse', name: 'Osc2 Coarse', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 1, isAutomatable: true, accessibilityName: 'Oscillator 2 Coarse Tune' },
  { id: 'wavesabre.filterType', name: 'Filter Type', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 2, isAutomatable: true, accessibilityName: 'Filter Type' },
  { id: 'wavesabre.filterEnvAmount', name: 'Flt Env', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 3, isAutomatable: true, accessibilityName: 'Filter Envelope Amount' },
  { id: 'wavesabre.filterAttack', name: 'Flt Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.01, unit: '%', formatString: '%.0f%%', page: 1, index: 4, isAutomatable: true, accessibilityName: 'Filter Envelope Attack Time' },
  { id: 'wavesabre.filterRelease', name: 'Flt Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 1, index: 5, isAutomatable: true, accessibilityName: 'Filter Envelope Release Time' },
  { id: 'wavesabre.detune', name: 'Detune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 6, isAutomatable: true, accessibilityName: 'Oscillator Detune' },
  { id: 'wavesabre.spread', name: 'Spread', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 7, isAutomatable: true, accessibilityName: 'Stereo Spread' },
];

// ─────────────────────────────────────────────────────
// Oidos — Additive/spectral demoscene synth
// ─────────────────────────────────────────────────────

export const OIDOS_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Spectral shaping
  { id: 'oidos.seed', name: 'Seed', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true, accessibilityName: 'Random Seed' },
  { id: 'oidos.modes', name: 'Modes', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true, accessibilityName: 'Number of Modes' },
  { id: 'oidos.fat', name: 'Fat', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true, accessibilityName: 'Fatness' },
  { id: 'oidos.width', name: 'Width', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true, accessibilityName: 'Spectral Width' },
  { id: 'oidos.overtones', name: 'Overtones', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true, accessibilityName: 'Overtone Count' },
  { id: 'oidos.sharpness', name: 'Sharpness', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true, accessibilityName: 'Spectral Sharpness' },
  { id: 'oidos.harmonicity', name: 'Harmonics', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true, accessibilityName: 'Harmonicity' },
  { id: 'oidos.gain', name: 'Gain', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 7, ccNumber: 7, isAutomatable: true, accessibilityName: 'Output Gain' },
  // Page 1: Decay & Filter slopes
  { id: 'oidos.decayLow', name: 'Decay Low', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 0, isAutomatable: true, accessibilityName: 'Low Frequency Decay' },
  { id: 'oidos.decayHigh', name: 'Decay High', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 1, isAutomatable: true, accessibilityName: 'High Frequency Decay' },
  { id: 'oidos.filterLow', name: 'Filter Low', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 2, isAutomatable: true, accessibilityName: 'Low Frequency Filter' },
  { id: 'oidos.filterHigh', name: 'Filter High', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 1.0, unit: '%', formatString: '%.0f%%', page: 1, index: 3, isAutomatable: true, accessibilityName: 'High Frequency Filter' },
  { id: 'oidos.attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.01, unit: '%', formatString: '%.0f%%', page: 1, index: 4, ccNumber: 73, isAutomatable: true, accessibilityName: 'Attack Time' },
  { id: 'oidos.release', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 1, index: 5, ccNumber: 72, isAutomatable: true, accessibilityName: 'Release Time' },
  { id: 'oidos.filterSlopeLow', name: 'Slope Low', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 6, isAutomatable: true, accessibilityName: 'Low Filter Slope' },
  { id: 'oidos.filterSlopeHigh', name: 'Slope High', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 7, isAutomatable: true, accessibilityName: 'High Filter Slope' },
];

// ─────────────────────────────────────────────────────
// Tunefish — Additive synth
// ─────────────────────────────────────────────────────

export const TUNEFISH_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Generator
  { id: 'tunefish.globalGain', name: 'Gain', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 7, isAutomatable: true, accessibilityName: 'Global Gain' },
  { id: 'tunefish.genBandwidth', name: 'Bandwidth', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true, accessibilityName: 'Generator Bandwidth' },
  { id: 'tunefish.genNumHarmonics', name: 'Harmonics', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true, accessibilityName: 'Number of Harmonics' },
  { id: 'tunefish.genDamp', name: 'Damp', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true, accessibilityName: 'Generator Damping' },
  { id: 'tunefish.genVolume', name: 'Gen Volume', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true, accessibilityName: 'Generator Volume' },
  { id: 'tunefish.genDetune', name: 'Detune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true, accessibilityName: 'Generator Detune' },
  { id: 'tunefish.genDrive', name: 'Drive', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true, accessibilityName: 'Generator Drive' },
  { id: 'tunefish.genUnisono', name: 'Unisono', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true, accessibilityName: 'Generator Unison Voices' },
  // Page 1: Filters & Effects
  { id: 'tunefish.lpFilterCutoff', name: 'LP Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 1.0, unit: '%', formatString: '%.0f%%', page: 1, index: 0, ccNumber: 74, isAutomatable: true, accessibilityName: 'Low-Pass Filter Cutoff' },
  { id: 'tunefish.lpFilterResonance', name: 'LP Reso', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 1, ccNumber: 71, isAutomatable: true, accessibilityName: 'Low-Pass Filter Resonance' },
  { id: 'tunefish.hpFilterCutoff', name: 'HP Cutoff', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 2, isAutomatable: true, accessibilityName: 'High-Pass Filter Cutoff' },
  { id: 'tunefish.noiseAmount', name: 'Noise', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 3, isAutomatable: true, accessibilityName: 'Noise Amount' },
  { id: 'tunefish.distortAmount', name: 'Distortion', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 4, isAutomatable: true, accessibilityName: 'Distortion Amount' },
  { id: 'tunefish.reverbRoomsize', name: 'Reverb Size', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 5, isAutomatable: true, accessibilityName: 'Reverb Room Size' },
  { id: 'tunefish.reverbWet', name: 'Reverb Wet', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 6, isAutomatable: true, accessibilityName: 'Reverb Wet Mix' },
  { id: 'tunefish.delayDecay', name: 'Delay Decay', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 7, isAutomatable: true, accessibilityName: 'Delay Feedback Decay' },
  // Page 2: Modulation & EQ
  { id: 'tunefish.chorusRate', name: 'Chorus Rate', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 2, index: 0, isAutomatable: true, accessibilityName: 'Chorus Rate' },
  { id: 'tunefish.chorusDepth', name: 'Chorus Dpth', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 2, index: 1, isAutomatable: true, accessibilityName: 'Chorus Depth' },
  { id: 'tunefish.flangerFrequency', name: 'Flanger Frq', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 2, index: 2, isAutomatable: true, accessibilityName: 'Flanger Frequency' },
  { id: 'tunefish.flangerWet', name: 'Flanger Wet', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 2, index: 3, isAutomatable: true, accessibilityName: 'Flanger Wet Mix' },
  { id: 'tunefish.eqLow', name: 'EQ Low', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 2, index: 4, isAutomatable: true, accessibilityName: 'Equalizer Low Band' },
  { id: 'tunefish.eqMid', name: 'EQ Mid', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 2, index: 5, isAutomatable: true, accessibilityName: 'Equalizer Mid Band' },
  { id: 'tunefish.eqHigh', name: 'EQ High', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 2, index: 6, isAutomatable: true, accessibilityName: 'Equalizer High Band' },
  { id: 'tunefish.genSpread', name: 'Spread', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 2, index: 7, isAutomatable: true, accessibilityName: 'Generator Stereo Spread' },
];

// ─────────────────────────────────────────────────────
// WASM Replayer NKS Maps — Automatable Internal Params
// ─────────────────────────────────────────────────────

// SoundMon — Brian Postma wavetable synth
// Params route via SoundMonEngine.setInstrumentParam() → _sm_set_instrument_param()
export const SOUNDMON_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'soundmon.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true, accessibilityName: 'Instrument Volume' },
  { id: 'soundmon.lfoSpeed', name: 'LFO Speed', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true, accessibilityName: 'LFO Speed' },
  { id: 'soundmon.lfoDepth', name: 'LFO Depth', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true, accessibilityName: 'LFO Depth' },
  { id: 'soundmon.lfoDelay', name: 'LFO Delay', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true, accessibilityName: 'LFO Delay Time' },
  { id: 'soundmon.adsrSpeed', name: 'ADSR Speed', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true, accessibilityName: 'ADSR Envelope Speed' },
  { id: 'soundmon.adsrControl', name: 'ADSR Ctrl', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true, accessibilityName: 'ADSR Envelope Control' },
  { id: 'soundmon.waveTable', name: 'Wave Table', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '', formatString: '%.0f', page: 0, index: 6, isAutomatable: true, accessibilityName: 'Wave Table Select' },
  { id: 'soundmon.egControl', name: 'EG Control', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '', formatString: '%.0f', page: 0, index: 7, isAutomatable: true, accessibilityName: 'Envelope Generator Control' },
];

// SidMon — SID-like synthesis (vibrato, filter, arpeggio)
// Params route via SidMonSynth.set() → SidMonEngine.sendMessage('setParam') → _smn_set_param()
export const SIDMON_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'sidmon.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true, accessibilityName: 'Instrument Volume' },
  { id: 'sidmon.vibSpeed', name: 'Vib Speed', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true, accessibilityName: 'Vibrato Speed' },
  { id: 'sidmon.vibDepth', name: 'Vib Depth', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true, accessibilityName: 'Vibrato Depth' },
  { id: 'sidmon.vibDelay', name: 'Vib Delay', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true, accessibilityName: 'Vibrato Delay Time' },
  { id: 'sidmon.arpSpeed', name: 'Arp Speed', section: NKSSection.ARP, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true, accessibilityName: 'Arpeggio Speed' },
  { id: 'sidmon.filterCutoff', name: 'Filter Cut', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 1.0, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true, accessibilityName: 'Filter Cutoff' },
  { id: 'sidmon.filterResonance', name: 'Filter Res', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true, accessibilityName: 'Filter Resonance' },
];

// Sonic Arranger — 18-mode wavetable synthesis + ADSR/AMF tables
// Params route via SonicArrangerEngine.setInstrumentParam() → _sa_set_instrument_param()
export const SONIC_ARRANGER_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'sonicarranger.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true, accessibilityName: 'Instrument Volume' },
  { id: 'sonicarranger.vibratoSpeed', name: 'Vib Speed', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true, accessibilityName: 'Vibrato Speed' },
  { id: 'sonicarranger.vibratoLevel', name: 'Vib Level', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true, accessibilityName: 'Vibrato Level' },
  { id: 'sonicarranger.vibratoDelay', name: 'Vib Delay', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true, accessibilityName: 'Vibrato Delay' },
  { id: 'sonicarranger.portamentoSpeed', name: 'Portamento', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true, accessibilityName: 'Portamento Speed' },
  { id: 'sonicarranger.fineTuning', name: 'Fine Tune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: -1, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true, accessibilityName: 'Fine Tuning' },
  { id: 'sonicarranger.effect', name: 'Effect', section: NKSSection.EFFECTS, type: NKSParameterType.INT, min: 0, max: 17, defaultValue: 0, page: 0, index: 6, isAutomatable: true, accessibilityName: 'Synthesis Effect Type' },
  { id: 'sonicarranger.effectArg1', name: 'FX Arg 1', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true, accessibilityName: 'Effect Argument 1' },
];

// CheeseCutter — SID 6581/8580 via direct register writes
// Params route via CheeseCutterEngine.writeByte() → worklet 'writeByte' → _cc_write_byte()
export const CHEESECUTTER_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'cheesecutter.filterCutoff', name: 'Filter Cut', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true, accessibilityName: 'SID Filter Cutoff' },
  { id: 'cheesecutter.filterResonance', name: 'Filter Res', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true, accessibilityName: 'SID Filter Resonance' },
  { id: 'cheesecutter.filterMode', name: 'Filter Mode', section: NKSSection.FILTER, type: NKSParameterType.INT, min: 0, max: 7, defaultValue: 1, page: 0, index: 2, isAutomatable: true, accessibilityName: 'SID Filter Mode (LP/BP/HP)' },
  { id: 'cheesecutter.masterVolume', name: 'Master Vol', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 1.0, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true, accessibilityName: 'SID Master Volume' },
  { id: 'cheesecutter.voice1PulseWidth', name: 'V1 PW', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true, accessibilityName: 'Voice 1 Pulse Width' },
  { id: 'cheesecutter.voice2PulseWidth', name: 'V2 PW', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true, accessibilityName: 'Voice 2 Pulse Width' },
  { id: 'cheesecutter.voice3PulseWidth', name: 'V3 PW', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true, accessibilityName: 'Voice 3 Pulse Width' },
];

// Hively — HVL/AHX tracker filter + vibrato + PWM
// Params route via HivelySynth.set() → HivelyEngine.sendMessage('setVoiceParam') → _hively_set_voice_param()
export const HIVELY_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'hively.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true, accessibilityName: 'Channel Volume' },
  { id: 'hively.filterSpeed', name: 'Filter Spd', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true, accessibilityName: 'Filter Sweep Speed' },
  { id: 'hively.filterLower', name: 'Filter Lo', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true, accessibilityName: 'Filter Lower Limit' },
  { id: 'hively.filterUpper', name: 'Filter Hi', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 1.0, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true, accessibilityName: 'Filter Upper Limit' },
  { id: 'hively.vibratoSpeed', name: 'Vib Speed', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true, accessibilityName: 'Vibrato Speed' },
  { id: 'hively.vibratoDepth', name: 'Vib Depth', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true, accessibilityName: 'Vibrato Depth' },
  { id: 'hively.squareSpeed', name: 'PWM Speed', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true, accessibilityName: 'Square PWM Speed' },
  { id: 'hively.pan', name: 'Pan', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true, accessibilityName: 'Stereo Panning' },
];

// OctaMED — volume + waveform select (minimal params, replayer owns synthesis)
export const OCTAMED_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'octamed.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true, accessibilityName: 'Channel Volume' },
];

// GTUltra — GoatTracker Ultra SID instrument params
// Params route via GTUltraEngine setter methods
export const GTULTRA_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'gtultra.attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 15, defaultValue: 0, page: 0, index: 0, isAutomatable: true, accessibilityName: 'Attack (SID AD high nibble)' },
  { id: 'gtultra.decay', name: 'Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 15, defaultValue: 9, page: 0, index: 1, isAutomatable: true, accessibilityName: 'Decay (SID AD low nibble)' },
  { id: 'gtultra.sustain', name: 'Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 15, defaultValue: 0, page: 0, index: 2, isAutomatable: true, accessibilityName: 'Sustain (SID SR high nibble)' },
  { id: 'gtultra.release', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 15, defaultValue: 0, page: 0, index: 3, isAutomatable: true, accessibilityName: 'Release (SID SR low nibble)' },
  { id: 'gtultra.firstwave', name: 'Waveform', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 255, defaultValue: 65, page: 0, index: 4, isAutomatable: true, accessibilityName: 'First Waveform Byte' },
  { id: 'gtultra.vibdelay', name: 'Vib Delay', section: NKSSection.LFO, type: NKSParameterType.INT, min: 0, max: 255, defaultValue: 0, page: 0, index: 5, isAutomatable: true, accessibilityName: 'Vibrato Delay Ticks' },
  { id: 'gtultra.gatetimer', name: 'Gate Time', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 255, defaultValue: 2, page: 0, index: 6, isAutomatable: true, accessibilityName: 'Gate Timer Ticks' },
];

// PreTracker — volume only (transpiled 68k replayer, no internal hooks)
export const PRETRACKER_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'pretracker.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true, accessibilityName: 'Channel Volume' },
];

// ASAP — Atari POKEY volume + distortion per channel
// Params route via AsapEngine → worklet → _asap_wasm_set_pokey_register()
export const ASAP_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'asap.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true, accessibilityName: 'POKEY Channel Volume' },
  { id: 'asap.distortion', name: 'Distortion', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 15, defaultValue: 10, page: 0, index: 1, isAutomatable: true, accessibilityName: 'POKEY Distortion Mode' },
];

// PxTone — master volume control
export const PXTONE_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'pxtone.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true, accessibilityName: 'Master Volume' },
];

// Organya — Cave Story wavetable volume + pan + tempo
export const ORGANYA_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'organya.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true, accessibilityName: 'Channel Volume' },
  { id: 'organya.pan', name: 'Pan', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true, accessibilityName: 'Stereo Panning' },
  { id: 'organya.tempo', name: 'Tempo', section: NKSSection.SEQUENCER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true, accessibilityName: 'Playback Tempo' },
];

// OpenMPT/libopenmpt — channel volume/pan + global volume
export const OPENMPT_NKS_PARAMETERS: NKSParameter[] = [
  { id: 'openmpt.channelVolume', name: 'Chan Vol', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 1.0, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true, accessibilityName: 'Channel Volume' },
  { id: 'openmpt.channelPan', name: 'Chan Pan', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true, accessibilityName: 'Channel Panning' },
  { id: 'openmpt.globalVolume', name: 'Global Vol', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 1.0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true, accessibilityName: 'Global Master Volume' },
];

// Klystrack — full chiptune synthesis (SID-style + FM + wavetable)
// Params route via KlysEngine.setInstrumentParam() → worklet → _klys_set_instrument_param()
export const KLYSTRACK_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: ADSR + basic
  { id: 'klystrack.attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.1, unit: '%', formatString: '%.0f%%', page: 0, index: 0, isAutomatable: true, accessibilityName: 'Envelope Attack' },
  { id: 'klystrack.decay', name: 'Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 0, index: 1, isAutomatable: true, accessibilityName: 'Envelope Decay' },
  { id: 'klystrack.sustain', name: 'Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 2, isAutomatable: true, accessibilityName: 'Envelope Sustain' },
  { id: 'klystrack.release', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.2, unit: '%', formatString: '%.0f%%', page: 0, index: 3, isAutomatable: true, accessibilityName: 'Envelope Release' },
  { id: 'klystrack.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 4, isAutomatable: true, accessibilityName: 'Instrument Volume' },
  { id: 'klystrack.pulseWidth', name: 'Pulse Width', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 5, isAutomatable: true, accessibilityName: 'Pulse Width' },
  { id: 'klystrack.finetune', name: 'Fine Tune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: -1, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 6, isAutomatable: true, accessibilityName: 'Fine Tuning' },
  { id: 'klystrack.slideSpeed', name: 'Slide Spd', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0, unit: '%', formatString: '%.0f%%', page: 0, index: 7, isAutomatable: true, accessibilityName: 'Slide Speed' },
  // Page 1: Filter + vibrato + PWM
  { id: 'klystrack.cutoff', name: 'Filter Cut', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 1.0, unit: '%', formatString: '%.0f%%', page: 1, index: 0, isAutomatable: true, accessibilityName: 'Filter Cutoff' },
  { id: 'klystrack.resonance', name: 'Filter Res', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 1, isAutomatable: true, accessibilityName: 'Filter Resonance' },
  { id: 'klystrack.vibratoSpeed', name: 'Vib Speed', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 2, isAutomatable: true, accessibilityName: 'Vibrato Speed' },
  { id: 'klystrack.vibratoDepth', name: 'Vib Depth', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 3, isAutomatable: true, accessibilityName: 'Vibrato Depth' },
  { id: 'klystrack.pwmSpeed', name: 'PWM Speed', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 4, isAutomatable: true, accessibilityName: 'PWM Modulation Speed' },
  { id: 'klystrack.pwmDepth', name: 'PWM Depth', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 5, isAutomatable: true, accessibilityName: 'PWM Modulation Depth' },
  { id: 'klystrack.fmMod', name: 'FM Mod', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 6, isAutomatable: true, accessibilityName: 'FM Modulation Depth' },
  { id: 'klystrack.fmFeedback', name: 'FM Fdbk', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 7, isAutomatable: true, accessibilityName: 'FM Feedback Amount' },
];
