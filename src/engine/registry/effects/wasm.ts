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
  },
];

EffectRegistry.register(wasmEffects);
