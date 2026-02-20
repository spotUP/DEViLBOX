/**
 * DJ One-Shot Effect Presets
 *
 * ~33 creative instrument presets designed for DJ performance one-shot use.
 * Assign these to drumpads for live triggering via MIDI, numpad, or mouse.
 *
 * Categories: Horns & Stabs, Risers & Buildups, Impacts & Drops,
 *             Laser & Zaps, Sirens & Alarms, Noise & Texture, Transitions
 */

import type { InstrumentPreset } from '@typedefs/instrument';
import { DEFAULT_DUB_SIREN, DEFAULT_SPACE_LASER } from '@typedefs/instrument';

// =============================================================================
// HORNS & STABS (6)
// =============================================================================

const DJ_AIR_HORN: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'DJ Air Horn',
  synthType: 'DubSiren',
  dubSiren: {
    ...DEFAULT_DUB_SIREN,
    oscillator: { type: 'sawtooth', frequency: 150 },
    lfo: { enabled: true, type: 'sawtooth', rate: 15, depth: 20 },
    delay: { enabled: true, time: 0.15, feedback: 0.2, wet: 0.2 },
    filter: { enabled: true, type: 'lowpass', frequency: 1200, rolloff: -12 },
    reverb: { enabled: false, decay: 1, wet: 0 },
  },
  effects: [],
  volume: -6,
  pan: 0,
};

const REGGAETON_HORN: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Reggaeton Horn',
  synthType: 'DubSiren',
  dubSiren: {
    ...DEFAULT_DUB_SIREN,
    oscillator: { type: 'sawtooth', frequency: 200 },
    lfo: { enabled: true, type: 'triangle', rate: 12, depth: 30 },
    delay: { enabled: false, time: 0.1, feedback: 0, wet: 0 },
    filter: { enabled: true, type: 'lowpass', frequency: 1800, rolloff: -12 },
    reverb: { enabled: false, decay: 1, wet: 0 },
  },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 60, parameters: { drive: 45, frequency: 2500 } },
  ],
  volume: -6,
  pan: 0,
};

const FOGHORN: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Foghorn',
  synthType: 'DubSiren',
  dubSiren: {
    ...DEFAULT_DUB_SIREN,
    oscillator: { type: 'sawtooth', frequency: 65 },
    lfo: { enabled: true, type: 'sine', rate: 0.5, depth: 10 },
    delay: { enabled: false, time: 0.1, feedback: 0, wet: 0 },
    filter: { enabled: true, type: 'lowpass', frequency: 400, rolloff: -24 },
    reverb: { enabled: false, decay: 1, wet: 0 },
  },
  effects: [
    { category: 'wasm', type: 'MVerb', enabled: true, wet: 40, parameters: { damping: 0.5, density: 0.6, bandwidth: 0.7, decay: 0.5, predelay: 0.02, size: 0.7, gain: 1.0, mix: 0.45, earlyMix: 0.5 } },
  ],
  volume: -8,
  pan: 0,
};

const CHORD_STAB: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Chord Stab',
  synthType: 'Synth',
  oscillator: { type: 'square', detune: 0, octave: 0 },
  envelope: { attack: 1, decay: 200, sustain: 0, release: 150 },
  filter: { type: 'lowpass', frequency: 3000, Q: 2, rolloff: -12 },
  effects: [
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -18, ratio: 4, attack: 0.003, release: 0.1 } },
    { category: 'tonejs', type: 'PingPongDelay', enabled: true, wet: 25, parameters: { delayTime: 0.2, feedback: 0.3 } },
  ],
  volume: -10,
  pan: 0,
};

const BRASS_STAB: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Brass Stab',
  synthType: 'FMSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 5, decay: 250, sustain: 0, release: 100 },
  filter: { type: 'lowpass', frequency: 4000, Q: 1, rolloff: -12 },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 50, parameters: { drive: 35, frequency: 3000 } },
    { category: 'wasm', type: 'MVerb', enabled: true, wet: 25, parameters: { damping: 0.6, density: 0.5, bandwidth: 0.7, decay: 0.3, predelay: 0.01, size: 0.35, gain: 1.0, mix: 0.35, earlyMix: 0.6 } },
  ],
  volume: -10,
  pan: 0,
};

const DUB_HORN: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Dub Horn',
  synthType: 'DubSiren',
  dubSiren: {
    ...DEFAULT_DUB_SIREN,
    oscillator: { type: 'sawtooth', frequency: 180 },
    lfo: { enabled: true, type: 'sine', rate: 6, depth: 40 },
    delay: { enabled: true, time: 0.35, feedback: 0.5, wet: 0.4 },
    filter: { enabled: true, type: 'lowpass', frequency: 1500, rolloff: -12 },
    reverb: { enabled: false, decay: 1, wet: 0 },
  },
  effects: [
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 45, parameters: { mode: 4, rate: 330, intensity: 0.6, echoVolume: 0.75, reverbVolume: 0.2 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 30, parameters: { decay: 0.5, damping: 0.4, tension: 0.45, mix: 0.35, drip: 0.6, diffusion: 0.7 } },
  ],
  volume: -10,
  pan: 0,
};

// =============================================================================
// RISERS & BUILDUPS (5)
// =============================================================================

const WHITE_NOISE_RISER: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'White Noise Riser',
  synthType: 'NoiseSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 2000, decay: 100, sustain: 0, release: 200 },
  filter: { type: 'lowpass', frequency: 200, Q: 5, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'AutoFilter', enabled: true, wet: 80, parameters: { frequency: 0.15, baseFrequency: 200, octaves: 6, type: 'sine', depth: 1 } },
    { category: 'wasm', type: 'MVerb', enabled: true, wet: 30, parameters: { damping: 0.4, density: 0.6, bandwidth: 0.7, decay: 0.5, predelay: 0.01, size: 0.6, gain: 1.0, mix: 0.4, earlyMix: 0.4 } },
  ],
  volume: -14,
  pan: 0,
};

const TENSION_BUILDER: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Tension Builder',
  synthType: 'NoiseSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 3000, decay: 200, sustain: 0.1, release: 300 },
  filter: { type: 'bandpass', frequency: 800, Q: 4, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'Phaser', enabled: true, wet: 60, parameters: { frequency: 0.2, octaves: 4, baseFrequency: 400, Q: 8 } },
    { category: 'wasm', type: 'MVerb', enabled: true, wet: 35, parameters: { damping: 0.3, density: 0.7, bandwidth: 0.6, decay: 0.6, predelay: 0.03, size: 0.8, gain: 1.0, mix: 0.45, earlyMix: 0.3 } },
  ],
  volume: -16,
  pan: 0,
};

const FREQUENCY_SWEEP: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Frequency Sweep',
  synthType: 'MonoSynth',
  oscillator: { type: 'sawtooth', detune: 0, octave: 0 },
  envelope: { attack: 1500, decay: 500, sustain: 0, release: 200 },
  filter: { type: 'lowpass', frequency: 300, Q: 6, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'AutoFilter', enabled: true, wet: 70, parameters: { frequency: 0.1, baseFrequency: 150, octaves: 7, type: 'sawtooth', depth: 1 } },
    { category: 'tonejs', type: 'Chorus', enabled: true, wet: 40, parameters: { frequency: 2.5, delayTime: 3.5, depth: 0.7, spread: 180 } },
  ],
  volume: -14,
  pan: 0,
};

const DARK_RISER: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Dark Riser',
  synthType: 'NoiseSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 2500, decay: 300, sustain: 0, release: 200 },
  filter: { type: 'lowpass', frequency: 500, Q: 3, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'BitCrusher', enabled: true, wet: 50, parameters: { bits: 6 } },
    { category: 'wasm', type: 'MVerb', enabled: true, wet: 35, parameters: { damping: 0.6, density: 0.5, bandwidth: 0.5, decay: 0.4, predelay: 0.02, size: 0.5, gain: 1.0, mix: 0.4, earlyMix: 0.5 } },
  ],
  volume: -14,
  pan: 0,
};

const EUPHORIA_RISER: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Euphoria Riser',
  synthType: 'NoiseSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 3000, decay: 200, sustain: 0, release: 400 },
  filter: { type: 'highpass', frequency: 400, Q: 2, rolloff: -12 },
  effects: [
    { category: 'tonejs', type: 'Chorus', enabled: true, wet: 55, parameters: { frequency: 3, delayTime: 4, depth: 0.8, spread: 180 } },
    { category: 'tonejs', type: 'StereoWidener', enabled: true, wet: 70, parameters: { width: 0.8 } },
    { category: 'wasm', type: 'MVerb', enabled: true, wet: 45, parameters: { damping: 0.2, density: 0.8, bandwidth: 0.8, decay: 0.7, predelay: 0.02, size: 0.9, gain: 1.0, mix: 0.5, earlyMix: 0.3 } },
  ],
  volume: -16,
  pan: 0,
};

// =============================================================================
// IMPACTS & DROPS (6)
// =============================================================================

const SUB_DROP: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Sub Drop',
  synthType: 'MembraneSynth',
  oscillator: { type: 'sine', detune: 0, octave: -1 },
  envelope: { attack: 1, decay: 800, sustain: 0, release: 200 },
  effects: [
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -12, ratio: 6, attack: 0.001, release: 0.05 } },
  ],
  volume: -6,
  pan: 0,
};

const BOOM: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Boom',
  synthType: 'MembraneSynth',
  oscillator: { type: 'sine', detune: 0, octave: -1 },
  envelope: { attack: 1, decay: 600, sustain: 0, release: 300 },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 55, parameters: { drive: 50, frequency: 800 } },
    { category: 'wasm', type: 'MVerb', enabled: true, wet: 30, parameters: { damping: 0.6, density: 0.5, bandwidth: 0.6, decay: 0.35, predelay: 0.01, size: 0.45, gain: 1.0, mix: 0.4, earlyMix: 0.6 } },
  ],
  volume: -8,
  pan: 0,
};

const CINEMATIC_HIT: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Cinematic Hit',
  synthType: 'MetalSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 1, decay: 1000, sustain: 0, release: 500 },
  effects: [
    { category: 'wasm', type: 'MVerb', enabled: true, wet: 50, parameters: { damping: 0.3, density: 0.8, bandwidth: 0.7, decay: 0.7, predelay: 0.03, size: 0.9, gain: 1.0, mix: 0.5, earlyMix: 0.3 } },
    { category: 'tonejs', type: 'StereoWidener', enabled: true, wet: 80, parameters: { width: 0.9 } },
  ],
  volume: -10,
  pan: 0,
};

const EARTHQUAKE: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Earthquake',
  synthType: 'MembraneSynth',
  oscillator: { type: 'sine', detune: 0, octave: -2 },
  envelope: { attack: 1, decay: 1200, sustain: 0, release: 400 },
  effects: [
    { category: 'tonejs', type: 'Distortion', enabled: true, wet: 40, parameters: { distortion: 0.6, oversample: 2 } },
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -15, ratio: 8, attack: 0.001, release: 0.08 } },
  ],
  volume: -8,
  pan: 0,
};

const CRASH_IMPACT: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Crash Impact',
  synthType: 'NoiseSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 1, decay: 400, sustain: 0, release: 200 },
  filter: { type: 'lowpass', frequency: 4000, Q: 1, rolloff: -12 },
  effects: [
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -10, ratio: 6, attack: 0.001, release: 0.05 } },
  ],
  volume: -8,
  pan: 0,
};

const REVERSE_HIT: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Reverse Hit',
  synthType: 'NoiseSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 300, decay: 100, sustain: 0, release: 50 },
  filter: { type: 'bandpass', frequency: 1500, Q: 3, rolloff: -12 },
  effects: [
    { category: 'wasm', type: 'RETapeEcho', enabled: true, wet: 55, parameters: { time: 0.25, feedback: 0.5, tone: 0.6, flutter: 0.3, wow: 0.2, saturation: 0.4, mix: 0.5 } },
  ],
  volume: -10,
  pan: 0,
};

// =============================================================================
// LASER & ZAPS (4)
// =============================================================================

const DJ_LASER: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'DJ Laser',
  synthType: 'SpaceLaser',
  spaceLaser: {
    ...DEFAULT_SPACE_LASER,
    laser: { startFreq: 5000, endFreq: 200, sweepTime: 120, sweepCurve: 'exponential' },
    fm: { amount: 50, ratio: 3.0 },
    noise: { amount: 8, type: 'white' },
    filter: { type: 'bandpass', cutoff: 2500, resonance: 40 },
  },
  effects: [
    { category: 'tonejs', type: 'PingPongDelay', enabled: true, wet: 30, parameters: { delayTime: 0.15, feedback: 0.4 } },
  ],
  volume: -10,
  pan: 0,
};

const GLITCH_ZAP: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Glitch Zap',
  synthType: 'SpaceLaser',
  spaceLaser: {
    ...DEFAULT_SPACE_LASER,
    laser: { startFreq: 8000, endFreq: 100, sweepTime: 80, sweepCurve: 'exponential' },
    fm: { amount: 70, ratio: 5.0 },
    noise: { amount: 15, type: 'white' },
    filter: { type: 'highpass', cutoff: 1000, resonance: 50 },
  },
  effects: [
    { category: 'tonejs', type: 'BitCrusher', enabled: true, wet: 55, parameters: { bits: 4 } },
    { category: 'tonejs', type: 'PingPongDelay', enabled: true, wet: 25, parameters: { delayTime: 0.1, feedback: 0.35 } },
  ],
  volume: -12,
  pan: 0,
};

const PEW_PEW: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Pew Pew',
  synthType: 'FMSynth',
  oscillator: { type: 'sine', detune: 0, octave: 1 },
  envelope: { attack: 1, decay: 150, sustain: 0, release: 80 },
  filter: { type: 'bandpass', frequency: 3000, Q: 8, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'PingPongDelay', enabled: true, wet: 30, parameters: { delayTime: 0.12, feedback: 0.3 } },
  ],
  volume: -10,
  pan: 0,
};

const COSMIC_RAY: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Cosmic Ray',
  synthType: 'SpaceLaser',
  spaceLaser: {
    ...DEFAULT_SPACE_LASER,
    laser: { startFreq: 6000, endFreq: 300, sweepTime: 250, sweepCurve: 'exponential' },
    fm: { amount: 45, ratio: 3.5 },
    noise: { amount: 12, type: 'pink' },
    filter: { type: 'bandpass', cutoff: 2000, resonance: 35 },
    delay: { enabled: true, time: 0.3, feedback: 0.5, wet: 0.4 },
    reverb: { enabled: true, decay: 3.0, wet: 0.3 },
  },
  effects: [
    { category: 'wasm', type: 'MVerb', enabled: true, wet: 40, parameters: { damping: 0.3, density: 0.7, bandwidth: 0.7, decay: 0.6, predelay: 0.02, size: 0.8, gain: 1.0, mix: 0.45, earlyMix: 0.3 } },
    { category: 'tonejs', type: 'Chorus', enabled: true, wet: 35, parameters: { frequency: 2, delayTime: 3.5, depth: 0.6, spread: 180 } },
  ],
  volume: -12,
  pan: 0,
};

// =============================================================================
// SIRENS & ALARMS (4)
// =============================================================================

const RAVE_SIREN: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Rave Siren',
  synthType: 'DubSiren',
  dubSiren: {
    ...DEFAULT_DUB_SIREN,
    oscillator: { type: 'sawtooth', frequency: 500 },
    lfo: { enabled: true, type: 'sine', rate: 4, depth: 300 },
    delay: { enabled: false, time: 0.1, feedback: 0, wet: 0 },
    filter: { enabled: true, type: 'lowpass', frequency: 3000, rolloff: -12 },
    reverb: { enabled: false, decay: 1, wet: 0 },
  },
  effects: [
    { category: 'tonejs', type: 'Distortion', enabled: true, wet: 40, parameters: { distortion: 0.4, oversample: 2 } },
    { category: 'wasm', type: 'MVerb', enabled: true, wet: 25, parameters: { damping: 0.5, density: 0.5, bandwidth: 0.7, decay: 0.3, predelay: 0.01, size: 0.4, gain: 1.0, mix: 0.35, earlyMix: 0.5 } },
  ],
  volume: -10,
  pan: 0,
};

const AMBULANCE: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Ambulance',
  synthType: 'DubSiren',
  dubSiren: {
    ...DEFAULT_DUB_SIREN,
    oscillator: { type: 'square', frequency: 700 },
    lfo: { enabled: true, type: 'square', rate: 3, depth: 150 },
    delay: { enabled: false, time: 0.1, feedback: 0, wet: 0 },
    filter: { enabled: true, type: 'lowpass', frequency: 4000, rolloff: -12 },
    reverb: { enabled: false, decay: 1, wet: 0 },
  },
  effects: [],
  volume: -10,
  pan: 0,
};

const NUCLEAR_ALARM: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Nuclear Alarm',
  synthType: 'DubSiren',
  dubSiren: {
    ...DEFAULT_DUB_SIREN,
    oscillator: { type: 'sawtooth', frequency: 400 },
    lfo: { enabled: true, type: 'sine', rate: 1.5, depth: 200 },
    delay: { enabled: false, time: 0.1, feedback: 0, wet: 0 },
    filter: { enabled: true, type: 'lowpass', frequency: 2000, rolloff: -24 },
    reverb: { enabled: false, decay: 1, wet: 0 },
  },
  effects: [
    { category: 'tonejs', type: 'BitCrusher', enabled: true, wet: 45, parameters: { bits: 5 } },
    { category: 'wasm', type: 'MVerb', enabled: true, wet: 35, parameters: { damping: 0.4, density: 0.6, bandwidth: 0.6, decay: 0.5, predelay: 0.02, size: 0.6, gain: 1.0, mix: 0.4, earlyMix: 0.4 } },
  ],
  volume: -10,
  pan: 0,
};

const WOBBLE_SIREN: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Wobble Siren',
  synthType: 'DubSiren',
  dubSiren: {
    ...DEFAULT_DUB_SIREN,
    oscillator: { type: 'sawtooth', frequency: 350 },
    lfo: { enabled: true, type: 'sine', rate: 6, depth: 120 },
    delay: { enabled: false, time: 0.1, feedback: 0, wet: 0 },
    filter: { enabled: true, type: 'lowpass', frequency: 2500, rolloff: -12 },
    reverb: { enabled: false, decay: 1, wet: 0 },
  },
  effects: [
    { category: 'tonejs', type: 'Tremolo', enabled: true, wet: 70, parameters: { frequency: 5, depth: 0.8, type: 'sine', spread: 0 } },
  ],
  volume: -10,
  pan: 0,
};

// =============================================================================
// NOISE & TEXTURE (4)
// =============================================================================

const VINYL_SCRATCH: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Vinyl Scratch',
  synthType: 'NoiseSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 1, decay: 120, sustain: 0, release: 50 },
  filter: { type: 'bandpass', frequency: 2000, Q: 6, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'AutoFilter', enabled: true, wet: 80, parameters: { frequency: 8, baseFrequency: 800, octaves: 4, type: 'sawtooth', depth: 1 } },
  ],
  volume: -10,
  pan: 0,
};

const STATIC_BURST: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Static Burst',
  synthType: 'NoiseSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 1, decay: 200, sustain: 0, release: 80 },
  filter: { type: 'highpass', frequency: 1000, Q: 2, rolloff: -12 },
  effects: [
    { category: 'tonejs', type: 'BitCrusher', enabled: true, wet: 65, parameters: { bits: 3 } },
    { category: 'tonejs', type: 'Distortion', enabled: true, wet: 40, parameters: { distortion: 0.5, oversample: 2 } },
  ],
  volume: -12,
  pan: 0,
};

const WIND_GUST: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Wind Gust',
  synthType: 'NoiseSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 200, decay: 800, sustain: 0.2, release: 600 },
  filter: { type: 'bandpass', frequency: 600, Q: 2, rolloff: -12 },
  effects: [
    { category: 'tonejs', type: 'AutoFilter', enabled: true, wet: 75, parameters: { frequency: 0.3, baseFrequency: 300, octaves: 5, type: 'sine', depth: 1 } },
    { category: 'wasm', type: 'MVerb', enabled: true, wet: 40, parameters: { damping: 0.3, density: 0.7, bandwidth: 0.7, decay: 0.6, predelay: 0.03, size: 0.8, gain: 1.0, mix: 0.45, earlyMix: 0.3 } },
  ],
  volume: -14,
  pan: 0,
};

const RADIO_TUNE: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Radio Tune',
  synthType: 'NoiseSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 50, decay: 300, sustain: 0.3, release: 200 },
  filter: { type: 'bandpass', frequency: 1200, Q: 8, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'AutoFilter', enabled: true, wet: 80, parameters: { frequency: 2, baseFrequency: 600, octaves: 3, type: 'sine', depth: 1 } },
    { category: 'tonejs', type: 'Tremolo', enabled: true, wet: 50, parameters: { frequency: 12, depth: 0.6, type: 'sine', spread: 0 } },
  ],
  volume: -12,
  pan: 0,
};

// =============================================================================
// TRANSITIONS (4)
// =============================================================================

const ECHO_WASHOUT: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Echo Washout',
  synthType: 'MonoSynth',
  oscillator: { type: 'sawtooth', detune: 0, octave: 0 },
  envelope: { attack: 10, decay: 300, sustain: 0.3, release: 200 },
  filter: { type: 'lowpass', frequency: 2000, Q: 3, rolloff: -12 },
  effects: [
    { category: 'wasm', type: 'RETapeEcho', enabled: true, wet: 65, parameters: { time: 0.35, feedback: 0.7, tone: 0.5, flutter: 0.4, wow: 0.3, saturation: 0.5, mix: 0.6 } },
  ],
  volume: -12,
  pan: 0,
};

const REWIND: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Rewind',
  synthType: 'MonoSynth',
  oscillator: { type: 'sawtooth', detune: 0, octave: 1 },
  envelope: { attack: 10, decay: 600, sustain: 0, release: 100 },
  filter: { type: 'lowpass', frequency: 4000, Q: 4, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'Phaser', enabled: true, wet: 55, parameters: { frequency: 6, octaves: 3, baseFrequency: 500, Q: 10 } },
  ],
  volume: -12,
  pan: 0,
};

const TAPE_STOP: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Tape Stop',
  synthType: 'NoiseSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 1, decay: 500, sustain: 0, release: 200 },
  filter: { type: 'lowpass', frequency: 1500, Q: 2, rolloff: -24 },
  effects: [
    { category: 'wasm', type: 'TapeSimulator', enabled: true, wet: 70, parameters: { flutter: 0.8, wow: 0.9, saturation: 0.5, hiss: 0.2, toneHigh: 0.4, toneLow: 0.6, speed: 0.3, mix: 0.7 } },
  ],
  volume: -10,
  pan: 0,
};

const SPLASH: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Splash',
  synthType: 'NoiseSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 1, decay: 300, sustain: 0, release: 400 },
  filter: { type: 'highpass', frequency: 600, Q: 1, rolloff: -12 },
  effects: [
    { category: 'wasm', type: 'MVerb', enabled: true, wet: 55, parameters: { damping: 0.2, density: 0.8, bandwidth: 0.8, decay: 0.7, predelay: 0.01, size: 0.9, gain: 1.0, mix: 0.55, earlyMix: 0.4 } },
    { category: 'tonejs', type: 'StereoWidener', enabled: true, wet: 80, parameters: { width: 0.9 } },
  ],
  volume: -10,
  pan: 0,
};

// =============================================================================
// EXPORT
// =============================================================================

export const DJ_ONE_SHOT_PRESETS: InstrumentPreset['config'][] = [
  // Horns & Stabs
  DJ_AIR_HORN,
  REGGAETON_HORN,
  FOGHORN,
  CHORD_STAB,
  BRASS_STAB,
  DUB_HORN,
  // Risers & Buildups
  WHITE_NOISE_RISER,
  TENSION_BUILDER,
  FREQUENCY_SWEEP,
  DARK_RISER,
  EUPHORIA_RISER,
  // Impacts & Drops
  SUB_DROP,
  BOOM,
  CINEMATIC_HIT,
  EARTHQUAKE,
  CRASH_IMPACT,
  REVERSE_HIT,
  // Laser & Zaps
  DJ_LASER,
  GLITCH_ZAP,
  PEW_PEW,
  COSMIC_RAY,
  // Sirens & Alarms
  RAVE_SIREN,
  AMBULANCE,
  NUCLEAR_ALARM,
  WOBBLE_SIREN,
  // Noise & Texture
  VINYL_SCRATCH,
  STATIC_BURST,
  WIND_GUST,
  RADIO_TUNE,
  // Transitions
  ECHO_WASHOUT,
  REWIND,
  TAPE_STOP,
  SPLASH,
];
