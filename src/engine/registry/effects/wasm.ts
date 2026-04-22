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
      { name: 'King Tubby Studio', params: { decay: 0.65, size: 0.6, mix: 0.4, earlyMix: 0.55, bandwidth: 0.5, density: 0.7, damping: 0.55, predelay: 0.02 } },
      { name: 'Sound System Hall', params: { decay: 0.85, size: 0.95, mix: 0.45, earlyMix: 0.3, bandwidth: 0.4, density: 0.9, damping: 0.6, predelay: 0.05 } },
      { name: 'Dub Plate Room', params: { decay: 0.45, size: 0.4, mix: 0.35, earlyMix: 0.6, bandwidth: 0.45, density: 0.75, damping: 0.65 } },
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
      { name: 'Studio One Tank', params: { decay: 0.65, damping: 0.5, tension: 0.45, drip: 0.8, mix: 0.45, diffusion: 0.65 } },
      { name: 'Dub Splash', params: { decay: 0.75, damping: 0.35, tension: 0.55, drip: 0.95, mix: 0.5, diffusion: 0.75 } },
      { name: 'Sound System Spring', params: { decay: 0.85, damping: 0.25, tension: 0.6, drip: 0.85, mix: 0.55, diffusion: 0.8 } },
    ],
  },
  {
    id: 'RE201', name: 'RE-201 Space Echo', category: 'wasm', group: 'Reverb & Delay',
    loadMode: 'eager',
    description: 'Full Roland RE-201 model: VA tone stack, tape magnetisation, 3-head tape delay, waveguide spring reverb. Port of je3928/RE201models (GPL-3.0).',
    create: async (c: EffectConfig) => {
      const { RE201Effect } = await import('@engine/effects/RE201Effect');
      const p = c.parameters;
      return new RE201Effect({
        bass: Number(p.bass) || 0.5,
        treble: Number(p.treble) || 0.5,
        delayMode: p.delayMode != null ? Number(p.delayMode) : 7,
        repeatRate: Number(p.repeatRate) || 0.5,
        intensity: Number(p.intensity) || 0.5,
        echoVolume: Number(p.echoVolume) || 0.8,
        reverbVolume: Number(p.reverbVolume) || 0.3,
        inputLevel: Number(p.inputLevel) || 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({
      bass: 0.5, treble: 0.5, delayMode: 7, repeatRate: 0.5, intensity: 0.5,
      echoVolume: 0.8, reverbVolume: 0.3, inputLevel: 1,
    }),
    presets: [
      // Authentic dub/sound system presets — RE-201 is THE classic dub echo
      { name: 'King Tubby Wash', params: { delayMode: 7, repeatRate: 0.25, intensity: 0.72, echoVolume: 0.9, reverbVolume: 0.55, bass: 0.8, treble: 0.25, inputLevel: 1.2 } },
      { name: 'Scientist Precision', params: { delayMode: 4, repeatRate: 0.45, intensity: 0.55, echoVolume: 0.75, reverbVolume: 0.3, bass: 0.6, treble: 0.5 } },
      { name: 'Lee Perry Madness', params: { delayMode: 10, repeatRate: 0.35, intensity: 0.82, echoVolume: 0.95, reverbVolume: 0.7, bass: 0.75, treble: 0.4, inputLevel: 1.8 } },
      { name: 'Sound System Drop', params: { delayMode: 1, repeatRate: 0.15, intensity: 0.78, echoVolume: 0.85, reverbVolume: 0.2, bass: 0.9, treble: 0.15 } },
      { name: 'Spring Tank Splash', params: { delayMode: 0, reverbVolume: 0.8, bass: 0.5, treble: 0.6 } },
      { name: 'Steppers Rhythm', params: { delayMode: 4, repeatRate: 0.55, intensity: 0.5, echoVolume: 0.7, reverbVolume: 0.15, bass: 0.55, treble: 0.45 } },
      { name: 'Roots Dub Deep', params: { delayMode: 7, repeatRate: 0.2, intensity: 0.68, echoVolume: 0.85, reverbVolume: 0.65, bass: 0.85, treble: 0.2, inputLevel: 1.1 } },
      { name: 'Runaway Feedback', params: { delayMode: 5, repeatRate: 0.4, intensity: 0.88, echoVolume: 0.95, reverbVolume: 0.35, bass: 0.7, treble: 0.3, inputLevel: 1.5 } },
    ],
  },
  {
    id: 'AnotherDelay', name: 'Another Delay', category: 'wasm', group: 'Reverb & Delay',
    loadMode: 'eager',
    description: 'Tape delay with wow/flutter, atan saturation, LP/HP filtering, and Schroeder reverb. Port of dllim/anotherdelay (MIT).',
    create: async (c: EffectConfig) => {
      const { AnotherDelayEffect } = await import('@engine/effects/AnotherDelayEffect');
      const p = c.parameters;
      return new AnotherDelayEffect({
        delayTime: Number(p.delayTime) || 300,
        feedback: Number(p.feedback) || 0.3,
        gain: Number(p.gain) || 1,
        lowpass: Number(p.lowpass) || 12000,
        highpass: Number(p.highpass) || 80,
        flutterFreq: Number(p.flutterFreq) || 3.5,
        flutterDepth: Number(p.flutterDepth) || 0,
        wowFreq: Number(p.wowFreq) || 0.5,
        wowDepth: Number(p.wowDepth) || 0,
        reverbEnabled: p.reverbEnabled != null ? Number(p.reverbEnabled) > 0 : true,
        roomSize: Number(p.roomSize) || 0.5,
        damping: Number(p.damping) || 0.5,
        width: p.width != null ? Number(p.width) : 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({
      delayTime: 300, feedback: 0.3, gain: 1, lowpass: 12000, highpass: 80,
      flutterFreq: 3.5, flutterDepth: 0, wowFreq: 0.5, wowDepth: 0,
      reverbEnabled: 1, roomSize: 0.5, damping: 0.5, width: 1,
    }),
    presets: [
      // Jamaican dub/sound system tape delay presets
      { name: 'Channel One Studio', params: { delayTime: 375, feedback: 0.6, gain: 1.2, lowpass: 3500, highpass: 120, flutterFreq: 3.5, flutterDepth: 0.02, wowFreq: 0.25, wowDepth: 0.01, reverbEnabled: 1, roomSize: 0.45, damping: 0.55, width: 0.8 } },
      { name: 'Dub Plate Special', params: { delayTime: 500, feedback: 0.75, gain: 1.5, lowpass: 2800, highpass: 180, flutterFreq: 2.5, flutterDepth: 0.04, wowFreq: 0.2, wowDepth: 0.015, reverbEnabled: 1, roomSize: 0.65, damping: 0.4, width: 1 } },
      { name: 'Version Excursion', params: { delayTime: 666, feedback: 0.72, gain: 1.3, lowpass: 3200, highpass: 100, flutterFreq: 3, flutterDepth: 0.03, wowFreq: 0.15, wowDepth: 0.02, reverbEnabled: 1, roomSize: 0.75, damping: 0.35, width: 1 } },
      { name: 'Dance Hall Slap', params: { delayTime: 180, feedback: 0.45, gain: 1.1, lowpass: 5000, highpass: 80, flutterDepth: 0.01, wowDepth: 0, reverbEnabled: 0 } },
      { name: 'Sufferer Echo', params: { delayTime: 750, feedback: 0.78, gain: 1.4, lowpass: 2200, highpass: 200, flutterFreq: 2, flutterDepth: 0.05, wowFreq: 0.12, wowDepth: 0.025, reverbEnabled: 1, roomSize: 0.8, damping: 0.3, width: 1 } },
      { name: 'Roots Tape Wobble', params: { delayTime: 440, feedback: 0.58, gain: 1.2, lowpass: 3000, highpass: 150, flutterFreq: 4.5, flutterDepth: 0.06, wowFreq: 0.35, wowDepth: 0.03, reverbEnabled: 1, roomSize: 0.5, damping: 0.5, width: 0.9 } },
      { name: 'Sound System Siren', params: { delayTime: 333, feedback: 0.65, gain: 1.6, lowpass: 4500, highpass: 250, flutterDepth: 0.02, wowDepth: 0.01, reverbEnabled: 1, roomSize: 0.55, damping: 0.45, width: 0.7 } },
      { name: 'Midnight Dub', params: { delayTime: 600, feedback: 0.7, gain: 1.3, lowpass: 1800, highpass: 250, flutterFreq: 2, flutterDepth: 0.04, wowFreq: 0.1, wowDepth: 0.02, reverbEnabled: 1, roomSize: 0.7, damping: 0.25, width: 1 } },
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
        delayActive:     (Number(p.delayActive) || 100) > 50,
        delayDryWet:     (Number(p.delayDryWet) || 35) / 100,
        delayTime:       (Number(p.delayTime) || 30) / 100,
        delayFeedback:   (Number(p.delayFeedback) || 45) / 100,
        delayCutLow:     (Number(p.delayCutLow) || 5) / 100,
        delayCutHi:      (Number(p.delayCutHi) || 75) / 100,
        delaySaturation: (Number(p.delaySaturation) || 25) / 100,
        delayDrift:      (Number(p.delayDrift) || 15) / 100,
        delayMode:       Number(p.delayMode) || 0,
        springsActive:   (Number(p.springsActive) || 100) > 50,
        springsDryWet:   (Number(p.springsDryWet) || 40) / 100,
        springsWidth:    (Number(p.springsWidth) || 100) / 100,
        springsLength:   (Number(p.springsLength) || 50) / 100,
        springsDecay:    (Number(p.springsDecay) || 40) / 100,
        springsDamp:     (Number(p.springsDamp) || 30) / 100,
        springsShape:    (Number(p.springsShape) || 30) / 100,
        springsTone:     (Number(p.springsTone) || 50) / 100,
        springsScatter:  (Number(p.springsScatter) || 50) / 100,
        springsChaos:    (Number(p.springsChaos) || 10) / 100,
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
      { name: 'King Tubby Tape & Springs', params: { delayActive: 100, springsActive: 100, delayDryWet: 55, delayTime: 35, delayFeedback: 65, delaySaturation: 50, delayDrift: 20, delayCutHi: 60, springsDryWet: 50, springsLength: 65, springsDecay: 55, springsDamp: 25, springsShape: 40 } },
      { name: 'Roots Dub Wash', params: { delayActive: 100, springsActive: 100, delayDryWet: 45, delayTime: 45, delayFeedback: 70, delaySaturation: 35, delayDrift: 30, delayCutHi: 55, springsDryWet: 60, springsLength: 75, springsDecay: 65, springsDamp: 15, springsChaos: 15 } },
      { name: 'Sound System Stack', params: { delayActive: 100, springsActive: 100, delayDryWet: 60, delayTime: 30, delayFeedback: 60, delaySaturation: 55, delayDrift: 10, springsDryWet: 45, springsLength: 55, springsDecay: 50, springsDamp: 30, springsWidth: 100 } },
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
        pitch: Number(p.pitch) || 12,
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
      { name: 'Dub Shimmer', params: { decay: 75, shimmer: 25, pitch: 12, damping: 65, size: 80, predelay: 30, modRate: 15, modDepth: 20 } },
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
        carrierType: (Number(p.carrierType) || 3) as 0 | 1 | 2 | 3,
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
        strength: (Number(p.strength) || 100) / 100,
        speed: (Number(p.speed) || 70) / 100,
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
        pitch: Number(p.pitch) || 0,
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
        threshold: Number(p.threshold) || -40,
        attack: Number(p.attack) || 0.5,
        hold: Number(p.hold) || 50,
        release: Number(p.release) || 100,
        range: (Number(p.range) || 0) / 100,
        hpf: Number(p.hpf) || 0,
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
        threshold: Number(p.threshold) || -1,
        ceiling: Number(p.ceiling) || -0.3,
        attack: Number(p.attack) || 5,
        release: Number(p.release) || 50,
        lookahead: Number(p.lookahead) || 5,
        knee: Number(p.knee) || 0,
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
        rate: Number(p.rate) || 0.3,
        depth: (Number(p.depth) || 70) / 100,
        delay: Number(p.delay) || 5,
        feedback: (Number(p.feedback) || 30) / 100,
        stereo: Number(p.stereo) || 90,
        mix: (Number(p.mix) || 50) / 100,
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
        drive: (Number(p.drive) || 50) / 100,
        tone: (Number(p.tone) || 50) / 100,
        mix: (Number(p.mix) || 100) / 100,
        level: (Number(p.level) || 50) / 100,
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
        frequency: Number(p.frequency) || 440,
        mix: (Number(p.mix) || 50) / 100,
        waveform: Number(p.waveform) || 0,
        lfoRate: Number(p.lfoRate) || 0,
        lfoDepth: (Number(p.lfoDepth) || 0) / 100,
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
        decay: (Number(p.decay) || 70) / 100,
        damping: (Number(p.damping) || 50) / 100,
        predelay: Number(p.predelay) || 10,
        width: (Number(p.width) || 100) / 100,
        brightness: (Number(p.brightness) || 70) / 100,
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
        decay: (Number(p.decay) || 80) / 100,
        damping: (Number(p.damping) || 40) / 100,
        predelay: Number(p.predelay) || 20,
        width: (Number(p.width) || 100) / 100,
        earlyLevel: (Number(p.earlyLevel) || 50) / 100,
        size: Number(p.size) || 1.5,
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
        decay: (Number(p.decay) || 40) / 100,
        damping: (Number(p.damping) || 60) / 100,
        predelay: Number(p.predelay) || 5,
        width: (Number(p.width) || 80) / 100,
        earlyLevel: (Number(p.earlyLevel) || 70) / 100,
        size: Number(p.size) || 0.7,
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
        rate: Number(p.rate) || 0.5,
        depth: (Number(p.depth) || 50) / 100,
        mode: Number(p.mode) || 2,
        mix: (Number(p.mix) || 50) / 100,
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
        b1Freq: Number(p.b1Freq) || 100, b1Gain: Number(p.b1Gain) || 0, b1Q: Number(p.b1Q) || 0.7,
        b2Freq: Number(p.b2Freq) || 500, b2Gain: Number(p.b2Gain) || 0, b2Q: Number(p.b2Q) || 0.7,
        b3Freq: Number(p.b3Freq) || 2000, b3Gain: Number(p.b3Gain) || 0, b3Q: Number(p.b3Q) || 0.7,
        b4Freq: Number(p.b4Freq) || 8000, b4Gain: Number(p.b4Gain) || 0, b4Q: Number(p.b4Q) || 0.7,
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
        cabinet: Number(p.cabinet) || 0,
        mix: (Number(p.mix) || 100) / 100,
        brightness: (Number(p.brightness) || 50) / 100,
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
        drive: (Number(p.drive) || 50) / 100,
        bass: (Number(p.bass) || 50) / 100,
        mid: (Number(p.mid) || 50) / 100,
        treble: (Number(p.treble) || 50) / 100,
        presence: (Number(p.presence) || 50) / 100,
        master: (Number(p.master) || 50) / 100,
        sag: (Number(p.sag) || 20) / 100,
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
        frequency: Number(p.frequency) || 6000,
        bandwidth: Number(p.bandwidth) || 1,
        threshold: Number(p.threshold) || -20,
        ratio: Number(p.ratio) || 4,
        attack: Number(p.attack) || 1,
        release: Number(p.release) || 50,
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
        lowCrossover: Number(p.lowCrossover) || 200,
        highCrossover: Number(p.highCrossover) || 3000,
        lowThreshold: Number(p.lowThreshold) || -20,
        midThreshold: Number(p.midThreshold) || -20,
        highThreshold: Number(p.highThreshold) || -20,
        lowRatio: Number(p.lowRatio) || 4,
        midRatio: Number(p.midRatio) || 4,
        highRatio: Number(p.highRatio) || 4,
        lowGain: Number(p.lowGain) || 1,
        midGain: Number(p.midGain) || 1,
        highGain: Number(p.highGain) || 1,
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
        attack: Number(p.attack) || 0,
        sustain: Number(p.sustain) || 0,
        outputGain: Number(p.output) || 1,
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
        frequency: Number(p.frequency) || 100,
        amount: Number(p.amount) || 0.5,
        drive: Number(p.drive) || 0,
        mix: Number(p.mix) || 1,
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
        threshold: Number(p.threshold) || -30,
        ratio: Number(p.ratio) || 2,
        attack: Number(p.attack) || 1,
        release: Number(p.release) || 100,
        range: Number(p.range) || -60,
        knee: Number(p.knee) || 6,
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
        time: Number(p.time) || 500,
        feedback: Number(p.feedback) || 0.3,
        mix: Number(p.mix) || 0.5,
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
        time: Number(p.time) || 400,
        feedback: Number(p.feedback) || 0.4,
        cutoff: Number(p.cutoff) || 3000,
        drive: Number(p.drive) || 0.3,
        mix: Number(p.mix) || 0.5,
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
        timeL: Number(p.timeL) || 500,
        timeR: Number(p.timeR) || 375,
        feedback: Number(p.feedback) || 0.4,
        pan: Number(p.pan) || 0.5,
        lpf: Number(p.lpf) || 12000,
        hpf: Number(p.hpf) || 40,
        mix: Number(p.mix) || 0.5,
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
        time: Number(p.time) || 60,
        feedback: Number(p.feedback) || 0.1,
        tone: Number(p.tone) || 4000,
        mix: Number(p.mix) || 0.5,
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
        time: Number(p.time) || 500,
        feedback: Number(p.feedback) || 0.4,
        lpf: Number(p.lpf) || 8000,
        hpf: Number(p.hpf) || 60,
        invert: Number(p.invert) || 0,
        mix: Number(p.mix) || 0.5,
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
        drive: Number(p.drive) || 0.5,
        blend: Number(p.blend) || 0.5,
        preFreq: Number(p.preFreq) || 20000,
        postFreq: Number(p.postFreq) || 20000,
        mix: Number(p.mix) || 1,
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
        frequency: Number(p.frequency) || 3000,
        amount: Number(p.amount) || 0.5,
        blend: Number(p.blend) || 0.5,
        ceil: Number(p.ceil) || 16000,
        mix: Number(p.mix) || 1,
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
        amount: Number(p.amount) || 0.5,
        mix: Number(p.mix) || 1,
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
        distortion: Number(p.distortion) || 0.5,
        tone: Number(p.tone) || 0.5,
        mix: Number(p.mix) || 1,
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
        inputGain: Number(p.inputGain) || 1,
        point1x: Number(p.point1x) || -0.5,
        point1y: Number(p.point1y) || -0.5,
        point2x: Number(p.point2x) || 0.5,
        point2y: Number(p.point2y) || 0.5,
        outputGain: Number(p.outputGain) || 1,
        preLpf: Number(p.preLpf) || 20000,
        postLpf: Number(p.postLpf) || 20000,
        mix: Number(p.mix) || 1,
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
        threshold: Number(p.threshold) || -12,
        ratio: Number(p.ratio) || 4,
        attack: Number(p.attack) || 10,
        release: Number(p.release) || 100,
        knee: Number(p.knee) || 6,
        makeup: Number(p.makeup) || 0,
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
        threshold: Number(p.threshold) || -30,
        attack: Number(p.attack) || 1,
        hold: Number(p.hold) || 50,
        release: Number(p.release) || 200,
        range: Number(p.range) || 0,
        scFreq: Number(p.scFreq) || 200,
        scQ: Number(p.scQ) || 1,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ threshold: -30, attack: 1, hold: 50, release: 200, range: 0, scFreq: 200, scQ: 1 }),
    presets: [
      { name: 'Kick Gate', params: { threshold: -25, attack: 0.1, hold: 30, release: 80, range: -60, scFreq: 100, scQ: 0.5 } },
      { name: 'Rhythmic Chop', params: { threshold: -30, attack: 0.5, hold: 10, release: 50, range: -80, scFreq: 200, scQ: 1 } },
      { name: 'Trance Pump', params: { threshold: -28, attack: 0.1, hold: 5, release: 120, range: -80, scFreq: 150, scQ: 0.8 } },
      { name: 'Soft Gate', params: { threshold: -20, attack: 1, hold: 60, release: 200, range: -20, scFreq: 300, scQ: 1 } },
      { name: 'Stutter', params: { threshold: -35, attack: 0.1, hold: 5, release: 30, range: -80, scFreq: 200, scQ: 1.5 } },
      { name: 'Bass Cleaner', params: { threshold: -22, attack: 0.5, hold: 40, release: 150, range: -40, scFreq: 80, scQ: 0.3 } },
    ],
  },
  {
    id: 'MultibandGate', name: 'Multiband Gate', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { MultibandGateEffect } = await import('@engine/effects/MultibandGateEffect');
      const p = c.parameters;
      return new MultibandGateEffect({
        lowCross: Number(p.lowCross) || 200,
        highCross: Number(p.highCross) || 3000,
        lowThresh: Number(p.lowThresh) || -40,
        midThresh: Number(p.midThresh) || -40,
        highThresh: Number(p.highThresh) || -40,
        lowRange: Number(p.lowRange) || 0,
        midRange: Number(p.midRange) || 0,
        highRange: Number(p.highRange) || 0,
        attack: Number(p.attack) || 1,
        release: Number(p.release) || 200,
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
        lowCross: Number(p.lowCross) || 200,
        highCross: Number(p.highCross) || 3000,
        lowCeil: Number(p.lowCeil) || -1,
        midCeil: Number(p.midCeil) || -1,
        highCeil: Number(p.highCeil) || -1,
        lowGain: Number(p.lowGain) || 1,
        midGain: Number(p.midGain) || 1,
        highGain: Number(p.highGain) || 1,
        release: Number(p.release) || 50,
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
        ceiling: Number(p.ceiling) || -1,
        release: Number(p.release) || 50,
        scFreq: Number(p.scFreq) || 1000,
        scGain: Number(p.scGain) || 0,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ ceiling: -1, release: 50, scFreq: 1000, scGain: 0 }),
    presets: [
      { name: 'Transparent', params: { ceiling: -1, release: 80, scFreq: 1000, scGain: 0 } },
      { name: 'Kick Tamer', params: { ceiling: -2, release: 40, scFreq: 100, scGain: 6 } },
      { name: 'Brick Wall', params: { ceiling: -0.3, release: 15, scFreq: 2000, scGain: 8 } },
      { name: 'Bass Control', params: { ceiling: -3, release: 60, scFreq: 80, scGain: 10 } },
      { name: 'De-Harsh', params: { ceiling: -1.5, release: 50, scFreq: 4000, scGain: 8 } },
      { name: 'Loud Master', params: { ceiling: -0.5, release: 25, scFreq: 1000, scGain: 4 } },
    ],
  },
  {
    id: 'Clipper', name: 'Clipper', category: 'wasm', group: 'Dynamics',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { ClipperEffect } = await import('@engine/effects/ClipperEffect');
      const p = c.parameters;
      return new ClipperEffect({
        inputGain: Number(p.inputGain) || 0,
        ceiling: Number(p.ceiling) || -1,
        softness: Number(p.softness) || 0.5,
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
        lowerThresh: Number(p.lowerThresh) || -40,
        upperThresh: Number(p.upperThresh) || -12,
        ratio: Number(p.ratio) || 4,
        attack: Number(p.attack) || 10,
        release: Number(p.release) || 100,
        makeup: Number(p.makeup) || 0,
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
        threshold: Number(p.threshold) || -20,
        ratio: Number(p.ratio) || 4,
        attack: Number(p.attack) || 10,
        release: Number(p.release) || 100,
        hold: Number(p.hold) || 0,
        inputGain: Number(p.inputGain) || 0,
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
        lowShelfFreq: Number(p.lowShelfFreq) || 100,
        lowShelfGain: Number(p.lowShelfGain) || 0,
        peak1Freq: Number(p.peak1Freq) || 500,
        peak1Gain: Number(p.peak1Gain) || 0,
        peak1Q: Number(p.peak1Q) || 1,
        peak2Freq: Number(p.peak2Freq) || 1500,
        peak2Gain: Number(p.peak2Gain) || 0,
        peak2Q: Number(p.peak2Q) || 1,
        peak3Freq: Number(p.peak3Freq) || 5000,
        peak3Gain: Number(p.peak3Gain) || 0,
        peak3Q: Number(p.peak3Q) || 1,
        highShelfFreq: Number(p.highShelfFreq) || 8000,
        highShelfGain: Number(p.highShelfGain) || 0,
        mix: Number(p.mix) || 1,
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
        mix: Number(p.mix) || 1,
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
        mix: Number(p.mix) || 1,
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
        mix: Number(p.mix) || 1,
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
        lowFreq: Number(p.lowFreq) || 200,
        lowGain: Number(p.lowGain) || 0,
        lowBw: Number(p.lowBw) || 1,
        highFreq: Number(p.highFreq) || 4000,
        highGain: Number(p.highGain) || 0,
        highBw: Number(p.highBw) || 1,
        mix: Number(p.mix) || 1,
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
        mode: Number(p.mode) || 0,
        mix: Number(p.mix) || 1,
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
        detectFreq: Number(p.detectFreq) || 1000,
        detectQ: Number(p.detectQ) || 1,
        processFreq: Number(p.processFreq) || 1000,
        processQ: Number(p.processQ) || 1,
        threshold: Number(p.threshold) || -20,
        maxGain: Number(p.maxGain) || 0,
        attack: Number(p.attack) || 10,
        release: Number(p.release) || 100,
        mix: Number(p.mix) || 1,
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
    id: 'ResonanceTamer', name: 'Resonance Tamer', category: 'wasm', group: 'EQ & Filter',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { ResonanceTamerEffect } = await import('@engine/effects/ResonanceTamerEffect');
      const p = c.parameters;
      const character = (p.character === 'warm' || p.character === 'bright' || p.character === 'transparent')
        ? p.character
        : 'transparent';
      return new ResonanceTamerEffect({
        amount: Number(p.amount ?? 0.35),
        character,
        mix: Number(p.mix ?? 1),
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ amount: 0.35, character: 'transparent', mix: 1 }),
    presets: [
      { name: 'Gentle',     params: { amount: 0.25, character: 'transparent' } },
      { name: 'Balanced',   params: { amount: 0.45, character: 'transparent' } },
      { name: 'Warm Tame',  params: { amount: 0.55, character: 'warm' } },
      { name: 'De-Harsh',   params: { amount: 0.50, character: 'bright' } },
      { name: 'Aggressive', params: { amount: 0.85, character: 'transparent' } },
    ],
  },
  {
    id: 'HaasEnhancer', name: 'Haas Stereo Enhancer', category: 'wasm', group: 'Stereo & Spatial',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { HaasEnhancerEffect } = await import('@engine/effects/HaasEnhancerEffect');
      const p = c.parameters;
      return new HaasEnhancerEffect({
        delay: Number(p.delay) || 10,
        side: Number(p.side) || 0,
        mix: Number(p.mix) || 1,
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
        bands: Number(p.bands) || 4,
        spread: Number(p.spread) || 0.7,
        mix: Number(p.mix) || 1,
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
        lowCross: Number(p.lowCross) || 200,
        midCross: Number(p.midCross) || 2000,
        highCross: Number(p.highCross) || 8000,
        lowWidth: Number(p.lowWidth) || 1,
        midWidth: Number(p.midWidth) || 1,
        highWidth: Number(p.highWidth) || 1,
        topWidth: Number(p.topWidth) || 1,
        harmonics: Number(p.harmonics) || 0,
        mix: Number(p.mix) || 1,
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
        size: Number(p.size) || 1,
        damping: Number(p.damping) || 0.3,
        mix: Number(p.mix) || 0.3,
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
        rate: Number(p.rate) || 2,
        depth: Number(p.depth) || 0.5,
        waveform: Number(p.waveform) || 0,
        stereoPhase: Number(p.stereoPhase) || 180,
        offset: Number(p.offset) || 0,
        mix: Number(p.mix) || 1,
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
        threshold: Number(p.threshold) || -20,
        drop: Number(p.drop) || 0.5,
        release: Number(p.release) || 200,
        mix: Number(p.mix) || 1,
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
        time: Number(p.time) || 100,
        volume: Number(p.volume) || 1,
        passthrough: Number(p.passthrough) || 0,
        active: Number(p.active) || 0,
        mix: Number(p.mix) || 1,
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
        crackle: Number(p.crackle) || 0.3,
        noise: Number(p.noise) || 0.2,
        rumble: Number(p.rumble) || 0.1,
        wear: Number(p.wear) || 0.3,
        speed: Number(p.speed) || 0.5,
        mix: Number(p.mix) || 1,
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
        transientBoost: Number(p.transientBoost) || 0,
        sustainBoost: Number(p.sustainBoost) || 0,
        sensitivity: Number(p.sensitivity) || 0.5,
        attack: Number(p.attack) || 5,
        release: Number(p.release) || 100,
        mix: Number(p.mix) || 1,
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
        lowCross: Number(p.lowCross) || 200,
        highCross: Number(p.highCross) || 4000,
        lowCeil: Number(p.lowCeil) || -3,
        midCeil: Number(p.midCeil) || -3,
        highCeil: Number(p.highCeil) || -3,
        softness: Number(p.softness) || 0.5,
        mix: Number(p.mix) || 1,
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
        lowCross: Number(p.lowCross) || 200,
        highCross: Number(p.highCross) || 4000,
        lowExpThresh: Number(p.lowExpThresh) || -40,
        midExpThresh: Number(p.midExpThresh) || -40,
        highExpThresh: Number(p.highExpThresh) || -40,
        lowCompThresh: Number(p.lowCompThresh) || -12,
        midCompThresh: Number(p.midCompThresh) || -12,
        highCompThresh: Number(p.highCompThresh) || -12,
        ratio: Number(p.ratio) || 4,
        attack: Number(p.attack) || 10,
        release: Number(p.release) || 100,
        mix: Number(p.mix) || 1,
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
        lowCross: Number(p.lowCross) || 200,
        highCross: Number(p.highCross) || 4000,
        lowThresh: Number(p.lowThresh) || -40,
        midThresh: Number(p.midThresh) || -40,
        highThresh: Number(p.highThresh) || -40,
        ratio: Number(p.ratio) || 2,
        attack: Number(p.attack) || 5,
        release: Number(p.release) || 100,
        range: Number(p.range) || -40,
        mix: Number(p.mix) || 1,
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
        lowCross: Number(p.lowCross) || 200,
        highCross: Number(p.highCross) || 4000,
        lowThresh: Number(p.lowThresh) || -18,
        midThresh: Number(p.midThresh) || -18,
        highThresh: Number(p.highThresh) || -18,
        lowRatio: Number(p.lowRatio) || 4,
        midRatio: Number(p.midRatio) || 4,
        highRatio: Number(p.highRatio) || 4,
        attack: Number(p.attack) || 10,
        release: Number(p.release) || 100,
        mix: Number(p.mix) || 1,
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
        ceiling: Number(p.ceiling) || -0.3,
        release: Number(p.release) || 50,
        mix: Number(p.mix) || 1,
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
        target: Number(p.target) || -12,
        speed: Number(p.speed) || 0.1,
        maxGain: Number(p.maxGain) || 12,
        mix: Number(p.mix) || 1,
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
        time: Number(p.time) || 300,
        feedback: Number(p.feedback) || 0.5,
        volume: Number(p.volume) || 0.7,
        mix: Number(p.mix) || 0.5,
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
        amount: Number(p.amount) || 0.5,
        tone: Number(p.tone) || 0,
        mix: Number(p.mix) || 1,
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
        threshold: Number(p.threshold) || -20,
        factor: Number(p.factor) || 0.5,
        release: Number(p.release) || 100,
        mix: Number(p.mix) || 1,
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
        azimuth: Number(p.azimuth) || 0,
        elevation: Number(p.elevation) || 0,
        distance: Number(p.distance) || 1,
        mix: Number(p.mix) || 1,
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
        time: Number(p.time) || 2,
        damping: Number(p.damping) || 0.5,
        mix: Number(p.mix) || 0.3,
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
        crush: Number(p.crush) || 8,
        mix: Number(p.mix) || 1,
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
        low: Number(p.low) || 0,
        lowMid: Number(p.lowMid) || 0,
        highMid: Number(p.highMid) || 0,
        high: Number(p.high) || 0,
        gain: Number(p.gain) || 0,
        mix: Number(p.mix) || 1,
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
        width: Number(p.width) || 1,
        invert: Number(p.invert) || 0,
        mix: Number(p.mix) || 1,
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
        rate: Number(p.rate) || 0.5,
        depth: Number(p.depth) || 0.5,
        voices: Number(p.voices) || 4,
        stereoPhase: Number(p.stereoPhase) || 90,
        mix: Number(p.mix) || 0.5,
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
        rate: Number(p.rate) || 0.5,
        depth: Number(p.depth) || 0.7,
        stages: Number(p.stages) || 6,
        feedback: Number(p.feedback) || 0.5,
        stereoPhase: Number(p.stereoPhase) || 90,
        mix: Number(p.mix) || 0.5,
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
        delayTime: Number(p.delayTime) || 0.3,
        feedback: Number(p.feedback) || 0.4,
        mix: Number(p.mix) || 0.5,
        toneFreq: Number(p.toneFreq) || 4000,
        drive: Number(p.drive) || 0,
        wowRate: Number(p.wowRate) || 0.5,
        wowDepth: Number(p.wowDepth) || 0,
        flutterRate: Number(p.flutterRate) || 6,
        flutterDepth: Number(p.flutterDepth) || 0,
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
  // ── Swedish Chainsaw — Boss HM-2 + JCM800 tonestack ──
  {
    id: 'SwedishChainsaw', name: 'Swedish Chainsaw', category: 'wasm', group: 'Distortion',
    loadMode: 'eager',
    create: async (c: EffectConfig) => {
      const { SwedishChainsawEffect } = await import('@engine/effects/SwedishChainsawEffect');
      const p = c.parameters;
      return new SwedishChainsawEffect({
        tight: Number(p.tight) > 50 ? 1 : 0,
        pedalGain: (Number(p.pedalGain) || 50) / 100,
        ampGain: (Number(p.ampGain) || 50) / 100,
        bass: (Number(p.bass) || 50) / 100,
        middle: (Number(p.middle) || 50) / 100,
        treble: (Number(p.treble) || 50) / 100,
        volume: (Number(p.volume) || 50) / 100,
        wet: c.wet / 100,
      });
    },
    getDefaultParameters: () => ({ tight: 0, pedalGain: 50, ampGain: 50, bass: 50, middle: 50, treble: 50, volume: 50 }),
    presets: [
      // ── Guitar presets ──
      { name: 'Gothenburg Sound', params: { tight: 0, pedalGain: 75, ampGain: 60, bass: 70, middle: 30, treble: 65, volume: 50 } },
      { name: 'Sunlight Studio', params: { tight: 0, pedalGain: 85, ampGain: 70, bass: 80, middle: 20, treble: 60, volume: 45 } },
      { name: 'Entombed Buzz', params: { tight: 0, pedalGain: 90, ampGain: 75, bass: 90, middle: 15, treble: 55, volume: 40 } },
      { name: 'Dismember Grind', params: { tight: 100, pedalGain: 80, ampGain: 65, bass: 60, middle: 25, treble: 70, volume: 50 } },
      { name: 'HM-2 Clean Boost', params: { tight: 0, pedalGain: 30, ampGain: 20, bass: 50, middle: 50, treble: 50, volume: 60 } },
      { name: 'Crust Punk', params: { tight: 100, pedalGain: 70, ampGain: 55, bass: 55, middle: 40, treble: 75, volume: 55 } },
      { name: 'Doom Sludge', params: { tight: 0, pedalGain: 65, ampGain: 50, bass: 95, middle: 35, treble: 30, volume: 55 } },
      { name: 'Shoegaze Wall', params: { tight: 0, pedalGain: 55, ampGain: 40, bass: 65, middle: 45, treble: 60, volume: 50 } },
      // ── TB-303 presets ──
      { name: '303 Acid Chainsaw', params: { tight: 100, pedalGain: 45, ampGain: 35, bass: 40, middle: 55, treble: 80, volume: 60 } },
      { name: '303 Industrial', params: { tight: 100, pedalGain: 60, ampGain: 50, bass: 30, middle: 45, treble: 85, volume: 55 } },
      { name: '303 Warm Overdrive', params: { tight: 0, pedalGain: 35, ampGain: 25, bass: 60, middle: 55, treble: 50, volume: 65 } },
      { name: '303 Scream Machine', params: { tight: 100, pedalGain: 70, ampGain: 55, bass: 25, middle: 60, treble: 90, volume: 50 } },
      { name: '303 Lo-Fi Tape', params: { tight: 0, pedalGain: 40, ampGain: 30, bass: 70, middle: 40, treble: 35, volume: 60 } },
      { name: '303 Techno Crunch', params: { tight: 100, pedalGain: 50, ampGain: 40, bass: 45, middle: 50, treble: 70, volume: 60 } },
    ],
  },
];

EffectRegistry.register(wasmEffects);
