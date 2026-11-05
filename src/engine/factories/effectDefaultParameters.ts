/** Pure default effect parameters. Kept free of effect-class imports so stores can use it without loading every effect. */
import { EffectRegistry } from '../registry/EffectRegistry';

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
  case 'RE201':
    return { bass: 0.5, treble: 0.5, delayMode: 7, repeatRate: 0.5, intensity: 0.5, echoVolume: 0.8, reverbVolume: 0.3, inputLevel: 1 };
  case 'AnotherDelay':
    return { delayTime: 300, feedback: 0.3, gain: 1, lowpass: 12000, highpass: 80, flutterFreq: 3.5, flutterDepth: 0, wowFreq: 0.5, wowDepth: 0, reverbEnabled: 1, roomSize: 0.5, damping: 0.5, width: 1 };
  case 'BiPhase':
    return { rateA: 0.5, depthA: 0.6, rateB: 4.0, depthB: 0.4, feedback: 0.3, routing: 0 };
  case 'DubFilter':
    return { cutoff: 20, resonance: 30, gain: 1 };
  case 'MoogFilter':
    return { cutoff: 1000, resonance: 10, drive: 1.0, model: 0, filterMode: 0 };
  case 'MVerb':
    return { damping: 0.5, density: 0.5, bandwidth: 0.5, decay: 0.7, predelay: 0.0, size: 0.8, gain: 1.0, mix: 0.4, earlyMix: 0.5 };
  case 'MadProfessorPlate':
    return { decay: 0.85, damping: 0.75, density: 0.80, predelay: 0.18, size: 0.70, hpfHz: 200, lpfHz: 5000 };
  case 'DattorroPlate':
    return { predelay: 0.15, preFilter: 0.70, inputDiffusion: 0.75, decayDiffusion: 0.50, decay: 0.85, damping: 0.35 };
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
