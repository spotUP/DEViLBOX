/**
 * EffectParameterEngine — pure functions extracted from ToneEngine.ts
 * for applying effect parameter diffs and BPM-synced params to audio nodes.
 */

import * as Tone from 'tone';
import { SpaceyDelayerEffect } from '../effects/SpaceyDelayerEffect';
import { RETapeEchoEffect } from '../effects/RETapeEchoEffect';
import { SpaceEchoEffect } from '../effects/SpaceEchoEffect';
import { BiPhaseEffect } from '../effects/BiPhaseEffect';
import { DubFilterEffect } from '../effects/DubFilterEffect';
import { MoogFilterEffect, type MoogFilterModel, type MoogFilterMode } from '../effects/MoogFilterEffect';
import { MVerbEffect } from '../effects/MVerbEffect';
import { LeslieEffect } from '../effects/LeslieEffect';
import { SpringReverbEffect } from '../effects/SpringReverbEffect';
import {
  AelapseEffect,
  PARAM_DELAY_ACTIVE as AEL_DELAY_ACTIVE,
  PARAM_DELAY_DRYWET as AEL_DELAY_DRYWET,
  PARAM_DELAY_SECONDS as AEL_DELAY_SECONDS,
  PARAM_DELAY_FEEDBACK as AEL_DELAY_FEEDBACK,
  PARAM_DELAY_CUT_LOW as AEL_DELAY_CUT_LOW,
  PARAM_DELAY_CUT_HI as AEL_DELAY_CUT_HI,
  PARAM_DELAY_SATURATION as AEL_DELAY_SATURATION,
  PARAM_DELAY_DRIFT as AEL_DELAY_DRIFT,
  PARAM_DELAY_MODE as AEL_DELAY_MODE,
  PARAM_SPRINGS_ACTIVE as AEL_SPRINGS_ACTIVE,
  PARAM_SPRINGS_DRYWET as AEL_SPRINGS_DRYWET,
  PARAM_SPRINGS_WIDTH as AEL_SPRINGS_WIDTH,
  PARAM_SPRINGS_LENGTH as AEL_SPRINGS_LENGTH,
  PARAM_SPRINGS_DECAY as AEL_SPRINGS_DECAY,
  PARAM_SPRINGS_DAMP as AEL_SPRINGS_DAMP,
  PARAM_SPRINGS_SHAPE as AEL_SPRINGS_SHAPE,
  PARAM_SPRINGS_TONE as AEL_SPRINGS_TONE,
  PARAM_SPRINGS_SCATTER as AEL_SPRINGS_SCATTER,
  PARAM_SPRINGS_CHAOS as AEL_SPRINGS_CHAOS,
} from '../effects/AelapseEffect';
import { VinylNoiseEffect } from '../effects/VinylNoiseEffect';
import { TumultEffect, type TumultOptions } from '../effects/TumultEffect';
import { TapeSimulatorEffect } from '../effects/TapeSimulatorEffect';
import { ToneArmEffect } from '../effects/ToneArmEffect';
import { NeuralEffectWrapper } from '../effects/NeuralEffectWrapper';
import { WAMEffectNode } from '../wam/WAMEffectNode';
import { SidechainCompressor } from '../effects/SidechainCompressor';
import { TapeSaturation } from '../effects/TapeSaturation';
import { AmbientDelayEffect } from '../effects/AmbientDelayEffect';
import { AutoTuneEffect } from '../effects/AutoTuneEffect';
import { GranularFreezeEffect } from '../effects/GranularFreezeEffect';
import { ShimmerReverbEffect } from '../effects/ShimmerReverbEffect';
import { TapeDegradationEffect } from '../effects/TapeDegradationEffect';
import { VocoderEffect } from '../effects/VocoderEffect';
import { NoiseGateEffect } from '../effects/NoiseGateEffect';
import { LimiterEffect } from '../effects/LimiterEffect';
import { FlangerEffect } from '../effects/FlangerEffect';
import { OverdriveEffect } from '../effects/OverdriveEffect';
import { RingModEffect } from '../effects/RingModEffect';
import { DragonflyPlateEffect } from '../effects/DragonflyPlateEffect';
import { DragonflyHallEffect } from '../effects/DragonflyHallEffect';
import { DragonflyRoomEffect } from '../effects/DragonflyRoomEffect';
import { JunoChorusEffect } from '../effects/JunoChorusEffect';
import { ParametricEQEffect } from '../effects/ParametricEQEffect';
import { CabinetSimEffect } from '../effects/CabinetSimEffect';
import { TubeAmpEffect } from '../effects/TubeAmpEffect';
import { DeEsserEffect } from '../effects/DeEsserEffect';
import { MultibandCompEffect } from '../effects/MultibandCompEffect';
import { TransientDesignerEffect } from '../effects/TransientDesignerEffect';
import { BassEnhancerEffect } from '../effects/BassEnhancerEffect';
import { ExpanderEffect } from '../effects/ExpanderEffect';
import { BuzzmachineSynth } from '../buzzmachines/BuzzmachineSynth';

export const EFFECT_RAMP_TIME = 0.02;

export function applyEffectParametersDiff(
  node: Tone.ToneAudioNode,
  type: string,
  changed: Record<string, number | string>
): void {
  const R = EFFECT_RAMP_TIME;

  switch (type) {
    case 'Distortion':
      if (node instanceof Tone.Distortion) {
        if ('drive' in changed) node.distortion = changed.drive as number;
        if ('oversample' in changed) {
          const v = changed.oversample;
          node.oversample = (v === '2x' || v === '4x' ? v : 'none') as 'none' | '2x' | '4x';
        }
      }
      break;

    case 'Delay':
    case 'FeedbackDelay':
      if (node instanceof Tone.FeedbackDelay) {
        if ('time' in changed) node.delayTime.rampTo(changed.time as number, R);
        if ('feedback' in changed) node.feedback.rampTo(changed.feedback as number, R);
      }
      break;

    case 'Chorus':
      if (node instanceof Tone.Chorus) {
        if ('frequency' in changed) node.frequency.rampTo(changed.frequency as number, R);
        if ('depth' in changed) node.depth = changed.depth as number;
      }
      break;

    case 'Phaser':
      if (node instanceof Tone.Phaser) {
        if ('frequency' in changed) node.frequency.rampTo(changed.frequency as number, R);
        if ('octaves' in changed) node.octaves = changed.octaves as number;
        if ('baseFrequency' in changed) node.baseFrequency = Number(changed.baseFrequency);
        if ('Q' in changed) node.Q.rampTo(changed.Q as number, R);
      }
      break;

    case 'Tremolo':
      if (node instanceof Tone.Tremolo) {
        if ('frequency' in changed) node.frequency.rampTo(changed.frequency as number, R);
        if ('depth' in changed) node.depth.rampTo(changed.depth as number, R);
        if ('type' in changed) node.type = changed.type as Tone.ToneOscillatorType;
      }
      break;

    case 'Vibrato':
      if (node instanceof Tone.Vibrato) {
        if ('frequency' in changed) node.frequency.rampTo(changed.frequency as number, R);
        if ('depth' in changed) node.depth.rampTo(changed.depth as number, R);
        if ('type' in changed) node.type = changed.type as Tone.ToneOscillatorType;
      }
      break;

    case 'BitCrusher': {
      // BitCrusher is implemented as a Distortion with a staircase WaveShaper curve
      const crusherNode = node as unknown as {
        _isBitCrusher?: boolean;
        _bitsValue?: number;
        _shaper?: { setMap: (fn: (v: number) => number, len?: number) => void };
      };
      if (crusherNode._isBitCrusher && 'bits' in changed) {
        const newBits = Math.max(1, Math.floor(Number(changed.bits) || 4));
        crusherNode._bitsValue = newBits;
        const step = Math.pow(0.5, newBits - 1);
        crusherNode._shaper?.setMap(
          (val: number) => step * Math.floor(val / step + 0.5), 4096
        );
      }
      break;
    }

    case 'PingPongDelay':
      if (node instanceof Tone.PingPongDelay) {
        if ('time' in changed) node.delayTime.rampTo(changed.time as number, R);
        if ('feedback' in changed) node.feedback.rampTo(changed.feedback as number, R);
      }
      break;

    case 'PitchShift':
      if (node instanceof Tone.PitchShift) {
        if ('pitch' in changed) node.pitch = changed.pitch as number;
      }
      break;

    case 'Compressor':
      if (node instanceof Tone.Compressor) {
        if ('threshold' in changed) node.threshold.rampTo(changed.threshold as number, R);
        if ('ratio' in changed) node.ratio.rampTo(changed.ratio as number, R);
        if ('attack' in changed) node.attack.rampTo(changed.attack as number, R);
        if ('release' in changed) node.release.rampTo(changed.release as number, R);
      }
      break;

    case 'EQ3': {
      // Node is a Gain wrapper with _eq3Filters: [lowFilter, midFilter, highFilter]
      const filters = (node as unknown as Record<string, unknown>)._eq3Filters as Tone.Filter[] | undefined;
      if (filters && filters.length === 3) {
        if ('low' in changed) filters[0].gain.rampTo(changed.low as number, R);
        if ('mid' in changed) filters[1].gain.rampTo(changed.mid as number, R);
        if ('high' in changed) filters[2].gain.rampTo(changed.high as number, R);
        if ('lowFrequency' in changed) filters[0].frequency.rampTo(changed.lowFrequency as number, R);
        if ('highFrequency' in changed) filters[2].frequency.rampTo(changed.highFrequency as number, R);
      } else if (node instanceof Tone.EQ3) {
        // Fallback for legacy Tone.EQ3 instances
        if ('low' in changed) node.low.rampTo(changed.low as number, R);
        if ('mid' in changed) node.mid.rampTo(changed.mid as number, R);
        if ('high' in changed) node.high.rampTo(changed.high as number, R);
      }
      break;
    }

    case 'Filter':
      if (node instanceof Tone.Filter) {
        if ('frequency' in changed) node.frequency.rampTo(changed.frequency as number, R);
        if ('Q' in changed) node.Q.rampTo(changed.Q as number, R);
        if ('type' in changed) node.type = changed.type as Tone.Filter['type'];
        if ('rolloff' in changed) node.rolloff = changed.rolloff as Tone.FilterRollOff;
        if ('gain' in changed) node.gain.rampTo(changed.gain as number, R);
      }
      break;

    case 'AutoFilter':
      if (node instanceof Tone.AutoFilter) {
        if ('frequency' in changed) node.frequency.rampTo(changed.frequency as number, R);
        if ('baseFrequency' in changed) node.baseFrequency = changed.baseFrequency as number;
        if ('octaves' in changed) node.octaves = changed.octaves as number;
        if ('type' in changed) node.type = changed.type as Tone.ToneOscillatorType;
      }
      break;

    case 'AutoPanner':
      if (node instanceof Tone.AutoPanner) {
        if ('frequency' in changed) node.frequency.rampTo(changed.frequency as number, R);
        if ('depth' in changed) node.depth.rampTo(changed.depth as number, R);
        if ('type' in changed) node.type = changed.type as Tone.ToneOscillatorType;
      }
      break;

    case 'StereoWidener':
      if (node instanceof Tone.StereoWidener) {
        if ('width' in changed) node.width.rampTo(Math.min(0.85, Number(changed.width)), R);
      }
      break;

    case 'SpaceyDelayer':
      if (node instanceof SpaceyDelayerEffect) {
        if ('firstTap' in changed) node.setFirstTap(Number(changed.firstTap));
        if ('tapSize' in changed) node.setTapSize(Number(changed.tapSize));
        if ('feedback' in changed) node.setFeedback(Number(changed.feedback));
        if ('multiTap' in changed) node.setMultiTap(Number(changed.multiTap));
        if ('tapeFilter' in changed) node.setTapeFilter(Number(changed.tapeFilter));
      }
      break;

    case 'RETapeEcho':
      if (node instanceof RETapeEchoEffect) {
        if ('mode' in changed) node.setMode(Number(changed.mode));
        if ('repeatRate' in changed) node.setRepeatRate(Number(changed.repeatRate));
        if ('intensity' in changed) node.setIntensity(Number(changed.intensity));
        if ('echoVolume' in changed) node.setEchoVolume(Number(changed.echoVolume));
        if ('wow' in changed) node.setWow(Number(changed.wow));
        if ('flutter' in changed) node.setFlutter(Number(changed.flutter));
        if ('dirt' in changed) node.setDirt(Number(changed.dirt));
        if ('inputBleed' in changed) node.setInputBleed(Number(changed.inputBleed));
        if ('loopAmount' in changed) node.setLoopAmount(Number(changed.loopAmount));
        if ('playheadFilter' in changed) node.setPlayheadFilter(Number(changed.playheadFilter));
      }
      break;

    case 'SpaceEcho':
      if (node instanceof SpaceEchoEffect) {
        if ('mode' in changed) node.setMode(Number(changed.mode));
        if ('rate' in changed) node.setRate(Number(changed.rate));
        if ('intensity' in changed) node.setIntensity(Number(changed.intensity));
        if ('echoVolume' in changed) node.setEchoVolume(Number(changed.echoVolume));
        if ('reverbVolume' in changed) node.setReverbVolume(Number(changed.reverbVolume));
        if ('bass' in changed) node.setBass(Number(changed.bass));
        if ('treble' in changed) node.setTreble(Number(changed.treble));
      }
      break;

    case 'BiPhase':
      if (node instanceof BiPhaseEffect) {
        if ('rateA' in changed) node.setRateA(Number(changed.rateA));
        if ('depthA' in changed) node.setDepthA(Number(changed.depthA));
        if ('rateB' in changed) node.setRateB(Number(changed.rateB));
        if ('depthB' in changed) node.setDepthB(Number(changed.depthB));
        if ('feedback' in changed) node.setFeedback(Number(changed.feedback));
        if ('routing' in changed) node.setRouting(Number(changed.routing) === 0 ? 'parallel' : 'series');
      }
      break;

    case 'DubFilter':
      if (node instanceof DubFilterEffect) {
        if ('cutoff' in changed) node.setCutoff(Number(changed.cutoff));
        if ('resonance' in changed) node.setResonance(Number(changed.resonance));
        if ('gain' in changed) node.setGain(Number(changed.gain));
      }
      break;

    case 'MoogFilter':
      if (node instanceof MoogFilterEffect) {
        if ('cutoff' in changed) node.setCutoff(Number(changed.cutoff));
        if ('resonance' in changed) node.setResonance(Number(changed.resonance) / 100); // UI 0-100 → WASM 0-1
        if ('drive' in changed) node.setDrive(Number(changed.drive));
        if ('model' in changed) node.setModel(Number(changed.model) as MoogFilterModel);
        if ('filterMode' in changed) node.setFilterMode(Number(changed.filterMode) as MoogFilterMode);
      }
      break;

    case 'MVerb':
      if (node instanceof MVerbEffect) {
        if ('damping' in changed) node.setDamping(Number(changed.damping));
        if ('density' in changed) node.setDensity(Number(changed.density));
        if ('bandwidth' in changed) node.setBandwidth(Number(changed.bandwidth));
        if ('decay' in changed) node.setDecay(Number(changed.decay));
        if ('predelay' in changed) node.setPredelay(Number(changed.predelay));
        if ('size' in changed) node.setSize(Number(changed.size));
        if ('gain' in changed) node.setGain(Number(changed.gain));
        if ('mix' in changed) node.setMix(Number(changed.mix));
        if ('earlyMix' in changed) node.setEarlyMix(Number(changed.earlyMix));
      }
      break;

    case 'Leslie':
      if (node instanceof LeslieEffect) {
        if ('speed' in changed) node.setSpeed(Number(changed.speed));
        if ('hornRate' in changed) node.setHornRate(Number(changed.hornRate));
        if ('drumRate' in changed) node.setDrumRate(Number(changed.drumRate));
        if ('hornDepth' in changed) node.setHornDepth(Number(changed.hornDepth));
        if ('drumDepth' in changed) node.setDrumDepth(Number(changed.drumDepth));
        if ('doppler' in changed) node.setDoppler(Number(changed.doppler));
        if ('mix' in changed) node.setMix(Number(changed.mix));
        if ('width' in changed) node.setWidth(Number(changed.width));
        if ('acceleration' in changed) node.setAcceleration(Number(changed.acceleration));
      }
      break;

    case 'SpringReverb':
      if (node instanceof SpringReverbEffect) {
        if ('decay' in changed) node.setDecay(Number(changed.decay));
        if ('damping' in changed) node.setDamping(Number(changed.damping));
        if ('tension' in changed) node.setTension(Number(changed.tension));
        if ('mix' in changed) node.setSpringMix(Number(changed.mix));
        if ('drip' in changed) node.setDrip(Number(changed.drip));
        if ('diffusion' in changed) node.setDiffusion(Number(changed.diffusion));
      }
      break;

    case 'Aelapse':
      if (node instanceof AelapseEffect) {
        // Store values are stored as 0..100 integers from the getDefaultParameters
        // shape. The AelapseEffect.setParamById() expects 0..1 normalized.
        const norm = (k: string) => Number(changed[k]) / 100;
        if ('delayActive'     in changed) node.setParamById(AEL_DELAY_ACTIVE,     Number(changed.delayActive) > 50 ? 1 : 0);
        if ('delayDryWet'     in changed) node.setParamById(AEL_DELAY_DRYWET,     norm('delayDryWet'));
        if ('delayTime'       in changed) node.setParamById(AEL_DELAY_SECONDS,    norm('delayTime'));
        if ('delayFeedback'   in changed) node.setParamById(AEL_DELAY_FEEDBACK,   norm('delayFeedback'));
        if ('delayCutLow'     in changed) node.setParamById(AEL_DELAY_CUT_LOW,    norm('delayCutLow'));
        if ('delayCutHi'      in changed) node.setParamById(AEL_DELAY_CUT_HI,     norm('delayCutHi'));
        if ('delaySaturation' in changed) node.setParamById(AEL_DELAY_SATURATION, norm('delaySaturation'));
        if ('delayDrift'      in changed) node.setParamById(AEL_DELAY_DRIFT,      norm('delayDrift'));
        if ('delayMode'       in changed) node.setParamById(AEL_DELAY_MODE,       Number(changed.delayMode) / 2);
        if ('springsActive'   in changed) node.setParamById(AEL_SPRINGS_ACTIVE,   Number(changed.springsActive) > 50 ? 1 : 0);
        if ('springsDryWet'   in changed) node.setParamById(AEL_SPRINGS_DRYWET,   norm('springsDryWet'));
        if ('springsWidth'    in changed) node.setParamById(AEL_SPRINGS_WIDTH,    norm('springsWidth'));
        if ('springsLength'   in changed) node.setParamById(AEL_SPRINGS_LENGTH,   norm('springsLength'));
        if ('springsDecay'    in changed) node.setParamById(AEL_SPRINGS_DECAY,    norm('springsDecay'));
        if ('springsDamp'     in changed) node.setParamById(AEL_SPRINGS_DAMP,     norm('springsDamp'));
        if ('springsShape'    in changed) node.setParamById(AEL_SPRINGS_SHAPE,    norm('springsShape'));
        if ('springsTone'     in changed) node.setParamById(AEL_SPRINGS_TONE,     norm('springsTone'));
        if ('springsScatter'  in changed) node.setParamById(AEL_SPRINGS_SCATTER,  norm('springsScatter'));
        if ('springsChaos'    in changed) node.setParamById(AEL_SPRINGS_CHAOS,    norm('springsChaos'));
      }
      break;

    case 'Reverb':
      if (node instanceof Tone.Reverb) {
        if ('decay' in changed) node.decay = changed.decay as number;
        if ('preDelay' in changed) node.preDelay = changed.preDelay as number;
      }
      break;

    case 'JCReverb':
      // JCReverb now uses Tone.Reverb (ConvolverNode-based) for reliability
      if (node instanceof Tone.Reverb) {
        if ('roomSize' in changed) {
          const roomVal = Math.max(0, Math.min(Number(changed.roomSize), 0.99));
          node.decay = 0.5 + roomVal * 9.5;
        }
      }
      break;

    case 'SidechainCompressor':
      if (node instanceof SidechainCompressor) {
        if ('threshold' in changed) node.threshold = changed.threshold as number;
        if ('ratio' in changed) node.ratio = changed.ratio as number;
        if ('attack' in changed) node.attack = changed.attack as number;
        if ('release' in changed) node.release = changed.release as number;
        if ('knee' in changed) node.knee = changed.knee as number;
        if ('sidechainGain' in changed) node.sidechainGain = changed.sidechainGain as number;
      }
      break;

    case 'TapeSaturation':
      if (node instanceof TapeSaturation) {
        if ('drive' in changed) node.drive = (changed.drive as number) / 100; // UI 0-100 → internal 0-1
        if ('tone' in changed) node.tone = changed.tone as number;
      }
      break;

    case 'VinylNoise':
      if (node instanceof VinylNoiseEffect) {
        if ('hiss'            in changed) node.setHiss           (Number(changed.hiss)            / 100);
        if ('dust'            in changed) node.setDust           (Number(changed.dust)            / 100);
        if ('age'             in changed) node.setAge            (Number(changed.age)             / 100);
        if ('speed'           in changed) node.setSpeed          (Number(changed.speed)           / 100);
        if ('riaa'            in changed) node.setRiaa           (Number(changed.riaa)            / 100);
        if ('stylusResonance' in changed) node.setStylusResonance(Number(changed.stylusResonance) / 100);
        if ('wornStylus'      in changed) node.setWornStylus     (Number(changed.wornStylus)      / 100);
        if ('pinch'           in changed) node.setPinch          (Number(changed.pinch)           / 100);
        if ('innerGroove'     in changed) node.setInnerGroove    (Number(changed.innerGroove)     / 100);
        if ('ghostEcho'       in changed) node.setGhostEcho      (Number(changed.ghostEcho)       / 100);
        if ('dropout'         in changed) node.setDropout        (Number(changed.dropout)         / 100);
        if ('warp'            in changed) node.setWarp           (Number(changed.warp)            / 100);
        if ('eccentricity'    in changed) node.setEccentricity   (Number(changed.eccentricity)    / 100);
      }
      break;

    case 'Tumult':
      if (node instanceof TumultEffect) {
        for (const key of Object.keys(changed)) {
          node.setParam(key as keyof TumultOptions, Number(changed[key]));
        }
      }
      break;

    case 'TapeSimulator':
      if (node instanceof TapeSimulatorEffect) {
        if ('drive'     in changed) node.setDrive    (Number(changed.drive)     / 100);
        if ('character' in changed) node.setCharacter(Number(changed.character) / 100);
        if ('bias'      in changed) node.setBias     (Number(changed.bias)      / 100);
        if ('shame'     in changed) node.setShame    (Number(changed.shame)     / 100);
        if ('hiss'      in changed) node.setHiss     (Number(changed.hiss)      / 100);
        if ('speed'     in changed) node.setSpeed    (Number(changed.speed)); // 0|1 integer, not /100
      }
      break;

    case 'ToneArm':
      if (node instanceof ToneArmEffect) {
        if ('wow'     in changed) node.setWow    (Number(changed.wow)     / 100);
        if ('coil'    in changed) node.setCoil   (Number(changed.coil)    / 100);
        if ('flutter' in changed) node.setFlutter(Number(changed.flutter) / 100);
        if ('riaa'    in changed) node.setRiaa   (Number(changed.riaa)    / 100);
        if ('stylus'  in changed) node.setStylus (Number(changed.stylus)  / 100);
        if ('hiss'    in changed) node.setHiss   (Number(changed.hiss)    / 100);
        if ('pops'    in changed) node.setPops   (Number(changed.pops)    / 100);
        if ('rpm'     in changed) node.setRpm    (Number(changed.rpm)); // raw value, not /100
      }
      break;

    case 'AutoWah':
      if (node instanceof Tone.AutoWah) {
        if ('baseFrequency' in changed) node.baseFrequency = changed.baseFrequency as number;
        if ('octaves' in changed) node.octaves = changed.octaves as number;
        if ('sensitivity' in changed) node.sensitivity = changed.sensitivity as number;
        if ('Q' in changed) node.Q.rampTo(changed.Q as number, R);
        if ('gain' in changed) node.gain.rampTo(changed.gain as number, R);
        if ('follower' in changed) node.follower = changed.follower as number;
      }
      break;

    case 'Chebyshev':
      if (node instanceof Tone.Chebyshev) {
        if ('order' in changed) node.order = changed.order as number;
        if ('oversample' in changed) {
          const v = changed.oversample;
          node.oversample = (v === '2x' || v === '4x' ? v : 'none') as 'none' | '2x' | '4x';
        }
      }
      break;

    case 'FrequencyShifter':
      if (node instanceof Tone.FrequencyShifter) {
        if ('frequency' in changed) node.frequency.rampTo(changed.frequency as number, R);
      }
      break;

    case 'AmbientDelay':
      if (node instanceof AmbientDelayEffect) {
        if ('time' in changed) node.time = Number(changed.time) / 1000;
        if ('feedback' in changed) node.feedback = Number(changed.feedback) / 100;
        if ('taps' in changed) node.taps = Number(changed.taps);
        if ('filterType' in changed) node.filterType = changed.filterType as BiquadFilterType;
        if ('filterFreq' in changed) node.filterFreq = Number(changed.filterFreq);
        if ('filterQ' in changed) node.filterQ = Number(changed.filterQ);
        if ('modRate' in changed) node.modRate = Number(changed.modRate) / 100;
        if ('modDepth' in changed) node.modDepth = Number(changed.modDepth) / 100;
        if ('stereoSpread' in changed) node.stereoSpread = Number(changed.stereoSpread) / 100;
        if ('diffusion' in changed) node.diffusion = Number(changed.diffusion) / 100;
      }
      break;

    case 'AutoTune':
      if (node instanceof AutoTuneEffect) {
        if ('key' in changed) node.setKey(Number(changed.key));
        if ('scale' in changed) node.setScale(changed.scale as 'major' | 'minor' | 'chromatic' | 'pentatonic' | 'blues');
        if ('strength' in changed) node.setStrength(Number(changed.strength) / 100);
        if ('speed' in changed) node.setSpeed(Number(changed.speed) / 100);
      }
      break;

    case 'GranularFreeze':
      if (node instanceof GranularFreezeEffect) {
        if ('freeze' in changed) node.setFreeze(Number(changed.freeze));
        if ('grainSize' in changed) node.setGrainSize(Number(changed.grainSize) / 1000);
        if ('density' in changed) node.setDensity(Number(changed.density));
        if ('scatter' in changed) node.setScatter(Number(changed.scatter) / 100);
        if ('pitch' in changed) node.setPitch(Number(changed.pitch));
        if ('spray' in changed) node.setSpray(Number(changed.spray) / 100);
        if ('shimmer' in changed) node.setShimmer(Number(changed.shimmer) / 100);
        if ('stereoWidth' in changed) node.setStereoWidth(Number(changed.stereoWidth) / 100);
        if ('feedback' in changed) node.setFeedback(Number(changed.feedback) / 100);
        if ('captureLen' in changed) node.setCaptureLength(Number(changed.captureLen) / 1000);
        if ('attack' in changed) node.setAttack(Number(changed.attack) / 1000);
        if ('release' in changed) node.setRelease(Number(changed.release) / 1000);
        if ('thru' in changed) node.setThru(Number(changed.thru));
      }
      break;

    case 'NoiseGate':
      if (node instanceof NoiseGateEffect) {
        if ('threshold' in changed) node.setThreshold(Number(changed.threshold));
        if ('attack' in changed) node.setAttack(Number(changed.attack));
        if ('hold' in changed) node.setHold(Number(changed.hold));
        if ('release' in changed) node.setRelease(Number(changed.release));
        if ('range' in changed) node.setRange(Number(changed.range));
        if ('hpf' in changed) node.setHpf(Number(changed.hpf));
      }
      break;

    case 'Limiter':
      if (node instanceof LimiterEffect) {
        if ('threshold' in changed) node.setThreshold(Number(changed.threshold));
        if ('ceiling' in changed) node.setCeiling(Number(changed.ceiling));
        if ('attack' in changed) node.setAttack(Number(changed.attack));
        if ('release' in changed) node.setRelease(Number(changed.release));
        if ('lookahead' in changed) node.setLookahead(Number(changed.lookahead));
        if ('knee' in changed) node.setKnee(Number(changed.knee));
      }
      break;

    case 'Flanger':
      if (node instanceof FlangerEffect) {
        if ('rate' in changed) node.setRate(Number(changed.rate));
        if ('depth' in changed) node.setDepth(Number(changed.depth) / 100);
        if ('delay' in changed) node.setDelay(Number(changed.delay));
        if ('feedback' in changed) node.setFeedback(Number(changed.feedback) / 100);
        if ('stereo' in changed) node.setStereo(Number(changed.stereo));
        if ('mix' in changed) node.setMix(Number(changed.mix) / 100);
      }
      break;

    case 'Overdrive':
      if (node instanceof OverdriveEffect) {
        if ('drive' in changed) node.setDrive(Number(changed.drive) / 100);
        if ('tone' in changed) node.setTone(Number(changed.tone) / 100);
        if ('mix' in changed) node.setMix(Number(changed.mix) / 100);
        if ('level' in changed) node.setLevel(Number(changed.level) / 100);
      }
      break;

    case 'RingMod':
      if (node instanceof RingModEffect) {
        if ('frequency' in changed) node.setFrequency(Number(changed.frequency));
        if ('mix' in changed) node.setMix(Number(changed.mix) / 100);
        if ('waveform' in changed) node.setWaveform(Number(changed.waveform));
        if ('lfoRate' in changed) node.setLfoRate(Number(changed.lfoRate));
        if ('lfoDepth' in changed) node.setLfoDepth(Number(changed.lfoDepth) / 100);
      }
      break;

    case 'DragonflyPlate':
      if (node instanceof DragonflyPlateEffect) {
        if ('decay' in changed) node.setDecay(Number(changed.decay) / 100);
        if ('damping' in changed) node.setDamping(Number(changed.damping) / 100);
        if ('predelay' in changed) node.setPredelay(Number(changed.predelay));
        if ('width' in changed) node.setWidth(Number(changed.width) / 100);
        if ('brightness' in changed) node.setBrightness(Number(changed.brightness) / 100);
      }
      break;

    case 'DragonflyHall':
      if (node instanceof DragonflyHallEffect) {
        if ('decay' in changed) node.setDecay(Number(changed.decay) / 100);
        if ('damping' in changed) node.setDamping(Number(changed.damping) / 100);
        if ('predelay' in changed) node.setPredelay(Number(changed.predelay));
        if ('width' in changed) node.setWidth(Number(changed.width) / 100);
        if ('earlyLevel' in changed) node.setEarlyLevel(Number(changed.earlyLevel) / 100);
        if ('size' in changed) node.setSize(Number(changed.size));
      }
      break;

    case 'DragonflyRoom':
      if (node instanceof DragonflyRoomEffect) {
        if ('decay' in changed) node.setDecay(Number(changed.decay) / 100);
        if ('damping' in changed) node.setDamping(Number(changed.damping) / 100);
        if ('predelay' in changed) node.setPredelay(Number(changed.predelay));
        if ('width' in changed) node.setWidth(Number(changed.width) / 100);
        if ('earlyLevel' in changed) node.setEarlyLevel(Number(changed.earlyLevel) / 100);
        if ('size' in changed) node.setSize(Number(changed.size));
      }
      break;

    case 'JunoChorus':
      if (node instanceof JunoChorusEffect) {
        if ('rate' in changed) node.setRate(Number(changed.rate));
        if ('depth' in changed) node.setDepth(Number(changed.depth) / 100);
        if ('mode' in changed) node.setMode(Number(changed.mode));
        if ('mix' in changed) node.setMix(Number(changed.mix) / 100);
      }
      break;

    case 'ParametricEQ':
      if (node instanceof ParametricEQEffect) {
        for (const k of Object.keys(changed)) {
          node.setParam(k, Number(changed[k]));
        }
      }
      break;

    case 'CabinetSim':
      if (node instanceof CabinetSimEffect) {
        if ('cabinet' in changed) node.setCabinet(Number(changed.cabinet));
        if ('mix' in changed) node.setMix(Number(changed.mix) / 100);
        if ('brightness' in changed) node.setBrightness(Number(changed.brightness) / 100);
      }
      break;

    case 'TubeAmp':
      if (node instanceof TubeAmpEffect) {
        if ('drive' in changed) node.setDrive(Number(changed.drive) / 100);
        if ('bass' in changed) node.setBass(Number(changed.bass) / 100);
        if ('mid' in changed) node.setMid(Number(changed.mid) / 100);
        if ('treble' in changed) node.setTreble(Number(changed.treble) / 100);
        if ('presence' in changed) node.setPresence(Number(changed.presence) / 100);
        if ('master' in changed) node.setMaster(Number(changed.master) / 100);
        if ('sag' in changed) node.setSag(Number(changed.sag) / 100);
      }
      break;

    case 'DeEsser':
      if (node instanceof DeEsserEffect) {
        if ('frequency' in changed) node.setFrequency(Number(changed.frequency));
        if ('bandwidth' in changed) node.setBandwidth(Number(changed.bandwidth));
        if ('threshold' in changed) node.setThreshold(Number(changed.threshold));
        if ('ratio' in changed) node.setRatio(Number(changed.ratio));
        if ('attack' in changed) node.setAttack(Number(changed.attack));
        if ('release' in changed) node.setRelease(Number(changed.release));
      }
      break;

    case 'MultibandComp':
      if (node instanceof MultibandCompEffect) {
        if ('lowCrossover' in changed) node.setLowCrossover(Number(changed.lowCrossover));
        if ('highCrossover' in changed) node.setHighCrossover(Number(changed.highCrossover));
        if ('lowThreshold' in changed) node.setLowThreshold(Number(changed.lowThreshold));
        if ('midThreshold' in changed) node.setMidThreshold(Number(changed.midThreshold));
        if ('highThreshold' in changed) node.setHighThreshold(Number(changed.highThreshold));
        if ('lowRatio' in changed) node.setLowRatio(Number(changed.lowRatio));
        if ('midRatio' in changed) node.setMidRatio(Number(changed.midRatio));
        if ('highRatio' in changed) node.setHighRatio(Number(changed.highRatio));
        if ('lowGain' in changed) node.setLowGain(Number(changed.lowGain));
        if ('midGain' in changed) node.setMidGain(Number(changed.midGain));
        if ('highGain' in changed) node.setHighGain(Number(changed.highGain));
      }
      break;

    case 'TransientDesigner':
      if (node instanceof TransientDesignerEffect) {
        if ('attack' in changed) node.setAttack(Number(changed.attack));
        if ('sustain' in changed) node.setSustain(Number(changed.sustain));
        if ('output' in changed) node.setOutputGain(Number(changed.output));
      }
      break;

    case 'BassEnhancer':
      if (node instanceof BassEnhancerEffect) {
        if ('frequency' in changed) node.setFrequency(Number(changed.frequency));
        if ('amount' in changed) node.setAmount(Number(changed.amount));
        if ('drive' in changed) node.setDrive(Number(changed.drive));
        if ('mix' in changed) node.setMix(Number(changed.mix));
      }
      break;

    case 'Expander':
      if (node instanceof ExpanderEffect) {
        if ('threshold' in changed) node.setThreshold(Number(changed.threshold));
        if ('ratio' in changed) node.setRatio(Number(changed.ratio));
        if ('attack' in changed) node.setAttack(Number(changed.attack));
        if ('release' in changed) node.setRelease(Number(changed.release));
        if ('range' in changed) node.setRange(Number(changed.range));
        if ('knee' in changed) node.setKnee(Number(changed.knee));
      }
      break;


    case 'ReverseDelay':
        if ('time' in changed) (node as any).setParam('time', Number(changed.time));
        if ('feedback' in changed) (node as any).setParam('feedback', Number(changed.feedback));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'VintageDelay':
        if ('time' in changed) (node as any).setParam('time', Number(changed.time));
        if ('feedback' in changed) (node as any).setParam('feedback', Number(changed.feedback));
        if ('cutoff' in changed) (node as any).setParam('cutoff', Number(changed.cutoff));
        if ('drive' in changed) (node as any).setParam('drive', Number(changed.drive));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'ArtisticDelay':
        if ('timeL' in changed) (node as any).setParam('timeL', Number(changed.timeL));
        if ('timeR' in changed) (node as any).setParam('timeR', Number(changed.timeR));
        if ('feedback' in changed) (node as any).setParam('feedback', Number(changed.feedback));
        if ('pan' in changed) (node as any).setParam('pan', Number(changed.pan));
        if ('lpf' in changed) (node as any).setParam('lpf', Number(changed.lpf));
        if ('hpf' in changed) (node as any).setParam('hpf', Number(changed.hpf));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'SlapbackDelay':
        if ('time' in changed) (node as any).setParam('time', Number(changed.time));
        if ('feedback' in changed) (node as any).setParam('feedback', Number(changed.feedback));
        if ('tone' in changed) (node as any).setParam('tone', Number(changed.tone));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'ZamDelay':
        if ('time' in changed) (node as any).setParam('time', Number(changed.time));
        if ('feedback' in changed) (node as any).setParam('feedback', Number(changed.feedback));
        if ('lpf' in changed) (node as any).setParam('lpf', Number(changed.lpf));
        if ('hpf' in changed) (node as any).setParam('hpf', Number(changed.hpf));
        if ('invert' in changed) (node as any).setParam('invert', Number(changed.invert));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'Saturator':
        if ('drive' in changed) (node as any).setParam('drive', Number(changed.drive));
        if ('blend' in changed) (node as any).setParam('blend', Number(changed.blend));
        if ('preFreq' in changed) (node as any).setParam('preFreq', Number(changed.preFreq));
        if ('postFreq' in changed) (node as any).setParam('postFreq', Number(changed.postFreq));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'Exciter':
        if ('frequency' in changed) (node as any).setParam('frequency', Number(changed.frequency));
        if ('amount' in changed) (node as any).setParam('amount', Number(changed.amount));
        if ('blend' in changed) (node as any).setParam('blend', Number(changed.blend));
        if ('ceil' in changed) (node as any).setParam('ceil', Number(changed.ceil));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'AutoSat':
        if ('amount' in changed) (node as any).setParam('amount', Number(changed.amount));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'Satma':
        if ('distortion' in changed) (node as any).setParam('distortion', Number(changed.distortion));
        if ('tone' in changed) (node as any).setParam('tone', Number(changed.tone));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'DistortionShaper':
        if ('inputGain' in changed) (node as any).setParam('inputGain', Number(changed.inputGain));
        if ('point1x' in changed) (node as any).setParam('point1x', Number(changed.point1x));
        if ('point1y' in changed) (node as any).setParam('point1y', Number(changed.point1y));
        if ('point2x' in changed) (node as any).setParam('point2x', Number(changed.point2x));
        if ('point2y' in changed) (node as any).setParam('point2y', Number(changed.point2y));
        if ('outputGain' in changed) (node as any).setParam('outputGain', Number(changed.outputGain));
        if ('preLpf' in changed) (node as any).setParam('preLpf', Number(changed.preLpf));
        if ('postLpf' in changed) (node as any).setParam('postLpf', Number(changed.postLpf));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'MonoComp':
        if ('threshold' in changed) (node as any).setParam('threshold', Number(changed.threshold));
        if ('ratio' in changed) (node as any).setParam('ratio', Number(changed.ratio));
        if ('attack' in changed) (node as any).setParam('attack', Number(changed.attack));
        if ('release' in changed) (node as any).setParam('release', Number(changed.release));
        if ('knee' in changed) (node as any).setParam('knee', Number(changed.knee));
        if ('makeup' in changed) (node as any).setParam('makeup', Number(changed.makeup));
      break;

    case 'SidechainGate':
        if ('threshold' in changed) (node as any).setParam('threshold', Number(changed.threshold));
        if ('attack' in changed) (node as any).setParam('attack', Number(changed.attack));
        if ('hold' in changed) (node as any).setParam('hold', Number(changed.hold));
        if ('release' in changed) (node as any).setParam('release', Number(changed.release));
        if ('range' in changed) (node as any).setParam('range', Number(changed.range));
        if ('scFreq' in changed) (node as any).setParam('scFreq', Number(changed.scFreq));
        if ('scQ' in changed) (node as any).setParam('scQ', Number(changed.scQ));
      break;

    case 'MultibandGate':
        if ('lowCross' in changed) (node as any).setParam('lowCross', Number(changed.lowCross));
        if ('highCross' in changed) (node as any).setParam('highCross', Number(changed.highCross));
        if ('lowThresh' in changed) (node as any).setParam('lowThresh', Number(changed.lowThresh));
        if ('midThresh' in changed) (node as any).setParam('midThresh', Number(changed.midThresh));
        if ('highThresh' in changed) (node as any).setParam('highThresh', Number(changed.highThresh));
        if ('lowRange' in changed) (node as any).setParam('lowRange', Number(changed.lowRange));
        if ('midRange' in changed) (node as any).setParam('midRange', Number(changed.midRange));
        if ('highRange' in changed) (node as any).setParam('highRange', Number(changed.highRange));
        if ('attack' in changed) (node as any).setParam('attack', Number(changed.attack));
        if ('release' in changed) (node as any).setParam('release', Number(changed.release));
      break;

    case 'MultibandLimiter':
        if ('lowCross' in changed) (node as any).setParam('lowCross', Number(changed.lowCross));
        if ('highCross' in changed) (node as any).setParam('highCross', Number(changed.highCross));
        if ('lowCeil' in changed) (node as any).setParam('lowCeil', Number(changed.lowCeil));
        if ('midCeil' in changed) (node as any).setParam('midCeil', Number(changed.midCeil));
        if ('highCeil' in changed) (node as any).setParam('highCeil', Number(changed.highCeil));
        if ('lowGain' in changed) (node as any).setParam('lowGain', Number(changed.lowGain));
        if ('midGain' in changed) (node as any).setParam('midGain', Number(changed.midGain));
        if ('highGain' in changed) (node as any).setParam('highGain', Number(changed.highGain));
        if ('release' in changed) (node as any).setParam('release', Number(changed.release));
      break;

    case 'SidechainLimiter':
        if ('ceiling' in changed) (node as any).setParam('ceiling', Number(changed.ceiling));
        if ('release' in changed) (node as any).setParam('release', Number(changed.release));
        if ('scFreq' in changed) (node as any).setParam('scFreq', Number(changed.scFreq));
        if ('scGain' in changed) (node as any).setParam('scGain', Number(changed.scGain));
      break;

    case 'Clipper':
        if ('inputGain' in changed) (node as any).setParam('inputGain', Number(changed.inputGain));
        if ('ceiling' in changed) (node as any).setParam('ceiling', Number(changed.ceiling));
        if ('softness' in changed) (node as any).setParam('softness', Number(changed.softness));
      break;

    case 'DynamicsProc':
        if ('lowerThresh' in changed) (node as any).setParam('lowerThresh', Number(changed.lowerThresh));
        if ('upperThresh' in changed) (node as any).setParam('upperThresh', Number(changed.upperThresh));
        if ('ratio' in changed) (node as any).setParam('ratio', Number(changed.ratio));
        if ('attack' in changed) (node as any).setParam('attack', Number(changed.attack));
        if ('release' in changed) (node as any).setParam('release', Number(changed.release));
        if ('makeup' in changed) (node as any).setParam('makeup', Number(changed.makeup));
      break;

    case 'X42Comp':
        if ('threshold' in changed) (node as any).setParam('threshold', Number(changed.threshold));
        if ('ratio' in changed) (node as any).setParam('ratio', Number(changed.ratio));
        if ('attack' in changed) (node as any).setParam('attack', Number(changed.attack));
        if ('release' in changed) (node as any).setParam('release', Number(changed.release));
        if ('hold' in changed) (node as any).setParam('hold', Number(changed.hold));
        if ('inputGain' in changed) (node as any).setParam('inputGain', Number(changed.inputGain));
      break;

    case 'EQ5Band':
        if ('lowShelfFreq' in changed) (node as any).setParam('lowShelfFreq', Number(changed.lowShelfFreq));
        if ('lowShelfGain' in changed) (node as any).setParam('lowShelfGain', Number(changed.lowShelfGain));
        if ('peak1Freq' in changed) (node as any).setParam('peak1Freq', Number(changed.peak1Freq));
        if ('peak1Gain' in changed) (node as any).setParam('peak1Gain', Number(changed.peak1Gain));
        if ('peak1Q' in changed) (node as any).setParam('peak1Q', Number(changed.peak1Q));
        if ('peak2Freq' in changed) (node as any).setParam('peak2Freq', Number(changed.peak2Freq));
        if ('peak2Gain' in changed) (node as any).setParam('peak2Gain', Number(changed.peak2Gain));
        if ('peak2Q' in changed) (node as any).setParam('peak2Q', Number(changed.peak2Q));
        if ('peak3Freq' in changed) (node as any).setParam('peak3Freq', Number(changed.peak3Freq));
        if ('peak3Gain' in changed) (node as any).setParam('peak3Gain', Number(changed.peak3Gain));
        if ('peak3Q' in changed) (node as any).setParam('peak3Q', Number(changed.peak3Q));
        if ('highShelfFreq' in changed) (node as any).setParam('highShelfFreq', Number(changed.highShelfFreq));
        if ('highShelfGain' in changed) (node as any).setParam('highShelfGain', Number(changed.highShelfGain));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'EQ8Band':
      for (const key of Object.keys(changed)) {
        (node as any).setParam(key, Number(changed[key]));
      }
      break;

    case 'EQ12Band':
      for (const key of Object.keys(changed)) {
        (node as any).setParam(key, Number(changed[key]));
      }
      break;

    case 'GEQ31':
      for (const key of Object.keys(changed)) {
        (node as any).setParam(key, Number(changed[key]));
      }
      break;

    case 'ZamEQ2':
        if ('lowFreq' in changed) (node as any).setParam('lowFreq', Number(changed.lowFreq));
        if ('lowGain' in changed) (node as any).setParam('lowGain', Number(changed.lowGain));
        if ('lowBw' in changed) (node as any).setParam('lowBw', Number(changed.lowBw));
        if ('highFreq' in changed) (node as any).setParam('highFreq', Number(changed.highFreq));
        if ('highGain' in changed) (node as any).setParam('highGain', Number(changed.highGain));
        if ('highBw' in changed) (node as any).setParam('highBw', Number(changed.highBw));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'PhonoFilter':
        if ('mode' in changed) (node as any).setParam('mode', Number(changed.mode));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'DynamicEQ':
        if ('detectFreq' in changed) (node as any).setParam('detectFreq', Number(changed.detectFreq));
        if ('detectQ' in changed) (node as any).setParam('detectQ', Number(changed.detectQ));
        if ('processFreq' in changed) (node as any).setParam('processFreq', Number(changed.processFreq));
        if ('processQ' in changed) (node as any).setParam('processQ', Number(changed.processQ));
        if ('threshold' in changed) (node as any).setParam('threshold', Number(changed.threshold));
        if ('maxGain' in changed) (node as any).setParam('maxGain', Number(changed.maxGain));
        if ('attack' in changed) (node as any).setParam('attack', Number(changed.attack));
        if ('release' in changed) (node as any).setParam('release', Number(changed.release));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'HaasEnhancer':
        if ('delay' in changed) (node as any).setParam('delay', Number(changed.delay));
        if ('side' in changed) (node as any).setParam('side', Number(changed.side));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'MultiSpread':
        if ('bands' in changed) (node as any).setParam('bands', Number(changed.bands));
        if ('spread' in changed) (node as any).setParam('spread', Number(changed.spread));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'MultibandEnhancer':
        if ('lowCross' in changed) (node as any).setParam('lowCross', Number(changed.lowCross));
        if ('midCross' in changed) (node as any).setParam('midCross', Number(changed.midCross));
        if ('highCross' in changed) (node as any).setParam('highCross', Number(changed.highCross));
        if ('lowWidth' in changed) (node as any).setParam('lowWidth', Number(changed.lowWidth));
        if ('midWidth' in changed) (node as any).setParam('midWidth', Number(changed.midWidth));
        if ('highWidth' in changed) (node as any).setParam('highWidth', Number(changed.highWidth));
        if ('topWidth' in changed) (node as any).setParam('topWidth', Number(changed.topWidth));
        if ('harmonics' in changed) (node as any).setParam('harmonics', Number(changed.harmonics));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'EarlyReflections':
        if ('size' in changed) (node as any).setParam('size', Number(changed.size));
        if ('damping' in changed) (node as any).setParam('damping', Number(changed.damping));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'Pulsator':
        if ('rate' in changed) (node as any).setParam('rate', Number(changed.rate));
        if ('depth' in changed) (node as any).setParam('depth', Number(changed.depth));
        if ('waveform' in changed) (node as any).setParam('waveform', Number(changed.waveform));
        if ('stereoPhase' in changed) (node as any).setParam('stereoPhase', Number(changed.stereoPhase));
        if ('offset' in changed) (node as any).setParam('offset', Number(changed.offset));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'Ducka':
        if ('threshold' in changed) (node as any).setParam('threshold', Number(changed.threshold));
        if ('drop' in changed) (node as any).setParam('drop', Number(changed.drop));
        if ('release' in changed) (node as any).setParam('release', Number(changed.release));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'Masha':
        if ('time' in changed) (node as any).setParam('time', Number(changed.time));
        if ('volume' in changed) (node as any).setParam('volume', Number(changed.volume));
        if ('passthrough' in changed) (node as any).setParam('passthrough', Number(changed.passthrough));
        if ('active' in changed) (node as any).setParam('active', Number(changed.active));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'Vinyl':
        if ('crackle' in changed) (node as any).setParam('crackle', Number(changed.crackle));
        if ('noise' in changed) (node as any).setParam('noise', Number(changed.noise));
        if ('rumble' in changed) (node as any).setParam('rumble', Number(changed.rumble));
        if ('wear' in changed) (node as any).setParam('wear', Number(changed.wear));
        if ('speed' in changed) (node as any).setParam('speed', Number(changed.speed));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'BeatBreather':
        if ('transientBoost' in changed) (node as any).setParam('transientBoost', Number(changed.transientBoost));
        if ('sustainBoost' in changed) (node as any).setParam('sustainBoost', Number(changed.sustainBoost));
        if ('sensitivity' in changed) (node as any).setParam('sensitivity', Number(changed.sensitivity));
        if ('attack' in changed) (node as any).setParam('attack', Number(changed.attack));
        if ('release' in changed) (node as any).setParam('release', Number(changed.release));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'MultibandClipper':
        if ('lowCross' in changed) (node as any).setParam('lowCross', Number(changed.lowCross));
        if ('highCross' in changed) (node as any).setParam('highCross', Number(changed.highCross));
        if ('lowCeil' in changed) (node as any).setParam('lowCeil', Number(changed.lowCeil));
        if ('midCeil' in changed) (node as any).setParam('midCeil', Number(changed.midCeil));
        if ('highCeil' in changed) (node as any).setParam('highCeil', Number(changed.highCeil));
        if ('softness' in changed) (node as any).setParam('softness', Number(changed.softness));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'MultibandDynamics':
        if ('lowCross' in changed) (node as any).setParam('lowCross', Number(changed.lowCross));
        if ('highCross' in changed) (node as any).setParam('highCross', Number(changed.highCross));
        if ('lowExpThresh' in changed) (node as any).setParam('lowExpThresh', Number(changed.lowExpThresh));
        if ('midExpThresh' in changed) (node as any).setParam('midExpThresh', Number(changed.midExpThresh));
        if ('highExpThresh' in changed) (node as any).setParam('highExpThresh', Number(changed.highExpThresh));
        if ('lowCompThresh' in changed) (node as any).setParam('lowCompThresh', Number(changed.lowCompThresh));
        if ('midCompThresh' in changed) (node as any).setParam('midCompThresh', Number(changed.midCompThresh));
        if ('highCompThresh' in changed) (node as any).setParam('highCompThresh', Number(changed.highCompThresh));
        if ('ratio' in changed) (node as any).setParam('ratio', Number(changed.ratio));
        if ('attack' in changed) (node as any).setParam('attack', Number(changed.attack));
        if ('release' in changed) (node as any).setParam('release', Number(changed.release));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'MultibandExpander':
        if ('lowCross' in changed) (node as any).setParam('lowCross', Number(changed.lowCross));
        if ('highCross' in changed) (node as any).setParam('highCross', Number(changed.highCross));
        if ('lowThresh' in changed) (node as any).setParam('lowThresh', Number(changed.lowThresh));
        if ('midThresh' in changed) (node as any).setParam('midThresh', Number(changed.midThresh));
        if ('highThresh' in changed) (node as any).setParam('highThresh', Number(changed.highThresh));
        if ('ratio' in changed) (node as any).setParam('ratio', Number(changed.ratio));
        if ('attack' in changed) (node as any).setParam('attack', Number(changed.attack));
        if ('release' in changed) (node as any).setParam('release', Number(changed.release));
        if ('range' in changed) (node as any).setParam('range', Number(changed.range));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'GOTTComp':
        if ('lowCross' in changed) (node as any).setParam('lowCross', Number(changed.lowCross));
        if ('highCross' in changed) (node as any).setParam('highCross', Number(changed.highCross));
        if ('lowThresh' in changed) (node as any).setParam('lowThresh', Number(changed.lowThresh));
        if ('midThresh' in changed) (node as any).setParam('midThresh', Number(changed.midThresh));
        if ('highThresh' in changed) (node as any).setParam('highThresh', Number(changed.highThresh));
        if ('lowRatio' in changed) (node as any).setParam('lowRatio', Number(changed.lowRatio));
        if ('midRatio' in changed) (node as any).setParam('midRatio', Number(changed.midRatio));
        if ('highRatio' in changed) (node as any).setParam('highRatio', Number(changed.highRatio));
        if ('attack' in changed) (node as any).setParam('attack', Number(changed.attack));
        if ('release' in changed) (node as any).setParam('release', Number(changed.release));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'Maximizer':
        if ('ceiling' in changed) (node as any).setParam('ceiling', Number(changed.ceiling));
        if ('release' in changed) (node as any).setParam('release', Number(changed.release));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'AGC':
        if ('target' in changed) (node as any).setParam('target', Number(changed.target));
        if ('speed' in changed) (node as any).setParam('speed', Number(changed.speed));
        if ('maxGain' in changed) (node as any).setParam('maxGain', Number(changed.maxGain));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'Della':
        if ('time' in changed) (node as any).setParam('time', Number(changed.time));
        if ('feedback' in changed) (node as any).setParam('feedback', Number(changed.feedback));
        if ('volume' in changed) (node as any).setParam('volume', Number(changed.volume));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'Driva':
        if ('amount' in changed) (node as any).setParam('amount', Number(changed.amount));
        if ('tone' in changed) (node as any).setParam('tone', Number(changed.tone));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'Panda':
        if ('threshold' in changed) (node as any).setParam('threshold', Number(changed.threshold));
        if ('factor' in changed) (node as any).setParam('factor', Number(changed.factor));
        if ('release' in changed) (node as any).setParam('release', Number(changed.release));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'BinauralPanner':
        if ('azimuth' in changed) (node as any).setParam('azimuth', Number(changed.azimuth));
        if ('elevation' in changed) (node as any).setParam('elevation', Number(changed.elevation));
        if ('distance' in changed) (node as any).setParam('distance', Number(changed.distance));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'Roomy':
        if ('time' in changed) (node as any).setParam('time', Number(changed.time));
        if ('damping' in changed) (node as any).setParam('damping', Number(changed.damping));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'Bitta':
        if ('crush' in changed) (node as any).setParam('crush', Number(changed.crush));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'Kuiza':
        if ('low' in changed) (node as any).setParam('low', Number(changed.low));
        if ('lowMid' in changed) (node as any).setParam('lowMid', Number(changed.lowMid));
        if ('highMid' in changed) (node as any).setParam('highMid', Number(changed.highMid));
        if ('high' in changed) (node as any).setParam('high', Number(changed.high));
        if ('gain' in changed) (node as any).setParam('gain', Number(changed.gain));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'Vihda':
        if ('width' in changed) (node as any).setParam('width', Number(changed.width));
        if ('invert' in changed) (node as any).setParam('invert', Number(changed.invert));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'MultiChorus':
        if ('rate' in changed) (node as any).setParam('rate', Number(changed.rate));
        if ('depth' in changed) (node as any).setParam('depth', Number(changed.depth));
        if ('voices' in changed) (node as any).setParam('voices', Number(changed.voices));
        if ('stereoPhase' in changed) (node as any).setParam('stereoPhase', Number(changed.stereoPhase));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'CalfPhaser':
        if ('rate' in changed) (node as any).setParam('rate', Number(changed.rate));
        if ('depth' in changed) (node as any).setParam('depth', Number(changed.depth));
        if ('stages' in changed) (node as any).setParam('stages', Number(changed.stages));
        if ('feedback' in changed) (node as any).setParam('feedback', Number(changed.feedback));
        if ('stereoPhase' in changed) (node as any).setParam('stereoPhase', Number(changed.stereoPhase));
        if ('mix' in changed) (node as any).setParam('mix', Number(changed.mix));
      break;

    case 'ShimmerReverb':
      if (node instanceof ShimmerReverbEffect) {
        if ('decay' in changed) node.setDecay(Number(changed.decay) / 100);
        if ('shimmer' in changed) node.setShimmer(Number(changed.shimmer) / 100);
        if ('pitch' in changed) node.setPitch(Number(changed.pitch));
        if ('damping' in changed) node.setDamping(Number(changed.damping) / 100);
        if ('size' in changed) node.setSize(Number(changed.size) / 100);
        if ('predelay' in changed) node.setPredelay(Number(changed.predelay) / 1000);
        if ('modRate' in changed) node.setModRate(Number(changed.modRate) / 100);
        if ('modDepth' in changed) node.setModDepth(Number(changed.modDepth) / 100);
      }
      break;

    case 'TapeDegradation':
      if (node instanceof TapeDegradationEffect) {
        if ('wow' in changed) node.wow = Number(changed.wow) / 100;
        if ('flutter' in changed) node.flutter = Number(changed.flutter) / 100;
        if ('hiss' in changed) node.hiss = Number(changed.hiss) / 100;
        if ('dropouts' in changed) node.dropouts = Number(changed.dropouts) / 100;
        if ('saturation' in changed) node.saturation = Number(changed.saturation) / 100;
        if ('toneShift' in changed) node.toneShift = Number(changed.toneShift) / 100;
      }
      break;

    case 'Vocoder':
      if (node instanceof VocoderEffect) {
        if ('source' in changed) node.setSource(changed.source as 'self' | 'mic');
        if ('carrierType' in changed) node.setCarrierType(Number(changed.carrierType) as 0 | 1 | 2 | 3);
        if ('carrierFreq' in changed) node.setCarrierFreq(Number(changed.carrierFreq));
        if ('formantShift' in changed) node.setFormantShift(Number(changed.formantShift));
        if ('reactionTime' in changed) node.setReactionTime(Number(changed.reactionTime) / 1000);
        if ('bands' in changed) node.setBands(Number(changed.bands));
        if ('filtersPerBand' in changed) node.setFiltersPerBand(Number(changed.filtersPerBand));
      }
      break;

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
    case 'WAMPedalboard':
      if (node instanceof WAMEffectNode) {
        for (const [key, value] of Object.entries(changed)) {
          if (key === 'bpmSync' || key === 'syncDivision') continue;
          node.setParameter(key, Number(value));
        }
      }
      break;

    case 'Neural':
      if (node instanceof NeuralEffectWrapper) {
        for (const [key, value] of Object.entries(changed)) {
          node.setParameter(key, Number(value));
        }
      }
      break;

    // Buzzmachine WASM effects — indexed parameters
    case 'BuzzDistortion':
    case 'BuzzOverdrive':
    case 'BuzzDistortion2':
    case 'BuzzDist2':
    case 'BuzzSoftSat':
    case 'BuzzStereoDist':
    case 'BuzzSVF':
    case 'BuzzPhilta':
    case 'BuzzNotch':
    case 'BuzzZfilter':
    case 'BuzzDelay':
    case 'BuzzCrossDelay':
    case 'BuzzFreeverb':
    case 'BuzzPanzerDelay':
    case 'BuzzChorus':
    case 'BuzzChorus2':
    case 'BuzzWhiteChorus':
    case 'BuzzFreqShift':
    case 'BuzzCompressor':
    case 'BuzzLimiter':
    case 'BuzzExciter':
    case 'BuzzMasterizer':
    case 'BuzzStereoGain':
      if (node instanceof BuzzmachineSynth) {
        for (const [key, value] of Object.entries(changed)) {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) {
            node.setParameter(paramIndex, Number(value));
          }
        }
      }
      break;
  }
}

/**
 * Apply a single BPM-synced parameter value to an effect node.
 * Routes via the correct setter per effect type.
 */
export function applyBpmSyncedParam(
  node: Tone.ToneAudioNode,
  effectType: string,
  paramKey: string,
  value: number,
): void {
  try {
    switch (effectType) {
      case 'Delay':
      case 'FeedbackDelay':
        if (paramKey === 'time' && node instanceof Tone.FeedbackDelay) {
          node.delayTime.rampTo(value, 0.02);
        }
        break;
      case 'PingPongDelay':
        if (paramKey === 'time' && node instanceof Tone.PingPongDelay) {
          node.delayTime.rampTo(value, 0.02);
        }
        break;
      case 'SpaceEcho':
        if (paramKey === 'rate' && node instanceof SpaceEchoEffect) {
          node.setRate(value);
        }
        break;
      case 'SpaceyDelayer':
        if (paramKey === 'firstTap' && node instanceof SpaceyDelayerEffect) {
          node.setFirstTap(value);
        }
        break;
      case 'RETapeEcho':
        if (paramKey === 'repeatRate' && node instanceof RETapeEchoEffect) {
          node.setRepeatRate(value);
        }
        break;
      case 'Chorus':
        if (paramKey === 'frequency' && node instanceof Tone.Chorus) {
          node.frequency.rampTo(value, 0.02);
        }
        break;
      case 'BiPhase':
        if (paramKey === 'rateA' && node instanceof BiPhaseEffect) {
          node.setRateA(value);
        }
        break;
      case 'AmbientDelay':
        if (paramKey === 'time' && node instanceof AmbientDelayEffect) {
          node.time = value;
        }
        break;
    }
  } catch (error) {
    console.warn('[ToneEngine] Failed to apply BPM-synced param:', effectType, paramKey, error);
  }
}
