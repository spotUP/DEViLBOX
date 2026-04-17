/**
 * DJ One-Shot Effect Presets — REGGAE SOUND SYSTEM EDITION
 *
 * ~33 creative instrument presets designed for DJ performance one-shot use.
 * Every preset is tuned for maximum reggae/dub sound system impact:
 *   - SpringReverb (dripping, high diffusion — the classic dub "boing")
 *   - SpaceEcho (RE-201 style tape delays — the heartbeat of dub)
 *   - TapeSaturation (warm analog overdrive — never cold or digital)
 *   - Heavy compression (in-your-face, punchy, LOUD)
 *   - Hot volumes (-4 to -6dB — crowd goes mad)
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
    delay: { enabled: true, time: 0.15, feedback: 0.3, wet: 0.3 },
    filter: { enabled: true, type: 'lowpass', frequency: 1200, rolloff: -12 },
    reverb: { enabled: true, decay: 1.5, wet: 0.2 },
  },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 45, parameters: { drive: 40, frequency: 1800 } },
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -8, ratio: 8, attack: 0.001, release: 0.04 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 20, parameters: { decay: 0.45, damping: 0.35, tension: 0.5, mix: 0.25, drip: 0.5, diffusion: 0.65 } },
  ],
  volume: -4,
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
    delay: { enabled: true, time: 0.25, feedback: 0.35, wet: 0.3 },
    filter: { enabled: true, type: 'lowpass', frequency: 1800, rolloff: -12 },
    reverb: { enabled: true, decay: 1.8, wet: 0.2 },
  },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 55, parameters: { drive: 50, frequency: 2200 } },
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -10, ratio: 6, attack: 0.001, release: 0.05 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 25, parameters: { decay: 0.5, damping: 0.3, tension: 0.45, mix: 0.3, drip: 0.55, diffusion: 0.7 } },
  ],
  volume: -4,
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
    delay: { enabled: true, time: 0.45, feedback: 0.4, wet: 0.3 },
    filter: { enabled: true, type: 'lowpass', frequency: 400, rolloff: -24 },
    reverb: { enabled: true, decay: 3.5, wet: 0.35 },
  },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 55, parameters: { drive: 50, frequency: 400 } },
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -12, ratio: 10, attack: 0.003, release: 0.08 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 35, parameters: { decay: 0.7, damping: 0.3, tension: 0.35, mix: 0.4, drip: 0.65, diffusion: 0.8 } },
  ],
  volume: -4,
  pan: 0,
};

const CHORD_STAB: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Chord Stab',
  synthType: 'Synth',
  oscillator: { type: 'square', detune: 0, octave: 0 },
  envelope: { attack: 1, decay: 250, sustain: 0, release: 200 },
  filter: { type: 'lowpass', frequency: 2500, Q: 4, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 45, parameters: { drive: 35, frequency: 2000 } },
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -10, ratio: 6, attack: 0.002, release: 0.08 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 40, parameters: { mode: 4, rate: 280, intensity: 0.3, echoVolume: 0.4, reverbVolume: 0.25, bpmSync: 1 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 30, parameters: { decay: 0.55, damping: 0.3, tension: 0.45, mix: 0.35, drip: 0.5, diffusion: 0.7 } },
  ],
  volume: -4,
  pan: 0,
};

const BRASS_STAB: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Brass Stab',
  synthType: 'FMSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 3, decay: 300, sustain: 0, release: 150 },
  filter: { type: 'lowpass', frequency: 3500, Q: 3, rolloff: -12 },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 50, parameters: { drive: 45, frequency: 2500 } },
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -10, ratio: 6, attack: 0.001, release: 0.06 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 35, parameters: { mode: 4, rate: 300, intensity: 0.25, echoVolume: 0.35, reverbVolume: 0.2, bpmSync: 1 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 25, parameters: { decay: 0.5, damping: 0.35, tension: 0.5, mix: 0.3, drip: 0.45, diffusion: 0.65 } },
  ],
  volume: -4,
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
    delay: { enabled: true, time: 0.35, feedback: 0.55, wet: 0.45 },
    filter: { enabled: true, type: 'lowpass', frequency: 1500, rolloff: -12 },
    reverb: { enabled: true, decay: 2.5, wet: 0.25 },
  },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 45, parameters: { drive: 40, frequency: 1800 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 50, parameters: { mode: 4, rate: 330, intensity: 0.3, echoVolume: 0.45, reverbVolume: 0.3, bpmSync: 1 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 35, parameters: { decay: 0.6, damping: 0.3, tension: 0.4, mix: 0.35, drip: 0.65, diffusion: 0.75 } },
  ],
  volume: -4,
  pan: 0,
};

// =============================================================================
// RISERS & BUILDUPS (5)
// =============================================================================

const WHITE_NOISE_RISER: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Noise Riser',
  synthType: 'NoiseSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 800, decay: 100, sustain: 0, release: 150 },
  filter: { type: 'lowpass', frequency: 300, Q: 10, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'AutoFilter', enabled: true, wet: 90, parameters: { frequency: 0.25, baseFrequency: 200, octaves: 7, type: 'sawtooth', depth: 1 } },
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 50, parameters: { drive: 45, frequency: 3000 } },
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -10, ratio: 8, attack: 0.002, release: 0.06 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 30, parameters: { decay: 0.55, damping: 0.25, tension: 0.45, mix: 0.35, drip: 0.5, diffusion: 0.75 } },
  ],
  volume: -6,
  pan: 0,
};

const TENSION_BUILDER: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Tension Swell',
  synthType: 'MonoSynth',
  oscillator: { type: 'sawtooth', detune: 12, octave: 0 },
  envelope: { attack: 1200, decay: 200, sustain: 0.3, release: 200 },
  filter: { type: 'lowpass', frequency: 400, Q: 12, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'AutoFilter', enabled: true, wet: 80, parameters: { frequency: 0.15, baseFrequency: 200, octaves: 6, type: 'sine', depth: 1 } },
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 45, parameters: { drive: 40, frequency: 2000 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 35, parameters: { mode: 4, rate: 350, intensity: 0.25, echoVolume: 0.35, reverbVolume: 0.25, bpmSync: 1 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 30, parameters: { decay: 0.6, damping: 0.3, tension: 0.4, mix: 0.35, drip: 0.55, diffusion: 0.7 } },
  ],
  volume: -6,
  pan: 0,
};

const FREQUENCY_SWEEP: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Filter Sweep',
  synthType: 'MonoSynth',
  oscillator: { type: 'sawtooth', detune: 0, octave: 0 },
  envelope: { attack: 600, decay: 400, sustain: 0.2, release: 200 },
  filter: { type: 'lowpass', frequency: 200, Q: 14, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'AutoFilter', enabled: true, wet: 85, parameters: { frequency: 0.2, baseFrequency: 100, octaves: 8, type: 'sawtooth', depth: 1 } },
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 45, parameters: { drive: 40, frequency: 2500 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 35, parameters: { mode: 3, rate: 280, intensity: 0.25, echoVolume: 0.35, reverbVolume: 0.2, bpmSync: 1 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 30, parameters: { decay: 0.5, damping: 0.3, tension: 0.5, mix: 0.3, drip: 0.5, diffusion: 0.7 } },
  ],
  volume: -6,
  pan: 0,
};

const DARK_RISER: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Dark Growl',
  synthType: 'FMSynth',
  oscillator: { type: 'sine', detune: 0, octave: -1 },
  envelope: { attack: 800, decay: 400, sustain: 0.2, release: 200 },
  filter: { type: 'lowpass', frequency: 600, Q: 8, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 55, parameters: { drive: 55, frequency: 800 } },
    { category: 'tonejs', type: 'Distortion', enabled: true, wet: 35, parameters: { distortion: 0.5, oversample: 2 } },
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -12, ratio: 8, attack: 0.002, release: 0.06 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 35, parameters: { decay: 0.65, damping: 0.35, tension: 0.35, mix: 0.4, drip: 0.6, diffusion: 0.75 } },
  ],
  volume: -6,
  pan: 0,
};

const EUPHORIA_RISER: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Shimmer Rise',
  synthType: 'MonoSynth',
  oscillator: { type: 'sawtooth', detune: 7, octave: 1 },
  envelope: { attack: 1000, decay: 300, sustain: 0.1, release: 400 },
  filter: { type: 'highpass', frequency: 600, Q: 5, rolloff: -12 },
  effects: [
    { category: 'tonejs', type: 'Chorus', enabled: true, wet: 55, parameters: { frequency: 4, delayTime: 5, depth: 0.9, spread: 180 } },
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 40, parameters: { drive: 35, frequency: 3000 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 40, parameters: { mode: 4, rate: 320, intensity: 0.3, echoVolume: 0.4, reverbVolume: 0.3, bpmSync: 1 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 35, parameters: { decay: 0.6, damping: 0.2, tension: 0.4, mix: 0.35, drip: 0.55, diffusion: 0.8 } },
  ],
  volume: -6,
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
  envelope: { attack: 1, decay: 1200, sustain: 0, release: 300 },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 40, parameters: { drive: 35, frequency: 350 } },
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -8, ratio: 10, attack: 0.001, release: 0.05 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 20, parameters: { mode: 4, rate: 400, intensity: 0.2, echoVolume: 0.3, reverbVolume: 0.15, bpmSync: 1 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 20, parameters: { decay: 0.4, damping: 0.5, tension: 0.3, mix: 0.25, drip: 0.4, diffusion: 0.5 } },
  ],
  volume: -4,
  pan: 0,
};

const BOOM: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Boom',
  synthType: 'MembraneSynth',
  oscillator: { type: 'sine', detune: 0, octave: -1 },
  envelope: { attack: 1, decay: 800, sustain: 0, release: 300 },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 60, parameters: { drive: 60, frequency: 500 } },
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -10, ratio: 8, attack: 0.001, release: 0.06 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 25, parameters: { mode: 4, rate: 350, intensity: 0.25, echoVolume: 0.3, reverbVolume: 0.2, bpmSync: 1 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 25, parameters: { decay: 0.5, damping: 0.4, tension: 0.35, mix: 0.3, drip: 0.5, diffusion: 0.6 } },
  ],
  volume: -4,
  pan: 0,
};

const CINEMATIC_HIT: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Metal Hit',
  synthType: 'MetalSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 1, decay: 1200, sustain: 0, release: 500 },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 45, parameters: { drive: 40, frequency: 1500 } },
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -10, ratio: 8, attack: 0.001, release: 0.06 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 35, parameters: { mode: 4, rate: 300, intensity: 0.25, echoVolume: 0.35, reverbVolume: 0.25, bpmSync: 1 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 30, parameters: { decay: 0.55, damping: 0.25, tension: 0.4, mix: 0.35, drip: 0.55, diffusion: 0.7 } },
  ],
  volume: -4,
  pan: 0,
};

const EARTHQUAKE: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Earthquake',
  synthType: 'MembraneSynth',
  oscillator: { type: 'sine', detune: 0, octave: -2 },
  envelope: { attack: 1, decay: 1800, sustain: 0, release: 500 },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 55, parameters: { drive: 55, frequency: 250 } },
    { category: 'tonejs', type: 'Distortion', enabled: true, wet: 30, parameters: { distortion: 0.5, oversample: 2 } },
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -12, ratio: 12, attack: 0.001, release: 0.08 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 25, parameters: { decay: 0.6, damping: 0.4, tension: 0.3, mix: 0.3, drip: 0.5, diffusion: 0.6 } },
  ],
  volume: -4,
  pan: 0,
};

const CRASH_IMPACT: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Crash Hit',
  synthType: 'NoiseSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 1, decay: 500, sustain: 0, release: 200 },
  filter: { type: 'lowpass', frequency: 5000, Q: 3, rolloff: -12 },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 50, parameters: { drive: 45, frequency: 2500 } },
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -8, ratio: 10, attack: 0.001, release: 0.04 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 30, parameters: { mode: 4, rate: 250, intensity: 0.25, echoVolume: 0.35, reverbVolume: 0.2, bpmSync: 0 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 30, parameters: { decay: 0.5, damping: 0.3, tension: 0.45, mix: 0.35, drip: 0.5, diffusion: 0.7 } },
  ],
  volume: -4,
  pan: 0,
};

const REVERSE_HIT: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Echo Burst',
  synthType: 'NoiseSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 100, decay: 200, sustain: 0, release: 100 },
  filter: { type: 'bandpass', frequency: 2000, Q: 6, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 40, parameters: { drive: 35, frequency: 2500 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 60, parameters: { mode: 4, rate: 220, intensity: 0.3, echoVolume: 0.45, reverbVolume: 0.3, bpmSync: 0 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 30, parameters: { decay: 0.55, damping: 0.25, tension: 0.4, mix: 0.35, drip: 0.6, diffusion: 0.75 } },
  ],
  volume: -4,
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
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 40, parameters: { drive: 35, frequency: 3000 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 40, parameters: { mode: 4, rate: 180, intensity: 0.3, echoVolume: 0.4, reverbVolume: 0.25, bpmSync: 0 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 25, parameters: { decay: 0.5, damping: 0.3, tension: 0.5, mix: 0.3, drip: 0.5, diffusion: 0.65 } },
  ],
  volume: -4,
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
    { category: 'tonejs', type: 'BitCrusher', enabled: true, wet: 50, parameters: { bits: 4 } },
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 45, parameters: { drive: 45, frequency: 2000 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 35, parameters: { mode: 3, rate: 120, intensity: 0.25, echoVolume: 0.35, reverbVolume: 0.2, bpmSync: 0 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 25, parameters: { decay: 0.45, damping: 0.3, tension: 0.5, mix: 0.3, drip: 0.45, diffusion: 0.65 } },
  ],
  volume: -4,
  pan: 0,
};

const PEW_PEW: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Pew Pew',
  synthType: 'FMSynth',
  oscillator: { type: 'sine', detune: 0, octave: 1 },
  envelope: { attack: 1, decay: 120, sustain: 0, release: 60 },
  filter: { type: 'bandpass', frequency: 3000, Q: 10, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 40, parameters: { drive: 35, frequency: 4000 } },
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -8, ratio: 8, attack: 0.001, release: 0.03 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 40, parameters: { mode: 4, rate: 150, intensity: 0.3, echoVolume: 0.4, reverbVolume: 0.2, bpmSync: 0 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 25, parameters: { decay: 0.45, damping: 0.3, tension: 0.5, mix: 0.3, drip: 0.5, diffusion: 0.65 } },
  ],
  volume: -4,
  pan: 0,
};

const COSMIC_RAY: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Cosmic Ray',
  synthType: 'SpaceLaser',
  spaceLaser: {
    ...DEFAULT_SPACE_LASER,
    laser: { startFreq: 6000, endFreq: 300, sweepTime: 250, sweepCurve: 'exponential' },
    fm: { amount: 55, ratio: 3.5 },
    noise: { amount: 12, type: 'pink' },
    filter: { type: 'bandpass', cutoff: 2000, resonance: 45 },
    delay: { enabled: true, time: 0.35, feedback: 0.55, wet: 0.45 },
    reverb: { enabled: true, decay: 3.5, wet: 0.35 },
  },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 40, parameters: { drive: 35, frequency: 2500 } },
    { category: 'tonejs', type: 'Chorus', enabled: true, wet: 40, parameters: { frequency: 3, delayTime: 4, depth: 0.8, spread: 180 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 35, parameters: { decay: 0.6, damping: 0.2, tension: 0.4, mix: 0.4, drip: 0.6, diffusion: 0.8 } },
  ],
  volume: -4,
  pan: 0,
};

// =============================================================================
// SIRENS & ALARMS (5)
// =============================================================================

const DUB_SIREN: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Dub Siren',
  synthType: 'DubSiren',
  dubSiren: {
    ...DEFAULT_DUB_SIREN,
    oscillator: { type: 'sine', frequency: 440 },
    lfo: { enabled: true, type: 'square', rate: 2, depth: 100 },
    delay: { enabled: true, time: 0.35, feedback: 0.5, wet: 0.4 },
    filter: { enabled: true, type: 'lowpass', frequency: 2000, rolloff: -12 },
    reverb: { enabled: true, decay: 2.5, wet: 0.3 },
  },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 40, parameters: { drive: 35, frequency: 1800 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 45, parameters: { mode: 4, rate: 300, intensity: 0.3, echoVolume: 0.45, reverbVolume: 0.3, bpmSync: 1 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 35, parameters: { decay: 0.65, damping: 0.25, tension: 0.45, mix: 0.35, drip: 0.6, diffusion: 0.75 } },
  ],
  volume: -4,
  pan: 0,
};

const RAVE_SIREN: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Rave Siren',
  synthType: 'DubSiren',
  dubSiren: {
    ...DEFAULT_DUB_SIREN,
    oscillator: { type: 'sawtooth', frequency: 500 },
    lfo: { enabled: true, type: 'sine', rate: 4, depth: 300 },
    delay: { enabled: true, time: 0.25, feedback: 0.4, wet: 0.35 },
    filter: { enabled: true, type: 'lowpass', frequency: 3000, rolloff: -12 },
    reverb: { enabled: true, decay: 2, wet: 0.2 },
  },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 50, parameters: { drive: 50, frequency: 2500 } },
    { category: 'tonejs', type: 'Distortion', enabled: true, wet: 25, parameters: { distortion: 0.3, oversample: 2 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 35, parameters: { mode: 4, rate: 200, intensity: 0.25, echoVolume: 0.35, reverbVolume: 0.2, bpmSync: 0 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 25, parameters: { decay: 0.5, damping: 0.3, tension: 0.5, mix: 0.3, drip: 0.5, diffusion: 0.65 } },
  ],
  volume: -4,
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
    delay: { enabled: true, time: 0.3, feedback: 0.4, wet: 0.3 },
    filter: { enabled: true, type: 'lowpass', frequency: 3500, rolloff: -12 },
    reverb: { enabled: true, decay: 2, wet: 0.2 },
  },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 40, parameters: { drive: 35, frequency: 2500 } },
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -10, ratio: 6, attack: 0.001, release: 0.05 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 30, parameters: { mode: 4, rate: 250, intensity: 0.25, echoVolume: 0.35, reverbVolume: 0.2, bpmSync: 0 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 25, parameters: { decay: 0.5, damping: 0.3, tension: 0.45, mix: 0.3, drip: 0.5, diffusion: 0.65 } },
  ],
  volume: -4,
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
    delay: { enabled: true, time: 0.4, feedback: 0.5, wet: 0.35 },
    filter: { enabled: true, type: 'lowpass', frequency: 2000, rolloff: -24 },
    reverb: { enabled: true, decay: 3, wet: 0.3 },
  },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 50, parameters: { drive: 50, frequency: 1500 } },
    { category: 'tonejs', type: 'BitCrusher', enabled: true, wet: 30, parameters: { bits: 6 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 40, parameters: { mode: 4, rate: 350, intensity: 0.3, echoVolume: 0.4, reverbVolume: 0.25, bpmSync: 1 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 30, parameters: { decay: 0.6, damping: 0.3, tension: 0.4, mix: 0.35, drip: 0.55, diffusion: 0.7 } },
  ],
  volume: -4,
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
    delay: { enabled: true, time: 0.3, feedback: 0.45, wet: 0.35 },
    filter: { enabled: true, type: 'lowpass', frequency: 2500, rolloff: -12 },
    reverb: { enabled: true, decay: 2, wet: 0.25 },
  },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 45, parameters: { drive: 40, frequency: 2000 } },
    { category: 'tonejs', type: 'Tremolo', enabled: true, wet: 55, parameters: { frequency: 5, depth: 0.7, type: 'sine', spread: 0 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 35, parameters: { mode: 4, rate: 280, intensity: 0.25, echoVolume: 0.35, reverbVolume: 0.2, bpmSync: 1 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 30, parameters: { decay: 0.55, damping: 0.25, tension: 0.45, mix: 0.35, drip: 0.55, diffusion: 0.7 } },
  ],
  volume: -4,
  pan: 0,
};

// =============================================================================
// NOISE & TEXTURE (4)
// =============================================================================

const VINYL_SCRATCH: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Filter Scratch',
  synthType: 'NoiseSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 1, decay: 80, sustain: 0, release: 30 },
  filter: { type: 'bandpass', frequency: 3000, Q: 12, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'AutoFilter', enabled: true, wet: 90, parameters: { frequency: 12, baseFrequency: 500, octaves: 5, type: 'sawtooth', depth: 1 } },
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 55, parameters: { drive: 50, frequency: 3500 } },
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -8, ratio: 10, attack: 0.001, release: 0.03 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 20, parameters: { decay: 0.4, damping: 0.35, tension: 0.55, mix: 0.25, drip: 0.4, diffusion: 0.6 } },
  ],
  volume: -4,
  pan: 0,
};

const STATIC_BURST: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Glitch Burst',
  synthType: 'NoiseSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 1, decay: 120, sustain: 0, release: 40 },
  filter: { type: 'bandpass', frequency: 2500, Q: 6, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'BitCrusher', enabled: true, wet: 60, parameters: { bits: 4 } },
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 50, parameters: { drive: 50, frequency: 2000 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 40, parameters: { mode: 3, rate: 120, intensity: 0.25, echoVolume: 0.35, reverbVolume: 0.2, bpmSync: 0 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 25, parameters: { decay: 0.45, damping: 0.3, tension: 0.5, mix: 0.3, drip: 0.5, diffusion: 0.65 } },
  ],
  volume: -4,
  pan: 0,
};

const WIND_GUST: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Storm Wash',
  synthType: 'NoiseSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 50, decay: 600, sustain: 0.4, release: 400 },
  filter: { type: 'bandpass', frequency: 800, Q: 5, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'AutoFilter', enabled: true, wet: 85, parameters: { frequency: 0.5, baseFrequency: 200, octaves: 6, type: 'sine', depth: 1 } },
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 40, parameters: { drive: 35, frequency: 1500 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 40, parameters: { mode: 4, rate: 400, intensity: 0.3, echoVolume: 0.4, reverbVolume: 0.3, bpmSync: 1 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 35, parameters: { decay: 0.7, damping: 0.2, tension: 0.35, mix: 0.4, drip: 0.65, diffusion: 0.8 } },
  ],
  volume: -6,
  pan: 0,
};

const RADIO_TUNE: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Radio Static',
  synthType: 'NoiseSynth',
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 1, decay: 250, sustain: 0.5, release: 150 },
  filter: { type: 'bandpass', frequency: 1500, Q: 14, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'BitCrusher', enabled: true, wet: 35, parameters: { bits: 5 } },
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 45, parameters: { drive: 40, frequency: 1800 } },
    { category: 'tonejs', type: 'AutoFilter', enabled: true, wet: 80, parameters: { frequency: 4, baseFrequency: 400, octaves: 4, type: 'square', depth: 1 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 30, parameters: { mode: 4, rate: 200, intensity: 0.25, echoVolume: 0.35, reverbVolume: 0.2, bpmSync: 0 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 25, parameters: { decay: 0.5, damping: 0.3, tension: 0.45, mix: 0.3, drip: 0.5, diffusion: 0.65 } },
  ],
  volume: -6,
  pan: 0,
};

// =============================================================================
// TRANSITIONS (4)
// =============================================================================

const ECHO_WASHOUT: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Dub Echo',
  synthType: 'MonoSynth',
  oscillator: { type: 'sawtooth', detune: 5, octave: 0 },
  envelope: { attack: 5, decay: 300, sustain: 0.2, release: 200 },
  filter: { type: 'lowpass', frequency: 1200, Q: 8, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 50, parameters: { drive: 45, frequency: 1800 } },
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -10, ratio: 6, attack: 0.002, release: 0.06 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 70, parameters: { mode: 4, rate: 300, intensity: 0.35, echoVolume: 0.3, reverbVolume: 0.35, bpmSync: 1 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 35, parameters: { decay: 0.65, damping: 0.25, tension: 0.4, mix: 0.35, drip: 0.6, diffusion: 0.75 } },
  ],
  volume: -4,
  pan: 0,
};

const REWIND: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Acid Sweep',
  synthType: 'MonoSynth',
  oscillator: { type: 'sawtooth', detune: 0, octave: 0 },
  envelope: { attack: 5, decay: 400, sustain: 0.1, release: 100 },
  filter: { type: 'lowpass', frequency: 500, Q: 18, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'AutoFilter', enabled: true, wet: 90, parameters: { frequency: 0.4, baseFrequency: 150, octaves: 7, type: 'sawtooth', depth: 1 } },
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 50, parameters: { drive: 50, frequency: 1500 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 40, parameters: { mode: 4, rate: 250, intensity: 0.3, echoVolume: 0.4, reverbVolume: 0.25, bpmSync: 1 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 30, parameters: { decay: 0.55, damping: 0.3, tension: 0.45, mix: 0.35, drip: 0.55, diffusion: 0.7 } },
  ],
  volume: -4,
  pan: 0,
};

const TAPE_STOP: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Lo-Fi Stab',
  synthType: 'MonoSynth',
  oscillator: { type: 'square', detune: 0, octave: 0 },
  envelope: { attack: 1, decay: 350, sustain: 0, release: 150 },
  filter: { type: 'lowpass', frequency: 1000, Q: 10, rolloff: -24 },
  effects: [
    { category: 'tonejs', type: 'BitCrusher', enabled: true, wet: 30, parameters: { bits: 6 } },
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 55, parameters: { drive: 55, frequency: 1500 } },
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -10, ratio: 8, attack: 0.001, release: 0.05 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 45, parameters: { mode: 4, rate: 280, intensity: 0.3, echoVolume: 0.4, reverbVolume: 0.25, bpmSync: 1 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 30, parameters: { decay: 0.55, damping: 0.3, tension: 0.4, mix: 0.35, drip: 0.55, diffusion: 0.7 } },
  ],
  volume: -4,
  pan: 0,
};

const SPLASH: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Cymbal Wash',
  synthType: 'MetalSynth',
  oscillator: { type: 'sine', detune: 0, octave: 2 },
  envelope: { attack: 1, decay: 700, sustain: 0, release: 500 },
  effects: [
    { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 35, parameters: { drive: 30, frequency: 3000 } },
    { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -10, ratio: 6, attack: 0.001, release: 0.05 } },
    { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 35, parameters: { mode: 4, rate: 250, intensity: 0.25, echoVolume: 0.35, reverbVolume: 0.25, bpmSync: 0 } },
    { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 35, parameters: { decay: 0.6, damping: 0.2, tension: 0.4, mix: 0.35, drip: 0.6, diffusion: 0.8 } },
  ],
  volume: -4,
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
  DUB_SIREN,
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
