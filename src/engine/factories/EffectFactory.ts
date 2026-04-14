/**
 * EffectFactory - Creates effect instances and provides default parameters.
 * Extracted from InstrumentFactory.ts
 */

import * as Tone from 'tone';
import type { EffectConfig } from '@typedefs/instrument';
import type { DevilboxSynth } from '@typedefs/synth';
import { TapeSaturation } from '../effects/TapeSaturation';
import { NeuralEffectWrapper } from '../effects/NeuralEffectWrapper';
import { SpaceEchoEffect } from '../effects/SpaceEchoEffect';
import { SpaceyDelayerEffect } from '../effects/SpaceyDelayerEffect';
import { RETapeEchoEffect } from '../effects/RETapeEchoEffect';
import { BiPhaseEffect } from '../effects/BiPhaseEffect';
import { DubFilterEffect } from '../effects/DubFilterEffect';
import { MoogFilterEffect, MoogFilterModel, MoogFilterMode } from '../effects/MoogFilterEffect';
import { MVerbEffect } from '../effects/MVerbEffect';
import { LeslieEffect } from '../effects/LeslieEffect';
import { SpringReverbEffect } from '../effects/SpringReverbEffect';
import { VinylNoiseEffect } from '../effects/VinylNoiseEffect';
import { ToneArmEffect } from '../effects/ToneArmEffect';
import { isEffectBpmSynced, getEffectSyncDivision, computeSyncedValue, SYNCABLE_EFFECT_PARAMS } from '../bpmSync';
import { SidechainCompressor } from '../effects/SidechainCompressor';
import { WAMEffectNode } from '../wam/WAMEffectNode';
import { WAM_EFFECT_URLS } from '@/constants/wamPlugins';
import { EffectRegistry } from '../registry/EffectRegistry';

/** Default wet % per effect type. Delays/echoes need lower wet to preserve dry signal. */
export function getDefaultEffectWet(type: string): number {
  switch (type) {
    // Delays & echoes: wet-only output, so keep dry signal dominant
    case 'Delay':
    case 'FeedbackDelay':
    case 'PingPongDelay':
    case 'SpaceEcho':
    case 'SpaceyDelayer':
    case 'RETapeEcho':
    case 'AmbientDelay':
      return 35;

    // Reverbs: moderate wet
    case 'Reverb':
    case 'Freeverb':
    case 'JCReverb':
    case 'MVerb':
    case 'SpringReverb':
    case 'ShimmerReverb':
      return 50;

    // Modulation: moderate wet
    case 'Chorus':
    case 'Phaser':
    case 'Tremolo':
    case 'Vibrato':
    case 'AutoWah':
    case 'AutoFilter':
    case 'AutoPanner':
    case 'BiPhase':
      return 50;

    // Granular/special: moderate wet
    case 'GranularFreeze':
      return 50;

    // Everything else (distortion, compression, EQ, filters, tape effects): full wet
    default:
      return 100;
  }
}

export function getDefaultEffectParameters(type: string): Record<string, number | string> {
// Try registry first
const desc = EffectRegistry.get(type);
if (desc) return desc.getDefaultParameters();

// Fallback to switch for unregistered effects
switch (type) {
  case 'Distortion':
    return { drive: 0.4, oversample: 'none' };
  case 'Reverb':
    return { decay: 1.5, preDelay: 0.01 };
  case 'Delay':
  case 'FeedbackDelay':
    return { time: 0.25, feedback: 0.35 };
  case 'Chorus':
    return { frequency: 1.5, delayTime: 3.5, depth: 0.7 };
  case 'Phaser':
    return { frequency: 0.5, octaves: 3, baseFrequency: 350, Q: 2, stages: 4 };
  case 'Tremolo':
    return { frequency: 10, depth: 0.5 };
  case 'Vibrato':
    return { frequency: 5, depth: 0.1 };
  case 'AutoFilter':
    return { frequency: 1, baseFrequency: 200, octaves: 2.6, filterType: 'lowpass' };
  case 'AutoPanner':
    return { frequency: 1, depth: 0.5 };
  case 'AutoWah':
    return { baseFrequency: 100, octaves: 4, sensitivity: 0, Q: 2, gain: 1, follower: 0.1 };
  case 'BitCrusher':
    return { bits: 4 };
  case 'Chebyshev':
    return { order: 2, oversample: 'none' };
  case 'FrequencyShifter':
    return { frequency: 0 };
  case 'PingPongDelay':
    return { time: 0.25, feedback: 0.35 };
  case 'PitchShift':
    return { pitch: 0, windowSize: 0.1, delayTime: 0, feedback: 0 };
  case 'Compressor':
    return { threshold: -24, ratio: 12, attack: 0.003, release: 0.25 };
  case 'EQ3':
    return { low: 0, mid: 0, high: 0, lowFrequency: 250, highFrequency: 3500 };
  case 'Filter':
    return { type: 'lowpass', frequency: 5000, rolloff: -12, Q: 1, gain: 0 };
  case 'JCReverb':
    return { roomSize: 0.5 };
  case 'StereoWidener':
    return { width: 0.5 };
  case 'TapeSaturation':
    return { drive: 50, tone: 12000 };
  case 'SidechainCompressor':
    return { threshold: -24, ratio: 4, attack: 0.003, release: 0.25, knee: 6, sidechainGain: 100 };
  case 'SpaceEcho':
    return { mode: 4, rate: 300, intensity: 0.5, echoVolume: 0.8, reverbVolume: 0.3, bass: 0, treble: 0 };
  case 'SpaceyDelayer':
    return { firstTap: 250, tapSize: 150, feedback: 40, multiTap: 1, tapeFilter: 0 };
  case 'RETapeEcho':
    return { mode: 3, repeatRate: 0.5, intensity: 0.5, echoVolume: 0.8, wow: 0, flutter: 0, dirt: 0, inputBleed: 0, loopAmount: 0, playheadFilter: 1 };
  case 'BiPhase':
    return { rateA: 0.5, depthA: 0.6, rateB: 4.0, depthB: 0.4, feedback: 0.3, routing: 0 };
  case 'DubFilter':
    return { cutoff: 20, resonance: 30, gain: 1 };
  case 'MoogFilter':
    return { cutoff: 1000, resonance: 10, drive: 1.0, model: 0, filterMode: 0 };
  case 'MVerb':
    return { damping: 0.5, density: 0.5, bandwidth: 0.5, decay: 0.7, predelay: 0.0, size: 0.8, gain: 1.0, mix: 0.4, earlyMix: 0.5 };
  case 'Leslie':
    return { speed: 0.0, hornRate: 6.8, drumRate: 5.9, hornDepth: 0.7, drumDepth: 0.5, doppler: 0.5, width: 0.8, acceleration: 0.5 };
  case 'SpringReverb':
    return { decay: 0.6, damping: 0.4, tension: 0.5, mix: 0.35, drip: 0.5, diffusion: 0.7 };
  case 'VinylNoise':
    return { hiss: 50, dust: 58, age: 45, speed: 5.5,
             riaa: 52, stylusResonance: 50, wornStylus: 28,
             pinch: 35, innerGroove: 25, ghostEcho: 20,
             dropout: 10, warp: 10, eccentricity: 18 };  // "Played" condition at 33 RPM
  case 'ToneArm':
    return { wow: 20, coil: 50, flutter: 15, riaa: 50, stylus: 30, hiss: 20, pops: 15, rpm: 33.333 };
  case 'ShimmerReverb':
    return { decay: 50, shimmer: 30, pitch: 12, damping: 60, size: 60, predelay: 40, modRate: 30, modDepth: 20 };
  case 'GranularFreeze':
    return { freeze: 0, grainSize: 80, density: 12, scatter: 30, pitch: 0, spray: 20, shimmer: 0, stereoWidth: 70, feedback: 0, captureLen: 500, attack: 5, release: 40, thru: 0 };
  case 'TapeDegradation':
    return { wow: 30, flutter: 20, hiss: 15, dropouts: 0, saturation: 30, toneShift: 50 };
  case 'AmbientDelay':
    return { time: 375, feedback: 55, taps: 2, filterType: 'lowpass', filterFreq: 2500, filterQ: 1.5, modRate: 30, modDepth: 15, stereoSpread: 50, diffusion: 20 };
  case 'SwedishChainsaw':
    return { tight: 0, pedalGain: 50, ampGain: 50, bass: 50, middle: 50, treble: 50, volume: 50 };
  default:
    return {};
}
}

/** Map synthType strings to FurnaceDispatchPlatform values for non-FM chips */


/**
 * Per-effect-type output gain compensation (dB).
 * Each value offsets the typical gain change of that effect at 100% wet.
 * Positive = effect cuts volume → boost. Negative = effect boosts volume → attenuate.
 *
 * Effects not listed here are assumed to be unity-gain (0dB compensation).
 * TapeSaturation handles its own makeup gain internally — not listed.
 */
const GAIN_COMPENSATION_DB: Record<string, number> = {
  // Legacy per-node wrapper compensation — DEPRECATED.
  // All gain compensation is now handled by effectGainCompensation.ts via
  // a separate gain node in MasterEffectsChain. Keeping this table empty
  // avoids double-compensation and avoids wrapping effects in Tone.Gain
  // (which breaks instanceof checks in EffectParameterEngine).
};

/** dB → linear gain */
function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export async function createEffectChain(
  effects: EffectConfig[]
): Promise<(Tone.ToneAudioNode | DevilboxSynth)[]> {
  const enabled = effects.filter((fx) => fx.enabled);
  return Promise.all(enabled.map((fx) => createEffect(fx)));
}


export async function createEffect(
  config: EffectConfig
): Promise<Tone.ToneAudioNode | DevilboxSynth> {
  const wetValue = config.wet / 100;
  // Helper: Tone.js expects specific numeric/string params; our EffectConfig stores them as number|string
  const p = config.parameters as Record<string, number & string>;

  /** Wrap an effect node with gain compensation if needed for its type. */
  function applyGainCompensation(effectNode: Tone.ToneAudioNode | DevilboxSynth): Tone.ToneAudioNode | DevilboxSynth {
    const effectType = config.category === 'neural' ? 'Neural' : config.type;
    const compensationDb = GAIN_COMPENSATION_DB[effectType];
    if (!compensationDb) return effectNode;
    // Scale by wet: at low wet%, most signal is dry (unity) → less compensation needed
    const scaledDb = compensationDb * wetValue;
    const wrapper = new Tone.Gain(1);
    const compensationGain = new Tone.Gain(dbToGain(scaledDb));
    wrapper.connect(effectNode as Tone.ToneAudioNode);
    (effectNode as Tone.ToneAudioNode).connect(compensationGain);
    Object.defineProperty(wrapper, 'output', {
      value: (compensationGain as unknown as { output: unknown }).output,
      configurable: true,
    });
    // Override dispose to clean up all three nodes
    const originalDispose = wrapper.dispose.bind(wrapper);
    wrapper.dispose = () => {
      try { (effectNode as Tone.ToneAudioNode).disconnect(); } catch { /* */ }
      try { compensationGain.disconnect(); compensationGain.dispose(); } catch { /* */ }
      try { (effectNode as Tone.ToneAudioNode).dispose(); } catch { /* */ }
      return originalDispose();
    };
    (wrapper as Tone.ToneAudioNode & { _fxType?: string })._fxType = config.type;
    (wrapper as unknown as Record<string, unknown>)._innerEffect = effectNode;
    (wrapper as unknown as Record<string, unknown>)._compensationGain = compensationGain;
    return wrapper;
  }

  // Try EffectRegistry first
  const effectDesc = await EffectRegistry.ensure(config.type);
  if (effectDesc) {
    const registryNode = await effectDesc.create(config);
    (registryNode as Tone.ToneAudioNode & { _fxType?: string })._fxType = config.type;
    return applyGainCompensation(registryNode);
  }

  // Neural effects
  if (config.category === 'neural') {
    if (config.neuralModelIndex === undefined) {
      throw new Error('Neural effect requires neuralModelIndex');
    }

    const wrapper = new NeuralEffectWrapper({
      modelIndex: config.neuralModelIndex,
      wet: wetValue,
    });

    await wrapper.loadModel();

    // Set all parameters from config
    Object.entries(config.parameters).forEach(([key, value]) => {
      wrapper.setParameter(key, value as number);
    });

    return applyGainCompensation(wrapper);
  }

  // Tone.js effects
  let node: Tone.ToneAudioNode | DevilboxSynth;
  
  switch (config.type) {
    case 'Distortion':
      node = new Tone.Distortion({
        distortion: p.drive || 0.4,
        oversample: p.oversample || 'none',
        wet: wetValue,
      });
      break;

    case 'Reverb': {
      const reverb = new Tone.Reverb({
        decay: p.decay || 1.5,
        preDelay: p.preDelay || 0.01,
        wet: wetValue,
      });
      // Reverb needs to generate its impulse response before it can process audio
      await reverb.ready;
      node = reverb;
      break;
    }

    case 'Delay':
      node = new Tone.FeedbackDelay({
        delayTime: p.time || 0.25,
        feedback: p.feedback || 0.35,
        wet: wetValue,
      });
      break;

    case 'Chorus': {
      const chorus = new Tone.Chorus({
        frequency: p.frequency || 1.5,
        delayTime: p.delayTime || 3.5,
        depth: p.depth || 0.7,
        wet: wetValue,
      });
      chorus.start(); // Start LFO
      node = chorus;
      break;
    }

    case 'Phaser':
      node = new Tone.Phaser({
        frequency: p.frequency || 0.5,
        octaves: p.octaves || 3,
        stages: p.stages || 4,
        baseFrequency: p.baseFrequency || 350,
        Q: p.Q || 2,
        wet: wetValue,
      });
      break;

    case 'Tremolo': {
      const tremolo = new Tone.Tremolo({
        frequency: p.frequency || 10,
        depth: p.depth || 0.5,
        wet: wetValue,
      });
      tremolo.start(); // Start LFO
      node = tremolo;
      break;
    }

    case 'Vibrato': {
      const vibrato = new Tone.Vibrato({
        frequency: p.frequency || 5,
        depth: p.depth || 0.1,
        wet: wetValue,
      });
      node = vibrato;
      break;
    }

    case 'AutoFilter': {
      const autoFilter = new Tone.AutoFilter({
        frequency: p.frequency || 1,
        baseFrequency: p.baseFrequency || 200,
        octaves: p.octaves || 2.6,
        filter: {
          type: p.filterType || 'lowpass',
          rolloff: -12,
          Q: 1,
        },
        wet: wetValue,
      });
      autoFilter.start(); // Start LFO
      node = autoFilter;
      break;
    }

    case 'AutoPanner': {
      const autoPanner = new Tone.AutoPanner({
        frequency: p.frequency || 1,
        depth: p.depth || 0.5,
        wet: wetValue,
      });
      autoPanner.start(); // Start LFO
      node = autoPanner;
      break;
    }

    case 'AutoWah':
      node = new Tone.AutoWah({
        baseFrequency: p.baseFrequency || 100,
        octaves: p.octaves || 4,
        sensitivity: p.sensitivity || 0,
        Q: p.Q || 2,
        gain: p.gain || 1,
        follower: p.follower || 0.1,
        wet: wetValue,
      });
      break;

    case 'BitCrusher': {
      // Use Tone.Distortion with a staircase WaveShaper curve instead of
      // Tone.BitCrusher. The latter uses an AudioWorklet that fails to
      // initialize due to standardized-audio-context's AudioWorkletNode
      // throwing InvalidStateError (even though the native API works).
      // A WaveShaper-based approach is synchronous and fully reliable.
      const bitsValue = Number(p.bits) || 4;
      const crusher = new Tone.Distortion({ distortion: 0, wet: wetValue, oversample: 'none' });
      const step = Math.pow(0.5, bitsValue - 1);
      (crusher as unknown as { _shaper: { setMap: (fn: (v: number) => number, len?: number) => void } })
        ._shaper.setMap((val: number) => step * Math.floor(val / step + 0.5), 4096);
      // Tag for parameter updates in applyEffectParametersDiff
      (crusher as unknown as Record<string, unknown>)._isBitCrusher = true;
      (crusher as unknown as Record<string, unknown>)._bitsValue = bitsValue;
      node = crusher;
      break;
    }

    case 'Chebyshev':
      node = new Tone.Chebyshev({
        order: p.order || 2,
        oversample: p.oversample || '2x',
        wet: wetValue,
      });
      break;

    case 'FeedbackDelay':
      node = new Tone.FeedbackDelay({
        delayTime: p.time || 0.25,
        feedback: p.feedback || 0.35,
        wet: wetValue,
      });
      break;

    case 'FrequencyShifter':
      node = new Tone.FrequencyShifter({
        frequency: p.frequency || 0,
        wet: wetValue,
      });
      break;

    case 'PingPongDelay':
      node = new Tone.PingPongDelay({
        delayTime: p.time || 0.25,
        feedback: p.feedback || 0.35,
        wet: wetValue,
      });
      break;

    case 'PitchShift':
      node = new Tone.PitchShift({
        pitch: p.pitch || 0,
        windowSize: p.windowSize || 0.1,
        delayTime: p.delayTime || 0,
        feedback: p.feedback || 0,
        wet: wetValue,
      });
      break;

    case 'Compressor':
      node = new Tone.Compressor({
        threshold: p.threshold || -24,
        ratio: p.ratio || 12,
        attack: p.attack || 0.003,
        release: p.release || 0.25,
      });
      break;

    case 'EQ3': {
      // Use three serial peaking filters instead of Tone.EQ3's multiband split,
      // which has inherent phase cancellation causing ~11dB insertion loss.
      // Peaking filters are transparent at 0dB gain (no band splitting).
      const eqInput = new Tone.Gain(1);
      const lowFilter = new Tone.Filter({
        type: 'peaking' as BiquadFilterType,
        frequency: p.lowFrequency || 250,
        gain: p.low || 0,
        Q: 0.5,
      });
      const midFilter = new Tone.Filter({
        type: 'peaking' as BiquadFilterType,
        frequency: Math.sqrt((p.lowFrequency || 250) * (p.highFrequency || 3500)),
        gain: p.mid || 0,
        Q: 0.7,
      });
      const highFilter = new Tone.Filter({
        type: 'peaking' as BiquadFilterType,
        frequency: p.highFrequency || 3500,
        gain: p.high || 0,
        Q: 0.5,
      });
      eqInput.chain(lowFilter, midFilter, highFilter);
      // Store filters for parameter updates
      (eqInput as unknown as Record<string, unknown>)._eq3Filters = [lowFilter, midFilter, highFilter];
      // Override output so chain connects FROM highFilter
      Object.defineProperty(eqInput, 'output', { value: (highFilter as unknown as { output: unknown }).output, configurable: true });
      node = eqInput;
      break;
    }

    case 'Filter':
      node = new Tone.Filter({
        type: p.type || 'lowpass',
        frequency: p.frequency || 5000,
        rolloff: p.rolloff || -12,
        Q: p.Q || 1,
        gain: p.gain || 0,
      });
      break;

    case 'JCReverb': {
      // Use Tone.Reverb (ConvolverNode-based) instead of Tone.JCReverb which
      // depends on FeedbackCombFilter AudioWorklets that fail to initialize.
      const roomVal = Math.max(0, Math.min(Number(p.roomSize) || 0.5, 0.99));
      const jcr = new Tone.Reverb({
        decay: 0.5 + roomVal * 9.5,  // roomSize 0-1 → decay 0.5-10s
        preDelay: 0.01,
        wet: wetValue,
      });
      await jcr.ready;
      node = jcr;
      break;
    }

    case 'StereoWidener':
      node = new Tone.StereoWidener({
        width: p.width || 0.5,
      });
      break;

    case 'TapeSaturation':
      node = new TapeSaturation({
        drive: (p.drive || 50) / 100,   // 0-100 -> 0-1
        tone: p.tone || 12000,          // Hz
        wet: wetValue,
      });
      break;

    case 'SidechainCompressor':
      node = new SidechainCompressor({
        threshold: p.threshold ?? -24,
        ratio: p.ratio ?? 4,
        attack: p.attack ?? 0.003,
        release: p.release ?? 0.25,
        knee: p.knee ?? 6,
        sidechainGain: (p.sidechainGain ?? 100) / 100,
        wet: wetValue,
      });
      break;

    case 'SpaceEcho':
      node = new SpaceEchoEffect({
        mode: Number(p.mode) || 4,
        rate: Number(p.rate) || 300,
        intensity: Number(p.intensity) || 0.5,
        echoVolume: Number(p.echoVolume) || 0.8,
        reverbVolume: Number(p.reverbVolume) || 0.3,
        bass: Number(p.bass) || 0,
        treble: Number(p.treble) || 0,
        wet: wetValue,
      });
      break;

    case 'SpaceyDelayer':
      node = new SpaceyDelayerEffect({
        firstTap: Number(p.firstTap) || 250,
        tapSize: Number(p.tapSize) || 150,
        feedback: Number(p.feedback) || 40,
        multiTap: p.multiTap != null ? Number(p.multiTap) : 1,
        tapeFilter: Number(p.tapeFilter) || 0,
        wet: wetValue,
      });
      break;

    case 'RETapeEcho':
      node = new RETapeEchoEffect({
        mode: p.mode != null ? Number(p.mode) : 3,
        repeatRate: Number(p.repeatRate) || 0.5,
        intensity: Number(p.intensity) || 0.5,
        echoVolume: Number(p.echoVolume) || 0.8,
        wow: Number(p.wow) || 0,
        flutter: Number(p.flutter) || 0,
        dirt: Number(p.dirt) || 0,
        inputBleed: p.inputBleed != null ? Number(p.inputBleed) : 0,
        loopAmount: Number(p.loopAmount) || 0,
        playheadFilter: p.playheadFilter != null ? Number(p.playheadFilter) : 1,
        wet: wetValue,
      });
      break;

    case 'BiPhase':
      node = new BiPhaseEffect({
        rateA: Number(p.rateA) || 0.5,
        depthA: Number(p.depthA) || 0.6,
        rateB: Number(p.rateB) || 4.0,
        depthB: Number(p.depthB) || 0.4,
        feedback: Number(p.feedback) || 0.3,
        routing: Number(p.routing) === 1 ? 'series' : 'parallel',
        wet: wetValue,
      });
      break;

    case 'DubFilter':
      node = new DubFilterEffect({
        cutoff: Number(p.cutoff) || 20,
        resonance: Number(p.resonance) || 30,
        gain: Number(p.gain) || 1,
        wet: wetValue,
      });
      break;

    // WASM effects
    case 'SwedishChainsaw': {
      const { SwedishChainsawEffect } = await import('../effects/SwedishChainsawEffect');
      node = new SwedishChainsawEffect({
        tight: Number(p.tight) > 50 ? 1 : 0,
        pedalGain: (Number(p.pedalGain) || 50) / 100,
        ampGain: (Number(p.ampGain) || 50) / 100,
        bass: (Number(p.bass) || 5) / 100,
        middle: (Number(p.middle) || 50) / 100,
        treble: (Number(p.treble) || 50) / 100,
        volume: (Number(p.volume) || 50) / 100,
        wet: wetValue,
      });
      break;
    }

    case 'MoogFilter':
      node = new MoogFilterEffect({
        cutoff: Number(p.cutoff) || 1000,
        resonance: (Number(p.resonance) || 10) / 100,  // 0-100 -> 0-1
        drive: Number(p.drive) || 1.0,
        model: (Number(p.model) || MoogFilterModel.Hyperion) as MoogFilterModel,
        filterMode: (Number(p.filterMode) || MoogFilterMode.LP4) as MoogFilterMode,
        wet: wetValue,
      });
      break;

    case 'MVerb':
      node = new MVerbEffect({
        damping: Number(p.damping),
        density: Number(p.density),
        bandwidth: Number(p.bandwidth),
        decay: Number(p.decay),
        predelay: Number(p.predelay),
        size: Number(p.size),
        gain: Number(p.gain),
        mix: Number(p.mix),
        earlyMix: Number(p.earlyMix),
        wet: wetValue,
      });
      break;

    case 'Leslie':
      node = new LeslieEffect({
        speed: Number(p.speed),
        hornRate: Number(p.hornRate),
        drumRate: Number(p.drumRate),
        hornDepth: Number(p.hornDepth),
        drumDepth: Number(p.drumDepth),
        doppler: Number(p.doppler),
        width: Number(p.width),
        acceleration: Number(p.acceleration),
        wet: wetValue,
      });
      break;

    case 'SpringReverb':
      node = new SpringReverbEffect({
        decay: Number(p.decay),
        damping: Number(p.damping),
        tension: Number(p.tension),
        mix: Number(p.mix),
        drip: Number(p.drip),
        diffusion: Number(p.diffusion),
        wet: wetValue,
      });
      break;

    case 'ToneArm': {
      node = new ToneArmEffect({
        wow:     (p.wow     != null ? Number(p.wow)     : 20) / 100,
        coil:    (p.coil    != null ? Number(p.coil)    : 50) / 100,
        flutter: (p.flutter != null ? Number(p.flutter) : 15) / 100,
        riaa:    (p.riaa    != null ? Number(p.riaa)    : 50) / 100,
        stylus:  (p.stylus  != null ? Number(p.stylus)  : 30) / 100,
        hiss:    (p.hiss    != null ? Number(p.hiss)    : 20) / 100,
        pops:    (p.pops    != null ? Number(p.pops)    : 15) / 100,
        rpm:     (p.rpm     != null ? Number(p.rpm)     : 33.333),
        wet:     wetValue,
      });
      break;
    }

    case 'VinylNoise': {
      node = new VinylNoiseEffect({
        hiss:            (p.hiss            != null ? Number(p.hiss)            : 20)  / 100,
        dust:            (p.dust            != null ? Number(p.dust)            : 30)  / 100,
        age:             (p.age             != null ? Number(p.age)             : 18)  / 100,
        speed:           (p.speed           != null ? Number(p.speed)           : 5.5) / 100,
        riaa:            (p.riaa            != null ? Number(p.riaa)            : 30)  / 100,
        stylusResonance: (p.stylusResonance != null ? Number(p.stylusResonance) : 25)  / 100,
        wornStylus:      (p.wornStylus      != null ? Number(p.wornStylus)      : 0)   / 100,
        pinch:           (p.pinch           != null ? Number(p.pinch)           : 15)  / 100,
        innerGroove:     (p.innerGroove     != null ? Number(p.innerGroove)     : 0)   / 100,
        ghostEcho:       (p.ghostEcho       != null ? Number(p.ghostEcho)       : 0)   / 100,
        dropout:         (p.dropout         != null ? Number(p.dropout)         : 0)   / 100,
        warp:            (p.warp            != null ? Number(p.warp)            : 0)   / 100,
        eccentricity:    (p.eccentricity    != null ? Number(p.eccentricity)    : 0)   / 100,
        wet: wetValue,
      });
      break;
    }

    // *Wave / ambient effects
    case 'TapeDegradation': {
      const { TapeDegradationEffect } = await import('@engine/effects/TapeDegradationEffect');
      node = new TapeDegradationEffect({
        wow: (Number(p.wow) || 30) / 100,
        flutter: (Number(p.flutter) || 20) / 100,
        hiss: (Number(p.hiss) || 15) / 100,
        dropouts: (Number(p.dropouts) || 0) / 100,
        saturation: (Number(p.saturation) || 30) / 100,
        toneShift: (Number(p.toneShift) || 50) / 100,
        wet: wetValue,
      });
      break;
    }
    case 'AmbientDelay': {
      const { AmbientDelayEffect } = await import('@engine/effects/AmbientDelayEffect');
      node = new AmbientDelayEffect({
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
        wet: wetValue,
      });
      break;
    }
    case 'ShimmerReverb': {
      const { ShimmerReverbEffect } = await import('@engine/effects/ShimmerReverbEffect');
      node = new ShimmerReverbEffect({
        decay: (Number(p.decay) || 70) / 100,
        shimmer: (Number(p.shimmer) || 50) / 100,
        pitch: Number(p.pitch) ?? 12,
        damping: (Number(p.damping) || 50) / 100,
        size: (Number(p.size) || 70) / 100,
        predelay: (Number(p.predelay) || 40) / 1000,
        modRate: (Number(p.modRate) || 30) / 100,
        modDepth: (Number(p.modDepth) || 20) / 100,
        wet: wetValue,
      });
      break;
    }
    case 'GranularFreeze': {
      const { GranularFreezeEffect } = await import('@engine/effects/GranularFreezeEffect');
      node = new GranularFreezeEffect({
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
        wet: wetValue,
      });
      break;
    }

    // WAM 2.0 effects
    case 'WAMBigMuff':
    case 'WAMTS9':
    case 'WAMDistoMachine':
    case 'WAMQuadraFuzz':
    case 'WAMVoxAmp':
    case 'WAMStonePhaser':
    case 'WAMPingPongDelay':
    case 'WAMFaustDelay':
    case 'WAMPitchShifter':
    case 'WAMGraphicEQ':
    case 'WAMPedalboard': {
      const wamUrl = WAM_EFFECT_URLS[config.type];
      if (!wamUrl) {
        console.warn(`[InstrumentFactory] No WAM URL for effect: ${config.type}`);
        node = new Tone.Gain(1);
        break;
      }
      const wamNode = new WAMEffectNode({ moduleUrl: wamUrl, wet: wetValue });
      await wamNode.ensureInitialized();
      node = wamNode;
      break;
    }

    default:
      console.warn(`Unknown effect type: ${config.type}, creating bypass`);
      node = new Tone.Gain(1);
  }

  // Attach type metadata for identification in the engine
  (node as Tone.ToneAudioNode & { _fxType?: string })._fxType = config.type;

  // Apply initial BPM-synced values if sync is enabled
  if (isEffectBpmSynced(config.parameters)) {
    const syncEntries = SYNCABLE_EFFECT_PARAMS[config.type];
    if (syncEntries) {
      const bpm = Tone.getTransport().bpm.value;
      const division = getEffectSyncDivision(config.parameters);
      for (const entry of syncEntries) {
        const value = computeSyncedValue(bpm, division, entry.unit);
        // Apply directly via the same pattern as ToneEngine.applyBpmSyncedParam
        switch (config.type) {
          case 'Delay':
          case 'FeedbackDelay':
            if (entry.param === 'time' && node instanceof Tone.FeedbackDelay) node.delayTime.value = value;
            break;
          case 'PingPongDelay':
            if (entry.param === 'time' && node instanceof Tone.PingPongDelay) node.delayTime.value = value;
            break;
          case 'SpaceEcho':
            if (entry.param === 'rate' && node instanceof SpaceEchoEffect) node.setRate(value);
            break;
          case 'SpaceyDelayer':
            if (entry.param === 'firstTap' && node instanceof SpaceyDelayerEffect) node.setFirstTap(value);
            break;
          case 'RETapeEcho':
            if (entry.param === 'repeatRate' && node instanceof RETapeEchoEffect) node.setRepeatRate(value);
            break;
          case 'Chorus':
            if (entry.param === 'frequency' && node instanceof Tone.Chorus) node.frequency.value = value;
            break;
          case 'BiPhase':
            if (entry.param === 'rateA' && node instanceof BiPhaseEffect) (node as unknown as { rateA: number }).rateA = value;
            break;
        }
      }
    }
  }

  // Apply per-effect-type gain compensation to normalize output levels.
  return applyGainCompensation(node);
}

