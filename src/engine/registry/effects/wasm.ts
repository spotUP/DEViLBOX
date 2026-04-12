/**
 * WASM effect registrations — eager
 *
 * Registers native C++ DSP effects that run via AudioWorklet + WASM:
 * MoogFilter, MVerb, Leslie, SpringReverb
 */

import type { EffectConfig } from '@typedefs/instrument';
import type { EffectDescriptor } from '../EffectDescriptor';
import { EffectRegistry } from '../EffectRegistry';
import type { MoogFilterModel as MoogModel, MoogFilterMode as MoogMode } from '@engine/effects/MoogFilterEffect';

const wasmEffects: EffectDescriptor[] = [
  {
    id: 'MoogFilter', name: 'Moog Filter', category: 'wasm', group: 'Filter',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { MoogFilterEffect, MoogFilterModel, MoogFilterMode } = await import('@engine/effects/MoogFilterEffect');
      const p = c.parameters;
      return new MoogFilterEffect({
        cutoff: Number(p.cutoff) || 1000,
        resonance: (Number(p.resonance) || 10) / 100,
        drive: Number(p.drive) || 1.0,
        model: (Number(p.model) || MoogFilterModel.Hyperion) as MoogModel,
        filterMode: (Number(p.filterMode) || MoogFilterMode.LP4) as MoogMode,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ cutoff: 1000, resonance: 10, drive: 1.0, model: 0, filterMode: 0 }),
    presets: [
      { name: 'Fat Bass', params: { cutoff: 300, resonance: 60, drive: 3 } },
      { name: 'Acid Squelch', params: { cutoff: 800, resonance: 90, drive: 5 } },
      { name: 'Dark Pad', params: { cutoff: 500, resonance: 30, drive: 1 } },
      { name: 'Screaming', params: { cutoff: 2000, resonance: 95, drive: 7 } },
    ],
  },
  {
    id: 'MVerb', name: 'MVerb Plate Reverb', category: 'wasm', group: 'Reverb & Delay',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { MVerbEffect } = await import('@engine/effects/MVerbEffect');
      const p = c.parameters;
      return new MVerbEffect({
        damping: Number(p.damping), density: Number(p.density), bandwidth: Number(p.bandwidth),
        decay: Number(p.decay), predelay: Number(p.predelay), size: Number(p.size),
        gain: Number(p.gain), mix: Number(p.mix), earlyMix: Number(p.earlyMix),
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ damping: 0.5, density: 0.5, bandwidth: 0.5, decay: 0.7, predelay: 0.0, size: 0.8, gain: 1.0, mix: 0.4, earlyMix: 0.5 }),
    presets: [
      { name: 'Small Room', params: { decay: 0.3, size: 0.3, mix: 0.2, earlyMix: 0.7, predelay: 0.0 } },
      { name: 'Concert Hall', params: { decay: 0.8, size: 0.9, mix: 0.35, earlyMix: 0.4, bandwidth: 0.7 } },
      { name: 'Infinite Wash', params: { decay: 0.99, size: 1.0, mix: 0.5, damping: 0.2, density: 0.8 } },
      { name: 'Plate', params: { decay: 0.5, size: 0.5, mix: 0.3, density: 0.8, bandwidth: 0.9, earlyMix: 0.3 } },
    ],
  },
  {
    id: 'Leslie', name: 'Leslie Rotary Speaker', category: 'wasm', group: 'Modulation',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { LeslieEffect } = await import('@engine/effects/LeslieEffect');
      const p = c.parameters;
      return new LeslieEffect({
        speed: Number(p.speed), hornRate: Number(p.hornRate), drumRate: Number(p.drumRate),
        hornDepth: Number(p.hornDepth), drumDepth: Number(p.drumDepth),
        doppler: Number(p.doppler), width: Number(p.width), acceleration: Number(p.acceleration),
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ speed: 0.0, hornRate: 6.8, drumRate: 5.9, hornDepth: 0.7, drumDepth: 0.5, doppler: 0.5, width: 0.8, acceleration: 0.5 }),
    presets: [
      { name: 'Slow', params: { speed: 0.0, hornRate: 0.8, drumRate: 0.7, hornDepth: 0.5, drumDepth: 0.3 } },
      { name: 'Fast', params: { speed: 1.0, hornRate: 6.8, drumRate: 5.9, hornDepth: 0.9, drumDepth: 0.7 } },
      { name: 'Gentle', params: { speed: 0.0, hornRate: 1.5, drumRate: 1.2, hornDepth: 0.3, drumDepth: 0.2, doppler: 0.2 } },
    ],
  },
  {
    id: 'SpringReverb', name: 'Spring Reverb', category: 'wasm', group: 'Reverb & Delay',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { SpringReverbEffect } = await import('@engine/effects/SpringReverbEffect');
      const p = c.parameters;
      return new SpringReverbEffect({
        decay: Number(p.decay), damping: Number(p.damping), tension: Number(p.tension),
        mix: Number(p.mix), drip: Number(p.drip), diffusion: Number(p.diffusion),
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ decay: 0.6, damping: 0.4, tension: 0.5, mix: 0.35, drip: 0.5, diffusion: 0.7 }),
    presets: [
      { name: 'Vintage Spring', params: { decay: 0.5, damping: 0.6, tension: 0.4, drip: 0.7, diffusion: 0.5 } },
      { name: 'Surf', params: { decay: 0.8, damping: 0.2, tension: 0.7, drip: 0.9, mix: 0.5, diffusion: 0.8 } },
      { name: 'Dark Spring', params: { decay: 0.7, damping: 0.8, tension: 0.3, drip: 0.3, mix: 0.3, diffusion: 0.6 } },
    ],
  },
  {
    id: 'Aelapse', name: 'Ælapse Tape+Springs', category: 'wasm', group: 'Reverb & Delay',
    loadMode: 'eager',
    description: 'Tape delay chained into a 4-spring reverb tank. Port of smiarx/aelapse. Hardware UI runs the real JUCE editor in WASM with a WebGL2 springs-shader overlay.',
    create: async (c: EffectConfig) => {
      const { AelapseEffect } = await import('@engine/effects/AelapseEffect');
      const p = c.parameters;
      return new AelapseEffect({
        delayActive:     (Number(p.delayActive) ?? 100) > 50,
        delayDryWet:     (Number(p.delayDryWet) ?? 35) / 100,
        delayTime:       (Number(p.delayTime) ?? 30) / 100,
        delayFeedback:   (Number(p.delayFeedback) ?? 45) / 100,
        delayCutLow:     (Number(p.delayCutLow) ?? 5) / 100,
        delayCutHi:      (Number(p.delayCutHi) ?? 75) / 100,
        delaySaturation: (Number(p.delaySaturation) ?? 25) / 100,
        delayDrift:      (Number(p.delayDrift) ?? 15) / 100,
        delayMode:       Number(p.delayMode) ?? 0,
        springsActive:   (Number(p.springsActive) ?? 100) > 50,
        springsDryWet:   (Number(p.springsDryWet) ?? 40) / 100,
        springsWidth:    (Number(p.springsWidth) ?? 100) / 100,
        springsLength:   (Number(p.springsLength) ?? 50) / 100,
        springsDecay:    (Number(p.springsDecay) ?? 40) / 100,
        springsDamp:     (Number(p.springsDamp) ?? 30) / 100,
        springsShape:    (Number(p.springsShape) ?? 30) / 100,
        springsTone:     (Number(p.springsTone) ?? 50) / 100,
        springsScatter:  (Number(p.springsScatter) ?? 50) / 100,
        springsChaos:    (Number(p.springsChaos) ?? 10) / 100,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({
      delayActive: 100, delayDryWet: 35, delayTime: 30, delayFeedback: 45,
      delayCutLow: 5, delayCutHi: 75, delaySaturation: 25, delayDrift: 15, delayMode: 0,
      springsActive: 100, springsDryWet: 40, springsWidth: 100, springsLength: 50,
      springsDecay: 40, springsDamp: 30, springsShape: 30, springsTone: 50,
      springsScatter: 50, springsChaos: 10,
    }),
    presets: [
      { name: 'Tape Echo', params: { delayActive: 100, springsActive: 0, delayDryWet: 50, delayTime: 40, delayFeedback: 55, delaySaturation: 40, delayDrift: 25 } },
      { name: 'Spring Wash', params: { delayActive: 0, springsActive: 100, springsDryWet: 60, springsLength: 70, springsDecay: 60, springsDamp: 20 } },
      { name: 'Both', params: { delayActive: 100, springsActive: 100, delayDryWet: 30, delayTime: 25, delayFeedback: 35, springsDryWet: 35, springsLength: 50, springsDecay: 40 } },
    ],
  },
  {
    id: 'ShimmerReverb', name: 'Shimmer Reverb', category: 'wasm', group: 'Reverb & Delay',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { ShimmerReverbEffect } = await import('@engine/effects/ShimmerReverbEffect');
      const p = c.parameters;
      return new ShimmerReverbEffect({
        decay: (Number(p.decay) || 70) / 100,
        shimmer: (Number(p.shimmer) || 50) / 100,
        pitch: Number(p.pitch) ?? 12,
        damping: (Number(p.damping) || 50) / 100,
        size: (Number(p.size) || 70) / 100,
        predelay: (Number(p.predelay) || 40) / 1000,
        modRate: (Number(p.modRate) || 30) / 100,
        modDepth: (Number(p.modDepth) || 20) / 100,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ decay: 70, shimmer: 50, pitch: 12, damping: 50, size: 70, predelay: 40, modRate: 30, modDepth: 20 }),
    presets: [
      { name: 'Ethereal', params: { decay: 85, shimmer: 70, pitch: 12, size: 90, modRate: 20, modDepth: 30 } },
      { name: 'Angelic', params: { decay: 95, shimmer: 90, pitch: 24, damping: 30, size: 100, predelay: 60 } },
      { name: 'Dark Shimmer', params: { decay: 80, shimmer: 40, pitch: 7, damping: 80, size: 60, modRate: 10 } },
    ],
  },
  {
    id: 'Vocoder', name: 'Vocoder', category: 'wasm', group: 'Voice',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { VocoderEffect, VOCODER_EFFECT_PRESETS } = await import('@engine/effects/VocoderEffect');
      const p = c.parameters;
      const sourceStr = (typeof p.source === 'string' ? p.source : 'self') as 'self' | 'mic';
      const presetName = typeof p.preset === 'string' ? p.preset : '';
      const preset = presetName ? VOCODER_EFFECT_PRESETS.find((x) => x.name === presetName) : undefined;

      // If a preset is selected, its values seed the engine. Individual
      // params still override (so the user can tweak after picking a preset).
      const eff = new VocoderEffect({
        source: sourceStr,
        bands: Number(p.bands) || preset?.params.bands || 32,
        filtersPerBand: Number(p.filtersPerBand) || preset?.params.filtersPerBand || 6,
        carrierType: (Number(p.carrierType) ?? 3) as 0 | 1 | 2 | 3,
        carrierFreq: Number(p.carrierFreq) || preset?.params.carrierFreq || 130.81,
        formantShift: Number(p.formantShift) || preset?.params.formantShift || 1.0,
        reactionTime: (Number(p.reactionTime) || (preset?.params.reactionTime ?? 0.03) * 1000) / 1000,
        wet: c.wet / 100,
      });
      return eff;
    },
    getDefaultParameters: () => ({
      preset: 'Kraftwerk',  // default voice
      source: 'self',
      bands: 16,
      filtersPerBand: 4,
      carrierType: 0,       // saw
      carrierFreq: 110.0,
      formantShift: 0.7,
      reactionTime: 25,     // ms (stored as ms, divided by 1000 in create)
    }),
    presets: [
      { name: 'Robot', params: { bands: 32, filtersPerBand: 6, carrierType: 0, carrierFreq: 110, formantShift: 1.0, reactionTime: 15 } },
      { name: 'Whisper', params: { bands: 8, filtersPerBand: 2, carrierType: 3, formantShift: 0.5, reactionTime: 40 } },
      { name: 'Choir', params: { bands: 24, filtersPerBand: 4, carrierType: 0, carrierFreq: 220, formantShift: 1.2, reactionTime: 30 } },
    ],
  },
  {
    id: 'AutoTune', name: 'Auto-Tune', category: 'wasm', group: 'Voice',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { AutoTuneEffect } = await import('@engine/effects/AutoTuneEffect');
      const p = c.parameters;
      const scaleStr = (typeof p.scale === 'string' ? p.scale : 'major') as
        'major' | 'minor' | 'chromatic' | 'pentatonic' | 'blues';
      return new AutoTuneEffect({
        key: Number(p.key) || 0,
        scale: scaleStr,
        strength: (Number(p.strength) ?? 100) / 100,
        speed: (Number(p.speed) ?? 70) / 100,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({
      key: 0,            // C
      scale: 'major',
      strength: 100,     // full snap
      speed: 70,         // fairly fast
    }),
    presets: [
      { name: 'Subtle', params: { strength: 50, speed: 40 } },
      { name: 'Natural', params: { strength: 80, speed: 60 } },
      { name: 'Hard Tune', params: { strength: 100, speed: 100 } },
    ],
  },
  {
    id: 'GranularFreeze', name: 'Granular Freeze', category: 'wasm', group: 'Granular',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { GranularFreezeEffect } = await import('@engine/effects/GranularFreezeEffect');
      const p = c.parameters;
      return new GranularFreezeEffect({
        freeze: Number(p.freeze) || 0,
        grainSize: (Number(p.grainSize) || 80) / 1000,
        density: Number(p.density) || 12,
        scatter: (Number(p.scatter) || 30) / 100,
        pitch: Number(p.pitch) ?? 0,
        spray: (Number(p.spray) || 20) / 100,
        shimmer: (Number(p.shimmer) || 0) / 100,
        stereoWidth: (Number(p.stereoWidth) || 70) / 100,
        feedback: (Number(p.feedback) || 0) / 100,
        captureLength: (Number(p.captureLen) || 500) / 1000,
        attack: (Number(p.attack) || 5) / 1000,
        release: (Number(p.release) || 40) / 1000,
        thru: Number(p.thru) || 0,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ freeze: 0, grainSize: 80, density: 12, scatter: 30, pitch: 0, spray: 20, shimmer: 0, stereoWidth: 70, feedback: 0, captureLen: 500, attack: 5, release: 40, thru: 0 }),
    presets: [
      { name: 'Shimmer Pad', params: { freeze: 1, grainSize: 120, density: 20, shimmer: 60, stereoWidth: 100, feedback: 30, pitch: 12 } },
      { name: 'Glitch', params: { freeze: 1, grainSize: 20, density: 30, scatter: 80, spray: 70, stereoWidth: 50, feedback: 10 } },
      { name: 'Ambient', params: { freeze: 1, grainSize: 150, density: 8, scatter: 40, shimmer: 30, stereoWidth: 90, feedback: 20 } },
    ],
  },
  {
    id: 'NoiseGate', name: 'Noise Gate', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { NoiseGateEffect } = await import('@engine/effects/NoiseGateEffect');
      const p = c.parameters;
      return new NoiseGateEffect({
        threshold: Number(p.threshold) ?? -40,
        attack: Number(p.attack) ?? 0.5,
        hold: Number(p.hold) ?? 50,
        release: Number(p.release) ?? 100,
        range: (Number(p.range) ?? 0) / 100,
        hpf: Number(p.hpf) ?? 0,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ threshold: -40, attack: 0.5, hold: 50, release: 100, range: 0, hpf: 0 }),
    presets: [
      { name: 'Gentle', params: { threshold: -50, attack: 2, hold: 80, release: 200, range: 20 } },
      { name: 'Tight', params: { threshold: -30, attack: 0.1, hold: 20, release: 50, range: 60 } },
      { name: 'Drums', params: { threshold: -35, attack: 0.2, hold: 30, release: 80, range: 40, hpf: 100 } },
    ],
  },
  {
    id: 'Limiter', name: 'Limiter', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { LimiterEffect } = await import('@engine/effects/LimiterEffect');
      const p = c.parameters;
      return new LimiterEffect({
        threshold: Number(p.threshold) ?? -1,
        ceiling: Number(p.ceiling) ?? -0.3,
        attack: Number(p.attack) ?? 5,
        release: Number(p.release) ?? 50,
        lookahead: Number(p.lookahead) ?? 5,
        knee: Number(p.knee) ?? 0,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ threshold: -1, ceiling: -0.3, attack: 5, release: 50, lookahead: 5, knee: 0 }),
    presets: [
      { name: 'Soft', params: { threshold: -3, ceiling: -0.5, attack: 10, release: 100, knee: 6 } },
      { name: 'Loud', params: { threshold: -1, ceiling: -0.1, attack: 2, release: 30, lookahead: 5 } },
      { name: 'Broadcast', params: { threshold: -2, ceiling: -0.3, attack: 5, release: 50, lookahead: 10, knee: 3 } },
    ],
  },
  {
    id: 'Flanger', name: 'Flanger', category: 'wasm', group: 'Modulation',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { FlangerEffect } = await import('@engine/effects/FlangerEffect');
      const p = c.parameters;
      return new FlangerEffect({
        rate: Number(p.rate) ?? 0.3,
        depth: (Number(p.depth) ?? 70) / 100,
        delay: Number(p.delay) ?? 5,
        feedback: (Number(p.feedback) ?? 30) / 100,
        stereo: Number(p.stereo) ?? 90,
        mix: (Number(p.mix) ?? 50) / 100,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ rate: 0.3, depth: 70, delay: 5, feedback: 30, stereo: 90, mix: 50 }),
    presets: [
      { name: 'Subtle', params: { rate: 0.1, depth: 30, feedback: 10, mix: 30 } },
      { name: 'Jet', params: { rate: 0.5, depth: 90, delay: 3, feedback: 70, mix: 60 } },
      { name: 'Metallic', params: { rate: 0.8, depth: 100, delay: 1, feedback: 85, stereo: 180, mix: 50 } },
    ],
  },
  {
    id: 'Overdrive', name: 'Overdrive', category: 'wasm', group: 'Distortion',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { OverdriveEffect } = await import('@engine/effects/OverdriveEffect');
      const p = c.parameters;
      return new OverdriveEffect({
        drive: (Number(p.drive) ?? 50) / 100,
        tone: (Number(p.tone) ?? 50) / 100,
        mix: (Number(p.mix) ?? 100) / 100,
        level: (Number(p.level) ?? 50) / 100,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ drive: 50, tone: 50, mix: 100, level: 50 }),
    presets: [
      { name: 'Blues', params: { drive: 25, tone: 40, level: 60 } },
      { name: 'Rock', params: { drive: 55, tone: 55, level: 55 } },
      { name: 'Metal', params: { drive: 85, tone: 65, level: 45 } },
    ],
  },
  {
    id: 'RingMod', name: 'Ring Modulator', category: 'wasm', group: 'Modulation',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { RingModEffect } = await import('@engine/effects/RingModEffect');
      const p = c.parameters;
      return new RingModEffect({
        frequency: Number(p.frequency) ?? 440,
        mix: (Number(p.mix) ?? 50) / 100,
        waveform: Number(p.waveform) ?? 0,
        lfoRate: Number(p.lfoRate) ?? 0,
        lfoDepth: (Number(p.lfoDepth) ?? 0) / 100,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ frequency: 440, mix: 50, waveform: 0, lfoRate: 0, lfoDepth: 0 }),
    presets: [
      { name: 'Bell', params: { frequency: 800, mix: 40, waveform: 0 } },
      { name: 'Robot', params: { frequency: 200, mix: 70, waveform: 1, lfoRate: 2, lfoDepth: 30 } },
      { name: 'Subtle', params: { frequency: 440, mix: 20, waveform: 0, lfoRate: 0.5, lfoDepth: 10 } },
    ],
  },
  {
    id: 'DragonflyPlate', name: 'Dragonfly Plate Reverb', category: 'wasm', group: 'Reverb & Delay',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { DragonflyPlateEffect } = await import('@engine/effects/DragonflyPlateEffect');
      const p = c.parameters;
      return new DragonflyPlateEffect({
        decay: (Number(p.decay) ?? 70) / 100,
        damping: (Number(p.damping) ?? 50) / 100,
        predelay: Number(p.predelay) ?? 10,
        width: (Number(p.width) ?? 100) / 100,
        brightness: (Number(p.brightness) ?? 70) / 100,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ decay: 70, damping: 50, predelay: 10, width: 100, brightness: 70 }),
    presets: [
      { name: 'Bright Plate', params: { decay: 50, damping: 30, brightness: 90, predelay: 5 } },
      { name: 'Dark Plate', params: { decay: 60, damping: 80, brightness: 30, predelay: 15 } },
      { name: 'Long Plate', params: { decay: 95, damping: 40, brightness: 60, predelay: 25 } },
    ],
  },
  {
    id: 'DragonflyHall', name: 'Dragonfly Hall Reverb', category: 'wasm', group: 'Reverb & Delay',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { DragonflyHallEffect } = await import('@engine/effects/DragonflyHallEffect');
      const p = c.parameters;
      return new DragonflyHallEffect({
        decay: (Number(p.decay) ?? 80) / 100,
        damping: (Number(p.damping) ?? 40) / 100,
        predelay: Number(p.predelay) ?? 20,
        width: (Number(p.width) ?? 100) / 100,
        earlyLevel: (Number(p.earlyLevel) ?? 50) / 100,
        size: Number(p.size) ?? 1.5,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ decay: 80, damping: 40, predelay: 20, width: 100, earlyLevel: 50, size: 1.5 }),
    presets: [
      { name: 'Small Hall', params: { decay: 40, size: 0.5, earlyLevel: 70, predelay: 5 } },
      { name: 'Grand Hall', params: { decay: 85, size: 2.0, earlyLevel: 40, predelay: 30 } },
      { name: 'Cathedral', params: { decay: 95, size: 3.0, damping: 20, earlyLevel: 30, predelay: 50, width: 100 } },
    ],
  },
  {
    id: 'DragonflyRoom', name: 'Dragonfly Room Reverb', category: 'wasm', group: 'Reverb & Delay',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { DragonflyRoomEffect } = await import('@engine/effects/DragonflyRoomEffect');
      const p = c.parameters;
      return new DragonflyRoomEffect({
        decay: (Number(p.decay) ?? 40) / 100,
        damping: (Number(p.damping) ?? 60) / 100,
        predelay: Number(p.predelay) ?? 5,
        width: (Number(p.width) ?? 80) / 100,
        earlyLevel: (Number(p.earlyLevel) ?? 70) / 100,
        size: Number(p.size) ?? 0.7,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ decay: 40, damping: 60, predelay: 5, width: 80, earlyLevel: 70, size: 0.7 }),
    presets: [
      { name: 'Tight Room', params: { decay: 20, size: 0.3, earlyLevel: 80, predelay: 2 } },
      { name: 'Medium Room', params: { decay: 45, size: 0.8, earlyLevel: 60, predelay: 8 } },
      { name: 'Large Room', params: { decay: 70, size: 1.5, earlyLevel: 40, predelay: 15, damping: 40 } },
    ],
  },
  {
    id: 'JunoChorus', name: 'Juno-60 Chorus', category: 'wasm', group: 'Modulation',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { JunoChorusEffect } = await import('@engine/effects/JunoChorusEffect');
      const p = c.parameters;
      return new JunoChorusEffect({
        rate: Number(p.rate) ?? 0.5,
        depth: (Number(p.depth) ?? 50) / 100,
        mode: Number(p.mode) ?? 2,
        mix: (Number(p.mix) ?? 50) / 100,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ rate: 0.5, depth: 50, mode: 2, mix: 50 }),
    presets: [
      { name: 'Mode I', params: { mode: 1, rate: 0.5, depth: 40, mix: 50 } },
      { name: 'Mode II', params: { mode: 2, rate: 0.5, depth: 50, mix: 50 } },
      { name: 'Full', params: { mode: 3, rate: 0.8, depth: 70, mix: 60 } },
    ],
  },
  {
    id: 'ParametricEQ', name: '4-Band Parametric EQ', category: 'wasm', group: 'Filter',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { ParametricEQEffect } = await import('@engine/effects/ParametricEQEffect');
      const p = c.parameters;
      return new ParametricEQEffect({
        b1Freq: Number(p.b1Freq) ?? 100, b1Gain: Number(p.b1Gain) ?? 0, b1Q: Number(p.b1Q) ?? 0.7,
        b2Freq: Number(p.b2Freq) ?? 500, b2Gain: Number(p.b2Gain) ?? 0, b2Q: Number(p.b2Q) ?? 0.7,
        b3Freq: Number(p.b3Freq) ?? 2000, b3Gain: Number(p.b3Gain) ?? 0, b3Q: Number(p.b3Q) ?? 0.7,
        b4Freq: Number(p.b4Freq) ?? 8000, b4Gain: Number(p.b4Gain) ?? 0, b4Q: Number(p.b4Q) ?? 0.7,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({
      b1Freq: 100, b1Gain: 0, b1Q: 0.7,
      b2Freq: 500, b2Gain: 0, b2Q: 0.7,
      b3Freq: 2000, b3Gain: 0, b3Q: 0.7,
      b4Freq: 8000, b4Gain: 0, b4Q: 0.7,
    }),
    presets: [
      { name: 'Smiley', params: { b1Gain: 4, b2Gain: -2, b3Gain: -2, b4Gain: 4 } },
      { name: 'Vocal Presence', params: { b2Freq: 800, b2Gain: 3, b3Freq: 3000, b3Gain: 4, b3Q: 1.2 } },
      { name: 'Bass Boost', params: { b1Freq: 80, b1Gain: 6, b1Q: 0.5, b2Gain: 2 } },
    ],
  },
  {
    id: 'CabinetSim', name: 'Cabinet Simulator', category: 'wasm', group: 'Distortion',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { CabinetSimEffect } = await import('@engine/effects/CabinetSimEffect');
      const p = c.parameters;
      return new CabinetSimEffect({
        cabinet: Number(p.cabinet) ?? 0,
        mix: (Number(p.mix) ?? 100) / 100,
        brightness: (Number(p.brightness) ?? 50) / 100,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ cabinet: 0, mix: 100, brightness: 50 }),
    presets: [
      { name: 'Dark', params: { brightness: 20 } },
      { name: 'Neutral', params: { brightness: 50 } },
      { name: 'Bright', params: { brightness: 80 } },
    ],
  },
  {
    id: 'TubeAmp', name: 'Tube Amplifier', category: 'wasm', group: 'Distortion',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { TubeAmpEffect } = await import('@engine/effects/TubeAmpEffect');
      const p = c.parameters;
      return new TubeAmpEffect({
        drive: (Number(p.drive) ?? 50) / 100,
        bass: (Number(p.bass) ?? 50) / 100,
        mid: (Number(p.mid) ?? 50) / 100,
        treble: (Number(p.treble) ?? 50) / 100,
        presence: (Number(p.presence) ?? 50) / 100,
        master: (Number(p.master) ?? 50) / 100,
        sag: (Number(p.sag) ?? 20) / 100,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, master: 50, sag: 20 }),
    presets: [
      { name: 'Clean', params: { drive: 15, bass: 50, mid: 50, treble: 55, master: 60, sag: 10 } },
      { name: 'Crunch', params: { drive: 50, bass: 55, mid: 60, treble: 55, presence: 55, master: 45, sag: 25 } },
      { name: 'High Gain', params: { drive: 85, bass: 60, mid: 45, treble: 60, presence: 65, master: 35, sag: 40 } },
    ],
  },
  {
    id: 'DeEsser', name: 'De-Esser', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { DeEsserEffect } = await import('@engine/effects/DeEsserEffect');
      const p = c.parameters;
      return new DeEsserEffect({
        frequency: Number(p.frequency) ?? 6000,
        bandwidth: Number(p.bandwidth) ?? 1,
        threshold: Number(p.threshold) ?? -20,
        ratio: Number(p.ratio) ?? 4,
        attack: Number(p.attack) ?? 1,
        release: Number(p.release) ?? 50,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ frequency: 6000, bandwidth: 1, threshold: -20, ratio: 4, attack: 1, release: 50 }),
    presets: [
      { name: 'Light', params: { threshold: -15, ratio: 2, frequency: 6500 } },
      { name: 'Medium', params: { threshold: -20, ratio: 4, frequency: 6000, bandwidth: 1.5 } },
      { name: 'Aggressive', params: { threshold: -28, ratio: 8, frequency: 5500, bandwidth: 2 } },
    ],
  },
  {
    id: 'MultibandComp', name: 'Multiband Compressor', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { MultibandCompEffect } = await import('@engine/effects/MultibandCompEffect');
      const p = c.parameters;
      return new MultibandCompEffect({
        lowCrossover: Number(p.lowCrossover) ?? 200,
        highCrossover: Number(p.highCrossover) ?? 3000,
        lowThreshold: Number(p.lowThreshold) ?? -20,
        midThreshold: Number(p.midThreshold) ?? -20,
        highThreshold: Number(p.highThreshold) ?? -20,
        lowRatio: Number(p.lowRatio) ?? 4,
        midRatio: Number(p.midRatio) ?? 4,
        highRatio: Number(p.highRatio) ?? 4,
        lowGain: Number(p.lowGain) ?? 1,
        midGain: Number(p.midGain) ?? 1,
        highGain: Number(p.highGain) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ lowCrossover: 200, highCrossover: 3000, lowThreshold: -20, midThreshold: -20, highThreshold: -20, lowRatio: 4, midRatio: 4, highRatio: 4, lowGain: 1, midGain: 1, highGain: 1 }),
    presets: [
      { name: 'Gentle', params: { lowThreshold: -15, midThreshold: -15, highThreshold: -15, lowRatio: 2, midRatio: 2, highRatio: 2 } },
      { name: 'Punchy', params: { lowThreshold: -18, midThreshold: -22, highThreshold: -20, lowRatio: 3, midRatio: 5, highRatio: 4, lowGain: 1.5 } },
      { name: 'Mastering', params: { lowThreshold: -12, midThreshold: -14, highThreshold: -16, lowRatio: 3, midRatio: 3, highRatio: 3, lowGain: 1.2, midGain: 1.1, highGain: 1.3 } },
    ],
  },
  {
    id: 'TransientDesigner', name: 'Transient Designer', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { TransientDesignerEffect } = await import('@engine/effects/TransientDesignerEffect');
      const p = c.parameters;
      return new TransientDesignerEffect({
        attack: Number(p.attack) ?? 0,
        sustain: Number(p.sustain) ?? 0,
        outputGain: Number(p.output) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ attack: 0, sustain: 0, output: 1 }),
    presets: [
      { name: 'Snap', params: { attack: 0.8, sustain: -0.3 } },
      { name: 'Sustain', params: { attack: -0.3, sustain: 0.7 } },
      { name: 'Both', params: { attack: 0.5, sustain: 0.5 } },
    ],
  },
  {
    id: 'BassEnhancer', name: 'Bass Enhancer', category: 'wasm', group: 'Filter',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { BassEnhancerEffect } = await import('@engine/effects/BassEnhancerEffect');
      const p = c.parameters;
      return new BassEnhancerEffect({
        frequency: Number(p.frequency) ?? 100,
        amount: Number(p.amount) ?? 0.5,
        drive: Number(p.drive) ?? 0,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ frequency: 100, amount: 0.5, drive: 0, mix: 1 }),
    presets: [
      { name: 'Subtle', params: { amount: 0.3, drive: 0 } },
      { name: 'Warm', params: { amount: 0.6, drive: 0.3, frequency: 80 } },
      { name: 'Heavy', params: { amount: 0.9, drive: 0.6, frequency: 120 } },
    ],
  },
  {
    id: 'Expander', name: 'Expander', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { ExpanderEffect } = await import('@engine/effects/ExpanderEffect');
      const p = c.parameters;
      return new ExpanderEffect({
        threshold: Number(p.threshold) ?? -30,
        ratio: Number(p.ratio) ?? 2,
        attack: Number(p.attack) ?? 1,
        release: Number(p.release) ?? 100,
        range: Number(p.range) ?? -60,
        knee: Number(p.knee) ?? 6,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ threshold: -30, ratio: 2, attack: 1, release: 100, range: -60, knee: 6 }),
    presets: [
      { name: 'Gentle', params: { threshold: -35, ratio: 1.5, range: -30, knee: 10 } },
      { name: 'Medium', params: { threshold: -30, ratio: 3, range: -50, knee: 6 } },
      { name: 'Hard', params: { threshold: -25, ratio: 6, range: -80, knee: 2, attack: 0.5 } },
    ],
  },
  {
    id: 'ReverseDelay', name: 'Reverse Delay', category: 'wasm', group: 'Reverb & Delay',
    loadMode: 'eager', bpmSyncParams: ['time'],
    create: async (c: EffectConfig) => {
      const { ReverseDelayEffect } = await import('@engine/effects/ReverseDelayEffect');
      const p = c.parameters;
      return new ReverseDelayEffect({
        time: Number(p.time) ?? 500,
        feedback: Number(p.feedback) ?? 0.3,
        mix: Number(p.mix) ?? 0.5,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ time: 500, feedback: 0.3, mix: 0.5 }),
    presets: [
      { name: 'Short', params: { time: 200, feedback: 0.2, mix: 0.4 } },
      { name: 'Medium', params: { time: 500, feedback: 0.4, mix: 0.5 } },
      { name: 'Long', params: { time: 1000, feedback: 0.5, mix: 0.6 } },
    ],
  },
  {
    id: 'VintageDelay', name: 'Vintage Delay', category: 'wasm', group: 'Reverb & Delay',
    loadMode: 'eager', bpmSyncParams: ['time'],
    create: async (c: EffectConfig) => {
      const { VintageDelayEffect } = await import('@engine/effects/VintageDelayEffect');
      const p = c.parameters;
      return new VintageDelayEffect({
        time: Number(p.time) ?? 400,
        feedback: Number(p.feedback) ?? 0.4,
        cutoff: Number(p.cutoff) ?? 3000,
        drive: Number(p.drive) ?? 0.3,
        mix: Number(p.mix) ?? 0.5,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ time: 400, feedback: 0.4, cutoff: 3000, drive: 0.3, mix: 0.5 }),
    presets: [
      { name: 'Warm Tape', params: { time: 350, feedback: 0.5, cutoff: 2000, drive: 0.5 } },
      { name: 'Dirty', params: { time: 450, feedback: 0.6, cutoff: 1500, drive: 0.8 } },
      { name: 'Clean', params: { time: 400, feedback: 0.3, cutoff: 8000, drive: 0.1 } },
    ],
  },
  {
    id: 'ArtisticDelay', name: 'Artistic Delay', category: 'wasm', group: 'Reverb & Delay',
    loadMode: 'eager', bpmSyncParams: ['timeL', 'timeR'],
    create: async (c: EffectConfig) => {
      const { ArtisticDelayEffect } = await import('@engine/effects/ArtisticDelayEffect');
      const p = c.parameters;
      return new ArtisticDelayEffect({
        timeL: Number(p.timeL) ?? 500,
        timeR: Number(p.timeR) ?? 375,
        feedback: Number(p.feedback) ?? 0.4,
        pan: Number(p.pan) ?? 0.5,
        lpf: Number(p.lpf) ?? 12000,
        hpf: Number(p.hpf) ?? 40,
        mix: Number(p.mix) ?? 0.5,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ timeL: 500, timeR: 375, feedback: 0.4, pan: 0.5, lpf: 12000, hpf: 40, mix: 0.5 }),
    presets: [
      { name: 'Stereo', params: { timeL: 500, timeR: 375, feedback: 0.35, pan: 0.5 } },
      { name: 'Ping Pong', params: { timeL: 400, timeR: 400, feedback: 0.5, pan: 0.0 } },
      { name: 'Ambient', params: { timeL: 750, timeR: 1000, feedback: 0.6, lpf: 4000, hpf: 200, mix: 0.4 } },
    ],
  },
  {
    id: 'SlapbackDelay', name: 'Slapback Delay', category: 'wasm', group: 'Reverb & Delay',
    loadMode: 'eager', bpmSyncParams: ['time'],
    create: async (c: EffectConfig) => {
      const { SlapbackDelayEffect } = await import('@engine/effects/SlapbackDelayEffect');
      const p = c.parameters;
      return new SlapbackDelayEffect({
        time: Number(p.time) ?? 60,
        feedback: Number(p.feedback) ?? 0.1,
        tone: Number(p.tone) ?? 4000,
        mix: Number(p.mix) ?? 0.5,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ time: 60, feedback: 0.1, tone: 4000, mix: 0.5 }),
    presets: [
      { name: 'Tight', params: { time: 30, feedback: 0.05, tone: 5000 } },
      { name: 'Medium', params: { time: 80, feedback: 0.15, tone: 3500 } },
      { name: 'Rockabilly', params: { time: 120, feedback: 0.25, tone: 3000, mix: 0.6 } },
    ],
  },
  {
    id: 'ZamDelay', name: 'ZAM Delay', category: 'wasm', group: 'Reverb & Delay',
    loadMode: 'eager', bpmSyncParams: ['time'],
    create: async (c: EffectConfig) => {
      const { ZamDelayEffect } = await import('@engine/effects/ZamDelayEffect');
      const p = c.parameters;
      return new ZamDelayEffect({
        time: Number(p.time) ?? 500,
        feedback: Number(p.feedback) ?? 0.4,
        lpf: Number(p.lpf) ?? 8000,
        hpf: Number(p.hpf) ?? 60,
        invert: Number(p.invert) ?? 0,
        mix: Number(p.mix) ?? 0.5,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ time: 500, feedback: 0.4, lpf: 8000, hpf: 60, invert: 0, mix: 0.5 }),
    presets: [
      { name: 'Clean', params: { time: 400, feedback: 0.3, lpf: 12000 } },
      { name: 'Filtered', params: { time: 500, feedback: 0.5, lpf: 4000, hpf: 200 } },
      { name: 'Dark', params: { time: 600, feedback: 0.55, lpf: 2000, hpf: 100 } },
    ],
  },
  {
    id: 'Saturator', name: 'Saturator', category: 'wasm', group: 'Distortion',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { SaturatorEffect } = await import('@engine/effects/SaturatorEffect');
      const p = c.parameters;
      return new SaturatorEffect({
        drive: Number(p.drive) ?? 0.5,
        blend: Number(p.blend) ?? 0.5,
        preFreq: Number(p.preFreq) ?? 20000,
        postFreq: Number(p.postFreq) ?? 20000,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ drive: 0.5, blend: 0.5, preFreq: 20000, postFreq: 20000, mix: 1 }),
    presets: [
      { name: 'Subtle', params: { drive: 0.2, blend: 0.3 } },
      { name: 'Warm', params: { drive: 0.5, blend: 0.6, postFreq: 10000 } },
      { name: 'Hot', params: { drive: 0.9, blend: 0.8, preFreq: 12000, postFreq: 8000 } },
    ],
  },
  {
    id: 'Exciter', name: 'Exciter', category: 'wasm', group: 'Distortion',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { ExciterEffect } = await import('@engine/effects/ExciterEffect');
      const p = c.parameters;
      return new ExciterEffect({
        frequency: Number(p.frequency) ?? 3000,
        amount: Number(p.amount) ?? 0.5,
        blend: Number(p.blend) ?? 0.5,
        ceil: Number(p.ceil) ?? 16000,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ frequency: 3000, amount: 0.5, blend: 0.5, ceil: 16000, mix: 1 }),
    presets: [
      { name: 'Subtle', params: { amount: 0.25, blend: 0.3, frequency: 4000 } },
      { name: 'Bright', params: { amount: 0.6, blend: 0.6, frequency: 2500, ceil: 14000 } },
      { name: 'Extreme', params: { amount: 0.9, blend: 0.8, frequency: 2000, ceil: 12000 } },
    ],
  },
  {
    id: 'AutoSat', name: 'Auto Saturator', category: 'wasm', group: 'Distortion',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { AutoSatEffect } = await import('@engine/effects/AutoSatEffect');
      const p = c.parameters;
      return new AutoSatEffect({
        amount: Number(p.amount) ?? 0.5,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ amount: 0.5, mix: 1 }),
    presets: [
      { name: 'Light', params: { amount: 0.2 } },
      { name: 'Medium', params: { amount: 0.6 } },
      { name: 'Heavy', params: { amount: 0.85 } },
    ],
  },
  {
    id: 'Satma', name: 'Satma Distortion', category: 'wasm', group: 'Distortion',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { SatmaEffect } = await import('@engine/effects/SatmaEffect');
      const p = c.parameters;
      return new SatmaEffect({
        distortion: Number(p.distortion) ?? 0.5,
        tone: Number(p.tone) ?? 0.5,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ distortion: 0.5, tone: 0.5, mix: 1 }),
    presets: [
      { name: 'Warm', params: { distortion: 0.25, tone: 0.3 } },
      { name: 'Gritty', params: { distortion: 0.6, tone: 0.6 } },
      { name: 'Destroyed', params: { distortion: 0.95, tone: 0.8 } },
    ],
  },
  {
    id: 'DistortionShaper', name: 'Distortion Shaper', category: 'wasm', group: 'Distortion',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { DistortionShaperEffect } = await import('@engine/effects/DistortionShaperEffect');
      const p = c.parameters;
      return new DistortionShaperEffect({
        inputGain: Number(p.inputGain) ?? 1,
        point1x: Number(p.point1x) ?? -0.5,
        point1y: Number(p.point1y) ?? -0.5,
        point2x: Number(p.point2x) ?? 0.5,
        point2y: Number(p.point2y) ?? 0.5,
        outputGain: Number(p.outputGain) ?? 1,
        preLpf: Number(p.preLpf) ?? 20000,
        postLpf: Number(p.postLpf) ?? 20000,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ inputGain: 1, point1x: -0.5, point1y: -0.5, point2x: 0.5, point2y: 0.5, outputGain: 1, preLpf: 20000, postLpf: 20000, mix: 1 }),
    presets: [
      { name: 'Soft Clip', params: { point1x: -0.7, point1y: -0.4, point2x: 0.7, point2y: 0.4 } },
      { name: 'Hard Clip', params: { point1x: -0.3, point1y: -0.3, point2x: 0.3, point2y: 0.3, inputGain: 2 } },
      { name: 'Asymmetric', params: { point1x: -0.6, point1y: -0.3, point2x: 0.4, point2y: 0.6, postLpf: 12000 } },
    ],
  },
  {
    id: 'MonoComp', name: 'Mono Compressor', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { MonoCompEffect } = await import('@engine/effects/MonoCompEffect');
      const p = c.parameters;
      return new MonoCompEffect({
        threshold: Number(p.threshold) ?? -12,
        ratio: Number(p.ratio) ?? 4,
        attack: Number(p.attack) ?? 10,
        release: Number(p.release) ?? 100,
        knee: Number(p.knee) ?? 6,
        makeup: Number(p.makeup) ?? 0,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ threshold: -12, ratio: 4, attack: 10, release: 100, knee: 6, makeup: 0 }),
    presets: [
      { name: 'Gentle', params: { threshold: -8, ratio: 2, knee: 10 } },
      { name: 'Medium', params: { threshold: -16, ratio: 4, knee: 6, makeup: 3 } },
      { name: 'Squash', params: { threshold: -24, ratio: 10, attack: 1, release: 50, knee: 2, makeup: 8 } },
    ],
  },
  {
    id: 'SidechainGate', name: 'Sidechain Gate', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { SidechainGateEffect } = await import('@engine/effects/SidechainGateEffect');
      const p = c.parameters;
      return new SidechainGateEffect({
        threshold: Number(p.threshold) ?? -30,
        attack: Number(p.attack) ?? 1,
        hold: Number(p.hold) ?? 50,
        release: Number(p.release) ?? 200,
        range: Number(p.range) ?? 0,
        scFreq: Number(p.scFreq) ?? 200,
        scQ: Number(p.scQ) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ threshold: -30, attack: 1, hold: 50, release: 200, range: 0, scFreq: 200, scQ: 1 }),
    presets: [
      { name: 'Tight', params: { threshold: -25, attack: 0.5, hold: 20, release: 100, range: -40 } },
      { name: 'Open', params: { threshold: -35, attack: 2, hold: 80, release: 300, range: -20 } },
      { name: 'Filtered', params: { threshold: -30, hold: 40, release: 150, scFreq: 500, scQ: 2 } },
    ],
  },
  {
    id: 'MultibandGate', name: 'Multiband Gate', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { MultibandGateEffect } = await import('@engine/effects/MultibandGateEffect');
      const p = c.parameters;
      return new MultibandGateEffect({
        lowCross: Number(p.lowCross) ?? 200,
        highCross: Number(p.highCross) ?? 3000,
        lowThresh: Number(p.lowThresh) ?? -40,
        midThresh: Number(p.midThresh) ?? -40,
        highThresh: Number(p.highThresh) ?? -40,
        lowRange: Number(p.lowRange) ?? 0,
        midRange: Number(p.midRange) ?? 0,
        highRange: Number(p.highRange) ?? 0,
        attack: Number(p.attack) ?? 1,
        release: Number(p.release) ?? 200,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ lowCross: 200, highCross: 3000, lowThresh: -40, midThresh: -40, highThresh: -40, lowRange: 0, midRange: 0, highRange: 0, attack: 1, release: 200 }),
    presets: [
      { name: 'Gentle', params: { lowThresh: -50, midThresh: -50, highThresh: -50, lowRange: -10, midRange: -10, highRange: -10 } },
      { name: 'Medium', params: { lowThresh: -40, midThresh: -35, highThresh: -35, lowRange: -20, midRange: -20, highRange: -20 } },
      { name: 'Tight', params: { lowThresh: -30, midThresh: -28, highThresh: -28, lowRange: -40, midRange: -40, highRange: -40, attack: 0.5, release: 100 } },
    ],
  },
  {
    id: 'MultibandLimiter', name: 'Multiband Limiter', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { MultibandLimiterEffect } = await import('@engine/effects/MultibandLimiterEffect');
      const p = c.parameters;
      return new MultibandLimiterEffect({
        lowCross: Number(p.lowCross) ?? 200,
        highCross: Number(p.highCross) ?? 3000,
        lowCeil: Number(p.lowCeil) ?? -1,
        midCeil: Number(p.midCeil) ?? -1,
        highCeil: Number(p.highCeil) ?? -1,
        lowGain: Number(p.lowGain) ?? 1,
        midGain: Number(p.midGain) ?? 1,
        highGain: Number(p.highGain) ?? 1,
        release: Number(p.release) ?? 50,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ lowCross: 200, highCross: 3000, lowCeil: -1, midCeil: -1, highCeil: -1, lowGain: 1, midGain: 1, highGain: 1, release: 50 }),
    presets: [
      { name: 'Soft', params: { lowCeil: -3, midCeil: -3, highCeil: -3, release: 80 } },
      { name: 'Medium', params: { lowCeil: -1.5, midCeil: -1.5, highCeil: -1.5, release: 60 } },
      { name: 'Loud', params: { lowCeil: -0.5, midCeil: -0.5, highCeil: -0.5, lowGain: 1.5, midGain: 1.3, highGain: 1.5, release: 30 } },
    ],
  },
  {
    id: 'SidechainLimiter', name: 'Sidechain Limiter', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { SidechainLimiterEffect } = await import('@engine/effects/SidechainLimiterEffect');
      const p = c.parameters;
      return new SidechainLimiterEffect({
        ceiling: Number(p.ceiling) ?? -1,
        release: Number(p.release) ?? 50,
        scFreq: Number(p.scFreq) ?? 1000,
        scGain: Number(p.scGain) ?? 0,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ ceiling: -1, release: 50, scFreq: 1000, scGain: 0 }),
    presets: [
      { name: 'Soft', params: { ceiling: -3, release: 80 } },
      { name: 'Medium', params: { ceiling: -1, release: 50, scGain: 3 } },
      { name: 'Brick', params: { ceiling: -0.3, release: 20, scFreq: 2000, scGain: 6 } },
    ],
  },
  {
    id: 'Clipper', name: 'Clipper', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { ClipperEffect } = await import('@engine/effects/ClipperEffect');
      const p = c.parameters;
      return new ClipperEffect({
        inputGain: Number(p.inputGain) ?? 0,
        ceiling: Number(p.ceiling) ?? -1,
        softness: Number(p.softness) ?? 0.5,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ inputGain: 0, ceiling: -1, softness: 0.5 }),
    presets: [
      { name: 'Soft', params: { softness: 0.8, ceiling: -2 } },
      { name: 'Medium', params: { softness: 0.4, inputGain: 3 } },
      { name: 'Hard', params: { softness: 0.1, inputGain: 6, ceiling: -0.5 } },
    ],
  },
  {
    id: 'DynamicsProc', name: 'Dynamics Processor', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { DynamicsProcEffect } = await import('@engine/effects/DynamicsProcEffect');
      const p = c.parameters;
      return new DynamicsProcEffect({
        lowerThresh: Number(p.lowerThresh) ?? -40,
        upperThresh: Number(p.upperThresh) ?? -12,
        ratio: Number(p.ratio) ?? 4,
        attack: Number(p.attack) ?? 10,
        release: Number(p.release) ?? 100,
        makeup: Number(p.makeup) ?? 0,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ lowerThresh: -40, upperThresh: -12, ratio: 4, attack: 10, release: 100, makeup: 0 }),
    presets: [
      { name: 'Gentle', params: { upperThresh: -8, ratio: 2, lowerThresh: -50 } },
      { name: 'Medium', params: { upperThresh: -14, ratio: 4, makeup: 3 } },
      { name: 'Heavy', params: { upperThresh: -20, ratio: 8, lowerThresh: -30, attack: 2, release: 60, makeup: 6 } },
    ],
  },
  {
    id: 'X42Comp', name: 'X42 Compressor', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { X42CompEffect } = await import('@engine/effects/X42CompEffect');
      const p = c.parameters;
      return new X42CompEffect({
        threshold: Number(p.threshold) ?? -20,
        ratio: Number(p.ratio) ?? 4,
        attack: Number(p.attack) ?? 10,
        release: Number(p.release) ?? 100,
        hold: Number(p.hold) ?? 0,
        inputGain: Number(p.inputGain) ?? 0,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ threshold: -20, ratio: 4, attack: 10, release: 100, hold: 0, inputGain: 0 }),
    presets: [
      { name: 'Gentle', params: { threshold: -12, ratio: 2, attack: 20 } },
      { name: 'Punchy', params: { threshold: -18, ratio: 6, attack: 2, release: 60, hold: 10 } },
      { name: 'Squash', params: { threshold: -28, ratio: 12, attack: 1, release: 40, hold: 5, inputGain: 6 } },
    ],
  },
  {
    id: 'EQ5Band', name: '5-Band EQ', category: 'wasm', group: 'EQ & Filter',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { EQ5BandEffect } = await import('@engine/effects/EQ5BandEffect');
      const p = c.parameters;
      return new EQ5BandEffect({
        lowShelfFreq: Number(p.lowShelfFreq) ?? 100,
        lowShelfGain: Number(p.lowShelfGain) ?? 0,
        peak1Freq: Number(p.peak1Freq) ?? 500,
        peak1Gain: Number(p.peak1Gain) ?? 0,
        peak1Q: Number(p.peak1Q) ?? 1,
        peak2Freq: Number(p.peak2Freq) ?? 1500,
        peak2Gain: Number(p.peak2Gain) ?? 0,
        peak2Q: Number(p.peak2Q) ?? 1,
        peak3Freq: Number(p.peak3Freq) ?? 5000,
        peak3Gain: Number(p.peak3Gain) ?? 0,
        peak3Q: Number(p.peak3Q) ?? 1,
        highShelfFreq: Number(p.highShelfFreq) ?? 8000,
        highShelfGain: Number(p.highShelfGain) ?? 0,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ lowShelfFreq: 100, lowShelfGain: 0, peak1Freq: 500, peak1Gain: 0, peak1Q: 1, peak2Freq: 1500, peak2Gain: 0, peak2Q: 1, peak3Freq: 5000, peak3Gain: 0, peak3Q: 1, highShelfFreq: 8000, highShelfGain: 0, mix: 1 }),
    presets: [
      { name: 'Flat', params: {} },
      { name: 'V-Shape', params: { lowShelfGain: 5, peak2Gain: -3, highShelfGain: 4 } },
      { name: 'Bass Boost', params: { lowShelfGain: 6, peak1Gain: 3, peak1Freq: 200 } },
    ],
  },
  {
    id: 'EQ8Band', name: '8-Band EQ', category: 'wasm', group: 'EQ & Filter',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { EQ8BandEffect } = await import('@engine/effects/EQ8BandEffect');
      const p = c.parameters;
      return new EQ8BandEffect({
        hpFreq: Number(p.hpFreq) || 20,
        lpFreq: Number(p.lpFreq) || 20000,
        lowShelfFreq: Number(p.lowShelfFreq) || 100,
        lowShelfGain: Number(p.lowShelfGain) || 0,
        peak1Freq: Number(p.peak1Freq) || 250,
        peak1Gain: Number(p.peak1Gain) || 0,
        peak1Q: Number(p.peak1Q) || 1,
        peak2Freq: Number(p.peak2Freq) || 1000,
        peak2Gain: Number(p.peak2Gain) || 0,
        peak2Q: Number(p.peak2Q) || 1,
        peak3Freq: Number(p.peak3Freq) || 3500,
        peak3Gain: Number(p.peak3Gain) || 0,
        peak3Q: Number(p.peak3Q) || 1,
        peak4Freq: Number(p.peak4Freq) || 8000,
        peak4Gain: Number(p.peak4Gain) || 0,
        peak4Q: Number(p.peak4Q) || 1,
        highShelfFreq: Number(p.highShelfFreq) || 8000,
        highShelfGain: Number(p.highShelfGain) || 0,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({
      hpFreq: 20, lpFreq: 20000,
      lowShelfFreq: 100, lowShelfGain: 0,
      peak1Freq: 250, peak1Gain: 0, peak1Q: 1,
      peak2Freq: 1000, peak2Gain: 0, peak2Q: 1,
      peak3Freq: 3500, peak3Gain: 0, peak3Q: 1,
      peak4Freq: 8000, peak4Gain: 0, peak4Q: 1,
      highShelfFreq: 8000, highShelfGain: 0,
      mix: 1,
    }),
    presets: [
      { name: 'Flat', params: {} },
      { name: 'V-Shape', params: { lowShelfGain: 5, peak2Gain: -2, peak3Gain: -2, highShelfGain: 4 } },
      { name: 'Presence', params: { peak3Freq: 4000, peak3Gain: 4, peak4Freq: 10000, peak4Gain: 3 } },
    ],
  },
  {
    id: 'EQ12Band', name: '12-Band EQ', category: 'wasm', group: 'EQ & Filter',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { EQ12BandEffect } = await import('@engine/effects/EQ12BandEffect');
      const p = c.parameters;
      const eq = new EQ12BandEffect({
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
      for (let i = 0; i < 12; i++) {
        if (p[`gain_${i}`] != null) eq.setBandGain(i, Number(p[`gain_${i}`]));
        if (p[`q_${i}`] != null) eq.setBandQ(i, Number(p[`q_${i}`]));
      }
      return eq;
    },
    getDefaultParameters: () => {
      const params: Record<string, number> = { mix: 1 };
      for (let i = 0; i < 12; i++) { params[`gain_${i}`] = 0; params[`q_${i}`] = 1; }
      return params;
    },
    presets: [
      { name: 'Flat', params: {} },
      { name: 'V-Shape', params: { gain_0: 5, gain_1: 3, gain_5: -2, gain_6: -2, gain_10: 3, gain_11: 5 } },
      { name: 'Warm', params: { gain_0: 3, gain_1: 2, gain_2: 1, gain_10: -1, gain_11: -2 } },
    ],
  },
  {
    id: 'GEQ31', name: '31-Band Graphic EQ', category: 'wasm', group: 'EQ & Filter',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { GEQ31Effect } = await import('@engine/effects/GEQ31Effect');
      const p = c.parameters;
      const eq = new GEQ31Effect({
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
      for (let i = 0; i < 31; i++) {
        if (p[`band_${i}`] != null) eq.setBandGain(i, Number(p[`band_${i}`]));
      }
      return eq;
    },
    getDefaultParameters: () => {
      const params: Record<string, number> = { mix: 1 };
      for (let i = 0; i < 31; i++) { params[`band_${i}`] = 0; }
      return params;
    },
    presets: [
      { name: 'Flat', params: {} },
      { name: 'Smiley', params: { band_0: 6, band_1: 5, band_2: 4, band_3: 3, band_14: -3, band_15: -4, band_16: -3, band_28: 3, band_29: 4, band_30: 5 } },
      { name: 'Mid Cut', params: { band_12: -4, band_13: -5, band_14: -6, band_15: -5, band_16: -4 } },
    ],
  },
  {
    id: 'ZamEQ2', name: 'ZAM EQ2', category: 'wasm', group: 'EQ & Filter',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { ZamEQ2Effect } = await import('@engine/effects/ZamEQ2Effect');
      const p = c.parameters;
      return new ZamEQ2Effect({
        lowFreq: Number(p.lowFreq) ?? 200,
        lowGain: Number(p.lowGain) ?? 0,
        lowBw: Number(p.lowBw) ?? 1,
        highFreq: Number(p.highFreq) ?? 4000,
        highGain: Number(p.highGain) ?? 0,
        highBw: Number(p.highBw) ?? 1,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ lowFreq: 200, lowGain: 0, lowBw: 1, highFreq: 4000, highGain: 0, highBw: 1, mix: 1 }),
    presets: [
      { name: 'Bass Lift', params: { lowGain: 5, lowFreq: 150 } },
      { name: 'Treble Lift', params: { highGain: 5, highFreq: 5000 } },
      { name: 'Scoop', params: { lowGain: 3, highGain: 3, lowBw: 1.5, highBw: 1.5 } },
    ],
  },
  {
    id: 'PhonoFilter', name: 'Phono Filter (RIAA)', category: 'wasm', group: 'EQ & Filter',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { PhonoFilterEffect } = await import('@engine/effects/PhonoFilterEffect');
      const p = c.parameters;
      return new PhonoFilterEffect({
        mode: Number(p.mode) ?? 0,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ mode: 0, mix: 1 }),
    presets: [
      { name: 'RIAA', params: { mode: 0 } },
      { name: 'Inverse RIAA', params: { mode: 1 } },
    ],
  },
  {
    id: 'DynamicEQ', name: 'Dynamic EQ', category: 'wasm', group: 'EQ & Filter',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { DynamicEQEffect } = await import('@engine/effects/DynamicEQEffect');
      const p = c.parameters;
      return new DynamicEQEffect({
        detectFreq: Number(p.detectFreq) ?? 1000,
        detectQ: Number(p.detectQ) ?? 1,
        processFreq: Number(p.processFreq) ?? 1000,
        processQ: Number(p.processQ) ?? 1,
        threshold: Number(p.threshold) ?? -20,
        maxGain: Number(p.maxGain) ?? 0,
        attack: Number(p.attack) ?? 10,
        release: Number(p.release) ?? 100,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ detectFreq: 1000, detectQ: 1, processFreq: 1000, processQ: 1, threshold: -20, maxGain: 0, attack: 10, release: 100, mix: 1 }),
    presets: [
      { name: 'Subtle', params: { threshold: -15, maxGain: -3, attack: 20, release: 150 } },
      { name: 'Medium', params: { threshold: -20, maxGain: -6, detectQ: 1.5, processQ: 1.5 } },
      { name: 'Aggressive', params: { threshold: -28, maxGain: -12, detectQ: 2, processQ: 2, attack: 5, release: 60 } },
    ],
  },
  {
    id: 'HaasEnhancer', name: 'Haas Stereo Enhancer', category: 'wasm', group: 'Stereo & Spatial',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { HaasEnhancerEffect } = await import('@engine/effects/HaasEnhancerEffect');
      const p = c.parameters;
      return new HaasEnhancerEffect({
        delay: Number(p.delay) ?? 10,
        side: Number(p.side) ?? 0,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ delay: 10, side: 0, mix: 1 }),
    presets: [
      { name: 'Subtle', params: { delay: 5 } },
      { name: 'Medium', params: { delay: 15 } },
      { name: 'Wide', params: { delay: 30 } },
    ],
  },
  {
    id: 'MultiSpread', name: 'Multi Spread', category: 'wasm', group: 'Stereo & Spatial',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { MultiSpreadEffect } = await import('@engine/effects/MultiSpreadEffect');
      const p = c.parameters;
      return new MultiSpreadEffect({
        bands: Number(p.bands) ?? 4,
        spread: Number(p.spread) ?? 0.7,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ bands: 4, spread: 0.7, mix: 1 }),
    presets: [
      { name: 'Subtle', params: { bands: 2, spread: 0.4 } },
      { name: 'Medium', params: { bands: 6, spread: 0.6 } },
      { name: 'Full', params: { bands: 8, spread: 1.0 } },
    ],
  },
  {
    id: 'MultibandEnhancer', name: 'Multiband Enhancer', category: 'wasm', group: 'Stereo & Spatial',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { MultibandEnhancerEffect } = await import('@engine/effects/MultibandEnhancerEffect');
      const p = c.parameters;
      return new MultibandEnhancerEffect({
        lowCross: Number(p.lowCross) ?? 200,
        midCross: Number(p.midCross) ?? 2000,
        highCross: Number(p.highCross) ?? 8000,
        lowWidth: Number(p.lowWidth) ?? 1,
        midWidth: Number(p.midWidth) ?? 1,
        highWidth: Number(p.highWidth) ?? 1,
        topWidth: Number(p.topWidth) ?? 1,
        harmonics: Number(p.harmonics) ?? 0,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ lowCross: 200, midCross: 2000, highCross: 8000, lowWidth: 1, midWidth: 1, highWidth: 1, topWidth: 1, harmonics: 0, mix: 1 }),
    presets: [
      { name: 'Subtle', params: { midWidth: 1.3, highWidth: 1.2, topWidth: 1.1 } },
      { name: 'Wide', params: { lowWidth: 0.8, midWidth: 1.5, highWidth: 1.8, topWidth: 2.0, harmonics: 0.3 } },
      { name: 'Extreme', params: { lowWidth: 0.5, midWidth: 2.0, highWidth: 2.5, topWidth: 3.0, harmonics: 0.6 } },
    ],
  },
  {
    id: 'EarlyReflections', name: 'Early Reflections', category: 'wasm', group: 'Reverb & Delay',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { EarlyReflectionsEffect } = await import('@engine/effects/EarlyReflectionsEffect');
      const p = c.parameters;
      return new EarlyReflectionsEffect({
        size: Number(p.size) ?? 1,
        damping: Number(p.damping) ?? 0.3,
        mix: Number(p.mix) ?? 0.3,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ size: 1, damping: 0.3, mix: 0.3 }),
    presets: [
      { name: 'Small', params: { size: 0.3, damping: 0.5, mix: 0.2 } },
      { name: 'Medium', params: { size: 1.0, damping: 0.3, mix: 0.3 } },
      { name: 'Large', params: { size: 2.5, damping: 0.15, mix: 0.4 } },
    ],
  },
  {
    id: 'Pulsator', name: 'Pulsator', category: 'wasm', group: 'Modulation',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { PulsatorEffect } = await import('@engine/effects/PulsatorEffect');
      const p = c.parameters;
      return new PulsatorEffect({
        rate: Number(p.rate) ?? 2,
        depth: Number(p.depth) ?? 0.5,
        waveform: Number(p.waveform) ?? 0,
        stereoPhase: Number(p.stereoPhase) ?? 180,
        offset: Number(p.offset) ?? 0,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ rate: 2, depth: 0.5, waveform: 0, stereoPhase: 180, offset: 0, mix: 1 }),
    presets: [
      { name: 'Gentle', params: { rate: 1, depth: 0.3, waveform: 0 } },
      { name: 'Choppy', params: { rate: 4, depth: 0.9, waveform: 1 } },
      { name: 'Trance', params: { rate: 8, depth: 1.0, waveform: 1, stereoPhase: 90 } },
    ],
  },
  {
    id: 'Ducka', name: 'Ducka', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { DuckaEffect } = await import('@engine/effects/DuckaEffect');
      const p = c.parameters;
      return new DuckaEffect({
        threshold: Number(p.threshold) ?? -20,
        drop: Number(p.drop) ?? 0.5,
        release: Number(p.release) ?? 200,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ threshold: -20, drop: 0.5, release: 200, mix: 1 }),
    presets: [
      { name: 'Gentle', params: { threshold: -15, drop: 0.3, release: 300 } },
      { name: 'Pumping', params: { threshold: -20, drop: 0.7, release: 150 } },
      { name: 'Extreme', params: { threshold: -28, drop: 0.95, release: 80 } },
    ],
  },
  {
    id: 'Masha', name: 'Masha Beat Stutter', category: 'wasm', group: 'Creative',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { MashaEffect } = await import('@engine/effects/MashaEffect');
      const p = c.parameters;
      return new MashaEffect({
        time: Number(p.time) ?? 100,
        volume: Number(p.volume) ?? 1,
        passthrough: Number(p.passthrough) ?? 0,
        active: Number(p.active) ?? 0,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ time: 100, volume: 1, passthrough: 0, active: 0, mix: 1 }),
    presets: [
      { name: 'Short Stutter', params: { time: 30, active: 1 } },
      { name: 'Medium', params: { time: 100, active: 1 } },
      { name: 'Long', params: { time: 300, active: 1, volume: 0.8 } },
    ],
  },
  {
    id: 'Vinyl', name: 'Vinyl Simulator', category: 'wasm', group: 'Lo-Fi',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { VinylEffect } = await import('@engine/effects/VinylEffect');
      const p = c.parameters;
      return new VinylEffect({
        crackle: Number(p.crackle) ?? 0.3,
        noise: Number(p.noise) ?? 0.2,
        rumble: Number(p.rumble) ?? 0.1,
        wear: Number(p.wear) ?? 0.3,
        speed: Number(p.speed) ?? 0.5,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ crackle: 0.3, noise: 0.2, rumble: 0.1, wear: 0.3, speed: 0.5, mix: 1 }),
    presets: [
      { name: 'Clean', params: { crackle: 0.1, noise: 0.05, rumble: 0.05, wear: 0.1 } },
      { name: 'Old', params: { crackle: 0.5, noise: 0.35, rumble: 0.2, wear: 0.5, speed: 0.4 } },
      { name: 'Destroyed', params: { crackle: 0.9, noise: 0.7, rumble: 0.5, wear: 0.9, speed: 0.3 } },
    ],
  },
  {
    id: 'BeatBreather', name: 'Beat Breather', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { BeatBreatherEffect } = await import('@engine/effects/BeatBreatherEffect');
      const p = c.parameters;
      return new BeatBreatherEffect({
        transientBoost: Number(p.transientBoost) ?? 0,
        sustainBoost: Number(p.sustainBoost) ?? 0,
        sensitivity: Number(p.sensitivity) ?? 0.5,
        attack: Number(p.attack) ?? 5,
        release: Number(p.release) ?? 100,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ transientBoost: 0, sustainBoost: 0, sensitivity: 0.5, attack: 5, release: 100, mix: 1 }),
    presets: [
      { name: 'Snap', params: { transientBoost: 0.6, sustainBoost: -0.2, sensitivity: 0.6, attack: 2 } },
      { name: 'Sustain', params: { transientBoost: -0.2, sustainBoost: 0.6, sensitivity: 0.5, release: 150 } },
      { name: 'Both', params: { transientBoost: 0.4, sustainBoost: 0.4, sensitivity: 0.5 } },
    ],
  },
  {
    id: 'MultibandClipper', name: 'Multiband Clipper', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { MultibandClipperEffect } = await import('@engine/effects/MultibandClipperEffect');
      const p = c.parameters;
      return new MultibandClipperEffect({
        lowCross: Number(p.lowCross) ?? 200,
        highCross: Number(p.highCross) ?? 4000,
        lowCeil: Number(p.lowCeil) ?? -3,
        midCeil: Number(p.midCeil) ?? -3,
        highCeil: Number(p.highCeil) ?? -3,
        softness: Number(p.softness) ?? 0.5,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ lowCross: 200, highCross: 4000, lowCeil: -3, midCeil: -3, highCeil: -3, softness: 0.5, mix: 1 }),
    presets: [
      { name: 'Soft', params: { lowCeil: -6, midCeil: -6, highCeil: -6, softness: 0.8 } },
      { name: 'Medium', params: { lowCeil: -3, midCeil: -3, highCeil: -3, softness: 0.5 } },
      { name: 'Hard', params: { lowCeil: -1, midCeil: -1, highCeil: -1, softness: 0.1 } },
    ],
  },
  {
    id: 'MultibandDynamics', name: 'Multiband Dynamics', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { MultibandDynamicsEffect } = await import('@engine/effects/MultibandDynamicsEffect');
      const p = c.parameters;
      return new MultibandDynamicsEffect({
        lowCross: Number(p.lowCross) ?? 200,
        highCross: Number(p.highCross) ?? 4000,
        lowExpThresh: Number(p.lowExpThresh) ?? -40,
        midExpThresh: Number(p.midExpThresh) ?? -40,
        highExpThresh: Number(p.highExpThresh) ?? -40,
        lowCompThresh: Number(p.lowCompThresh) ?? -12,
        midCompThresh: Number(p.midCompThresh) ?? -12,
        highCompThresh: Number(p.highCompThresh) ?? -12,
        ratio: Number(p.ratio) ?? 4,
        attack: Number(p.attack) ?? 10,
        release: Number(p.release) ?? 100,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ lowCross: 200, highCross: 4000, lowExpThresh: -40, midExpThresh: -40, highExpThresh: -40, lowCompThresh: -12, midCompThresh: -12, highCompThresh: -12, ratio: 4, attack: 10, release: 100, mix: 1 }),
    presets: [
      { name: 'Gentle', params: { lowCompThresh: -8, midCompThresh: -8, highCompThresh: -8, ratio: 2 } },
      { name: 'Medium', params: { lowCompThresh: -14, midCompThresh: -14, highCompThresh: -14, ratio: 4, lowExpThresh: -35, midExpThresh: -35, highExpThresh: -35 } },
      { name: 'Heavy', params: { lowCompThresh: -20, midCompThresh: -20, highCompThresh: -20, ratio: 8, lowExpThresh: -30, midExpThresh: -30, highExpThresh: -30, attack: 2 } },
    ],
  },
  {
    id: 'MultibandExpander', name: 'Multiband Expander', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { MultibandExpanderEffect } = await import('@engine/effects/MultibandExpanderEffect');
      const p = c.parameters;
      return new MultibandExpanderEffect({
        lowCross: Number(p.lowCross) ?? 200,
        highCross: Number(p.highCross) ?? 4000,
        lowThresh: Number(p.lowThresh) ?? -40,
        midThresh: Number(p.midThresh) ?? -40,
        highThresh: Number(p.highThresh) ?? -40,
        ratio: Number(p.ratio) ?? 2,
        attack: Number(p.attack) ?? 5,
        release: Number(p.release) ?? 100,
        range: Number(p.range) ?? -40,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ lowCross: 200, highCross: 4000, lowThresh: -40, midThresh: -40, highThresh: -40, ratio: 2, attack: 5, release: 100, range: -40, mix: 1 }),
    presets: [
      { name: 'Gentle', params: { lowThresh: -50, midThresh: -50, highThresh: -50, ratio: 1.5, range: -20 } },
      { name: 'Medium', params: { lowThresh: -38, midThresh: -35, highThresh: -35, ratio: 3, range: -40 } },
      { name: 'Tight', params: { lowThresh: -28, midThresh: -25, highThresh: -25, ratio: 5, range: -60, attack: 1 } },
    ],
  },
  {
    id: 'GOTTComp', name: 'GOTT Compressor', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { GOTTCompEffect } = await import('@engine/effects/GOTTCompEffect');
      const p = c.parameters;
      return new GOTTCompEffect({
        lowCross: Number(p.lowCross) ?? 200,
        highCross: Number(p.highCross) ?? 4000,
        lowThresh: Number(p.lowThresh) ?? -18,
        midThresh: Number(p.midThresh) ?? -18,
        highThresh: Number(p.highThresh) ?? -18,
        lowRatio: Number(p.lowRatio) ?? 4,
        midRatio: Number(p.midRatio) ?? 4,
        highRatio: Number(p.highRatio) ?? 4,
        attack: Number(p.attack) ?? 10,
        release: Number(p.release) ?? 100,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ lowCross: 200, highCross: 4000, lowThresh: -18, midThresh: -18, highThresh: -18, lowRatio: 4, midRatio: 4, highRatio: 4, attack: 10, release: 100, mix: 1 }),
    presets: [
      { name: 'Gentle', params: { lowThresh: -12, midThresh: -12, highThresh: -12, lowRatio: 2, midRatio: 2, highRatio: 2 } },
      { name: 'Glue', params: { lowThresh: -16, midThresh: -16, highThresh: -16, lowRatio: 3, midRatio: 3, highRatio: 3, attack: 15, release: 120 } },
      { name: 'Mastering', params: { lowThresh: -14, midThresh: -16, highThresh: -18, lowRatio: 3, midRatio: 4, highRatio: 5, attack: 8, release: 80 } },
    ],
  },
  {
    id: 'Maximizer', name: 'Maximizer', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { MaximizerEffect } = await import('@engine/effects/MaximizerEffect');
      const p = c.parameters;
      return new MaximizerEffect({
        ceiling: Number(p.ceiling) ?? -0.3,
        release: Number(p.release) ?? 50,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ ceiling: -0.3, release: 50, mix: 1 }),
    presets: [
      { name: 'Soft', params: { ceiling: -1, release: 80 } },
      { name: 'Medium', params: { ceiling: -0.5, release: 40 } },
      { name: 'Loud', params: { ceiling: -0.1, release: 20 } },
    ],
  },
  {
    id: 'AGC', name: 'Auto Gain Control', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { AGCEffect } = await import('@engine/effects/AGCEffect');
      const p = c.parameters;
      return new AGCEffect({
        target: Number(p.target) ?? -12,
        speed: Number(p.speed) ?? 0.1,
        maxGain: Number(p.maxGain) ?? 12,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ target: -12, speed: 0.1, maxGain: 12, mix: 1 }),
    presets: [
      { name: 'Slow', params: { speed: 0.03, maxGain: 6 } },
      { name: 'Medium', params: { speed: 0.1, maxGain: 12 } },
      { name: 'Fast', params: { speed: 0.5, maxGain: 18 } },
    ],
  },
  {
    id: 'Della', name: 'Della Delay', category: 'wasm', group: 'Reverb & Delay',
    loadMode: 'eager', bpmSyncParams: ['time'],
    create: async (c: EffectConfig) => {
      const { DellaEffect } = await import('@engine/effects/DellaEffect');
      const p = c.parameters;
      return new DellaEffect({
        time: Number(p.time) ?? 300,
        feedback: Number(p.feedback) ?? 0.5,
        volume: Number(p.volume) ?? 0.7,
        mix: Number(p.mix) ?? 0.5,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ time: 300, feedback: 0.5, volume: 0.7, mix: 0.5 }),
    presets: [
      { name: 'Short', params: { time: 150, feedback: 0.3, volume: 0.8 } },
      { name: 'Medium', params: { time: 350, feedback: 0.5, volume: 0.7 } },
      { name: 'Long', params: { time: 600, feedback: 0.7, volume: 0.6, mix: 0.4 } },
    ],
  },
  {
    id: 'Driva', name: 'Driva Distortion', category: 'wasm', group: 'Distortion',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { DrivaEffect } = await import('@engine/effects/DrivaEffect');
      const p = c.parameters;
      return new DrivaEffect({
        amount: Number(p.amount) ?? 0.5,
        tone: Number(p.tone) ?? 0,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ amount: 0.5, tone: 0, mix: 1 }),
    presets: [
      { name: 'Light', params: { amount: 0.2, tone: -0.2 } },
      { name: 'Medium', params: { amount: 0.5, tone: 0.2 } },
      { name: 'Heavy', params: { amount: 0.9, tone: 0.5 } },
    ],
  },
  {
    id: 'Panda', name: 'Panda Comp/Expand', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { PandaEffect } = await import('@engine/effects/PandaEffect');
      const p = c.parameters;
      return new PandaEffect({
        threshold: Number(p.threshold) ?? -20,
        factor: Number(p.factor) ?? 0.5,
        release: Number(p.release) ?? 100,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ threshold: -20, factor: 0.5, release: 100, mix: 1 }),
    presets: [
      { name: 'Gentle', params: { threshold: -15, factor: 0.3, release: 150 } },
      { name: 'Medium', params: { threshold: -20, factor: 0.5, release: 100 } },
      { name: 'Heavy', params: { threshold: -28, factor: 0.8, release: 50 } },
    ],
  },
  {
    id: 'BinauralPanner', name: 'Binaural Panner', category: 'wasm', group: 'Stereo & Spatial',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { BinauralPannerEffect } = await import('@engine/effects/BinauralPannerEffect');
      const p = c.parameters;
      return new BinauralPannerEffect({
        azimuth: Number(p.azimuth) ?? 0,
        elevation: Number(p.elevation) ?? 0,
        distance: Number(p.distance) ?? 1,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ azimuth: 0, elevation: 0, distance: 1, mix: 1 }),
    presets: [
      { name: 'Front Close', params: { azimuth: 0, elevation: 0, distance: 0.5 } },
      { name: 'Left', params: { azimuth: -90, elevation: 0, distance: 1 } },
      { name: 'Behind', params: { azimuth: 180, elevation: 0, distance: 2 } },
    ],
  },
  {
    id: 'Roomy', name: 'Roomy Reverb', category: 'wasm', group: 'Reverb & Delay',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { RoomyEffect } = await import('@engine/effects/RoomyEffect');
      const p = c.parameters;
      return new RoomyEffect({
        time: Number(p.time) ?? 2,
        damping: Number(p.damping) ?? 0.5,
        mix: Number(p.mix) ?? 0.3,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ time: 2, damping: 0.5, mix: 0.3 }),
    presets: [
      { name: 'Small', params: { time: 0.8, damping: 0.7, mix: 0.2 } },
      { name: 'Medium', params: { time: 2, damping: 0.5, mix: 0.3 } },
      { name: 'Huge', params: { time: 6, damping: 0.2, mix: 0.5 } },
    ],
  },
  {
    id: 'Bitta', name: 'Bitta Crusher', category: 'wasm', group: 'Lo-Fi',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { BittaEffect } = await import('@engine/effects/BittaEffect');
      const p = c.parameters;
      return new BittaEffect({
        crush: Number(p.crush) ?? 8,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ crush: 8, mix: 1 }),
    presets: [
      { name: 'Light', params: { crush: 12 } },
      { name: 'Medium', params: { crush: 8 } },
      { name: 'Heavy', params: { crush: 4 } },
    ],
  },
  {
    id: 'Kuiza', name: 'Kuiza EQ', category: 'wasm', group: 'EQ & Filter',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { KuizaEffect } = await import('@engine/effects/KuizaEffect');
      const p = c.parameters;
      return new KuizaEffect({
        low: Number(p.low) ?? 0,
        lowMid: Number(p.lowMid) ?? 0,
        highMid: Number(p.highMid) ?? 0,
        high: Number(p.high) ?? 0,
        gain: Number(p.gain) ?? 0,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ low: 0, lowMid: 0, highMid: 0, high: 0, gain: 0, mix: 1 }),
    presets: [
      { name: 'Bass Boost', params: { low: 6, lowMid: 2 } },
      { name: 'Mid Scoop', params: { lowMid: -4, highMid: -4, low: 2, high: 2 } },
      { name: 'Bright', params: { highMid: 3, high: 5 } },
    ],
  },
  {
    id: 'Vihda', name: 'Vihda Stereo', category: 'wasm', group: 'Stereo & Spatial',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { VihdaEffect } = await import('@engine/effects/VihdaEffect');
      const p = c.parameters;
      return new VihdaEffect({
        width: Number(p.width) ?? 1,
        invert: Number(p.invert) ?? 0,
        mix: Number(p.mix) ?? 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ width: 1, invert: 0, mix: 1 }),
    presets: [
      { name: 'Narrow', params: { width: 0.5 } },
      { name: 'Normal', params: { width: 1.0 } },
      { name: 'Ultra Wide', params: { width: 2.0 } },
    ],
  },
  {
    id: 'MultiChorus', name: 'Multi Chorus', category: 'wasm', group: 'Modulation',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { MultiChorusEffect } = await import('@engine/effects/MultiChorusEffect');
      const p = c.parameters;
      return new MultiChorusEffect({
        rate: Number(p.rate) ?? 0.5,
        depth: Number(p.depth) ?? 0.5,
        voices: Number(p.voices) ?? 4,
        stereoPhase: Number(p.stereoPhase) ?? 90,
        mix: Number(p.mix) ?? 0.5,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ rate: 0.5, depth: 0.5, voices: 4, stereoPhase: 90, mix: 0.5 }),
    presets: [
      { name: 'Subtle', params: { rate: 0.3, depth: 0.3, voices: 2, mix: 0.3 } },
      { name: 'Lush', params: { rate: 0.5, depth: 0.6, voices: 6, stereoPhase: 120, mix: 0.5 } },
      { name: 'Wide', params: { rate: 0.8, depth: 0.8, voices: 8, stereoPhase: 180, mix: 0.6 } },
    ],
  },
  {
    id: 'CalfPhaser', name: 'Calf Phaser', category: 'wasm', group: 'Modulation',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { CalfPhaserEffect } = await import('@engine/effects/CalfPhaserEffect');
      const p = c.parameters;
      return new CalfPhaserEffect({
        rate: Number(p.rate) ?? 0.5,
        depth: Number(p.depth) ?? 0.7,
        stages: Number(p.stages) ?? 6,
        feedback: Number(p.feedback) ?? 0.5,
        stereoPhase: Number(p.stereoPhase) ?? 90,
        mix: Number(p.mix) ?? 0.5,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ rate: 0.5, depth: 0.7, stages: 6, feedback: 0.5, stereoPhase: 90, mix: 0.5 }),
    presets: [
      { name: 'Slow', params: { rate: 0.15, depth: 0.5, stages: 4, feedback: 0.3 } },
      { name: 'Jet', params: { rate: 0.8, depth: 0.9, stages: 8, feedback: 0.7, mix: 0.6 } },
      { name: 'Deep', params: { rate: 0.3, depth: 1.0, stages: 12, feedback: 0.8, stereoPhase: 180, mix: 0.5 } },
    ],
  },
  {
    id: 'TapeDelay', name: 'Tape Delay', category: 'wasm', group: 'Reverb & Delay',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { TapeDelayEffect } = await import('@engine/effects/TapeDelayEffect');
      const p = c.parameters;
      return new TapeDelayEffect({
        delayTime: Number(p.delayTime) ?? 0.3,
        feedback: Number(p.feedback) ?? 0.4,
        mix: Number(p.mix) ?? 0.5,
        toneFreq: Number(p.toneFreq) ?? 4000,
        drive: Number(p.drive) ?? 0,
        wowRate: Number(p.wowRate) ?? 0.5,
        wowDepth: Number(p.wowDepth) ?? 0,
        flutterRate: Number(p.flutterRate) ?? 6,
        flutterDepth: Number(p.flutterDepth) ?? 0,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ delayTime: 0.3, feedback: 0.4, mix: 0.5, toneFreq: 4000, drive: 0, wowRate: 0.5, wowDepth: 0, flutterRate: 6, flutterDepth: 0 }),
    presets: [
      { name: 'Clean Echo', params: { delayTime: 0.35, feedback: 0.4, mix: 0.4, toneFreq: 8000, drive: 0 } },
      { name: 'Vintage Tape', params: { delayTime: 0.3, feedback: 0.5, mix: 0.45, toneFreq: 3000, drive: 0.3, wowDepth: 0.3, flutterDepth: 0.2 } },
      { name: 'Space Echo', params: { delayTime: 0.45, feedback: 0.7, mix: 0.5, toneFreq: 2500, drive: 0.4, wowDepth: 0.4, flutterDepth: 0.3 } },
      { name: 'Worn Tape', params: { delayTime: 0.25, feedback: 0.6, mix: 0.5, toneFreq: 2000, drive: 0.6, wowDepth: 0.6, flutterDepth: 0.5 } },
      { name: 'Dub Delay', params: { delayTime: 0.5, feedback: 0.8, mix: 0.55, toneFreq: 1500, drive: 0.5, wowDepth: 0.2, flutterDepth: 0.1 } },
    ],
  },
];

EffectRegistry.register(wasmEffects);
