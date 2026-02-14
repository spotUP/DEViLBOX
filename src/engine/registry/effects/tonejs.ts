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
      return new Tone.Distortion({ distortion: Number(p.drive) || 0.4, oversample: (p.oversample as OscillatorType) || 'none', wet });
    },
    getDefaultParameters: () => ({ drive: 0.4, oversample: 'none' }),
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
  },
  {
    id: 'BitCrusher', name: 'BitCrusher', category: 'tonejs', group: 'Distortion',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      const crusher = new Tone.BitCrusher(Number(p.bits) || 4);
      crusher.wet.value = c.wet / 100;
      // Wait for AudioWorklet
      const crusherWorklet = (crusher as unknown as { _bitCrusherWorklet: { _worklet?: AudioWorkletNode } })._bitCrusherWorklet;
      if (crusherWorklet) {
        for (let attempt = 0; attempt < 50; attempt++) {
          if (crusherWorklet._worklet) break;
          await new Promise(r => setTimeout(r, 20));
        }
      }
      return crusher;
    },
    getDefaultParameters: () => ({ bits: 4 }),
  },
  {
    id: 'Chebyshev', name: 'Chebyshev', category: 'tonejs', group: 'Distortion',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      return new Tone.Chebyshev({ order: Number(p.order) || 50, oversample: (p.oversample as OscillatorType) || 'none', wet: c.wet / 100 });
    },
    getDefaultParameters: () => ({ order: 50, oversample: 'none' }),
  },

  // ── Filter ──────────────────────────────────────────────────────────────
  {
    id: 'Filter', name: 'Filter', category: 'tonejs', group: 'Filter',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      return new Tone.Filter({
        type: (p.type as BiquadFilterType) || 'lowpass', frequency: Number(p.frequency) || 5000,
        rolloff: Number(p.rolloff) || -12, Q: Number(p.Q) || 1, gain: Number(p.gain) || 0,
      });
    },
    getDefaultParameters: () => ({ type: 'lowpass', frequency: 5000, rolloff: -12, Q: 1, gain: 0 }),
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
  },

  // ── Reverb & Delay ──────────────────────────────────────────────────────
  {
    id: 'Reverb', name: 'Reverb', category: 'tonejs', group: 'Reverb & Delay',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      const reverb = new Tone.Reverb({ decay: Number(p.decay) || 1.5, preDelay: Number(p.preDelay) || 0.01, wet: c.wet / 100 });
      await reverb.ready;
      return reverb;
    },
    getDefaultParameters: () => ({ decay: 1.5, preDelay: 0.01 }),
  },
  {
    id: 'JCReverb', name: 'JC Reverb', category: 'tonejs', group: 'Reverb & Delay',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      const jcr = new Tone.JCReverb({ roomSize: Number(p.roomSize) || 0.5, wet: c.wet / 100 });
      const combFilters = (jcr as unknown as { _feedbackCombFilters: { _worklet?: AudioWorkletNode }[] })._feedbackCombFilters;
      if (combFilters?.length) {
        for (let attempt = 0; attempt < 50; attempt++) {
          if (combFilters.every(f => f._worklet)) break;
          await new Promise(r => setTimeout(r, 20));
        }
      }
      return jcr;
    },
    getDefaultParameters: () => ({ roomSize: 0.5 }),
  },
  {
    id: 'Delay', name: 'Delay', category: 'tonejs', group: 'Reverb & Delay',
    loadMode: 'eager', bpmSyncParams: ['time'],
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      return new Tone.FeedbackDelay({ delayTime: Number(p.time) || 0.25, feedback: Number(p.feedback) || 0.5, wet: c.wet / 100 });
    },
    getDefaultParameters: () => ({ time: 0.25, feedback: 0.5 }),
  },
  {
    id: 'FeedbackDelay', name: 'Feedback Delay', category: 'tonejs', group: 'Reverb & Delay',
    loadMode: 'eager', bpmSyncParams: ['time'],
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      return new Tone.FeedbackDelay({ delayTime: Number(p.time) || 0.25, feedback: Number(p.feedback) || 0.5, wet: c.wet / 100 });
    },
    getDefaultParameters: () => ({ time: 0.25, feedback: 0.5 }),
  },
  {
    id: 'PingPongDelay', name: 'Ping Pong Delay', category: 'tonejs', group: 'Reverb & Delay',
    loadMode: 'eager', bpmSyncParams: ['time'],
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      return new Tone.PingPongDelay({ delayTime: Number(p.time) || 0.25, feedback: Number(p.feedback) || 0.5, wet: c.wet / 100 });
    },
    getDefaultParameters: () => ({ time: 0.25, feedback: 0.5 }),
  },
  {
    id: 'SpaceEcho', name: 'Space Echo', category: 'tonejs', group: 'Reverb & Delay',
    loadMode: 'eager', bpmSyncParams: ['rate'],
    create: async (c: EffectConfig) => {
      const { SpaceEchoEffect } = await import('@engine/effects/SpaceEchoEffect');
      const p = c.parameters;
      return new SpaceEchoEffect({
        mode: Number(p.mode) || 4, rate: Number(p.rate) || 300,
        intensity: Number(p.intensity) || 0.5, echoVolume: Number(p.echoVolume) || 0.8,
        reverbVolume: Number(p.reverbVolume) || 0.3, bass: Number(p.bass) || 0,
        treble: Number(p.treble) || 0, wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ mode: 4, rate: 300, intensity: 0.5, echoVolume: 0.8, reverbVolume: 0.3, bass: 0, treble: 0 }),
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
  },
  {
    id: 'Phaser', name: 'Phaser', category: 'tonejs', group: 'Modulation',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      return new Tone.Phaser({
        frequency: Number(p.frequency) || 0.5, octaves: Number(p.octaves) || 3,
        baseFrequency: Number(p.baseFrequency) || 350, wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ frequency: 0.5, octaves: 3, baseFrequency: 350 }),
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
  },
  {
    id: 'Vibrato', name: 'Vibrato', category: 'tonejs', group: 'Modulation',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      return new Tone.Vibrato({ frequency: Number(p.frequency) || 5, depth: Number(p.depth) || 0.1, wet: c.wet / 100 });
    },
    getDefaultParameters: () => ({ frequency: 5, depth: 0.1 }),
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
  },

  // ── EQ & Stereo ────────────────────────────────────────────────────────
  {
    id: 'EQ3', name: '3-Band EQ', category: 'tonejs', group: 'EQ & Stereo',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      return new Tone.EQ3({
        low: Number(p.low) || 0, mid: Number(p.mid) || 0, high: Number(p.high) || 0,
        lowFrequency: Number(p.lowFrequency) || 400, highFrequency: Number(p.highFrequency) || 2500,
      });
    },
    getDefaultParameters: () => ({ low: 0, mid: 0, high: 0, lowFrequency: 400, highFrequency: 2500 }),
  },
  {
    id: 'StereoWidener', name: 'Stereo Widener', category: 'tonejs', group: 'EQ & Stereo',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const p = c.parameters;
      return new Tone.StereoWidener({ width: Number(p.width) || 0.5 });
    },
    getDefaultParameters: () => ({ width: 0.5 }),
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
  },
];

EffectRegistry.register(tonejs);
