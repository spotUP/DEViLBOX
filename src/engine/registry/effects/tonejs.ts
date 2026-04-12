/**
 * Tone.js + custom WASM effect registrations — eager
 *
 * Registers all built-in Tone.js effects and custom JS/WASM effects
 * (TapeSaturation, SidechainCompressor, SpaceEcho, BiPhase, DubFilter,
 * SpaceyDelayer, RETapeEcho) with the EffectRegistry.
 */

import * as Tone from 'tone';
import type { EffectConfig } from '@typedefs/instrument';
import type { EffectDescriptor } from '../EffectDescriptor';
import { EffectRegistry } from '../EffectRegistry';

const tonejs: EffectDescriptor[] = [
  // ── Distortion ──────────────────────────────────────────────────────────
  {
    id: 'Distortion', name: 'Distortion', category: 'tonejs', group: 'Distortion',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters; const wet = c.wet / 100;
      return new Tone.Distortion({ distortion: Number(p.drive) || 0.4, oversample: (p.oversample as OverSampleType) || 'none', wet });
    },
    getDefaultParameters: () => ({ drive: 0.4, oversample: 'none' }),
    presets: [
      { name: 'Subtle', params: { drive: 0.08, oversample: 'none' } },
      { name: 'Warm Crunch', params: { drive: 0.2, oversample: 'none' } },
      { name: 'Heavy', params: { drive: 0.6, oversample: '2x' } },
      { name: 'Fuzz', params: { drive: 0.9, oversample: '4x' } },
    ],
  },
  {
    id: 'TapeSaturation', name: 'Tape Saturation', category: 'tonejs', group: 'Distortion',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { TapeSaturation } = await import('@engine/effects/TapeSaturation');
      const p = c.parameters;
      return new TapeSaturation({ drive: (Number(p.drive) || 50) / 100, tone: Number(p.tone) || 12000, wet: c.wet / 100 });
    },
    getDefaultParameters: () => ({ drive: 50, tone: 12000 }),
    presets: [
      { name: 'Subtle Warmth', params: { drive: 20, tone: 14000 } },
      { name: 'Warm Tape', params: { drive: 50, tone: 10000 } },
      { name: 'Hot Tape', params: { drive: 75, tone: 8000 } },
      { name: 'Destroyed', params: { drive: 95, tone: 5000 } },
    ],
  },
  {
    id: 'BitCrusher', name: 'BitCrusher', category: 'tonejs', group: 'Distortion',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      // Use Tone.Distortion with a staircase WaveShaper curve instead of
      // Tone.BitCrusher. The latter uses an AudioWorklet that fails to
      // initialize due to standardized-audio-context's AudioWorkletNode
      // throwing InvalidStateError (even though the native API works).
      const p = c.parameters;
      const bitsValue = Number(p.bits) || 4;
      const wetValue = c.wet / 100;
      const crusher = new Tone.Distortion({ distortion: 0, wet: wetValue, oversample: 'none' });
      const step = Math.pow(0.5, bitsValue - 1);
      (crusher as unknown as { _shaper: { setMap: (fn: (v: number) => number, len?: number) => void } })
        ._shaper.setMap((val: number) => step * Math.floor(val / step + 0.5), 4096);
      (crusher as unknown as Record<string, unknown>)._isBitCrusher = true;
      (crusher as unknown as Record<string, unknown>)._bitsValue = bitsValue;
      return crusher;
    },
    getDefaultParameters: () => ({ bits: 4 }),
    presets: [
      { name: '8-Bit', params: { bits: 8 } },
      { name: '4-Bit Lo-Fi', params: { bits: 4 } },
      { name: 'Telephone', params: { bits: 6 } },
      { name: 'Extreme', params: { bits: 1 } },
    ],
  },
  {
    id: 'Chebyshev', name: 'Chebyshev', category: 'tonejs', group: 'Distortion',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      return new Tone.Chebyshev({ order: Number(p.order) || 2, oversample: (p.oversample as OverSampleType) || 'none', wet: c.wet / 100 });
    },
    getDefaultParameters: () => ({ order: 2, oversample: 'none' }),
    presets: [
      { name: 'Warm', params: { order: 2, oversample: 'none' } },
      { name: 'Gritty', params: { order: 5, oversample: 'none' } },
      { name: 'Harsh', params: { order: 12, oversample: '2x' } },
      { name: 'Extreme', params: { order: 20, oversample: '4x' } },
    ],
  },

  // ── Filter ──────────────────────────────────────────────────────────────
  {
    id: 'Filter', name: 'Filter', category: 'tonejs', group: 'Filter',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      return new Tone.Filter({
        type: (p.type as BiquadFilterType) || 'lowpass', frequency: Number(p.frequency) || 5000,
        rolloff: (Number(p.rolloff) || -12) as -12 | -24 | -48 | -96, Q: Number(p.Q) || 1, gain: Number(p.gain) || 0,
      });
    },
    getDefaultParameters: () => ({ type: 'lowpass', frequency: 5000, rolloff: -12, Q: 1, gain: 0 }),
    presets: [
      { name: 'Dark', params: { type: 'lowpass', frequency: 800, rolloff: -24, Q: 1, gain: 0 } },
      { name: 'Bright', params: { type: 'highpass', frequency: 2000, rolloff: -12, Q: 1, gain: 0 } },
      { name: 'Mid Scoop', params: { type: 'notch', frequency: 2500, rolloff: -12, Q: 4, gain: 0 } },
      { name: 'Telephone', params: { type: 'bandpass', frequency: 1800, rolloff: -24, Q: 2, gain: 0 } },
    ],
  },
  {
    id: 'AutoFilter', name: 'Auto Filter', category: 'tonejs', group: 'Filter',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      const af = new Tone.AutoFilter({
        frequency: Number(p.frequency) || 1, baseFrequency: Number(p.baseFrequency) || 200,
        octaves: Number(p.octaves) || 2.6,
        filter: { type: (p.filterType as BiquadFilterType) || 'lowpass', rolloff: -12, Q: 1 },
        wet: c.wet / 100,
      });
      af.start();
      return af;
    },
    getDefaultParameters: () => ({ frequency: 1, baseFrequency: 200, octaves: 2.6, filterType: 'lowpass' }),
    presets: [
      { name: 'Slow Wah', params: { frequency: 0.3, baseFrequency: 150, octaves: 4, filterType: 'lowpass' } },
      { name: 'Fast Wobble', params: { frequency: 6, baseFrequency: 300, octaves: 3, filterType: 'lowpass' } },
      { name: 'Subtle Sweep', params: { frequency: 0.8, baseFrequency: 400, octaves: 1.5, filterType: 'lowpass' } },
    ],
  },
  {
    id: 'AutoWah', name: 'Auto Wah', category: 'tonejs', group: 'Filter',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      return new Tone.AutoWah({
        baseFrequency: Number(p.baseFrequency) || 100, octaves: Number(p.octaves) || 6,
        sensitivity: Number(p.sensitivity) || 0, Q: Number(p.Q) || 2,
        gain: Number(p.gain) || 2, follower: Number(p.follower) || 0.1, wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ baseFrequency: 100, octaves: 6, sensitivity: 0, Q: 2, gain: 2, follower: 0.1 }),
    presets: [
      { name: 'Funk', params: { baseFrequency: 200, octaves: 4, sensitivity: -10, Q: 6, gain: 3, follower: 0.06 } },
      { name: 'Quack', params: { baseFrequency: 300, octaves: 3, sensitivity: -20, Q: 10, gain: 4, follower: 0.04 } },
      { name: 'Subtle', params: { baseFrequency: 80, octaves: 2, sensitivity: 0, Q: 1.5, gain: 1, follower: 0.2 } },
    ],
  },
  {
    id: 'DubFilter', name: 'Dub Filter', category: 'tonejs', group: 'Filter',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { DubFilterEffect } = await import('@engine/effects/DubFilterEffect');
      const p = c.parameters;
      return new DubFilterEffect({
        cutoff: Number(p.cutoff) || 20, resonance: Number(p.resonance) || 30,
        gain: Number(p.gain) || 1, wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ cutoff: 20, resonance: 30, gain: 1 }),
    presets: [
      { name: 'Deep Bass', params: { cutoff: 10, resonance: 60, gain: 1.5 } },
      { name: 'Reggae', params: { cutoff: 35, resonance: 45, gain: 1.2 } },
      { name: 'Clean', params: { cutoff: 50, resonance: 15, gain: 0.8 } },
    ],
  },

  // ── Reverb & Delay ──────────────────────────────────────────────────────
  {
    id: 'Reverb', name: 'Reverb', category: 'tonejs', group: 'Reverb & Delay',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      const reverb = new Tone.Reverb({ decay: Number(p.decay) || 8.6, preDelay: Number(p.preDelay) || 0.4, wet: c.wet / 100 });
      await reverb.ready;
      return reverb;
    },
    getDefaultParameters: () => ({ decay: 8.6, preDelay: 0.4 }),
    presets: [
      { name: 'Small Room', params: { decay: 1.5, preDelay: 0.01 } },
      { name: 'Large Hall', params: { decay: 5.0, preDelay: 0.1 } },
      { name: 'Cathedral', params: { decay: 12.0, preDelay: 0.3 } },
      { name: 'Plate', params: { decay: 2.5, preDelay: 0.005 } },
    ],
  },
  {
    id: 'JCReverb', name: 'JC Reverb', category: 'tonejs', group: 'Reverb & Delay',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      const roomVal = Math.max(0, Math.min(Number(p.roomSize) || 0.7, 0.99));
      const jcr = new Tone.Reverb({ decay: 0.5 + roomVal * 9.5, preDelay: 0.01, wet: c.wet / 100 });
      await jcr.ready;
      return jcr;
    },
    getDefaultParameters: () => ({ roomSize: 0.7 }),
    presets: [
      { name: 'Tight Room', params: { roomSize: 0.2 } },
      { name: 'Medium', params: { roomSize: 0.5 } },
      { name: 'Large Space', params: { roomSize: 0.9 } },
    ],
  },
  {
    id: 'Delay', name: 'Delay', category: 'tonejs', group: 'Reverb & Delay',
    loadMode: 'eager', bpmSyncParams: ['time'],
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      return new Tone.FeedbackDelay({ delayTime: Number(p.time) || 0.25, feedback: Number(p.feedback) || 0.5, wet: c.wet / 100 });
    },
    getDefaultParameters: () => ({ time: 0.25, feedback: 0.5 }),
    presets: [
      { name: 'Slapback', params: { time: 0.08, feedback: 0.1 } },
      { name: 'Quarter Note', params: { time: 0.25, feedback: 0.4 } },
      { name: 'Dotted Eighth', params: { time: 0.1875, feedback: 0.45 } },
      { name: 'Long Ambient', params: { time: 0.5, feedback: 0.7 } },
    ],
  },
  {
    id: 'FeedbackDelay', name: 'Feedback Delay', category: 'tonejs', group: 'Reverb & Delay',
    loadMode: 'eager', bpmSyncParams: ['time'],
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      return new Tone.FeedbackDelay({ delayTime: Number(p.time) || 0.25, feedback: Number(p.feedback) || 0.5, wet: c.wet / 100 });
    },
    getDefaultParameters: () => ({ time: 0.25, feedback: 0.5 }),
    presets: [
      { name: 'Slapback', params: { time: 0.06, feedback: 0.1 } },
      { name: 'Echo', params: { time: 0.25, feedback: 0.45 } },
      { name: 'Dub', params: { time: 0.375, feedback: 0.7 } },
      { name: 'Runaway', params: { time: 0.3, feedback: 0.85 } },
    ],
  },
  {
    id: 'PingPongDelay', name: 'Ping Pong Delay', category: 'tonejs', group: 'Reverb & Delay',
    loadMode: 'eager', bpmSyncParams: ['time'],
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      return new Tone.PingPongDelay({ delayTime: Number(p.time) || 0.25, feedback: Number(p.feedback) || 0.5, wet: c.wet / 100 });
    },
    getDefaultParameters: () => ({ time: 0.25, feedback: 0.5 }),
    presets: [
      { name: 'Tight Stereo', params: { time: 0.1, feedback: 0.3 } },
      { name: 'Wide Bounce', params: { time: 0.25, feedback: 0.5 } },
      { name: 'Spacious', params: { time: 0.45, feedback: 0.65 } },
    ],
  },
  {
    id: 'SpaceEcho', name: 'Space Echo', category: 'tonejs', group: 'Reverb & Delay',
    loadMode: 'eager', bpmSyncParams: ['rate'],
    create: async (c: EffectConfig) => {
      const { SpaceEchoEffect } = await import('@engine/effects/SpaceEchoEffect');
      const p = c.parameters;
      return new SpaceEchoEffect({
        mode: Number(p.mode) || 8, rate: Number(p.rate) || 300,
        intensity: Number(p.intensity) || 0.74, echoVolume: Number(p.echoVolume) || 0.8,
        reverbVolume: Number(p.reverbVolume) || 0.4, bass: Number(p.bass) || 4,
        treble: Number(p.treble) || 4, wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ mode: 8, rate: 300, intensity: 0.74, echoVolume: 0.8, reverbVolume: 0.4, bass: 4, treble: 4, bpmSync: 1, syncDivision: '1/8' }),
    presets: [
      { name: 'Classic', params: { mode: 8, rate: 300, intensity: 0.74, echoVolume: 0.8, reverbVolume: 0.4, bass: 4, treble: 4, bpmSync: 1, syncDivision: '1/8' } },
      { name: 'Tape Wobble', params: { mode: 5, rate: 200, intensity: 0.85, echoVolume: 0.7, reverbVolume: 0.6, bass: 6, treble: 2, bpmSync: 0, syncDivision: '1/8' } },
      { name: 'Ambient Wash', params: { mode: 11, rate: 400, intensity: 0.5, echoVolume: 0.6, reverbVolume: 0.8, bass: 3, treble: 5, bpmSync: 1, syncDivision: '1/4' } },
    ],
  },
  {
    id: 'SpaceyDelayer', name: 'Spacey Delayer', category: 'tonejs', group: 'Reverb & Delay',
    loadMode: 'eager', bpmSyncParams: ['firstTap'],
    create: async (c: EffectConfig) => {
      const { SpaceyDelayerEffect } = await import('@engine/effects/SpaceyDelayerEffect');
      const p = c.parameters;
      return new SpaceyDelayerEffect({
        firstTap: Number(p.firstTap) || 250, tapSize: Number(p.tapSize) || 150,
        feedback: Number(p.feedback) || 40, multiTap: p.multiTap != null ? Number(p.multiTap) : 1,
        tapeFilter: Number(p.tapeFilter) || 0, wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ firstTap: 250, tapSize: 150, feedback: 40, multiTap: 1, tapeFilter: 0 }),
    presets: [
      { name: 'Short Tape', params: { firstTap: 120, tapSize: 80, feedback: 30, multiTap: 1, tapeFilter: 0 } },
      { name: 'Long Tape', params: { firstTap: 400, tapSize: 200, feedback: 50, multiTap: 1, tapeFilter: 0 } },
      { name: 'Dub Space', params: { firstTap: 300, tapSize: 250, feedback: 70, multiTap: 1, tapeFilter: 1 } },
    ],
  },
  {
    id: 'RETapeEcho', name: 'RE Tape Echo', category: 'tonejs', group: 'Reverb & Delay',
    loadMode: 'eager', bpmSyncParams: ['repeatRate'],
    create: async (c: EffectConfig) => {
      const { RETapeEchoEffect } = await import('@engine/effects/RETapeEchoEffect');
      const p = c.parameters;
      return new RETapeEchoEffect({
        mode: p.mode != null ? Number(p.mode) : 3, repeatRate: Number(p.repeatRate) || 0.5,
        intensity: Number(p.intensity) || 0.5, echoVolume: Number(p.echoVolume) || 0.8,
        wow: Number(p.wow) || 0, flutter: Number(p.flutter) || 0, dirt: Number(p.dirt) || 0,
        inputBleed: p.inputBleed != null ? Number(p.inputBleed) : 0,
        loopAmount: Number(p.loopAmount) || 0,
        playheadFilter: p.playheadFilter != null ? Number(p.playheadFilter) : 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ mode: 3, repeatRate: 0.5, intensity: 0.5, echoVolume: 0.8, wow: 0, flutter: 0, dirt: 0, inputBleed: 0, loopAmount: 0, playheadFilter: 1 }),
    presets: [
      { name: 'Vintage', params: { mode: 3, repeatRate: 0.4, intensity: 0.5, echoVolume: 0.7, wow: 0.15, flutter: 0.1, dirt: 0.1, inputBleed: 0, loopAmount: 0, playheadFilter: 1 } },
      { name: 'Space Echo', params: { mode: 7, repeatRate: 0.6, intensity: 0.7, echoVolume: 0.9, wow: 0.05, flutter: 0.05, dirt: 0, inputBleed: 0, loopAmount: 0, playheadFilter: 0.8 } },
      { name: 'Dub Siren', params: { mode: 1, repeatRate: 0.8, intensity: 0.85, echoVolume: 1.0, wow: 0.2, flutter: 0.15, dirt: 0.2, inputBleed: 0, loopAmount: 0, playheadFilter: 0.6 } },
      { name: 'Subtle Warmth', params: { mode: 3, repeatRate: 0.3, intensity: 0.3, echoVolume: 0.5, wow: 0.1, flutter: 0.08, dirt: 0.05, inputBleed: 0, loopAmount: 0, playheadFilter: 1 } },
    ],
  },

  // ── Modulation ──────────────────────────────────────────────────────────
  {
    id: 'Chorus', name: 'Chorus', category: 'tonejs', group: 'Modulation',
    loadMode: 'eager', bpmSyncParams: ['frequency'],
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      const chorus = new Tone.Chorus({
        frequency: Number(p.frequency) || 1.5, delayTime: Number(p.delayTime) || 3.5,
        depth: Number(p.depth) || 0.7, wet: c.wet / 100,
      });
      chorus.start();
      return chorus;
    },
    getDefaultParameters: () => ({ frequency: 1.5, delayTime: 3.5, depth: 0.7 }),
    presets: [
      { name: 'Subtle', params: { frequency: 0.8, delayTime: 2.5, depth: 0.3 } },
      { name: 'Lush', params: { frequency: 1.5, delayTime: 4.5, depth: 0.9 } },
      { name: '80s Synth', params: { frequency: 3.0, delayTime: 5.0, depth: 0.6 } },
    ],
  },
  {
    id: 'Phaser', name: 'Phaser', category: 'tonejs', group: 'Modulation',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      return new Tone.Phaser({
        frequency: Number(p.frequency) || 0.5, octaves: Number(p.octaves) || 3,
        baseFrequency: Number(p.baseFrequency) || 1000, Q: Number(p.Q) || 10, wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ frequency: 0.5, octaves: 3, baseFrequency: 1000, Q: 10 }),
    presets: [
      { name: 'Slow Sweep', params: { frequency: 0.2, octaves: 4, baseFrequency: 800, Q: 8 } },
      { name: 'Jet', params: { frequency: 1.5, octaves: 5, baseFrequency: 1200, Q: 15 } },
      { name: 'Subtle', params: { frequency: 0.3, octaves: 1.5, baseFrequency: 1000, Q: 5 } },
    ],
  },
  {
    id: 'Tremolo', name: 'Tremolo', category: 'tonejs', group: 'Modulation',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      const t = new Tone.Tremolo({ frequency: Number(p.frequency) || 10, depth: Number(p.depth) || 0.5, wet: c.wet / 100 });
      t.start();
      return t;
    },
    getDefaultParameters: () => ({ frequency: 10, depth: 0.5 }),
    presets: [
      { name: 'Gentle Pulse', params: { frequency: 4, depth: 0.3 } },
      { name: 'Surf', params: { frequency: 6, depth: 0.8 } },
      { name: 'Helicopter', params: { frequency: 20, depth: 1.0 } },
    ],
  },
  {
    id: 'Vibrato', name: 'Vibrato', category: 'tonejs', group: 'Modulation',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      return new Tone.Vibrato({ frequency: Number(p.frequency) || 5, depth: Number(p.depth) || 0.1, wet: c.wet / 100 });
    },
    getDefaultParameters: () => ({ frequency: 5, depth: 0.1 }),
    presets: [
      { name: 'Subtle', params: { frequency: 4, depth: 0.05 } },
      { name: 'Classic', params: { frequency: 5, depth: 0.15 } },
      { name: 'Wide', params: { frequency: 6, depth: 0.4 } },
    ],
  },
  {
    id: 'AutoPanner', name: 'Auto Panner', category: 'tonejs', group: 'Modulation',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      const ap = new Tone.AutoPanner({ frequency: Number(p.frequency) || 1, depth: Number(p.depth) || 1, wet: c.wet / 100 });
      ap.start();
      return ap;
    },
    getDefaultParameters: () => ({ frequency: 1, depth: 1 }),
    presets: [
      { name: 'Slow Pan', params: { frequency: 0.3, depth: 1 } },
      { name: 'Fast Pan', params: { frequency: 4, depth: 1 } },
      { name: 'Subtle', params: { frequency: 0.8, depth: 0.4 } },
    ],
  },
  {
    id: 'BiPhase', name: 'Bi-Phase', category: 'tonejs', group: 'Modulation',
    loadMode: 'eager', bpmSyncParams: ['rateA'],
    create: async (c: EffectConfig) => {
      const { BiPhaseEffect } = await import('@engine/effects/BiPhaseEffect');
      const p = c.parameters;
      return new BiPhaseEffect({
        rateA: Number(p.rateA) || 0.5, depthA: Number(p.depthA) || 0.6,
        rateB: Number(p.rateB) || 4.0, depthB: Number(p.depthB) || 0.4,
        feedback: Number(p.feedback) || 0.3,
        routing: Number(p.routing) === 1 ? 'series' : 'parallel', wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ rateA: 0.5, depthA: 0.6, rateB: 4.0, depthB: 0.4, feedback: 0.3, routing: 0 }),
    presets: [
      { name: 'Slow Swirl', params: { rateA: 0.2, depthA: 0.8, rateB: 1.5, depthB: 0.3, feedback: 0.2, routing: 0 } },
      { name: 'Fast Phase', params: { rateA: 2.0, depthA: 0.5, rateB: 8.0, depthB: 0.6, feedback: 0.5, routing: 0 } },
      { name: 'Wide Stereo', params: { rateA: 0.3, depthA: 0.7, rateB: 0.7, depthB: 0.7, feedback: 0.4, routing: 1 } },
    ],
  },

  // ── Dynamics ────────────────────────────────────────────────────────────
  {
    id: 'Compressor', name: 'Compressor', category: 'tonejs', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      return new Tone.Compressor({
        threshold: Number(p.threshold) || -24, ratio: Number(p.ratio) || 12,
        attack: Number(p.attack) || 0.003, release: Number(p.release) || 0.25,
      });
    },
    getDefaultParameters: () => ({ threshold: -24, ratio: 12, attack: 0.003, release: 0.25 }),
    presets: [
      { name: 'Gentle Glue', params: { threshold: -18, ratio: 2, attack: 0.01, release: 0.15 } },
      { name: 'Punchy', params: { threshold: -20, ratio: 6, attack: 0.001, release: 0.1 } },
      { name: 'Brick Wall', params: { threshold: -30, ratio: 20, attack: 0.001, release: 0.3 } },
      { name: 'Transparent', params: { threshold: -12, ratio: 1.5, attack: 0.02, release: 0.2 } },
    ],
  },
  {
    id: 'SidechainCompressor', name: 'Sidechain Compressor', category: 'tonejs', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { SidechainCompressor } = await import('@engine/effects/SidechainCompressor');
      const p = c.parameters;
      return new SidechainCompressor({
        threshold: Number(p.threshold) ?? -24, ratio: Number(p.ratio) ?? 4,
        attack: Number(p.attack) ?? 0.003, release: Number(p.release) ?? 0.25,
        knee: Number(p.knee) ?? 6, sidechainGain: (Number(p.sidechainGain) ?? 100) / 100,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ threshold: -24, ratio: 4, attack: 0.003, release: 0.25, knee: 6, sidechainGain: 100 }),
    presets: [
      { name: 'Pumping', params: { threshold: -30, ratio: 8, attack: 0.001, release: 0.15, knee: 3, sidechainGain: 100 } },
      { name: 'Ducking', params: { threshold: -20, ratio: 4, attack: 0.005, release: 0.3, knee: 10, sidechainGain: 80 } },
      { name: 'Extreme', params: { threshold: -36, ratio: 12, attack: 0.001, release: 0.1, knee: 0, sidechainGain: 100 } },
    ],
  },

  // ── EQ & Stereo ────────────────────────────────────────────────────────
  {
    id: 'EQ3', name: '3-Band EQ', category: 'tonejs', group: 'EQ & Stereo',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      const lowFreq = Number(p.lowFrequency) || 250;
      const highFreq = Number(p.highFrequency) || 3500;
      // Use three serial peaking filters instead of Tone.EQ3's multiband split,
      // which has inherent phase cancellation causing ~11dB insertion loss.
      const eqInput = new Tone.Gain(1);
      const lowFilter = new Tone.Filter({
        type: 'peaking' as BiquadFilterType,
        frequency: lowFreq,
        gain: Number(p.low) || 0,
        Q: 0.5,
      });
      const midFilter = new Tone.Filter({
        type: 'peaking' as BiquadFilterType,
        frequency: Math.sqrt(lowFreq * highFreq),
        gain: Number(p.mid) || 0,
        Q: 0.7,
      });
      const highFilter = new Tone.Filter({
        type: 'peaking' as BiquadFilterType,
        frequency: highFreq,
        gain: Number(p.high) || 0,
        Q: 0.5,
      });
      eqInput.chain(lowFilter, midFilter, highFilter);
      (eqInput as unknown as Record<string, unknown>)._eq3Filters = [lowFilter, midFilter, highFilter];
      Object.defineProperty(eqInput, 'output', {
        value: (highFilter as unknown as { output: unknown }).output,
        configurable: true,
      });
      return eqInput;
    },
    getDefaultParameters: () => ({ low: 0, mid: 0, high: 0, lowFrequency: 250, highFrequency: 3500 }),
    presets: [
      { name: 'Bass Boost', params: { low: 6, mid: 0, high: 0, lowFrequency: 250, highFrequency: 3500 } },
      { name: 'Treble Boost', params: { low: 0, mid: 0, high: 6, lowFrequency: 250, highFrequency: 3500 } },
      { name: 'V-Shape', params: { low: 5, mid: -3, high: 5, lowFrequency: 250, highFrequency: 3500 } },
      { name: 'Vocal Presence', params: { low: -2, mid: 4, high: 1, lowFrequency: 300, highFrequency: 4000 } },
      { name: 'Flat', params: { low: 0, mid: 0, high: 0, lowFrequency: 250, highFrequency: 3500 } },
    ],
  },
  {
    id: 'StereoWidener', name: 'Stereo Widener', category: 'tonejs', group: 'EQ & Stereo',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      return new Tone.StereoWidener({ width: Math.min(0.85, Number(p.width) || 0.5), wet: c.wet / 100 });
    },
    getDefaultParameters: () => ({ width: 0.5 }),
    presets: [
      { name: 'Subtle', params: { width: 0.3 } },
      { name: 'Wide', params: { width: 0.6 } },
      { name: 'Ultra Wide', params: { width: 0.85 } },
    ],
  },

  // ── Pitch ───────────────────────────────────────────────────────────────
  {
    id: 'FrequencyShifter', name: 'Frequency Shifter', category: 'tonejs', group: 'Pitch',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      return new Tone.FrequencyShifter({ frequency: Number(p.frequency) || 0, wet: c.wet / 100 });
    },
    getDefaultParameters: () => ({ frequency: 0 }),
    presets: [
      { name: 'Subtle Shift', params: { frequency: 5 } },
      { name: 'Robot', params: { frequency: 50 } },
      { name: 'Metallic', params: { frequency: 200 } },
    ],
  },
  {
    id: 'PitchShift', name: 'Pitch Shift', category: 'tonejs', group: 'Pitch',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      return new Tone.PitchShift({
        pitch: Number(p.pitch) || 0, windowSize: Number(p.windowSize) || 0.1,
        delayTime: Number(p.delayTime) || 0, feedback: Number(p.feedback) || 0, wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ pitch: 0, windowSize: 0.1, delayTime: 0, feedback: 0 }),
    presets: [
      { name: 'Octave Up', params: { pitch: 12, windowSize: 0.1, delayTime: 0, feedback: 0 } },
      { name: 'Octave Down', params: { pitch: -12, windowSize: 0.1, delayTime: 0, feedback: 0 } },
      { name: 'Fifth Up', params: { pitch: 7, windowSize: 0.1, delayTime: 0, feedback: 0 } },
      { name: 'Detune', params: { pitch: 0.15, windowSize: 0.08, delayTime: 0.01, feedback: 0.1 } },
    ],
  },

  // ── *Wave / Ambient ─────────────────────────────────────────────────────
  {
    id: 'TapeDegradation', name: 'Tape Degradation', category: 'tonejs', group: 'Lo-Fi',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { TapeDegradationEffect } = await import('@engine/effects/TapeDegradationEffect');
      const p = c.parameters;
      return new TapeDegradationEffect({
        wow: (Number(p.wow) || 30) / 100,
        flutter: (Number(p.flutter) || 20) / 100,
        hiss: (Number(p.hiss) || 15) / 100,
        dropouts: (Number(p.dropouts) || 0) / 100,
        saturation: (Number(p.saturation) || 30) / 100,
        toneShift: (Number(p.toneShift) || 50) / 100,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ wow: 30, flutter: 20, hiss: 15, dropouts: 0, saturation: 30, toneShift: 50 }),
    presets: [
      { name: 'Worn Tape', params: { wow: 50, flutter: 40, hiss: 25, dropouts: 10, saturation: 50, toneShift: 40 } },
      { name: 'Destroyed', params: { wow: 80, flutter: 70, hiss: 50, dropouts: 30, saturation: 80, toneShift: 30 } },
      { name: 'Subtle', params: { wow: 15, flutter: 10, hiss: 5, dropouts: 0, saturation: 15, toneShift: 55 } },
    ],
  },
  {
    id: 'AmbientDelay', name: 'Ambient Delay', category: 'tonejs', group: 'Delay',
    loadMode: 'eager',
    bpmSyncParams: ['time'],
    create: async (c: EffectConfig) => {
      const { AmbientDelayEffect } = await import('@engine/effects/AmbientDelayEffect');
      const p = c.parameters;
      return new AmbientDelayEffect({
        time: (Number(p.time) || 375) / 1000,
        feedback: (Number(p.feedback) || 55) / 100,
        taps: Number(p.taps) || 2,
        filterType: (p.filterType as 'lowpass' | 'highpass' | 'bandpass') || 'lowpass',
        filterFreq: Number(p.filterFreq) || 2500,
        filterQ: Number(p.filterQ) || 1.5,
        modRate: (Number(p.modRate) || 30) / 100,
        modDepth: (Number(p.modDepth) || 15) / 100,
        stereoSpread: (Number(p.stereoSpread) || 50) / 100,
        diffusion: (Number(p.diffusion) || 20) / 100,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ time: 375, feedback: 55, taps: 2, filterType: 'lowpass', filterFreq: 2500, filterQ: 1.5, modRate: 30, modDepth: 15, stereoSpread: 50, diffusion: 20 }),
    presets: [
      { name: 'Ethereal', params: { time: 500, feedback: 70, taps: 4, filterType: 'lowpass', filterFreq: 2000, filterQ: 2, modRate: 20, modDepth: 25, stereoSpread: 80, diffusion: 40 } },
      { name: 'Subtle Space', params: { time: 250, feedback: 35, taps: 2, filterType: 'lowpass', filterFreq: 3500, filterQ: 1, modRate: 15, modDepth: 8, stereoSpread: 40, diffusion: 15 } },
      { name: 'Infinite', params: { time: 600, feedback: 85, taps: 4, filterType: 'lowpass', filterFreq: 1800, filterQ: 2.5, modRate: 40, modDepth: 30, stereoSpread: 90, diffusion: 50 } },
    ],
  },
];

EffectRegistry.register(tonejs);
