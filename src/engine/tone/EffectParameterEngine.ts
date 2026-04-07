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
        if ('oversample' in changed) node.oversample = changed.oversample as OverSampleType;
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
      }
      break;

    case 'Vibrato':
      if (node instanceof Tone.Vibrato) {
        if ('frequency' in changed) node.frequency.rampTo(changed.frequency as number, R);
        if ('depth' in changed) node.depth.rampTo(changed.depth as number, R);
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
        const newBits = Number(changed.bits) || 4;
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

    case 'EQ3':
      if (node instanceof Tone.EQ3) {
        if ('low' in changed) node.low.rampTo(changed.low as number, R);
        if ('mid' in changed) node.mid.rampTo(changed.mid as number, R);
        if ('high' in changed) node.high.rampTo(changed.high as number, R);
      }
      break;

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
      }
      break;

    case 'AutoPanner':
      if (node instanceof Tone.AutoPanner) {
        if ('frequency' in changed) node.frequency.rampTo(changed.frequency as number, R);
        if ('depth' in changed) node.depth.rampTo(changed.depth as number, R);
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

    case 'Reverb':
      if (node instanceof Tone.Reverb) {
        if ('decay' in changed) node.decay = changed.decay as number;
        if ('preDelay' in changed) node.preDelay = changed.preDelay as number;
      }
      break;

    case 'JCReverb':
      if (node instanceof Tone.JCReverb) {
        if ('roomSize' in changed) node.roomSize.rampTo(Math.min(0.9, Number(changed.roomSize)), R);
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
        if ('oversample' in changed) node.oversample = changed.oversample as OverSampleType;
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
