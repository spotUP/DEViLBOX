import type { InstrumentPreset } from '../../types/instrument';

// ============================================================================
// FX PRESETS (4)
// ============================================================================

export const FX_PRESETS: InstrumentPreset['config'][] = [
  {
    type: 'synth' as const,
    name: 'Riser',
    synthType: 'NoiseSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 }, // NoiseSynth doesn't use waveform type
    envelope: { attack: 2000, decay: 100, sustain: 0, release: 100 },
    filter: { type: 'lowpass', frequency: 200, Q: 5, rolloff: -24 },
    effects: [],
    volume: -16,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Downlifter',
    synthType: 'MonoSynth',
    oscillator: { type: 'sawtooth', detune: 0, octave: 0 },
    envelope: { attack: 10, decay: 2000, sustain: 0, release: 100 },
    filter: { type: 'lowpass', frequency: 5000, Q: 3, rolloff: -24 },
    effects: [],
    volume: -14,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Impact',
    synthType: 'NoiseSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 }, // NoiseSynth doesn't use waveform type
    envelope: { attack: 1, decay: 500, sustain: 0, release: 200 },
    filter: { type: 'lowpass', frequency: 300, Q: 2, rolloff: -24 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Laser Zap',
    synthType: 'FMSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 300, sustain: 0, release: 100 },
    filter: { type: 'bandpass', frequency: 2000, Q: 10, rolloff: -24 },
    effects: [],
    volume: -12,
    pan: 0,
  },
];
