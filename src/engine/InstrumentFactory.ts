// @ts-nocheck - Tone.js API type issues need resolution
/**
 * InstrumentFactory - Creates and manages Tone.js synth instances
 * Factory class to create all 12 synth types from InstrumentConfig
 */

import * as Tone from 'tone';
import type { InstrumentConfig, EffectConfig, PitchEnvelopeConfig } from '@typedefs/instrument';
import {
  DEFAULT_WAVETABLE,
  DEFAULT_SUPERSAW,
  DEFAULT_POLYSYNTH,
  DEFAULT_ORGAN,
  DEFAULT_DRUM_MACHINE,
  DEFAULT_CHIP_SYNTH,
  DEFAULT_PWM_SYNTH,
  DEFAULT_STRING_MACHINE,
  DEFAULT_FORMANT_SYNTH,
  DEFAULT_WOBBLE_BASS,
  DEFAULT_DRUMKIT,
  DEFAULT_FURNACE,
  DEFAULT_DUB_SIREN,
  DEFAULT_SYNARE,
} from '@/types/instrument';
import { TB303Synth } from './TB303Engine';
import { TB303AccurateSynth } from './TB303AccurateSynth';
import { TapeSaturation } from './effects/TapeSaturation';
import { SidechainCompressor } from './effects/SidechainCompressor';
import { WavetableSynth } from './WavetableSynth';
import { NeuralEffectWrapper } from './effects/NeuralEffectWrapper';
import { SpaceEchoEffect } from './effects/SpaceEchoEffect';
import { BiPhaseEffect } from './effects/BiPhaseEffect';
import { DubFilterEffect } from './effects/DubFilterEffect';
import type { InstrumentConfig, EffectConfig, SynthType } from '@/types/instrument';
import { ArpeggioEngine } from './ArpeggioEngine';
import { FurnaceSynth } from './FurnaceSynth';
import { DrumKitSynth } from './DrumKitSynth';
import { DubSirenSynth } from './DubSirenSynth';
import { SynareSynth } from './SynareSynth';
import { JC303Synth } from './jc303/JC303Synth';
import { MAMESynth } from './MAMESynth';
import { BuzzmachineGenerator } from './buzzmachines/BuzzmachineGenerator';
import { BuzzmachineType } from './buzzmachines/BuzzmachineEngine';

export class InstrumentFactory {
  /**
   * Create a synth instance based on InstrumentConfig
   */
  public static createInstrument(config: InstrumentConfig): Tone.ToneAudioNode {
    let instrument: Tone.ToneAudioNode;

    switch (config.synthType) {
      case 'Synth':
        instrument = this.createSynth(config);
        break;

      case 'MonoSynth':
        instrument = this.createMonoSynth(config);
        break;

      case 'DuoSynth':
        instrument = this.createDuoSynth(config);
        break;

      case 'FMSynth':
        instrument = this.createFMSynth(config);
        break;

      case 'AMSynth':
        instrument = this.createAMSynth(config);
        break;

      case 'PluckSynth':
        instrument = this.createPluckSynth(config);
        break;

      case 'MetalSynth':
        instrument = this.createMetalSynth(config);
        break;

      case 'MembraneSynth':
        instrument = this.createMembraneSynth(config);
        break;

      case 'NoiseSynth':
        instrument = this.createNoiseSynth(config);
        break;

      case 'TB303':
        instrument = this.createTB303(config);
        break;

      case 'Furnace':
        instrument = this.createFurnace(config);
        break;

      case 'Buzzmachine':
        instrument = this.createBuzzmachine(config);
        break;

      // Furnace Chip Types - all use FurnaceSynth with different chip IDs
      case 'FurnaceOPN':
        instrument = this.createFurnaceWithChip(config, 1); // OPN2
        break;
      case 'FurnaceOPM':
        instrument = this.createFurnaceWithChip(config, 33); // OPM
        break;
      case 'FurnaceOPL':
        instrument = this.createFurnaceWithChip(config, 14); // OPL3
        break;
      case 'FurnaceOPLL':
        instrument = this.createFurnaceWithChip(config, 9); // OPLL
        break;
      case 'FurnaceESFM':
        instrument = this.createFurnaceWithChip(config, 48); // ESFM
        break;
      case 'FurnaceOPZ':
        instrument = this.createFurnaceWithChip(config, 40); // OPZ
        break;
      case 'FurnaceOPNA':
        instrument = this.createFurnaceWithChip(config, 6); // OPNA
        break;
      case 'FurnaceOPNB':
        instrument = this.createFurnaceWithChip(config, 7); // OPNB
        break;
      case 'FurnaceOPL4':
        instrument = this.createFurnaceWithChip(config, 46); // OPL4
        break;
      case 'FurnaceY8950':
        instrument = this.createFurnaceWithChip(config, 15); // Y8950
        break;
      case 'FurnaceVRC7':
        instrument = this.createFurnaceWithChip(config, 35); // VRC7
        break;
      case 'FurnaceNES':
        instrument = this.createFurnaceWithChip(config, 34); // NES
        break;
      case 'FurnaceGB':
        instrument = this.createFurnaceWithChip(config, 2); // GB
        break;
      case 'FurnaceSNES':
        instrument = this.createFurnaceWithChip(config, 41); // SNES
        break;
      case 'FurnacePCE':
        instrument = this.createFurnaceWithChip(config, 4); // PCE
        break;
      case 'FurnacePSG':
        instrument = this.createFurnaceWithChip(config, 8); // PSG (SN76489)
        break;
      case 'FurnaceVB':
        instrument = this.createFurnaceWithChip(config, 36); // Virtual Boy
        break;
      case 'FurnaceLynx':
        instrument = this.createFurnaceWithChip(config, 39); // Lynx
        break;
      case 'FurnaceSWAN':
        instrument = this.createFurnaceWithChip(config, 37); // WonderSwan
        break;
      case 'FurnaceVRC6':
        instrument = this.createFurnaceWithChip(config, 21); // VRC6
        break;
      case 'FurnaceN163':
        instrument = this.createFurnaceWithChip(config, 22); // N163
        break;
      case 'FurnaceFDS':
        instrument = this.createFurnaceWithChip(config, 23); // FDS
        break;
      case 'FurnaceMMC5':
        instrument = this.createFurnaceWithChip(config, 24); // MMC5
        break;
      case 'FurnaceC64':
        instrument = this.createFurnaceWithChip(config, 3); // SID
        break;
      case 'FurnaceAY':
        instrument = this.createFurnaceWithChip(config, 5); // AY
        break;
      case 'FurnaceVIC':
        instrument = this.createFurnaceWithChip(config, 32); // VIC
        break;
      case 'FurnaceSAA':
        instrument = this.createFurnaceWithChip(config, 31); // SAA
        break;
      case 'FurnaceTED':
        instrument = this.createFurnaceWithChip(config, 43); // TED
        break;
      case 'FurnaceVERA':
        instrument = this.createFurnaceWithChip(config, 42); // VERA
        break;
      case 'FurnaceSCC':
        instrument = this.createFurnaceWithChip(config, 10); // SCC
        break;
      case 'FurnaceTIA':
        instrument = this.createFurnaceWithChip(config, 38); // TIA
        break;
      case 'FurnaceSEGAPCM':
        instrument = this.createFurnaceWithChip(config, 16); // SEGAPCM
        break;
      case 'FurnaceQSOUND':
        instrument = this.createFurnaceWithChip(config, 19); // QSound
        break;
      case 'FurnaceES5506':
        instrument = this.createFurnaceWithChip(config, 18); // ES5506
        break;
      case 'FurnaceRF5C68':
        instrument = this.createFurnaceWithChip(config, 17); // RF5C68
        break;
      case 'FurnaceC140':
        instrument = this.createFurnaceWithChip(config, 25); // C140
        break;
      case 'FurnaceK007232':
        instrument = this.createFurnaceWithChip(config, 26); // K007232
        break;
      case 'FurnaceK053260':
        instrument = this.createFurnaceWithChip(config, 27); // K053260
        break;
      case 'FurnaceGA20':
        instrument = this.createFurnaceWithChip(config, 28); // GA20
        break;
      case 'FurnaceOKI':
        instrument = this.createFurnaceWithChip(config, 20); // OKI
        break;
      case 'FurnaceYMZ280B':
        instrument = this.createFurnaceWithChip(config, 29); // YMZ280B
        break;
      case 'FurnaceX1_010':
        instrument = this.createFurnaceWithChip(config, 30); // X1-010
        break;
      case 'FurnaceBUBBLE':
        instrument = this.createFurnaceWithChip(config, 47); // Bubble System
        break;
      case 'FurnaceSM8521':
        instrument = this.createFurnaceWithChip(config, 44); // SM8521
        break;
      case 'FurnaceT6W28':
        instrument = this.createFurnaceWithChip(config, 45); // T6W28
        break;
      case 'FurnaceSUPERVISION':
        instrument = this.createFurnaceWithChip(config, 49); // Supervision
        break;
      case 'FurnaceUPD1771':
        instrument = this.createFurnaceWithChip(config, 50); // UPD1771
        break;


      case 'Sampler':
        // Check if this is a MOD/XM sample that needs period-based playback
        const hasMODMetadata = config.metadata?.modPlayback?.usePeriodPlayback;
        console.log(`[InstrumentFactory] Creating ${config.synthType} for instrument ${config.id}:`, {
          hasMODMetadata,
          metadataExists: !!config.metadata,
          modPlaybackExists: !!config.metadata?.modPlayback,
          usePeriodPlayback: config.metadata?.modPlayback?.usePeriodPlayback,
        });
        if (hasMODMetadata) {
          console.log('[InstrumentFactory] Using Player for MOD/XM period-based playback');
          instrument = this.createPlayer(config); // Use Player for period-based playback
        } else {
          console.log('[InstrumentFactory] Using Sampler for regular sample playback');
          instrument = this.createSampler(config); // Use Sampler for regular samples
        }
        break;

      case 'Player':
        instrument = this.createPlayer(config);
        break;

      case 'Wavetable':
        instrument = this.createWavetable(config);
        break;

      case 'GranularSynth':
        instrument = this.createGranularSynth(config);
        break;

      // New synths
      case 'SuperSaw':
        instrument = this.createSuperSaw(config);
        break;

      case 'PolySynth':
        instrument = this.createPolySynth(config);
        break;

      case 'Organ':
        instrument = this.createOrgan(config);
        break;

      case 'DrumMachine':
        instrument = this.createDrumMachine(config);
        break;

      case 'ChipSynth':
        instrument = this.createChipSynth(config);
        break;

      case 'PWMSynth':
        instrument = this.createPWMSynth(config);
        break;

      case 'StringMachine':
        instrument = this.createStringMachine(config);
        break;

      case 'FormantSynth':
        instrument = this.createFormantSynth(config);
        break;

      case 'WobbleBass':
        instrument = this.createWobbleBass(config);
        break;

      case 'DrumKit':
        instrument = this.createDrumKit(config);
        break;

      case 'DubSiren':
        instrument = this.createDubSiren(config);
        break;

      case 'Synare':
        instrument = this.createSynare(config);
        break;

      case 'MAMEVFX':
        instrument = new MAMESynth({ type: 'vfx' });
        break;

      case 'MAMEDOC':
        instrument = new MAMESynth({ type: 'doc' });
        break;

      case 'MAMERSA':
        instrument = new MAMESynth({ type: 'rsa' });
        break;

      // Buzzmachine Generators (WASM-emulated Buzz synths)
      case 'BuzzDTMF':
        console.log('[InstrumentFactory] Creating BuzzDTMF generator');
        instrument = new BuzzmachineGenerator(BuzzmachineType.CYANPHASE_DTMF);
        break;
      case 'BuzzFreqBomb':
        instrument = new BuzzmachineGenerator(BuzzmachineType.ELENZIL_FREQUENCYBOMB);
        break;
      case 'BuzzKick':
        console.log('[InstrumentFactory] Creating BuzzKick generator');
        instrument = new BuzzmachineGenerator(BuzzmachineType.FSM_KICK);
        break;
      case 'BuzzKickXP':
        instrument = new BuzzmachineGenerator(BuzzmachineType.FSM_KICKXP);
        break;
      case 'BuzzNoise':
        instrument = new BuzzmachineGenerator(BuzzmachineType.JESKOLA_NOISE);
        break;
      case 'BuzzTrilok':
        instrument = new BuzzmachineGenerator(BuzzmachineType.JESKOLA_TRILOK);
        break;
      case 'Buzz4FM2F':
        instrument = new BuzzmachineGenerator(BuzzmachineType.MADBRAIN_4FM2F);
        break;
      case 'BuzzDynamite6':
        instrument = new BuzzmachineGenerator(BuzzmachineType.MADBRAIN_DYNAMITE6);
        break;
      case 'BuzzM3':
        instrument = new BuzzmachineGenerator(BuzzmachineType.MAKK_M3);
        break;
      case 'Buzz3o3':
        instrument = new BuzzmachineGenerator(BuzzmachineType.OOMEK_AGGRESSOR);
        break;

      default:
        console.warn(`Unknown synth type: ${config.synthType}, defaulting to Synth`);
        instrument = this.createSynth(config);
    }

    return instrument;
  }

  /**
   * Create effect chain from config (now async for neural effects)
   */
  public static async createEffectChain(
    effects: EffectConfig[],
    audioContext?: AudioContext
  ): Promise<Tone.ToneAudioNode[]> {
    const enabled = effects.filter((fx) => fx.enabled);
    return Promise.all(enabled.map((fx) => this.createEffect(fx, audioContext)));
  }

  /**
   * Create single effect instance (now async for neural effects)
   */
  public static async createEffect(
    config: EffectConfig,
    audioContext?: AudioContext
  ): Promise<Tone.ToneAudioNode> {
    const wetValue = config.wet / 100;

    // Neural effects
    if (config.category === 'neural') {
      if (config.neuralModelIndex === undefined) {
        throw new Error('Neural effect requires neuralModelIndex');
      }

      const context = audioContext || Tone.getContext().rawContext;
      const wrapper = new NeuralEffectWrapper({
        modelIndex: config.neuralModelIndex,
        audioContext: context,
        wet: wetValue,
      });

      await wrapper.loadModel();

      // Set all parameters from config
      Object.entries(config.parameters).forEach(([key, value]) => {
        wrapper.setParameter(key, value);
      });

      return wrapper;
    }

    // Tone.js effects
    let node: Tone.ToneAudioNode;
    
    switch (config.type) {
      case 'Distortion':
        node = new Tone.Distortion({
          distortion: config.parameters.drive || 0.4,
          oversample: config.parameters.oversample || 'none',
          wet: wetValue,
        });
        break;

      case 'Reverb':
        node = new Tone.Reverb({
          decay: config.parameters.decay || 1.5,
          preDelay: config.parameters.preDelay || 0.01,
          wet: wetValue,
        });
        break;

      case 'Delay':
        node = new Tone.FeedbackDelay({
          delayTime: config.parameters.time || 0.25,
          feedback: config.parameters.feedback || 0.5,
          wet: wetValue,
        });
        break;

      case 'Chorus': {
        const chorus = new Tone.Chorus({
          frequency: config.parameters.frequency || 1.5,
          delayTime: config.parameters.delayTime || 3.5,
          depth: config.parameters.depth || 0.7,
          wet: wetValue,
        });
        chorus.start(); // Start LFO
        node = chorus;
        break;
      }

      case 'Phaser':
        node = new Tone.Phaser({
          frequency: config.parameters.frequency || 0.5,
          octaves: config.parameters.octaves || 3,
          baseFrequency: config.parameters.baseFrequency || 350,
          wet: wetValue,
        });
        break;

      case 'Tremolo': {
        const tremolo = new Tone.Tremolo({
          frequency: config.parameters.frequency || 10,
          depth: config.parameters.depth || 0.5,
          wet: wetValue,
        });
        tremolo.start(); // Start LFO
        node = tremolo;
        break;
      }

      case 'Vibrato': {
        const vibrato = new Tone.Vibrato({
          frequency: config.parameters.frequency || 5,
          depth: config.parameters.depth || 0.1,
          wet: wetValue,
        });
        node = vibrato;
        break;
      }

      case 'AutoFilter': {
        const autoFilter = new Tone.AutoFilter({
          frequency: config.parameters.frequency || 1,
          baseFrequency: config.parameters.baseFrequency || 200,
          octaves: config.parameters.octaves || 2.6,
          filter: {
            type: config.parameters.filterType || 'lowpass',
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
          frequency: config.parameters.frequency || 1,
          depth: config.parameters.depth || 1,
          wet: wetValue,
        });
        autoPanner.start(); // Start LFO
        node = autoPanner;
        break;
      }

      case 'AutoWah':
        node = new Tone.AutoWah({
          baseFrequency: config.parameters.baseFrequency || 100,
          octaves: config.parameters.octaves || 6,
          sensitivity: config.parameters.sensitivity || 0,
          Q: config.parameters.Q || 2,
          gain: config.parameters.gain || 2,
          follower: config.parameters.follower || 0.1,
          wet: wetValue,
        });
        break;

      case 'BitCrusher':
        node = new Tone.BitCrusher({
          bits: config.parameters.bits || 4,
          wet: wetValue,
        });
        break;

      case 'Chebyshev':
        node = new Tone.Chebyshev({
          order: config.parameters.order || 50,
          oversample: config.parameters.oversample || 'none',
          wet: wetValue,
        });
        break;

      case 'FeedbackDelay':
        node = new Tone.FeedbackDelay({
          delayTime: config.parameters.time || 0.25,
          feedback: config.parameters.feedback || 0.5,
          wet: wetValue,
        });
        break;

      case 'FrequencyShifter':
        node = new Tone.FrequencyShifter({
          frequency: config.parameters.frequency || 0,
          wet: wetValue,
        });
        break;

      case 'PingPongDelay':
        node = new Tone.PingPongDelay({
          delayTime: config.parameters.time || 0.25,
          feedback: config.parameters.feedback || 0.5,
          wet: wetValue,
        });
        break;

      case 'PitchShift':
        node = new Tone.PitchShift({
          pitch: config.parameters.pitch || 0,
          windowSize: config.parameters.windowSize || 0.1,
          delayTime: config.parameters.delayTime || 0,
          feedback: config.parameters.feedback || 0,
          wet: wetValue,
        });
        break;

      case 'Compressor':
        node = new Tone.Compressor({
          threshold: config.parameters.threshold || -24,
          ratio: config.parameters.ratio || 12,
          attack: config.parameters.attack || 0.003,
          release: config.parameters.release || 0.25,
        });
        break;

      case 'EQ3':
        node = new Tone.EQ3({
          low: config.parameters.low || 0,
          mid: config.parameters.mid || 0,
          high: config.parameters.high || 0,
          lowFrequency: config.parameters.lowFrequency || 400,
          highFrequency: config.parameters.highFrequency || 2500,
        });
        break;

      case 'Filter':
        node = new Tone.Filter({
          type: config.parameters.type || 'lowpass',
          frequency: config.parameters.frequency || 350,
          rolloff: config.parameters.rolloff || -12,
          Q: config.parameters.Q || 1,
          gain: config.parameters.gain || 0,
        });
        break;

      case 'JCReverb':
        node = new Tone.JCReverb({
          roomSize: config.parameters.roomSize || 0.5,
          wet: wetValue,
        });
        break;

      case 'StereoWidener':
        node = new Tone.StereoWidener({
          width: config.parameters.width || 0.5,
        });
        break;

      case 'TapeSaturation':
        node = new TapeSaturation({
          drive: (config.parameters.drive || 50) / 100,   // 0-100 -> 0-1
          tone: config.parameters.tone || 12000,          // Hz
          wet: wetValue,
        });
        break;

      case 'SidechainCompressor':
        node = new SidechainCompressor({
          threshold: config.parameters.threshold ?? -24,
          ratio: config.parameters.ratio ?? 4,
          attack: config.parameters.attack ?? 0.003,
          release: config.parameters.release ?? 0.25,
          knee: config.parameters.knee ?? 6,
          sidechainGain: (config.parameters.sidechainGain ?? 100) / 100,
          wet: wetValue,
        });
        break;

      case 'SpaceEcho':
        node = new SpaceEchoEffect({
          mode: Number(config.parameters.mode) || 4,
          rate: Number(config.parameters.rate) || 300,
          intensity: Number(config.parameters.intensity) || 0.5,
          echoVolume: Number(config.parameters.echoVolume) || 0.8,
          reverbVolume: Number(config.parameters.reverbVolume) || 0.3,
          bass: Number(config.parameters.bass) || 0,
          treble: Number(config.parameters.treble) || 0,
          wet: wetValue,
        });
        break;

      case 'BiPhase':
        node = new BiPhaseEffect({
          rateA: Number(config.parameters.rateA) || 0.5,
          depthA: Number(config.parameters.depthA) || 0.6,
          rateB: Number(config.parameters.rateB) || 4.0,
          depthB: Number(config.parameters.depthB) || 0.4,
          feedback: Number(config.parameters.feedback) || 0.3,
          routing: Number(config.parameters.routing) === 1 ? 'series' : 'parallel',
          wet: wetValue,
        });
        break;

      case 'DubFilter':
        node = new DubFilterEffect({
          cutoff: Number(config.parameters.cutoff) || 20,
          resonance: Number(config.parameters.resonance) || 1,
          gain: Number(config.parameters.gain) || 1,
          wet: wetValue,
        });
        break;

      // Buzzmachines
      case 'BuzzDistortion': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('ArguruDistortion');

        // Apply parameters from config
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) {
            synth.setParameter(paramIndex, value as number);
          }
        });

        node = synth;
        break;
      }

      case 'BuzzSVF': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('ElakSVF');

        // Apply parameters from config
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) {
            synth.setParameter(paramIndex, value as number);
          }
        });

        node = synth;
        break;
      }

      case 'BuzzDelay': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('JeskolaDelay');

        // Apply parameters from config
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) {
            synth.setParameter(paramIndex, value as number);
          }
        });

        node = synth;
        break;
      }

      case 'BuzzChorus': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('FSMChorus');

        // Apply parameters from config
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) {
            synth.setParameter(paramIndex, value as number);
          }
        });

        node = synth;
        break;
      }

      case 'BuzzCompressor': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('GeonikCompressor');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzOverdrive': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('GeonikOverdrive');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzDistortion2': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('JeskolaDistortion');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzCrossDelay': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('JeskolaCrossDelay');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzPhilta': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('FSMPhilta');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzDist2': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('ElakDist2');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzFreeverb': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('JeskolaFreeverb');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzFreqShift': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('BigyoFrequencyShifter');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzNotch': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('CyanPhaseNotch');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzStereoGain': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('DedaCodeStereoGain');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzSoftSat': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('GraueSoftSat');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzLimiter': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('LdSLimit');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzExciter': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('OomekExciter');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzMasterizer': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('OomekMasterizer');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzStereoDist': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('WhiteNoiseStereoDist');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzWhiteChorus': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('WhiteNoiseWhiteChorus');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzZfilter': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('QZfilter');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzChorus2': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('FSMChorus2');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzPanzerDelay': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('FSMPanzerDelay');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      default:
        console.warn(`Unknown effect type: ${config.type}, creating bypass`);
        node = new Tone.Gain(1);
    }

    // Attach type metadata for identification in the engine
    (node as any)._fxType = config.type;
    return node;
  }

  /**
   * Connect instrument through effect chain to destination
   */
  public static connectWithEffects(
    instrument: Tone.ToneAudioNode,
    effects: Tone.ToneAudioNode[],
    destination: Tone.ToneAudioNode
  ): void {
    if (effects.length === 0) {
      instrument.connect(destination);
      return;
    }

    // Connect instrument to first effect
    instrument.connect(effects[0]);

    // Chain effects together
    for (let i = 0; i < effects.length - 1; i++) {
      effects[i].connect(effects[i + 1]);
    }

    // Connect last effect to destination
    effects[effects.length - 1].connect(destination);
  }

  /**
   * Dispose of instrument and effects
   */
  public static disposeInstrument(
    instrument: Tone.ToneAudioNode,
    effects: Tone.ToneAudioNode[]
  ): void {
    // Dispose effects
    effects.forEach((fx) => fx.dispose());

    // Dispose instrument
    instrument.dispose();
  }

  // ============================================================================
  // PRIVATE SYNTH CREATORS
  // ============================================================================

  private static createSynth(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: {
        type: config.oscillator?.type || 'sawtooth',
        detune: config.oscillator?.detune || 0,
      },
      envelope: {
        attack: (config.envelope?.attack ?? 10) / 1000,
        decay: (config.envelope?.decay ?? 200) / 1000,
        sustain: (config.envelope?.sustain ?? 50) / 100,
        release: (config.envelope?.release ?? 1000) / 1000,
      },
      volume: config.volume || -12,
    });

    // Setup pitch envelope if enabled
    const pitchEnv = config.pitchEnvelope;
    const hasPitchEnv = pitchEnv?.enabled && pitchEnv.amount !== 0;

    // If no pitch envelope, return synth directly
    if (!hasPitchEnv) {
      return synth;
    }

    // Wrap synth to add pitch envelope support
    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        const t = time ?? Tone.now();
        this.applyPitchEnvelope(synth, pitchEnv!, t, duration);
        synth.triggerAttackRelease(note, duration, t, velocity);
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        const t = time ?? Tone.now();
        this.triggerPitchEnvelopeAttack(synth, pitchEnv!, t);
        synth.triggerAttack(note, t, velocity);
      },
      triggerRelease: (note: string, time?: number) => {
        const t = time ?? Tone.now();
        this.triggerPitchEnvelopeRelease(synth, pitchEnv!, t);
        synth.triggerRelease(note, t);
      },
      releaseAll: () => {
        synth.set({ detune: 0 });
        synth.releaseAll();
      },
      connect: (dest: Tone.InputNode) => synth.connect(dest),
      disconnect: () => synth.disconnect(),
      dispose: () => synth.dispose(),
      volume: synth.volume,
    } as any;
  }

  private static createMonoSynth(config: InstrumentConfig): Tone.MonoSynth {
    return new Tone.MonoSynth({
      oscillator: {
        type: config.oscillator?.type || 'sawtooth',
        detune: config.oscillator?.detune || 0,
      },
      envelope: {
        attack: (config.envelope?.attack ?? 10) / 1000,
        decay: (config.envelope?.decay ?? 200) / 1000,
        sustain: (config.envelope?.sustain ?? 50) / 100,
        release: (config.envelope?.release ?? 1000) / 1000,
      },
      filter: config.filter
        ? {
            type: config.filter.type,
            frequency: config.filter.frequency,
            Q: config.filter.Q,
            rolloff: config.filter.rolloff,
          }
        : undefined,
      filterEnvelope: config.filterEnvelope
        ? {
            baseFrequency: config.filterEnvelope.baseFrequency,
            octaves: config.filterEnvelope.octaves,
            attack: config.filterEnvelope.attack / 1000,
            decay: config.filterEnvelope.decay / 1000,
            sustain: config.filterEnvelope.sustain / 100,
            release: config.filterEnvelope.release / 1000,
          }
        : undefined,
      volume: config.volume || -12,
    });
  }

  private static createDuoSynth(config: InstrumentConfig): Tone.DuoSynth {
    return new Tone.DuoSynth({
      voice0: {
        oscillator: {
          type: config.oscillator?.type || 'sawtooth',
        },
        envelope: {
          attack: (config.envelope?.attack ?? 10) / 1000,
          decay: (config.envelope?.decay ?? 200) / 1000,
          sustain: (config.envelope?.sustain ?? 50) / 100,
          release: (config.envelope?.release ?? 1000) / 1000,
        },
      },
      voice1: {
        oscillator: {
          type: config.oscillator?.type || 'sawtooth',
        },
        envelope: {
          attack: (config.envelope?.attack ?? 10) / 1000,
          decay: (config.envelope?.decay ?? 200) / 1000,
          sustain: (config.envelope?.sustain ?? 50) / 100,
          release: (config.envelope?.release ?? 1000) / 1000,
        },
      },
      vibratoAmount: config.oscillator?.detune ? config.oscillator.detune / 100 : 0.5,
      vibratoRate: 5,
      volume: config.volume || -12,
    });
  }

  private static createFMSynth(config: InstrumentConfig): Tone.PolySynth {
    return new Tone.PolySynth(Tone.FMSynth, {
      oscillator: {
        type: config.oscillator?.type || 'sine',
      },
      envelope: {
        attack: (config.envelope?.attack ?? 10) / 1000,
        decay: (config.envelope?.decay ?? 200) / 1000,
        sustain: (config.envelope?.sustain ?? 50) / 100,
        release: (config.envelope?.release ?? 1000) / 1000,
      },
      modulationIndex: 10,
      volume: config.volume ?? -6, // Boost FM synth volume
    });
  }

  private static createAMSynth(config: InstrumentConfig): Tone.PolySynth {
    return new Tone.PolySynth(Tone.AMSynth, {
      oscillator: {
        type: config.oscillator?.type || 'sine',
      },
      envelope: {
        attack: (config.envelope?.attack ?? 10) / 1000,
        decay: (config.envelope?.decay ?? 200) / 1000,
        sustain: (config.envelope?.sustain ?? 50) / 100,
        release: (config.envelope?.release ?? 1000) / 1000,
      },
      volume: config.volume ?? -6, // Boost AM synth volume
    });
  }

  private static createPluckSynth(config: InstrumentConfig): Tone.PolySynth {
    return new Tone.PolySynth(Tone.PluckSynth, {
      attackNoise: 1,
      dampening: 4000,
      resonance: 0.7,
      volume: config.volume ?? 0, // Boost Pluck synth volume (very quiet)
    });
  }

  private static createMetalSynth(config: InstrumentConfig): Tone.MetalSynth {
    return new Tone.MetalSynth({
      envelope: {
        attack: (config.envelope?.attack ?? 1) / 1000,
        decay: (config.envelope?.decay ?? 100) / 1000,
        release: (config.envelope?.release ?? 100) / 1000,
      },
      volume: config.volume || -12,
    });
  }

  private static createMembraneSynth(config: InstrumentConfig): Tone.MembraneSynth {
    return new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 10,
      oscillator: {
        type: config.oscillator?.type || 'sine',
      },
      envelope: {
        attack: (config.envelope?.attack ?? 1) / 1000,
        decay: (config.envelope?.decay ?? 400) / 1000,
        sustain: 0.01,
        release: (config.envelope?.release ?? 100) / 1000,
      },
      volume: config.volume || -12,
    });
  }

  private static createNoiseSynth(config: InstrumentConfig): Tone.NoiseSynth {
    return new Tone.NoiseSynth({
      noise: {
        type: 'white',
      },
      envelope: {
        attack: (config.envelope?.attack ?? 10) / 1000,
        decay: (config.envelope?.decay ?? 200) / 1000,
        sustain: (config.envelope?.sustain ?? 50) / 100,
        release: (config.envelope?.release ?? 1000) / 1000,
      },
      volume: config.volume ?? -12,
    });
  }

  private static createTB303(config: InstrumentConfig): TB303Synth | TB303AccurateSynth | JC303Synth {
    if (!config.tb303) {
      throw new Error('TB303 config required for TB303 synth type');
    }

    // Choose engine based on engineType (default: jc303 - WASM engine)
    const engineType = config.tb303.engineType || 'jc303';

    if (engineType === 'jc303') {
      return this.createJC303(config.tb303, config.volume);
    }

    if (engineType === 'accurate') {
      // Use Open303-based accurate engine (JS-based worklet)
      const synth = new TB303AccurateSynth(config.tb303);
      synth.setVolume(config.volume || -12);
      return synth;
    } else {
      // Use Tone.js-based classic engine
      const synth = new TB303Synth(config.tb303);
      synth.setVolume(config.volume || -12);
      return synth;
    }
  }

  private static createJC303(tb: NonNullable<InstrumentConfig['tb303']>, volume?: number): JC303Synth {
    const synth = new JC303Synth();
    
    // Apply parameters from TB303 config
    synth.setCutoff(tb.filter.cutoff);
    synth.setResonance(tb.filter.resonance);
    synth.setEnvMod(tb.filterEnvelope.envMod);
    synth.setDecay(tb.filterEnvelope.decay);
    synth.setAccent(tb.accent.amount);
    synth.setWaveform(tb.oscillator.type === 'square' ? 1.0 : 0.0);
    
    if (tb.slide) {
      synth.setSlideTime(tb.slide.time);
    }
    if (tb.overdrive) {
      synth.setOverdrive(tb.overdrive.amount);
    }

    if (volume !== undefined) {
      synth.setVolume(volume);
    }

    return synth;
  }

  private static createWavetable(config: InstrumentConfig): WavetableSynth {
    const wavetableConfig = config.wavetable || DEFAULT_WAVETABLE;
    return new WavetableSynth(wavetableConfig);
  }

  private static createSampler(config: InstrumentConfig): Tone.Sampler {
    // Get sample URL from parameters (base64 data URL from user upload)
    const sampleUrl = config.parameters?.sampleUrl;

    // Get base note from sample config (for MOD/XM imports)
    const baseNote = config.sample?.baseNote || 'C4';

    // CRITICAL: Check if this is a MOD/XM instrument loaded from localStorage
    if (!sampleUrl && config.metadata?.importedFrom) {
      console.error(
        `[InstrumentFactory] CRITICAL: MOD/XM instrument "${config.name}" has no audio data!`,
        'This happens when instruments are loaded from localStorage.',
        'AudioBuffers and blob URLs cannot be serialized to JSON.',
        'Solution: Re-import the MOD/XM file to restore audio.'
      );
    }

    if (sampleUrl) {
      console.log(`[InstrumentFactory] Creating Sampler with sample URL:`, {
        instrumentId: config.id,
        baseNote,
        hasUrl: !!sampleUrl,
        urlPreview: sampleUrl.substring(0, 50) + '...',
      });

      // Map sample to its actual base note
      const urls: { [note: string]: string } = {};
      urls[baseNote] = sampleUrl;

      return new Tone.Sampler({
        urls,
        volume: config.volume || -12,
      });
    }

    // No sample loaded - create empty sampler
    console.warn(`[InstrumentFactory] Creating empty Sampler (no sample URL provided)`);
    return new Tone.Sampler({
      volume: config.volume || -12,
    });
  }

  private static createPlayer(config: InstrumentConfig): Tone.Player {
    // Get sample URL from parameters (base64 data URL from user upload)
    const sampleUrl = config.parameters?.sampleUrl;
    const reverseMode = config.parameters?.reverseMode || 'forward';

    if (sampleUrl) {
      const player = new Tone.Player({
        url: sampleUrl,
        volume: config.volume || -12,
        reverse: reverseMode === 'reverse',
      });
      return player;
    }

    // No sample loaded - create empty player
    return new Tone.Player({
      volume: config.volume || -12,
    });
  }

  private static createGranularSynth(config: InstrumentConfig): Tone.GrainPlayer {
    // Get sample URL and granular config
    const sampleUrl = config.granular?.sampleUrl || config.parameters?.sampleUrl;
    const granularConfig = config.granular;

    if (sampleUrl) {
      const grainPlayer = new Tone.GrainPlayer({
        url: sampleUrl,
        grainSize: (granularConfig?.grainSize || 100) / 1000, // ms to seconds
        overlap: (granularConfig?.grainOverlap || 50) / 100, // percentage to ratio
        playbackRate: granularConfig?.playbackRate || 1,
        detune: granularConfig?.detune || 0,
        reverse: granularConfig?.reverse || false,
        loop: true,
        loopStart: 0,
        loopEnd: 0, // 0 = end of buffer
        volume: config.volume || -12,
      });
      return grainPlayer;
    }

    // No sample loaded - create with placeholder
    return new Tone.GrainPlayer({
      grainSize: 0.1,
      overlap: 0.5,
      playbackRate: 1,
      loop: true,
      volume: config.volume || -12,
    });
  }

  // ============================================================================
  // NEW SYNTH CREATORS
  // ============================================================================

  /**
   * SuperSaw - Multiple detuned sawtooth oscillators for massive trance/EDM sound
   */
  private static createSuperSaw(config: InstrumentConfig): Tone.ToneAudioNode {
    const ssConfig = config.superSaw || DEFAULT_SUPERSAW;
    const detuneSpread = ssConfig.detune;

    // Create a PolySynth with sawtooth and add unison effect via chorus
    const synth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 16,
      oscillator: {
        type: 'sawtooth',
      },
      envelope: {
        attack: (ssConfig.envelope.attack || 10) / 1000,
        decay: (ssConfig.envelope.decay || 100) / 1000,
        sustain: (ssConfig.envelope.sustain || 80) / 100,
        release: (ssConfig.envelope.release || 300) / 1000,
      },
      volume: config.volume || -12,
    });

    // Apply filter
    const filter = new Tone.Filter({
      type: ssConfig.filter.type,
      frequency: ssConfig.filter.cutoff,
      Q: ssConfig.filter.resonance / 10,
      rolloff: -24,
    });

    // Add chorus for the supersaw detuning effect (simulates multiple detuned oscillators)
    const chorus = new Tone.Chorus({
      frequency: 4,
      delayTime: 2.5,
      depth: Math.min(1, detuneSpread / 50), // Map 0-100 to 0-2, capped at 1
      wet: 0.8,
    });
    chorus.start();

    // Connect synth -> filter -> chorus
    synth.connect(filter);
    filter.connect(chorus);

    // Setup pitch envelope if enabled
    const pitchEnv = config.pitchEnvelope;
    const hasPitchEnv = pitchEnv?.enabled && pitchEnv.amount !== 0;

    // Return a wrapper object
    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        const t = time ?? Tone.now();
        if (hasPitchEnv) {
          this.applyPitchEnvelope(synth, pitchEnv!, t, duration);
        }
        synth.triggerAttackRelease(note, duration, t, velocity);
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        const t = time ?? Tone.now();
        if (hasPitchEnv) {
          this.triggerPitchEnvelopeAttack(synth, pitchEnv!, t);
        }
        synth.triggerAttack(note, t, velocity);
      },
      triggerRelease: (note: string, time?: number) => {
        const t = time ?? Tone.now();
        if (hasPitchEnv) {
          this.triggerPitchEnvelopeRelease(synth, pitchEnv!, t);
        }
        synth.triggerRelease(note, t);
      },
      releaseAll: () => {
        synth.set({ detune: 0 }); // Reset pitch on release all
        synth.releaseAll();
      },
      connect: (dest: Tone.InputNode) => chorus.connect(dest),
      disconnect: () => chorus.disconnect(),
      dispose: () => {
        synth.dispose();
        filter.dispose();
        chorus.dispose();
      },
      applyConfig: (newConfig: any) => {
        const ssc = newConfig || DEFAULT_SUPERSAW;
        synth.set({
          envelope: {
            attack: (ssc.envelope.attack || 10) / 1000,
            decay: (ssc.envelope.decay || 100) / 1000,
            sustain: (ssc.envelope.sustain || 80) / 100,
            release: (ssc.envelope.release || 300) / 1000,
          }
        });
        filter.set({
          type: ssc.filter.type,
          frequency: ssc.filter.cutoff,
          Q: ssc.filter.resonance / 10,
        });
        chorus.set({
          depth: Math.min(1, ssc.detune / 50),
        });
      },
      volume: synth.volume,
    } as any;
  }

  /**
   * PolySynth - True polyphonic synth with voice management
   */
  private static createPolySynth(config: InstrumentConfig): Tone.ToneAudioNode {
    const psConfig = config.polySynth || DEFAULT_POLYSYNTH;

    // Select voice type
    let VoiceClass: typeof Tone.Synth | typeof Tone.FMSynth | typeof Tone.AMSynth = Tone.Synth;
    if (psConfig.voiceType === 'FMSynth') VoiceClass = Tone.FMSynth;
    else if (psConfig.voiceType === 'AMSynth') VoiceClass = Tone.AMSynth;

    const synth = new Tone.PolySynth(VoiceClass, {
      maxPolyphony: psConfig.voiceCount,
      oscillator: {
        type: psConfig.oscillator.type || 'sawtooth',
      },
      envelope: {
        attack: (psConfig.envelope.attack || 50) / 1000,
        decay: (psConfig.envelope.decay || 200) / 1000,
        sustain: (psConfig.envelope.sustain || 70) / 100,
        release: (psConfig.envelope.release || 500) / 1000,
      },
      volume: config.volume || -12,
    });

    // Setup pitch envelope if enabled
    const pitchEnv = config.pitchEnvelope;
    const hasPitchEnv = pitchEnv?.enabled && pitchEnv.amount !== 0;

    // If no pitch envelope, return synth directly
    if (!hasPitchEnv) {
      return synth;
    }

    // Wrap synth to add pitch envelope support
    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        const t = time ?? Tone.now();
        this.applyPitchEnvelope(synth, pitchEnv!, t, duration);
        synth.triggerAttackRelease(note, duration, t, velocity);
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        const t = time ?? Tone.now();
        this.triggerPitchEnvelopeAttack(synth, pitchEnv!, t);
        synth.triggerAttack(note, t, velocity);
      },
      triggerRelease: (note: string, time?: number) => {
        const t = time ?? Tone.now();
        this.triggerPitchEnvelopeRelease(synth, pitchEnv!, t);
        synth.triggerRelease(note, t);
      },
      releaseAll: () => {
        synth.set({ detune: 0 });
        synth.releaseAll();
      },
      connect: (dest: Tone.InputNode) => synth.connect(dest),
      disconnect: () => synth.disconnect(),
      dispose: () => synth.dispose(),
      volume: synth.volume,
    } as any;
  }

  /**
   * Organ - Hammond-style tonewheel organ with 9 drawbars
   * Note: Full drawbar implementation would require 9 oscillators per voice.
   * This simplified version uses a sine wave with rotary effect.
   */
  private static createOrgan(config: InstrumentConfig): Tone.ToneAudioNode {
    const orgConfig = config.organ || DEFAULT_ORGAN;
    const output = new Tone.Gain(1);

    // Create polyphonic sine synth for organ tone
    const synth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 8,
      oscillator: {
        type: 'sine',
      },
      envelope: {
        attack: 0.01,
        decay: 0.1,
        sustain: 0.9,
        release: 0.3,
      },
      volume: config.volume || -12,
    });

    // Add Leslie/rotary effect
    let rotary: Tone.Tremolo | null = null;
    if (orgConfig.rotary?.enabled) {
      rotary = new Tone.Tremolo({
        frequency: orgConfig.rotary.speed === 'fast' ? 6 : 1,
        depth: 0.3,
        wet: 0.5,
      });
      rotary.start();
      synth.connect(rotary);
      rotary.connect(output);
    } else {
      synth.connect(output);
    }

    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        synth.triggerAttackRelease(note, duration, time, velocity);
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        synth.triggerAttack(note, time, velocity);
      },
      triggerRelease: (note: string, time?: number) => {
        synth.triggerRelease(note, time);
      },
      releaseAll: () => synth.releaseAll(),
      connect: (dest: Tone.InputNode) => output.connect(dest),
      disconnect: () => output.disconnect(),
      dispose: () => {
        synth.dispose();
        rotary?.dispose();
        output.dispose();
      },
      applyConfig: (newConfig: any) => {
        const oc = newConfig || DEFAULT_ORGAN;
        synth.set({
          oscillator: {
            partials: [
              oc.drawbars.sub / 100,
              oc.drawbars.fundamental / 100,
              oc.drawbars.third / 100,
              oc.drawbars.fourth / 100,
              oc.drawbars.fifth / 100,
              oc.drawbars.sixth / 100,
              oc.drawbars.seventh / 100,
              oc.drawbars.eighth / 100,
              oc.drawbars.ninth / 100,
            ]
          }
        });
        if (rotary) {
          rotary.frequency.rampTo(oc.rotary?.speed === 'fast' ? 6 : 1, 0.1);
        }
      },
      volume: synth.volume,
    } as any;
  }

  /**
   * DrumMachine - TR-909 style drum synthesis
   * Based on authentic TR-909 parameters from the er-99 web emulator
   * Key characteristics:
   * - Kick: Sine with pitch envelope (2.5x multiplier, 50ms duration), saturation, 3kHz lowpass
   * - Snare: Pitched body (220Hz, 4x env, 10ms fast drop) + noise with notch filter at 1000Hz
   * - Clap: Multiple delayed noise bursts (10ms spread) with serial bandpass + modulator
   * - Rimshot: Parallel resonant bandpass filters (220/500/950Hz) with high Q and saturation
   * - Toms: Pitched body with 2x envelope, varying frequencies (100/200/300Hz)
   */
  private static createDrumMachine(config: InstrumentConfig): Tone.ToneAudioNode {
    const dmConfig = config.drumMachine || DEFAULT_DRUM_MACHINE;
    const is808 = dmConfig.machineType === '808';

    switch (dmConfig.drumType) {
      case 'kick': {
        // 808 vs 909 kick defaults - significantly different character
        const kickDefaults808 = {
          pitch: 48,          // 808: lower base frequency
          pitchDecay: 50,
          tone: 40,
          toneDecay: 30,
          decay: 200,         // 808: slightly shorter default
          drive: 60,          // 808: more saturation
          envAmount: 2.0,     // 808: less pitch sweep
          envDuration: 110,   // 808: longer pitch envelope
          filterFreq: 250,    // 808: much lower filter (warm/boomy)
        };
        const kickDefaults909 = {
          pitch: 80,          // 909: higher, punchier
          pitchDecay: 50,
          tone: 50,
          toneDecay: 20,
          decay: 300,
          drive: 50,
          envAmount: 2.5,     // 909: more aggressive pitch sweep
          envDuration: 50,    // 909: shorter, snappier
          filterFreq: 3000,   // 909: bright/punchy
        };
        const kickConfig = {
          ...(is808 ? kickDefaults808 : kickDefaults909),
          ...dmConfig.kick
        };

        // TR-909 kick: sine oscillator with pitch envelope and saturation
        // Using MembraneSynth as base for pitch envelope capability
        const synth = new Tone.MembraneSynth({
          // pitchDecay controls how fast pitch drops - use envDuration
          pitchDecay: kickConfig.envDuration / 1000,
          // octaves controls pitch envelope depth - derive from envAmount
          // envAmount 2.5 means start at freq*2.5, so ~1.3 octaves above base
          octaves: Math.log2(kickConfig.envAmount) * 2,
          oscillator: { type: 'sine' },
          envelope: {
            attack: 0.001,
            decay: kickConfig.decay / 1000,
            sustain: 0,
            release: 0.1,
          },
          volume: config.volume ?? -6,
        });

        // Add saturation via waveshaper if drive > 0
        let output: Tone.ToneAudioNode = synth;
        let saturation: Tone.Distortion | null = null;
        let filter: Tone.Filter | null = null;

        if (kickConfig.drive > 0) {
          saturation = new Tone.Distortion({
            distortion: (kickConfig.drive / 100) * 0.5, // Scale to reasonable range
            oversample: '2x',
            wet: 1,
          });
        }

        // Add lowpass filter (909: 3000Hz)
        filter = new Tone.Filter({
          type: 'lowpass',
          frequency: kickConfig.filterFreq,
          Q: 1,
          rolloff: -24,
        });

        // Connect chain: synth -> saturation (if any) -> filter
        if (saturation) {
          synth.connect(saturation);
          saturation.connect(filter);
        } else {
          synth.connect(filter);
        }
        output = filter;

        // Use fixed 909 frequency (80Hz) regardless of note
        const baseNote = Tone.Frequency(kickConfig.pitch, 'hz').toNote();

        return {
          triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
            synth.triggerAttackRelease(baseNote, duration, time, velocity);
          },
          triggerAttack: (_note: string, time?: number, velocity?: number) => {
            synth.triggerAttack(baseNote, time, velocity);
          },
          triggerRelease: (_note: string, time?: number) => {
            synth.triggerRelease(time);
          },
          releaseAll: () => { try { synth.triggerRelease(); } catch { /* ignore */ } },
          connect: (dest: Tone.InputNode) => output.connect(dest),
          disconnect: () => output.disconnect(),
          dispose: () => {
            synth.dispose();
            saturation?.dispose();
            filter?.dispose();
          },
          applyConfig: (newConfig: any) => {
            const dmc = newConfig || DEFAULT_DRUM_MACHINE;
            const kc = dmc.kick;
            if (!kc) return;
            
            synth.set({
              pitchDecay: kc.envDuration / 1000,
              octaves: Math.log2(kc.envAmount) * 2,
              envelope: {
                decay: kc.decay / 1000,
              }
            });
            if (saturation) {
              saturation.distortion = (kc.drive / 100) * 0.5;
            }
            if (filter) {
              filter.frequency.rampTo(kc.filterFreq, 0.1);
            }
          },
          volume: synth.volume,
        } as any;
      }

      case 'snare': {
        // 808 vs 909 snare defaults
        const snareDefaults808 = {
          pitch: 238,           // 808: lower frequency body
          tone: 35,             // 808: more body-focused
          toneDecay: 200,       // 808: longer noise decay
          snappy: 55,           // 808: less harsh noise
          decay: 150,           // 808: slightly longer body
          envAmount: 2.5,       // 808: less aggressive pitch sweep
          envDuration: 25,      // 808: medium pitch envelope
          filterType: 'lowpass' as const, // 808: lowpass for warmth
          filterFreq: 2500,     // 808: warmer filter
        };
        const snareDefaults909 = {
          pitch: 220,           // 909: slightly higher
          tone: 25,
          toneDecay: 250,       // 909: longer
          snappy: 70,           // 909: sharper noise
          decay: 100,           // 909: snappier body
          envAmount: 4.0,       // 909: aggressive pitch sweep
          envDuration: 10,      // 909: very fast pitch drop
          filterType: 'notch' as const, // 909: characteristic notch
          filterFreq: 1000,
        };
        const snareConfig = {
          ...(is808 ? snareDefaults808 : snareDefaults909),
          ...dmConfig.snare
        };

        // Snare: pitched body with pitch envelope + filtered noise
        const body = new Tone.MembraneSynth({
          pitchDecay: snareConfig.envDuration / 1000, // 909: 10ms fast pitch drop
          octaves: Math.log2(snareConfig.envAmount) * 2, // 909: 4x = ~2 octaves
          oscillator: { type: 'sine' },
          envelope: {
            attack: 0.001,
            decay: snareConfig.decay / 1000,
            sustain: 0,
            release: 0.1,
          },
          volume: config.volume ?? -6,
        });

        // Noise component for snare "snap"
        const noise = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: {
            attack: 0.001,
            decay: snareConfig.toneDecay / 1000, // 909: 250ms
            sustain: 0,
            release: 0.05,
          },
          volume: (config.volume ?? -6) + (snareConfig.snappy / 15 - 3),
        });

        // 909 uses notch filter at 1000Hz on snare
        const filter = new Tone.Filter({
          type: snareConfig.filterType,
          frequency: snareConfig.filterFreq,
          Q: 2,
        });

        const output = new Tone.Gain(1);
        body.connect(output);
        noise.connect(filter);
        filter.connect(output);

        // Use fixed 909 frequency
        const baseNote = Tone.Frequency(snareConfig.pitch, 'hz').toNote();

        return {
          triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
            body.triggerAttackRelease(baseNote, duration, time, velocity);
            noise.triggerAttackRelease(duration, time, velocity);
          },
          triggerAttack: (_note: string, time?: number, velocity?: number) => {
            body.triggerAttack(baseNote, time, velocity);
            noise.triggerAttack(time, velocity);
          },
          triggerRelease: (_note: string, time?: number) => {
            body.triggerRelease(time);
            noise.triggerRelease(time);
          },
          releaseAll: () => {
            try { body.triggerRelease(); } catch { /* ignore */ }
            try { noise.triggerRelease(); } catch { /* ignore */ }
          },
          connect: (dest: Tone.InputNode) => output.connect(dest),
          disconnect: () => output.disconnect(),
          dispose: () => {
            body.dispose();
            noise.dispose();
            filter.dispose();
            output.dispose();
          },
          applyConfig: (newConfig: any) => {
            const dmc = newConfig || DEFAULT_DR_MACHINE;
            const sc = dmc.snare;
            if (!sc) return;

            body.set({
              pitchDecay: sc.envDuration / 1000,
              octaves: Math.log2(sc.envAmount) * 2,
              envelope: {
                decay: sc.decay / 1000,
              }
            });
            noise.set({
              envelope: {
                decay: sc.toneDecay / 1000,
              },
              volume: (config.volume ?? -6) + (sc.snappy / 15 - 3),
            });
            filter.set({
              type: sc.filterType,
              frequency: sc.filterFreq,
            });
          },
          volume: body.volume,
        } as any;
      }

      case 'hihat': {
        // 808 vs 909 hihat defaults - 808 uses 6-square metallic, 909 samples
        const hhDefaults808 = { tone: 40, decay: 80, metallic: 70 };   // 808: warmer, more metallic
        const hhDefaults909 = { tone: 50, decay: 100, metallic: 50 }; // 909: crisper
        const hhConfig = { ...(is808 ? hhDefaults808 : hhDefaults909), ...dmConfig.hihat };
        // Hi-hat: metal synth approximation
        return new Tone.MetalSynth({
          frequency: is808 ? 180 + hhConfig.tone * 1.5 : 200 + hhConfig.tone * 2,
          envelope: {
            attack: 0.001,
            decay: hhConfig.decay / 1000,
            release: is808 ? 0.02 : 0.01,
          },
          harmonicity: 5.1,
          modulationIndex: 32 + hhConfig.metallic / 3,
          resonance: 4000 + hhConfig.tone * 40,
          octaves: 1.5,
          volume: config.volume || -12,
        });
      }

      case 'clap': {
        // 808 vs 909 clap defaults
        const clapDefaults808 = {
          tone: 45,              // 808: slightly darker
          decay: 120,            // 808: longer reverby tail
          toneDecay: 350,        // 808: longer noise envelope
          spread: 15,            // 808: wider spread for room effect
          filterFreqs: [700, 1000] as [number, number], // 808: lower filter freqs
          modulatorFreq: 30,
        };
        const clapDefaults909 = {
          tone: 55,              // 909: brighter
          decay: 80,             // 909: snappier
          toneDecay: 250,
          spread: 10,            // 909: tighter spread
          filterFreqs: [900, 1200] as [number, number],
          modulatorFreq: 40,
        };
        const clapConfig = {
          ...(is808 ? clapDefaults808 : clapDefaults909),
          ...dmConfig.clap
        };

        // Clap: Multiple delayed noise bursts with filtering
        // Creates the "clap" effect by triggering noise at slightly
        // offset times creating a richer, more realistic clap
        const output = new Tone.Gain(1);

        // Create noise source for the sustained clap tail
        const noise = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: {
            attack: 0.001,
            decay: clapConfig.decay / 1000,
            sustain: 0,
            release: 0.05,
          },
          volume: config.volume ?? -10,
        });

        // Serial bandpass filters (909: highpass 900Hz -> bandpass 1200Hz)
        const filter1 = new Tone.Filter({
          type: 'highpass',
          frequency: clapConfig.filterFreqs[0],
          Q: 1.2,
        });
        const filter2 = new Tone.Filter({
          type: 'bandpass',
          frequency: clapConfig.filterFreqs[1],
          Q: 0.7,
        });

        // Tone filter for the initial burst character (909: 2200Hz bandpass)
        const toneFilter = new Tone.Filter({
          type: 'bandpass',
          frequency: 1000 + clapConfig.tone * 24, // Scale 0-100 to ~1000-3400Hz
          Q: 2,
        });

        noise.connect(toneFilter);
        toneFilter.connect(filter1);
        filter1.connect(filter2);
        filter2.connect(output);

        // Create additional noise bursts for the "spread" effect
        // In hardware this is done with delay lines; we simulate with timed triggers
        const burstNoises: Tone.NoiseSynth[] = [];
        const numBursts = 4;
        for (let i = 0; i < numBursts; i++) {
          const burstNoise = new Tone.NoiseSynth({
            noise: { type: 'white' },
            envelope: {
              attack: 0.001,
              decay: (clapConfig.toneDecay / 1000) / (i + 1), // Each burst shorter
              sustain: 0,
              release: 0.02,
            },
            volume: (config.volume ?? -10) - (i * 3), // Each burst quieter
          });
          burstNoise.connect(toneFilter);
          burstNoises.push(burstNoise);
        }

        return {
          triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
            const t = time ?? Tone.now();
            const spreadMs = clapConfig.spread / 1000;
            // Trigger the delayed bursts
            burstNoises.forEach((burst, i) => {
              const burstTime = t + (i * spreadMs);
              const burstVel = (velocity ?? 1) * (1 - i * 0.15);
              burst.triggerAttackRelease(duration / (i + 1), burstTime, burstVel);
            });
            // Main sustain comes last
            noise.triggerAttackRelease(duration, t + (numBursts * spreadMs), velocity);
          },
          triggerAttack: (_note: string, time?: number, velocity?: number) => {
            const t = time ?? Tone.now();
            const spreadMs = clapConfig.spread / 1000;
            burstNoises.forEach((burst, i) => {
              burst.triggerAttack(t + (i * spreadMs), (velocity ?? 1) * (1 - i * 0.15));
            });
            noise.triggerAttack(t + (numBursts * spreadMs), velocity);
          },
          triggerRelease: (_note: string, time?: number) => {
            noise.triggerRelease(time);
            burstNoises.forEach(burst => burst.triggerRelease(time));
          },
          releaseAll: () => {
            try { noise.triggerRelease(); } catch { /* ignore */ }
            burstNoises.forEach(burst => {
              try { burst.triggerRelease(); } catch { /* ignore */ }
            });
          },
          connect: (dest: Tone.InputNode) => output.connect(dest),
          disconnect: () => output.disconnect(),
          dispose: () => {
            noise.dispose();
            burstNoises.forEach(burst => burst.dispose());
            filter1.dispose();
            filter2.dispose();
            toneFilter.dispose();
            output.dispose();
          },
          applyConfig: (newConfig: any) => {
            const dmc = newConfig || DEFAULT_DRUM_MACHINE;
            const cc = dmc.clap;
            if (!cc) return;

            noise.set({
              envelope: {
                decay: cc.decay / 1000,
              }
            });
            filter1.frequency.rampTo(cc.filterFreqs[0], 0.1);
            filter2.frequency.rampTo(cc.filterFreqs[1], 0.1);
            toneFilter.frequency.rampTo(1000 + cc.tone * 24, 0.1);
            
            burstNoises.forEach((burst, i) => {
              burst.set({
                envelope: {
                  decay: (cc.toneDecay / 1000) / (i + 1),
                }
              });
            });
          },
          volume: noise.volume,
        } as any;
      }

      case 'tom': {
        // 808 vs 909 tom defaults
        const tomDefaults808 = {
          pitch: 160,            // 808: slightly lower
          decay: 300,            // 808: longer decay
          tone: 2,               // 808: pure sine, minimal noise
          toneDecay: 50,
          envAmount: 1.5,        // 808: gentler pitch sweep
          envDuration: 150,      // 808: longer envelope
        };
        const tomDefaults909 = {
          pitch: 200,            // 909: punchier
          decay: 200,
          tone: 5,               // 909: slight noise
          toneDecay: 100,
          envAmount: 2.0,        // 909: more aggressive
          envDuration: 100,
        };
        const tomConfig = {
          ...(is808 ? tomDefaults808 : tomDefaults909),
          ...dmConfig.tom
        };

        // Tom: pitched sine with pitch envelope
        const synth = new Tone.MembraneSynth({
          pitchDecay: tomConfig.envDuration / 1000,
          octaves: Math.log2(tomConfig.envAmount) * 2,
          oscillator: { type: 'sine' },
          envelope: {
            attack: 0.001,
            decay: tomConfig.decay / 1000,
            sustain: 0,
            release: 0.1,
          },
          volume: config.volume ?? -6,
        });

        // Small amount of noise for attack character
        const noise = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: {
            attack: 0.001,
            decay: tomConfig.toneDecay / 1000,
            sustain: 0,
            release: 0.02,
          },
          volume: (config.volume ?? -6) - 20 + (tomConfig.tone / 5), // Very subtle noise
        });

        const output = new Tone.Gain(1);
        synth.connect(output);
        noise.connect(output);

        const baseNote = Tone.Frequency(tomConfig.pitch, 'hz').toNote();

        return {
          triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
            synth.triggerAttackRelease(baseNote, duration, time, velocity);
            noise.triggerAttackRelease(duration * 0.3, time, velocity);
          },
          triggerAttack: (_note: string, time?: number, velocity?: number) => {
            synth.triggerAttack(baseNote, time, velocity);
            noise.triggerAttack(time, velocity);
          },
          triggerRelease: (_note: string, time?: number) => {
            synth.triggerRelease(time);
            noise.triggerRelease(time);
          },
          releaseAll: () => {
            try { synth.triggerRelease(); } catch { /* ignore */ }
            try { noise.triggerRelease(); } catch { /* ignore */ }
          },
          connect: (dest: Tone.InputNode) => output.connect(dest),
          disconnect: () => output.disconnect(),
          dispose: () => {
            synth.dispose();
            noise.dispose();
            output.dispose();
          },
          applyConfig: (newConfig: any) => {
            const dmc = newConfig || DEFAULT_DR_MACHINE;
            const tc = dmc.tom;
            if (!tc) return;

            synth.set({
              pitchDecay: tc.envDuration / 1000,
              octaves: Math.log2(tc.envAmount) * 2,
              envelope: {
                decay: tc.decay / 1000,
              }
            });
            noise.set({
              envelope: {
                decay: tc.toneDecay / 1000,
              },
              volume: (config.volume ?? -6) - 20 + (tc.tone / 5),
            });
          },
          volume: synth.volume,
        } as any;
      }

      case 'rimshot': {
        // 808 vs 909 rimshot defaults
        const rimDefaults808 = {
          decay: 45,             // 808: slightly longer decay
          filterFreqs: [280, 450, 850] as [number, number, number], // 808: lower freqs
          filterQ: 8.0,          // 808: slightly less resonant
          saturation: 2.0,       // 808: less aggressive
        };
        const rimDefaults909 = {
          decay: 30,             // 909: snappier
          filterFreqs: [220, 500, 950] as [number, number, number],
          filterQ: 10.5,         // 909: very resonant "ping"
          saturation: 3.0,       // 909: more aggressive
        };
        const rimConfig = {
          ...(is808 ? rimDefaults808 : rimDefaults909),
          ...dmConfig.rimshot
        };

        // Rimshot: Parallel resonant bandpass filters with saturation
        // The high Q creates the characteristic "ping"
        // Uses a short noise impulse to excite the resonant filters

        // Create noise burst as impulse source
        const noise = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: {
            attack: 0.001,
            decay: rimConfig.decay / 1000,
            sustain: 0,
            release: 0.01,
          },
          volume: config.volume ?? -10,
        });

        // Three parallel resonant bandpass filters (909 characteristic)
        const filter1 = new Tone.Filter({
          type: 'bandpass',
          frequency: rimConfig.filterFreqs[0],
          Q: rimConfig.filterQ,
        });
        const filter2 = new Tone.Filter({
          type: 'bandpass',
          frequency: rimConfig.filterFreqs[1],
          Q: rimConfig.filterQ,
        });
        const filter3 = new Tone.Filter({
          type: 'bandpass',
          frequency: rimConfig.filterFreqs[2],
          Q: rimConfig.filterQ,
        });

        // Mix the parallel filters
        const filterMix = new Tone.Gain(1);
        noise.connect(filter1);
        noise.connect(filter2);
        noise.connect(filter3);
        filter1.connect(filterMix);
        filter2.connect(filterMix);
        filter3.connect(filterMix);

        // Saturation for the punchy 909 rimshot character
        const saturation = new Tone.Distortion({
          distortion: (rimConfig.saturation / 5) * 0.8, // Scale saturation
          oversample: '2x',
          wet: 1,
        });

        // Highpass to remove mud
        const highpass = new Tone.Filter({
          type: 'highpass',
          frequency: 100,
          Q: 0.5,
        });

        filterMix.connect(saturation);
        saturation.connect(highpass);

        return {
          triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
            noise.triggerAttackRelease(duration, time, velocity);
          },
          triggerAttack: (_note: string, time?: number, velocity?: number) => {
            noise.triggerAttack(time, velocity);
          },
          triggerRelease: (_note: string, time?: number) => {
            noise.triggerRelease(time);
          },
          releaseAll: () => {
            try { noise.triggerRelease(); } catch { /* ignore */ }
          },
          connect: (dest: Tone.InputNode) => highpass.connect(dest),
          disconnect: () => highpass.disconnect(),
          dispose: () => {
            noise.dispose();
            filter1.dispose();
            filter2.dispose();
            filter3.dispose();
            filterMix.dispose();
            saturation.dispose();
            highpass.dispose();
          },
          applyConfig: (newConfig: any) => {
            const dmc = newConfig || DEFAULT_DRUM_MACHINE;
            const rc = dmc.rimshot;
            if (!rc) return;

            noise.set({
              envelope: {
                decay: rc.decay / 1000,
              }
            });
            filter1.frequency.rampTo(rc.filterFreqs[0], 0.1);
            filter2.frequency.rampTo(rc.filterFreqs[1], 0.1);
            filter3.frequency.rampTo(rc.filterFreqs[2], 0.1);
            filter1.Q.value = rc.filterQ;
            filter2.Q.value = rc.filterQ;
            filter3.Q.value = rc.filterQ;
            saturation.distortion = (rc.saturation / 5) * 0.8;
          },
          volume: noise.volume,
        } as any;
      }

      // =========================================================================
      // TR-808 SPECIFIC DRUM TYPES
      // Based on io-808 web emulator - 100% synthesized (no samples)
      // =========================================================================

      case 'conga': {
        // TR-808 Conga: Pure sine oscillator (higher pitched than tom, no noise)
        const congaConfig = {
          pitch: 310,           // Mid conga default
          decay: 180,           // 808: 180ms
          tuning: 50,           // 0-100% pitch interpolation
          ...dmConfig.conga
        };

        // 808 congas are pure sine - no noise component like toms
        const synth = new Tone.Synth({
          oscillator: { type: 'sine' },
          envelope: {
            attack: 0.001,
            decay: congaConfig.decay / 1000,
            sustain: 0,
            release: 0.1,
          },
          volume: config.volume ?? -8,
        });

        // Lowpass filter for warmth
        const filter = new Tone.Filter({
          type: 'lowpass',
          frequency: 10000,
          Q: 1,
        });

        synth.connect(filter);
        const baseNote = Tone.Frequency(congaConfig.pitch, 'hz').toNote();

        return {
          triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
            synth.triggerAttackRelease(baseNote, duration, time, velocity);
          },
          triggerAttack: (_note: string, time?: number, velocity?: number) => {
            synth.triggerAttack(baseNote, time, velocity);
          },
          triggerRelease: (_note: string, time?: number) => {
            synth.triggerRelease(time);
          },
          releaseAll: () => {
            try { synth.triggerRelease(); } catch { /* ignore */ }
          },
          connect: (dest: Tone.InputNode) => filter.connect(dest),
          disconnect: () => filter.disconnect(),
          dispose: () => {
            synth.dispose();
            filter.dispose();
          },
          applyConfig: (newConfig: any) => {
            const dmc = newConfig || DEFAULT_DR_MACHINE;
            const cc = dmc.conga;
            if (!cc) return;

            synth.set({
              envelope: {
                decay: cc.decay / 1000,
              }
            });
          },
          volume: synth.volume,
        } as any;
      }

      case 'cowbell': {
        // TR-808 Cowbell: Dual square oscillators at 540Hz and 800Hz through bandpass
        // Dual envelope: short attack + longer exponential tail
        const cowbellConfig = {
          decay: 400,           // 808: 15ms short + 400ms tail
          filterFreq: 2640,     // 808: 2640Hz bandpass center
          ...dmConfig.cowbell
        };

        // Two square oscillators at fixed 808 frequencies
        const osc1 = new Tone.Oscillator({
          type: 'square',
          frequency: 540,
          volume: -6,
        });
        const osc2 = new Tone.Oscillator({
          type: 'square',
          frequency: 800,
          volume: -6,
        });

        // Short envelope for attack transient
        const shortVCA = new Tone.Gain(0);
        // Long envelope for sustaining tail
        const longVCA = new Tone.Gain(0);

        // Bandpass filter for cowbell character
        const filter = new Tone.Filter({
          type: 'bandpass',
          frequency: cowbellConfig.filterFreq,
          Q: 1,
        });

        // Mix oscillators
        const oscMix = new Tone.Gain(0.3);
        osc1.connect(oscMix);
        osc2.connect(oscMix);

        // Split to short and long VCAs
        oscMix.connect(shortVCA);
        oscMix.connect(longVCA);

        // Output mix
        const output = new Tone.Gain(1);
        shortVCA.connect(filter);
        longVCA.connect(filter);
        filter.connect(output);

        // Start oscillators
        osc1.start();
        osc2.start();

        return {
          triggerAttackRelease: (_note: string, _duration: number, time?: number, velocity?: number) => {
            const t = time ?? Tone.now();
            const vel = velocity ?? 1;
            // Short attack envelope: 0 -> 0.375 over 2ms, then decay to 0 over 15ms
            shortVCA.gain.cancelScheduledValues(t);
            shortVCA.gain.setValueAtTime(0, t);
            shortVCA.gain.linearRampToValueAtTime(0.375 * vel, t + 0.002);
            shortVCA.gain.linearRampToValueAtTime(0, t + 0.017);
            // Long tail envelope: 0 -> 0.125 over 2ms, exponential decay over cowbell decay
            longVCA.gain.cancelScheduledValues(t);
            longVCA.gain.setValueAtTime(0.001, t + 0.015);
            longVCA.gain.exponentialRampToValueAtTime(0.125 * vel, t + 0.017);
            longVCA.gain.exponentialRampToValueAtTime(0.001, t + 0.017 + cowbellConfig.decay / 1000);
          },
          triggerAttack: (_note: string, time?: number, velocity?: number) => {
            const t = time ?? Tone.now();
            const vel = velocity ?? 1;
            shortVCA.gain.cancelScheduledValues(t);
            shortVCA.gain.setValueAtTime(0, t);
            shortVCA.gain.linearRampToValueAtTime(0.375 * vel, t + 0.002);
            shortVCA.gain.linearRampToValueAtTime(0, t + 0.017);
            longVCA.gain.cancelScheduledValues(t);
            longVCA.gain.setValueAtTime(0.001, t + 0.015);
            longVCA.gain.exponentialRampToValueAtTime(0.125 * vel, t + 0.017);
            longVCA.gain.exponentialRampToValueAtTime(0.001, t + 0.017 + cowbellConfig.decay / 1000);
          },
          triggerRelease: (_note: string, _time?: number) => {
            // Cowbell doesn't respond to release - it's a one-shot
          },
          releaseAll: () => {
            // One-shot, nothing to release
          },
          connect: (dest: Tone.InputNode) => output.connect(dest),
          disconnect: () => output.disconnect(),
          dispose: () => {
            osc1.stop();
            osc2.stop();
            osc1.dispose();
            osc2.dispose();
            shortVCA.dispose();
            longVCA.dispose();
            oscMix.dispose();
            filter.dispose();
            output.dispose();
          },
          applyConfig: (newConfig: any) => {
            const dmc = newConfig || DEFAULT_DR_MACHINE;
            const cc = dmc.cowbell;
            if (!cc) return;

            filter.frequency.rampTo(cc.filterFreq, 0.1);
          },
          volume: output.gain,
        } as any;
      }

      case 'clave': {
        // TR-808 Clave: Triangle (2450Hz) + Sine (1750Hz) through bandpass + distortion
        // Creates woody "click" character
        const claveConfig = {
          decay: 40,            // 808: 40ms
          pitch: 2450,          // 808: 2450Hz triangle
          pitchSecondary: 1750, // 808: 1750Hz sine
          filterFreq: 2450,     // 808: 2450Hz bandpass
          ...dmConfig.clave
        };

        // Primary triangle oscillator
        const osc1 = new Tone.Oscillator({
          type: 'triangle',
          frequency: claveConfig.pitch,
          volume: -6,
        });
        // Secondary sine oscillator
        const osc2 = new Tone.Oscillator({
          type: 'sine',
          frequency: claveConfig.pitchSecondary,
          volume: -8,
        });

        // VCAs for envelope
        const vca1 = new Tone.Gain(0);
        const vca2 = new Tone.Gain(0);

        // Bandpass filter
        const filter = new Tone.Filter({
          type: 'bandpass',
          frequency: claveConfig.filterFreq,
          Q: 5,
        });

        // Distortion for punch (808 "swing VCA" - half-wave rectifier + soft clip)
        const distortion = new Tone.Distortion({
          distortion: 0.5,
          oversample: '2x',
          wet: 1,
        });

        const output = new Tone.Gain(1);

        osc1.connect(vca1);
        osc2.connect(vca2);
        vca1.connect(filter);
        vca2.connect(filter);
        filter.connect(distortion);
        distortion.connect(output);

        osc1.start();
        osc2.start();

        return {
          triggerAttackRelease: (_note: string, _duration: number, time?: number, velocity?: number) => {
            const t = time ?? Tone.now();
            const vel = velocity ?? 1;
            // Fast exponential decay
            vca1.gain.cancelScheduledValues(t);
            vca1.gain.setValueAtTime(0.7 * vel, t);
            vca1.gain.exponentialRampToValueAtTime(0.001, t + claveConfig.decay / 1000);
            vca2.gain.cancelScheduledValues(t);
            vca2.gain.setValueAtTime(0.5 * vel, t);
            vca2.gain.exponentialRampToValueAtTime(0.001, t + claveConfig.decay / 1000);
          },
          triggerAttack: (_note: string, time?: number, velocity?: number) => {
            const t = time ?? Tone.now();
            const vel = velocity ?? 1;
            vca1.gain.cancelScheduledValues(t);
            vca1.gain.setValueAtTime(0.7 * vel, t);
            vca1.gain.exponentialRampToValueAtTime(0.001, t + claveConfig.decay / 1000);
            vca2.gain.cancelScheduledValues(t);
            vca2.gain.setValueAtTime(0.5 * vel, t);
            vca2.gain.exponentialRampToValueAtTime(0.001, t + claveConfig.decay / 1000);
          },
          triggerRelease: (_note: string, _time?: number) => { /* one-shot */ },
          releaseAll: () => { /* one-shot */ },
          connect: (dest: Tone.InputNode) => output.connect(dest),
          disconnect: () => output.disconnect(),
          dispose: () => {
            osc1.stop();
            osc2.stop();
            osc1.dispose();
            osc2.dispose();
            vca1.dispose();
            vca2.dispose();
            filter.dispose();
            distortion.dispose();
            output.dispose();
          },
          applyConfig: (newConfig: any) => {
            const dmc = newConfig || DEFAULT_DR_MACHINE;
            const cc = dmc.clave;
            if (!cc) return;

            filter.frequency.rampTo(cc.filterFreq, 0.1);
          },
          volume: output.gain,
        } as any;
      }

      case 'maracas': {
        // TR-808 Maracas: White noise through highpass filter (5kHz)
        // Very short decay for "shake" character
        const maracasConfig = {
          decay: 30,            // 808: 30ms (quick shake)
          filterFreq: 5000,     // 808: 5000Hz highpass
          ...dmConfig.maracas
        };

        const noise = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: {
            attack: 0.001,
            decay: maracasConfig.decay / 1000,
            sustain: 0,
            release: 0.01,
          },
          volume: config.volume ?? -12,
        });

        // Highpass filter removes low frequencies, keeps bright rattle
        const filter = new Tone.Filter({
          type: 'highpass',
          frequency: maracasConfig.filterFreq,
          Q: 1,
        });

        noise.connect(filter);

        return {
          triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
            noise.triggerAttackRelease(duration, time, velocity);
          },
          triggerAttack: (_note: string, time?: number, velocity?: number) => {
            noise.triggerAttack(time, velocity);
          },
          triggerRelease: (_note: string, time?: number) => {
            noise.triggerRelease(time);
          },
          releaseAll: () => {
            try { noise.triggerRelease(); } catch { /* ignore */ }
          },
          connect: (dest: Tone.InputNode) => filter.connect(dest),
          disconnect: () => filter.disconnect(),
          dispose: () => {
            noise.dispose();
            filter.dispose();
          },
          applyConfig: (newConfig: any) => {
            const dmc = newConfig || DEFAULT_DR_MACHINE;
            const mc = dmc.maracas;
            if (!mc) return;

            noise.set({
              envelope: {
                decay: mc.decay / 1000,
              }
            });
            filter.frequency.rampTo(mc.filterFreq, 0.1);
          },
          volume: noise.volume,
        } as any;
      }

      case 'cymbal': {
        // TR-808 Cymbal: Same 6-oscillator bank as hi-hat but with 3-band processing
        // Complex multi-band filtering with separate envelopes per band
        const cymbalConfig = {
          tone: 50,             // Low/high band balance
          decay: 2000,          // 808: variable from 700-6800ms for low band
          ...dmConfig.cymbal
        };

        // 808 metallic oscillator bank - 6 square waves at inharmonic frequencies
        const oscFreqs = [263, 400, 421, 474, 587, 845];
        const oscillators: Tone.Oscillator[] = [];
        const oscMix = new Tone.Gain(0.3);

        for (const freq of oscFreqs) {
          const osc = new Tone.Oscillator({
            type: 'square',
            frequency: freq,
            volume: -10,
          });
          osc.connect(oscMix);
          osc.start();
          oscillators.push(osc);
        }

        // 3-band filtering with separate VCAs
        // Low band: 5kHz bandpass, long decay
        const lowFilter = new Tone.Filter({ type: 'bandpass', frequency: 5000, Q: 1 });
        const lowVCA = new Tone.Gain(0);
        // Mid band: 10kHz bandpass, medium decay
        const midFilter = new Tone.Filter({ type: 'bandpass', frequency: 10000, Q: 1 });
        const midVCA = new Tone.Gain(0);
        // High band: 8kHz highpass, short decay
        const highFilter = new Tone.Filter({ type: 'highpass', frequency: 8000, Q: 1 });
        const highVCA = new Tone.Gain(0);

        oscMix.connect(lowFilter);
        oscMix.connect(midFilter);
        oscMix.connect(highFilter);

        lowFilter.connect(lowVCA);
        midFilter.connect(midVCA);
        highFilter.connect(highVCA);

        const output = new Tone.Gain(1);
        lowVCA.connect(output);
        midVCA.connect(output);
        highVCA.connect(output);

        // Calculate envelope amounts based on tone parameter
        const lowEnvAmt = 0.666 - (cymbalConfig.tone / 100) * 0.666;
        const midEnvAmt = 0.333;
        const highEnvAmt = 0.666 - (1 - cymbalConfig.tone / 100) * 0.666;

        return {
          triggerAttackRelease: (_note: string, _duration: number, time?: number, velocity?: number) => {
            const t = time ?? Tone.now();
            const vel = velocity ?? 1;
            // Low band: longest decay (variable based on config)
            lowVCA.gain.cancelScheduledValues(t);
            lowVCA.gain.setValueAtTime(0.001, t);
            lowVCA.gain.exponentialRampToValueAtTime(lowEnvAmt * vel, t + 0.01);
            lowVCA.gain.exponentialRampToValueAtTime(0.001, t + cymbalConfig.decay / 1000);
            // Mid band: medium decay (400ms)
            midVCA.gain.cancelScheduledValues(t);
            midVCA.gain.setValueAtTime(0.001, t);
            midVCA.gain.exponentialRampToValueAtTime(midEnvAmt * vel, t + 0.01);
            midVCA.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
            // High band: short decay (150ms)
            highVCA.gain.cancelScheduledValues(t);
            highVCA.gain.setValueAtTime(0.001, t);
            highVCA.gain.exponentialRampToValueAtTime(highEnvAmt * vel, t + 0.01);
            highVCA.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          },
          triggerAttack: (_note: string, time?: number, velocity?: number) => {
            const t = time ?? Tone.now();
            const vel = velocity ?? 1;
            lowVCA.gain.cancelScheduledValues(t);
            lowVCA.gain.setValueAtTime(0.001, t);
            lowVCA.gain.exponentialRampToValueAtTime(lowEnvAmt * vel, t + 0.01);
            lowVCA.gain.exponentialRampToValueAtTime(0.001, t + cymbalConfig.decay / 1000);
            midVCA.gain.cancelScheduledValues(t);
            midVCA.gain.setValueAtTime(0.001, t);
            midVCA.gain.exponentialRampToValueAtTime(midEnvAmt * vel, t + 0.01);
            midVCA.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
            highVCA.gain.cancelScheduledValues(t);
            highVCA.gain.setValueAtTime(0.001, t);
            highVCA.gain.exponentialRampToValueAtTime(highEnvAmt * vel, t + 0.01);
            highVCA.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          },
          triggerRelease: (_note: string, _time?: number) => { /* one-shot */ },
          releaseAll: () => { /* one-shot */ },
          connect: (dest: Tone.InputNode) => output.connect(dest),
          disconnect: () => output.disconnect(),
          dispose: () => {
            oscillators.forEach(osc => {
              osc.stop();
              osc.dispose();
            });
            oscMix.dispose();
            lowFilter.dispose();
            midFilter.dispose();
            highFilter.dispose();
            lowVCA.dispose();
            midVCA.dispose();
            highVCA.dispose();
            output.dispose();
          },
          applyConfig: (newConfig: any) => {
            // Cymbal parameters primarily affect triggerAttack, but we can store them
            // or update relevant static params here if needed.
            // For now, since most logic is in trigger, we just ensure it doesn't crash.
          },
          volume: output.gain,
        } as any;
      }

      default:
        // Default to 808/909-style kick
        return new Tone.MembraneSynth({
          pitchDecay: 0.05,
          octaves: 3,
          envelope: {
            attack: 0.001,
            decay: 0.3,
            sustain: 0,
            release: 0.1,
          },
          volume: config.volume || -12,
        });
    }
  }

  /**
   * ChipSynth - 8-bit video game console sounds
   * Uses square/triangle waves with bit crushing for authentic lo-fi character
   * Now includes integrated ArpeggioEngine for true chiptune-style arpeggios
   */
  private static createChipSynth(config: InstrumentConfig): Tone.ToneAudioNode {
    const chipConfig = config.chipSynth || DEFAULT_CHIP_SYNTH;
    const arpeggioConfig = chipConfig.arpeggio;

    // Create base oscillator based on channel type
    // Note: 'pulse' channels use 'square' since Tone.Synth doesn't support pulse width
    let oscillatorType: 'square' | 'triangle' = 'square';
    if (chipConfig.channel === 'triangle') {
      oscillatorType = 'triangle';
    }

    if (chipConfig.channel === 'noise') {
      // Noise channel uses NoiseSynth
      const noise = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: {
          attack: chipConfig.envelope.attack / 1000,
          decay: chipConfig.envelope.decay / 1000,
          sustain: chipConfig.envelope.sustain / 100,
          release: chipConfig.envelope.release / 1000,
        },
        volume: config.volume || -12,
      });

      // Add bit crusher for 8-bit sound
      const bitCrusher = new Tone.BitCrusher({
        bits: chipConfig.bitDepth,
        wet: 1,
      });
      noise.connect(bitCrusher);

      return {
        triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
          noise.triggerAttackRelease(duration, time, velocity);
        },
        triggerAttack: (_note: string, time?: number, velocity?: number) => {
          noise.triggerAttack(time, velocity);
        },
        triggerRelease: (_note: string, time?: number) => {
          noise.triggerRelease(time);
        },
        releaseAll: () => {
          // NoiseSynth doesn't have releaseAll, just release current note
          try { noise.triggerRelease(); } catch { /* ignore */ }
        },
        connect: (dest: Tone.InputNode) => bitCrusher.connect(dest),
        disconnect: () => bitCrusher.disconnect(),
        dispose: () => {
          noise.dispose();
          bitCrusher.dispose();
        },
        applyConfig: (newConfig: any) => {
          const csc = newConfig || DEFAULT_CHIP_SYNTH;
          noise.set({
            envelope: {
              attack: csc.envelope.attack / 1000,
              decay: csc.envelope.decay / 1000,
              sustain: csc.envelope.sustain / 100,
              release: csc.envelope.release / 1000,
            }
          });
          bitCrusher.bits = csc.bitDepth;
        },
        volume: noise.volume,
      } as any;
    }

    // Square/Triangle channels
    const synth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 8,
      oscillator: {
        type: oscillatorType,
      },
      envelope: {
        attack: chipConfig.envelope.attack / 1000,
        decay: chipConfig.envelope.decay / 1000,
        sustain: chipConfig.envelope.sustain / 100,
        release: chipConfig.envelope.release / 1000,
      },
      volume: config.volume || -12,
    });

    // Add bit crusher for 8-bit character
    const bitCrusher = new Tone.BitCrusher({
      bits: chipConfig.bitDepth,
      wet: 1,
    });
    synth.connect(bitCrusher);

    // Create ArpeggioEngine only if arpeggio is ENABLED (not just configured)
    let arpeggioEngine: InstanceType<typeof ArpeggioEngine> | null = null;
    let lastArpNote: string | null = null;

    if (arpeggioConfig?.enabled) {
      arpeggioEngine = new ArpeggioEngine({
        config: arpeggioConfig,
        onNoteOn: (note: string, velocity: number, duration: number, scheduledTime: number) => {
          // Release last arpeggio note before playing new one - use scheduled time for tight timing
          if (lastArpNote) {
            synth.triggerRelease(lastArpNote, scheduledTime);
          }
          synth.triggerAttackRelease(note, duration, scheduledTime, velocity);
          lastArpNote = note;
        },
        onNoteOff: (note: string, scheduledTime: number) => {
          synth.triggerRelease(note, scheduledTime);
          if (lastArpNote === note) {
            lastArpNote = null;
          }
        },
      });
    }

    // Wrapper object with arpeggio support
    const chipSynthWrapper = {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        if (arpeggioEngine && arpeggioConfig?.enabled) {
          // Start arpeggiator instead of direct note
          arpeggioEngine.start(note, velocity ?? 1);
          // Schedule stop after duration
          if (duration && typeof duration === 'number') {
            const stopTime = (time ?? Tone.now()) + duration;
            Tone.getTransport().scheduleOnce(() => {
              arpeggioEngine.stop(note);
            }, stopTime);
          }
        } else {
          synth.triggerAttackRelease(note, duration, time, velocity);
        }
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        if (arpeggioEngine && arpeggioConfig?.enabled) {
          arpeggioEngine.start(note, velocity ?? 1);
        } else {
          synth.triggerAttack(note, time, velocity);
        }
      },
      triggerRelease: (note: string, time?: number) => {
        if (arpeggioEngine && arpeggioConfig?.enabled) {
          arpeggioEngine.stop(note);
        } else {
          synth.triggerRelease(note, time);
        }
      },
      releaseAll: () => {
        if (arpeggioEngine) {
          arpeggioEngine.stopAll();
        }
        synth.releaseAll();
        lastArpNote = null;
      },
      connect: (dest: Tone.InputNode) => bitCrusher.connect(dest),
      disconnect: () => bitCrusher.disconnect(),
      dispose: () => {
        if (arpeggioEngine) {
          arpeggioEngine.dispose();
        }
        synth.dispose();
        bitCrusher.dispose();
      },
      applyConfig: (newConfig: any) => {
        const csc = newConfig || DEFAULT_CHIP_SYNTH;
        synth.set({
          envelope: {
            attack: csc.envelope.attack / 1000,
            decay: csc.envelope.decay / 1000,
            sustain: csc.envelope.sustain / 100,
            release: csc.envelope.release / 1000,
          }
        });
        bitCrusher.bits = csc.bitDepth;
      },
      volume: synth.volume,
      // Expose methods for real-time arpeggio updates
      updateArpeggio: (newConfig: typeof arpeggioConfig) => {
        if (arpeggioEngine && newConfig) {
          arpeggioEngine.updateConfig(newConfig);
        }
      },
      getArpeggioEngine: () => arpeggioEngine,
      getCurrentArpeggioStep: () => arpeggioEngine?.getCurrentStep() ?? 0,
      isArpeggioPlaying: () => arpeggioEngine?.getIsPlaying() ?? false,
    };

    return chipSynthWrapper as any;
  }

  private static createFurnace(config: InstrumentConfig): FurnaceSynth {
    if (!config.furnace) {
      throw new Error('Furnace config required for Furnace synth type');
    }
    return new FurnaceSynth(config.furnace);
  }

  private static createBuzzmachine(config: InstrumentConfig): BuzzmachineGenerator {
    // Get machine type from config or default to ArguruDistortion
    const machineTypeStr = config.buzzmachine?.machineType || 'ArguruDistortion';

    // Map string machine type to BuzzmachineType enum
    const machineTypeMap: Record<string, BuzzmachineType> = {
      // Distortion/Saturation
      'ArguruDistortion': BuzzmachineType.ARGURU_DISTORTION,
      'ElakDist2': BuzzmachineType.ELAK_DIST2,
      'JeskolaDistortion': BuzzmachineType.JESKOLA_DISTORTION,
      'GeonikOverdrive': BuzzmachineType.GEONIK_OVERDRIVE,
      'GraueSoftSat': BuzzmachineType.GRAUE_SOFTSAT,
      'WhiteNoiseStereoDist': BuzzmachineType.WHITENOISE_STEREODIST,
      // Filters
      'ElakSVF': BuzzmachineType.ELAK_SVF,
      'CyanPhaseNotch': BuzzmachineType.CYANPHASE_NOTCH,
      'QZfilter': BuzzmachineType.Q_ZFILTER,
      'FSMPhilta': BuzzmachineType.FSM_PHILTA,
      // Delay/Reverb
      'JeskolaDelay': BuzzmachineType.JESKOLA_DELAY,
      'JeskolaCrossDelay': BuzzmachineType.JESKOLA_CROSSDELAY,
      'JeskolaFreeverb': BuzzmachineType.JESKOLA_FREEVERB,
      'FSMPanzerDelay': BuzzmachineType.FSM_PANZERDELAY,
      // Chorus/Modulation
      'FSMChorus': BuzzmachineType.FSM_CHORUS,
      'FSMChorus2': BuzzmachineType.FSM_CHORUS2,
      'WhiteNoiseWhiteChorus': BuzzmachineType.WHITENOISE_WHITECHORUS,
      'BigyoFrequencyShifter': BuzzmachineType.BIGYO_FREQUENCYSHIFTER,
      // Dynamics
      'GeonikCompressor': BuzzmachineType.GEONIK_COMPRESSOR,
      'LdSLimit': BuzzmachineType.LD_SLIMIT,
      'OomekExciter': BuzzmachineType.OOMEK_EXCITER,
      'OomekMasterizer': BuzzmachineType.OOMEK_MASTERIZER,
      'DedaCodeStereoGain': BuzzmachineType.DEDACODE_STEREOGAIN,
      // Generators
      'FSMKick': BuzzmachineType.FSM_KICK,
      'FSMKickXP': BuzzmachineType.FSM_KICKXP,
      'JeskolaTrilok': BuzzmachineType.JESKOLA_TRILOK,
      'JeskolaNoise': BuzzmachineType.JESKOLA_NOISE,
      'OomekAggressor': BuzzmachineType.OOMEK_AGGRESSOR,
      'MadBrain4FM2F': BuzzmachineType.MADBRAIN_4FM2F,
      'MadBrainDynamite6': BuzzmachineType.MADBRAIN_DYNAMITE6,
      'MakkM3': BuzzmachineType.MAKK_M3,
      'CyanPhaseDTMF': BuzzmachineType.CYANPHASE_DTMF,
      'ElenzilFrequencyBomb': BuzzmachineType.ELENZIL_FREQUENCYBOMB,
    };

    const machineType = machineTypeMap[machineTypeStr] ?? BuzzmachineType.ARGURU_DISTORTION;
    return new BuzzmachineGenerator(machineType);
  }


  /**
   * Chip-specific default configs for different Furnace chip types
   * These provide characteristic sounds for each chip family
   */
  private static readonly CHIP_DEFAULTS: Record<number, Partial<import('@typedefs/instrument').FurnaceConfig>> = {
    // FM Chips - use 4-operator FM synthesis
    // FurnaceChipType: OPN2=0, OPM=1, OPL3=2, OPLL=11, etc.
    0: { // OPN2 (Genesis) - punchy bass
      algorithm: 4, feedback: 5,
      operators: [
        { enabled: true, mult: 1, tl: 20, ar: 31, dr: 8, d2r: 0, sl: 2, rr: 8, dt: 0, am: false },
        { enabled: true, mult: 2, tl: 30, ar: 31, dr: 12, d2r: 0, sl: 4, rr: 6, dt: 3, am: false },
        { enabled: true, mult: 1, tl: 25, ar: 31, dr: 10, d2r: 0, sl: 3, rr: 8, dt: 0, am: false },
        { enabled: true, mult: 4, tl: 35, ar: 28, dr: 15, d2r: 0, sl: 5, rr: 10, dt: -1, am: false },
      ],
    },
    1: { // OPM (X68000) - bright lead
      algorithm: 5, feedback: 6,
      operators: [
        { enabled: true, mult: 1, tl: 15, ar: 31, dr: 5, d2r: 0, sl: 1, rr: 6, dt: 0, am: false },
        { enabled: true, mult: 3, tl: 40, ar: 31, dr: 8, d2r: 0, sl: 3, rr: 8, dt: 2, am: false },
        { enabled: true, mult: 2, tl: 35, ar: 31, dr: 10, d2r: 0, sl: 4, rr: 8, dt: -2, am: false },
        { enabled: true, mult: 1, tl: 25, ar: 31, dr: 12, d2r: 0, sl: 5, rr: 10, dt: 0, am: true },
      ],
    },
    2: { // OPL3 (AdLib) - organ-like
      algorithm: 0, feedback: 3,
      operators: [
        { enabled: true, mult: 2, tl: 30, ar: 15, dr: 4, d2r: 0, sl: 8, rr: 5, dt: 0, ws: 1, am: false },
        { enabled: true, mult: 1, tl: 0, ar: 15, dr: 2, d2r: 0, sl: 4, rr: 8, dt: 0, ws: 0, am: false },
        { enabled: false, mult: 1, tl: 63, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, ws: 0, am: false },
        { enabled: false, mult: 1, tl: 63, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, ws: 0, am: false },
      ],
    },
    11: { // OPLL - simple FM
      algorithm: 0, feedback: 2,
      operators: [
        { enabled: true, mult: 4, tl: 35, ar: 15, dr: 5, d2r: 0, sl: 6, rr: 7, dt: 0, am: false },
        { enabled: true, mult: 1, tl: 0, ar: 15, dr: 3, d2r: 0, sl: 3, rr: 6, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 63, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 63, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      ],
    },
    // Console chips - PSG style, use simpler synthesis
    4: { // NES (2A03) - 8-bit pulse
      algorithm: 7, feedback: 0,
      operators: [
        { enabled: true, mult: 1, tl: 0, ar: 31, dr: 0, d2r: 0, sl: 0, rr: 12, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      ],
    },
    5: { // Game Boy - lo-fi pulse
      algorithm: 7, feedback: 0,
      operators: [
        { enabled: true, mult: 1, tl: 5, ar: 28, dr: 2, d2r: 0, sl: 2, rr: 10, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      ],
    },
    3: { // PSG (SN76489) - square wave
      algorithm: 7, feedback: 0,
      operators: [
        { enabled: true, mult: 1, tl: 8, ar: 31, dr: 4, d2r: 0, sl: 3, rr: 8, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      ],
    },
    12: { // AY-3-8910 - buzzy PSG
      algorithm: 7, feedback: 1,
      operators: [
        { enabled: true, mult: 1, tl: 10, ar: 31, dr: 6, d2r: 2, sl: 4, rr: 6, dt: 0, am: false },
        { enabled: true, mult: 3, tl: 50, ar: 31, dr: 8, d2r: 0, sl: 8, rr: 10, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      ],
    },
    10: { // C64 SID - gritty
      algorithm: 4, feedback: 4,
      operators: [
        { enabled: true, mult: 1, tl: 15, ar: 25, dr: 8, d2r: 3, sl: 5, rr: 8, dt: 0, am: false },
        { enabled: true, mult: 2, tl: 35, ar: 31, dr: 10, d2r: 0, sl: 6, rr: 10, dt: 1, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      ],
    },
    6: { // PCE/TurboGrafx - wavetable style
      algorithm: 6, feedback: 2,
      operators: [
        { enabled: true, mult: 1, tl: 12, ar: 31, dr: 5, d2r: 0, sl: 2, rr: 8, dt: 0, am: false },
        { enabled: true, mult: 2, tl: 40, ar: 31, dr: 8, d2r: 0, sl: 4, rr: 10, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      ],
    },
    9: { // VRC6 - rich pulse
      algorithm: 5, feedback: 0,
      operators: [
        { enabled: true, mult: 1, tl: 5, ar: 31, dr: 3, d2r: 0, sl: 1, rr: 10, dt: 0, am: false },
        { enabled: true, mult: 2, tl: 30, ar: 31, dr: 6, d2r: 0, sl: 3, rr: 12, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      ],
    },
    8: { // N163 - wavetable
      algorithm: 7, feedback: 0,
      operators: [
        { enabled: true, mult: 1, tl: 8, ar: 31, dr: 4, d2r: 0, sl: 2, rr: 8, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      ],
      wavetables: [{ id: 0, data: [8,10,12,14,15,14,12,10,8,6,4,2,1,2,4,6] }],
    },
    15: { // TIA (Atari 2600) - harsh
      algorithm: 7, feedback: 7,
      operators: [
        { enabled: true, mult: 1, tl: 20, ar: 31, dr: 15, d2r: 5, sl: 8, rr: 4, dt: 0, am: false },
        { enabled: true, mult: 5, tl: 45, ar: 31, dr: 20, d2r: 0, sl: 10, rr: 6, dt: 2, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      ],
    },
  };

  /**
   * Create Furnace synth with specific chip type
   * Used for the individual chip type synths (FurnaceOPN, FurnaceNES, etc.)
   */
  private static createFurnaceWithChip(config: InstrumentConfig, chipType: number): FurnaceSynth {
    // Get chip-specific defaults or fall back to generic FM
    const chipDefaults = this.CHIP_DEFAULTS[chipType] || {
      algorithm: 0, feedback: 0,
      operators: [
        { enabled: true, mult: 1, tl: 0, ar: 31, dr: 0, d2r: 0, sl: 0, rr: 15, dt: 0, am: false },
        { enabled: true, mult: 2, tl: 40, ar: 31, dr: 10, d2r: 5, sl: 8, rr: 8, dt: 0, am: false },
        { enabled: true, mult: 1, tl: 40, ar: 31, dr: 10, d2r: 5, sl: 8, rr: 8, dt: 0, am: false },
        { enabled: true, mult: 1, tl: 20, ar: 31, dr: 15, d2r: 0, sl: 4, rr: 10, dt: 0, am: false },
      ],
    };

    const baseConfig = config.furnace || {
      algorithm: chipDefaults.algorithm ?? 0,
      feedback: chipDefaults.feedback ?? 0,
      operators: chipDefaults.operators || [],
      macros: [],
      opMacros: [],
      wavetables: chipDefaults.wavetables || [],
    };
    // Create new object with overridden chip type (to avoid mutating frozen presets)
    const furnaceConfig = {
      ...baseConfig,
      chipType,
    };
    return new FurnaceSynth(furnaceConfig);
  }
  /**
   * PWMSynth - Pulse width modulation synth
   * Uses square wave with vibrato to simulate PWM effect
   * Note: True PWM would require custom oscillator implementation
   */
  private static createPWMSynth(config: InstrumentConfig): Tone.ToneAudioNode {
    const pwmConfig = config.pwmSynth || DEFAULT_PWM_SYNTH;

    // Use square wave (Tone.Synth doesn't support true pulse width control)
    const synth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 8,
      oscillator: {
        type: 'square',
      },
      envelope: {
        attack: pwmConfig.envelope.attack / 1000,
        decay: pwmConfig.envelope.decay / 1000,
        sustain: pwmConfig.envelope.sustain / 100,
        release: pwmConfig.envelope.release / 1000,
      },
      volume: config.volume || -12,
    });

    // Add filter
    const filter = new Tone.Filter({
      type: pwmConfig.filter.type,
      frequency: pwmConfig.filter.cutoff,
      Q: pwmConfig.filter.resonance / 10,
      rolloff: -24,
    });

    // Add chorus to simulate PWM modulation effect (richer than vibrato)
    const chorus = new Tone.Chorus({
      frequency: pwmConfig.pwmRate,
      delayTime: 2,
      depth: pwmConfig.pwmDepth / 100,
      wet: 0.6,
    });
    chorus.start();

    synth.connect(filter);
    filter.connect(chorus);

    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        synth.triggerAttackRelease(note, duration, time, velocity);
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        synth.triggerAttack(note, time, velocity);
      },
      triggerRelease: (note: string, time?: number) => {
        synth.triggerRelease(note, time);
      },
      releaseAll: () => synth.releaseAll(),
      connect: (dest: Tone.InputNode) => chorus.connect(dest),
      disconnect: () => chorus.disconnect(),
      dispose: () => {
        synth.dispose();
        filter.dispose();
        chorus.dispose();
      },
      applyConfig: (newConfig: any) => {
        const pc = newConfig || DEFAULT_PWM_SYNTH;
        synth.set({
          envelope: {
            attack: pc.envelope.attack / 1000,
            decay: pc.envelope.decay / 1000,
            sustain: pc.envelope.sustain / 100,
            release: pc.envelope.release / 1000,
          }
        });
        filter.set({
          type: pc.filter.type,
          frequency: pc.filter.cutoff,
          Q: pc.filter.resonance / 10,
        });
        chorus.set({
          frequency: pc.pwmRate,
          depth: pc.pwmDepth / 100,
        });
      },
      volume: synth.volume,
    } as any;
  }

  /**
   * StringMachine - Vintage ensemble strings (Solina-style)
   */
  private static createStringMachine(config: InstrumentConfig): Tone.ToneAudioNode {
    const strConfig = config.stringMachine || DEFAULT_STRING_MACHINE;

    // Create polyphonic sawtooth synth
    const synth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 8,
      oscillator: {
        type: 'sawtooth',
      },
      envelope: {
        attack: strConfig.attack / 1000,
        decay: 0.2,
        sustain: 0.9,
        release: strConfig.release / 1000,
      },
      volume: config.volume || -12,
    });

    // Rich chorus effect for ensemble character
    const chorus = new Tone.Chorus({
      frequency: strConfig.ensemble.rate,
      delayTime: 3.5,
      depth: strConfig.ensemble.depth / 100,
      wet: 0.8,
    });
    chorus.start();

    // Low-pass filter for warmth
    const filter = new Tone.Filter({
      type: 'lowpass',
      frequency: 2000 + (strConfig.brightness * 80),
      Q: 0.5,
      rolloff: -12,
    });

    synth.connect(filter);
    filter.connect(chorus);

    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        synth.triggerAttackRelease(note, duration, time, velocity);
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        synth.triggerAttack(note, time, velocity);
      },
      triggerRelease: (note: string, time?: number) => {
        synth.triggerRelease(note, time);
      },
      releaseAll: () => synth.releaseAll(),
      connect: (dest: Tone.InputNode) => chorus.connect(dest),
      disconnect: () => chorus.disconnect(),
      dispose: () => {
        synth.dispose();
        chorus.dispose();
        filter.dispose();
      },
      applyConfig: (newConfig: any) => {
        const sc = newConfig || DEFAULT_STRING_MACHINE;
        synth.set({
          envelope: {
            attack: sc.attack / 1000,
            release: sc.release / 1000,
          }
        });
        chorus.set({
          frequency: sc.ensemble.rate,
          depth: sc.ensemble.depth / 100,
        });
        filter.frequency.rampTo(2000 + (sc.brightness * 80), 0.1);
      },
      volume: synth.volume,
    } as any;
  }

  /**
   * FormantSynth - Vowel synthesis using parallel bandpass filters
   */
  private static createFormantSynth(config: InstrumentConfig): Tone.ToneAudioNode {
    const fmtConfig = config.formantSynth || DEFAULT_FORMANT_SYNTH;
    const formants = VOWEL_FORMANTS[fmtConfig.vowel];

    // Create source oscillator
    const synth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 8,
      oscillator: {
        type: fmtConfig.oscillator.type,
      },
      envelope: {
        attack: fmtConfig.envelope.attack / 1000,
        decay: fmtConfig.envelope.decay / 1000,
        sustain: fmtConfig.envelope.sustain / 100,
        release: fmtConfig.envelope.release / 1000,
      },
      volume: config.volume ?? 0, // Boost - formants cut a lot of signal
    });

    // Create 3 parallel bandpass filters for formants with lower Q for more output
    const f1 = new Tone.Filter({
      type: 'bandpass',
      frequency: formants.f1,
      Q: 3,
    });
    const f2 = new Tone.Filter({
      type: 'bandpass',
      frequency: formants.f2,
      Q: 3,
    });
    const f3 = new Tone.Filter({
      type: 'bandpass',
      frequency: formants.f3,
      Q: 3,
    });

    // Mix formants together with boost
    const output = new Tone.Gain(2);

    synth.connect(f1);
    synth.connect(f2);
    synth.connect(f3);
    f1.connect(output);
    f2.connect(output);
    f3.connect(output);

    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        synth.triggerAttackRelease(note, duration, time, velocity);
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        synth.triggerAttack(note, time, velocity);
      },
      triggerRelease: (note: string, time?: number) => {
        synth.triggerRelease(note, time);
      },
      releaseAll: () => synth.releaseAll(),
      connect: (dest: Tone.InputNode) => output.connect(dest),
      disconnect: () => output.disconnect(),
      dispose: () => {
        synth.dispose();
        f1.dispose();
        f2.dispose();
        f3.dispose();
        output.dispose();
      },
      applyConfig: (newConfig: any) => {
        const fc = newConfig || DEFAULT_FORMANT_SYNTH;
        const formants = VOWEL_FORMANTS[fc.vowel];
        
        synth.set({
          envelope: {
            attack: fc.envelope.attack / 1000,
            decay: fc.envelope.decay / 1000,
            sustain: fc.envelope.sustain / 100,
            release: fc.envelope.release / 1000,
          }
        });
        f1.frequency.rampTo(formants.f1, 0.1);
        f2.frequency.rampTo(formants.f2, 0.1);
        f3.frequency.rampTo(formants.f3, 0.1);
      },
      volume: synth.volume,
    } as any;
  }

  /**
   * WobbleBass - Dedicated bass synth for dubstep, DnB, jungle
   * Features: dual oscillators, FM, Reese detuning, wobble LFO, distortion, formant growl
   */
  private static createWobbleBass(config: InstrumentConfig): Tone.ToneAudioNode {
    const wbConfig = config.wobbleBass || DEFAULT_WOBBLE_BASS;
    console.log('[WobbleBass] Creating with config:', {
      hasWobbleBass: !!config.wobbleBass,
      envelope: wbConfig.envelope,
      osc1: wbConfig.osc1,
      filter: wbConfig.filter,
      configVolume: config.volume,
    });
    console.log('[WobbleBass] Creating with config:', {
      hasWobbleBass: !!config.wobbleBass,
      envelope: wbConfig.envelope,
      osc1: wbConfig.osc1,
      filter: wbConfig.filter,
      configVolume: config.volume,
    });
    console.log('[WobbleBass] Creating with config:', {
      hasWobbleBass: !!config.wobbleBass,
      envelope: wbConfig.envelope,
      osc1: wbConfig.osc1,
      filter: wbConfig.filter,
      configVolume: config.volume,
    });

    // === OSCILLATOR SECTION ===
    // Create dual oscillators with unison
    const voiceCount = Math.max(1, wbConfig.unison.voices);
    const detuneSpread = wbConfig.unison.detune;

    // Main oscillator 1 (with unison)
    const osc1 = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 8,
      oscillator: {
        type: wbConfig.osc1.type,
      },
      envelope: {
        attack: wbConfig.envelope.attack / 1000,
        decay: wbConfig.envelope.decay / 1000,
        sustain: wbConfig.envelope.sustain / 100,
        release: wbConfig.envelope.release / 1000,
      },
      volume: -6 + (wbConfig.osc1.level / 100) * 6 - 6,
    });

    // Main oscillator 2 (slightly detuned for Reese)
    const osc2 = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 8,
      oscillator: {
        type: wbConfig.osc2.type,
      },
      envelope: {
        attack: wbConfig.envelope.attack / 1000,
        decay: wbConfig.envelope.decay / 1000,
        sustain: wbConfig.envelope.sustain / 100,
        release: wbConfig.envelope.release / 1000,
      },
      volume: -6 + (wbConfig.osc2.level / 100) * 6 - 6,
    });

    // Set octave offsets via detune (1200 cents = 1 octave)
    osc1.set({ detune: wbConfig.osc1.octave * 1200 + wbConfig.osc1.detune });
    osc2.set({ detune: wbConfig.osc2.octave * 1200 + wbConfig.osc2.detune });

    // Sub oscillator (clean sine for solid low end)
    let subOsc: Tone.PolySynth | null = null;
    if (wbConfig.sub.enabled) {
      subOsc = new Tone.PolySynth(Tone.Synth, {
        maxPolyphony: 8,
        oscillator: { type: 'sine' },
        envelope: {
          attack: wbConfig.envelope.attack / 1000,
          decay: wbConfig.envelope.decay / 1000,
          sustain: wbConfig.envelope.sustain / 100,
          release: wbConfig.envelope.release / 1000,
        },
        volume: -12 + (wbConfig.sub.level / 100) * 12 - 6,
      });
      subOsc.set({ detune: wbConfig.sub.octave * 1200 });
    }

    // === UNISON SPREAD ===
    // Create additional detuned voices for thickness
    const unisonVoices: Tone.PolySynth[] = [];
    const unisonPanners: Tone.Panner[] = [];
    if (voiceCount > 1) {
      for (let i = 1; i < Math.min(voiceCount, 8); i++) {
        const detuneAmount = ((i / voiceCount) - 0.5) * detuneSpread * 2;
        const panAmount = ((i / voiceCount) - 0.5) * (wbConfig.unison.stereoSpread / 50);

        const voice = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: 4,
          oscillator: { type: wbConfig.osc1.type },
          envelope: {
            attack: wbConfig.envelope.attack / 1000,
            decay: wbConfig.envelope.decay / 1000,
            sustain: wbConfig.envelope.sustain / 100,
            release: wbConfig.envelope.release / 1000,
          },
          volume: -12 - (voiceCount * 1.5),
        });
        voice.set({ detune: wbConfig.osc1.octave * 1200 + detuneAmount });

        const panner = new Tone.Panner(panAmount);
        voice.connect(panner);
        unisonVoices.push(voice);
        unisonPanners.push(panner);
      }
    }

    // === FM SECTION ===
    // Optional FM modulation between oscillators
    let fmSynth: Tone.PolySynth | null = null;
    if (wbConfig.fm.enabled && wbConfig.fm.amount > 0) {
      fmSynth = new Tone.PolySynth(Tone.FMSynth, {
        maxPolyphony: 8,
        modulationIndex: wbConfig.fm.amount / 10,
        harmonicity: wbConfig.fm.ratio,
        envelope: {
          attack: wbConfig.envelope.attack / 1000,
          decay: wbConfig.envelope.decay / 1000,
          sustain: wbConfig.envelope.sustain / 100,
          release: wbConfig.envelope.release / 1000,
        },
        volume: -6,
      });
      fmSynth.set({ detune: wbConfig.osc1.octave * 1200 });
    }

    // === MIXER ===
    const oscMixer = new Tone.Gain(1);

    // === FILTER SECTION ===
    const filter = new Tone.Filter({
      type: wbConfig.filter.type,
      frequency: wbConfig.filter.cutoff,
      Q: wbConfig.filter.resonance / 10,
      rolloff: wbConfig.filter.rolloff,
    });

    // Filter drive/saturation
    let filterDrive: Tone.Distortion | null = null;
    if (wbConfig.filter.drive > 0) {
      filterDrive = new Tone.Distortion({
        distortion: wbConfig.filter.drive / 100,
        oversample: '2x',
      });
    }

    // === FILTER ENVELOPE ===
    const filterEnvAmount = wbConfig.filterEnvelope.amount / 100;
    const filterBaseFreq = wbConfig.filter.cutoff;
    const filterEnvOctaves = Math.abs(filterEnvAmount) * 4; // Max 4 octaves sweep

    // Use FrequencyEnvelope for filter envelope modulation
    const filterEnv = new Tone.FrequencyEnvelope({
      baseFrequency: filterBaseFreq,
      octaves: filterEnvOctaves,
      attack: wbConfig.filterEnvelope.attack / 1000,
      decay: wbConfig.filterEnvelope.decay / 1000,
      sustain: wbConfig.filterEnvelope.sustain / 100,
      release: wbConfig.filterEnvelope.release / 1000,
    });

    // Connect filter envelope to filter frequency (only if LFO not taking over)
    if (!wbConfig.wobbleLFO.enabled || wbConfig.filterEnvelope.amount > 0) {
      filterEnv.connect(filter.frequency);
    }

    // === WOBBLE LFO ===
    let wobbleLFO: Tone.LFO | null = null;

    if (wbConfig.wobbleLFO.enabled) {
      // Calculate LFO rate from sync value
      let lfoRate = wbConfig.wobbleLFO.rate;
      if (wbConfig.wobbleLFO.sync !== 'free') {
        // Convert sync division to rate based on current BPM
        const bpm = Tone.getTransport().bpm.value || 120;
        const syncMap: Record<string, number> = {
          '1/1': 1,
          '1/2': 2,
          '1/2T': 3,
          '1/2D': 1.5,
          '1/4': 4,
          '1/4T': 6,
          '1/4D': 3,
          '1/8': 8,
          '1/8T': 12,
          '1/8D': 6,
          '1/16': 16,
          '1/16T': 24,
          '1/16D': 12,
          '1/32': 32,
          '1/32T': 48,
        };
        const divisor = syncMap[wbConfig.wobbleLFO.sync] || 4;
        lfoRate = (bpm / 60) * (divisor / 4);
      }

      // Map shape to Tone.js type
      const shapeMap: Record<string, Tone.ToneOscillatorType> = {
        'sine': 'sine',
        'triangle': 'triangle',
        'saw': 'sawtooth',
        'square': 'square',
        'sample_hold': 'square', // Closest approximation
      };

      // Calculate filter modulation range based on amount
      const filterModRange = filterBaseFreq * 4; // 4 octaves max range
      const minFreq = Math.max(20, filterBaseFreq * 0.1);
      const maxFreq = Math.min(20000, filterBaseFreq + (filterModRange * (wbConfig.wobbleLFO.amount / 100)));

      wobbleLFO = new Tone.LFO({
        frequency: lfoRate,
        type: shapeMap[wbConfig.wobbleLFO.shape] || 'sine',
        min: minFreq,
        max: maxFreq,
        phase: wbConfig.wobbleLFO.phase,
      });

      wobbleLFO.connect(filter.frequency);
      wobbleLFO.start();
    }

    // === DISTORTION SECTION ===
    let distortion: Tone.ToneAudioNode | null = null;
    if (wbConfig.distortion.enabled) {
      switch (wbConfig.distortion.type) {
        case 'soft':
          distortion = new Tone.Distortion({
            distortion: wbConfig.distortion.drive / 100,
            oversample: '2x',
          });
          break;
        case 'hard':
          distortion = new Tone.Chebyshev({
            order: Math.floor(1 + (wbConfig.distortion.drive / 100) * 50),
          });
          break;
        case 'fuzz':
          distortion = new Tone.Distortion({
            distortion: 0.5 + (wbConfig.distortion.drive / 200),
            oversample: '4x',
          });
          break;
        case 'bitcrush':
          distortion = new Tone.BitCrusher({
            bits: Math.max(2, 12 - Math.floor(wbConfig.distortion.drive / 10)),
          });
          break;
      }
    }

    // Post-distortion tone control
    const toneFilter = new Tone.Filter({
      type: 'lowpass',
      frequency: 500 + (wbConfig.distortion.tone / 100) * 15000,
      Q: 0.5,
    });

    // === FORMANT SECTION (for growl) ===
    let formantFilters: Tone.Filter[] = [];
    let formantMixer: Tone.Gain | null = null;
    if (wbConfig.formant.enabled) {
      const formants = VOWEL_FORMANTS[wbConfig.formant.vowel];
      formantFilters = [
        new Tone.Filter({ type: 'bandpass', frequency: formants.f1, Q: 5 }),
        new Tone.Filter({ type: 'bandpass', frequency: formants.f2, Q: 5 }),
        new Tone.Filter({ type: 'bandpass', frequency: formants.f3, Q: 5 }),
      ];
      formantMixer = new Tone.Gain(0.5);
    }

    // === OUTPUT ===
    const output = new Tone.Gain(1);
    output.gain.value = Math.pow(10, (config.volume ?? -6) / 20);

    // === SIGNAL CHAIN ===
    // Route oscillators through mixer
    osc1.connect(oscMixer);
    osc2.connect(oscMixer);
    if (subOsc) subOsc.connect(oscMixer);
    if (fmSynth) fmSynth.connect(oscMixer);
    // Connect unison panners (voices already connected to their panners)
    unisonPanners.forEach(p => p.connect(oscMixer));

    // Route through filter chain
    if (filterDrive) {
      oscMixer.connect(filterDrive);
      filterDrive.connect(filter);
    } else {
      oscMixer.connect(filter);
    }

    // Route through effects
    let currentNode: Tone.ToneAudioNode = filter;

    if (distortion) {
      currentNode.connect(distortion);
      currentNode = distortion;
    }

    currentNode.connect(toneFilter);
    currentNode = toneFilter;

    // Add formant parallel path if enabled
    if (formantMixer && formantFilters.length > 0) {
      formantFilters.forEach(f => {
        currentNode.connect(f);
        f.connect(formantMixer!);
      });
      formantMixer.connect(output);
      currentNode.connect(output); // Mix dry + formant
    } else {
      currentNode.connect(output);
    }

    // Store active notes for release
    const activeNotes = new Set<string>();

    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        const t = time ?? Tone.now();
        const v = velocity ?? 0.8;

        // Reset LFO phase on retrigger
        if (wbConfig.wobbleLFO.retrigger && wobbleLFO) {
          wobbleLFO.phase = wbConfig.wobbleLFO.phase;
        }

        // Trigger filter envelope
        filterEnv.triggerAttack(t);

        // Trigger all oscillators
        osc1.triggerAttackRelease(note, duration, t, v);
        osc2.triggerAttackRelease(note, duration, t, v);
        if (subOsc) subOsc.triggerAttackRelease(note, duration, t, v);
        if (fmSynth) fmSynth.triggerAttackRelease(note, duration, t, v);
        unisonVoices.forEach(voice => voice.triggerAttackRelease(note, duration, t, v * 0.6));
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        const t = time ?? Tone.now();
        const v = velocity ?? 0.8;
        activeNotes.add(note);

        console.log(`[WobbleBass] triggerAttack note=${note} time=${t} velocity=${v} osc1Vol=${osc1.volume.value}dB outputGain=${output.gain.value}`);

        // Reset LFO phase on retrigger
        if (wbConfig.wobbleLFO.retrigger && wobbleLFO) {
          wobbleLFO.phase = wbConfig.wobbleLFO.phase;
        }

        // Trigger filter envelope
        filterEnv.triggerAttack(t);

        osc1.triggerAttack(note, t, v);
        osc2.triggerAttack(note, t, v);
        if (subOsc) subOsc.triggerAttack(note, t, v);
        if (fmSynth) fmSynth.triggerAttack(note, t, v);
        unisonVoices.forEach(voice => voice.triggerAttack(note, t, v * 0.6));
      },
      triggerRelease: (note: string, time?: number) => {
        const t = time ?? Tone.now();
        activeNotes.delete(note);

        filterEnv.triggerRelease(t);

        osc1.triggerRelease(note, t);
        osc2.triggerRelease(note, t);
        if (subOsc) subOsc.triggerRelease(note, t);
        if (fmSynth) fmSynth.triggerRelease(note, t);
        unisonVoices.forEach(voice => voice.triggerRelease(note, t));
      },
      releaseAll: () => {
        osc1.releaseAll();
        osc2.releaseAll();
        if (subOsc) subOsc.releaseAll();
        if (fmSynth) fmSynth.releaseAll();
        unisonVoices.forEach(voice => voice.releaseAll());
        activeNotes.clear();
      },
      connect: (dest: Tone.InputNode) => output.connect(dest),
      disconnect: () => output.disconnect(),
      dispose: () => {
        osc1.dispose();
        osc2.dispose();
        if (subOsc) subOsc.dispose();
        if (fmSynth) fmSynth.dispose();
        unisonVoices.forEach(v => v.dispose());
        unisonPanners.forEach(p => p.dispose());
        oscMixer.dispose();
        filter.dispose();
        if (filterDrive) filterDrive.dispose();
        filterEnv.dispose();
        if (wobbleLFO) wobbleLFO.dispose();
        if (distortion) distortion.dispose();
        toneFilter.dispose();
        formantFilters.forEach(f => f.dispose());
        if (formantMixer) formantMixer.dispose();
        output.dispose();
      },
      applyConfig: (newConfig: any) => {
        const wbc = newConfig || DEFAULT_WOBBLE_BASS;
        
        // Update Envelopes
        const envParams = {
          attack: wbc.envelope.attack / 1000,
          decay: wbc.envelope.decay / 1000,
          sustain: wbc.envelope.sustain / 100,
          release: wbc.envelope.release / 1000,
        };
        osc1.set({ envelope: envParams });
        osc2.set({ envelope: envParams });
        if (subOsc) subOsc.set({ envelope: envParams });
        if (fmSynth) fmSynth.set({ envelope: envParams });
        unisonVoices.forEach(v => v.set({ envelope: envParams }));

        // Update Osc Levels & Tuning
        osc1.volume.rampTo(-6 + (wbc.osc1.level / 100) * 6 - 6, 0.1);
        osc2.volume.rampTo(-6 + (wbc.osc2.level / 100) * 6 - 6, 0.1);
        osc1.set({ detune: wbc.osc1.octave * 1200 + wbc.osc1.detune });
        osc2.set({ detune: wbc.osc2.octave * 1200 + wbc.osc2.detune });
        
        if (subOsc) {
          subOsc.volume.rampTo(-12 + (wbc.sub.level / 100) * 12 - 6, 0.1);
          subOsc.set({ detune: wbc.sub.octave * 1200 });
        }

        // Update Filter
        filter.set({
          type: wbc.filter.type,
          frequency: wbc.filter.cutoff,
          Q: wbc.filter.resonance / 10,
        });

        // Update LFO
        if (wobbleLFO) {
          wobbleLFO.frequency.rampTo(wbc.wobbleLFO.rate, 0.1);
        }
      },
      volume: osc1.volume,

      // Expose LFO for external control
      wobbleLFO,
      filter,
    } as any;
  }

  /**
   * Reverse an AudioBuffer by copying samples in reverse order
   */
  private static reverseAudioBuffer(buffer: AudioBuffer): AudioBuffer {
    const audioContext = Tone.getContext().rawContext;
    const reversed = audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = reversed.getChannelData(ch);
      for (let i = 0; i < src.length; i++) {
        dst[i] = src[src.length - 1 - i];
      }
    }
    return reversed;
  }

  /**
   * Create a DrumKit multi-sample instrument
   */
  private static createDrumKit(config: InstrumentConfig): DrumKitSynth {
    const dkConfig = config.drumKit || DEFAULT_DRUMKIT;
    return new DrumKitSynth(dkConfig);
  }

  // ============================================================================
  // PITCH ENVELOPE UTILITIES
  // ============================================================================

  /**
   * Apply pitch envelope for triggerAttackRelease (full envelope cycle)
   * Modulates synth detune from initial offset back to 0, with decay/sustain/release
   */
  private static applyPitchEnvelope(
    synth: Tone.PolySynth | { set: (options: { detune: number }) => void },
    pitchEnv: PitchEnvelopeConfig,
    time: number,
    duration: number
  ): void {
    const startCents = pitchEnv.amount * 100; // Convert semitones to cents
    const sustainCents = (pitchEnv.sustain / 100) * startCents;
    const attackTime = pitchEnv.attack / 1000;
    const decayTime = pitchEnv.decay / 1000;
    const releaseTime = pitchEnv.release / 1000;

    // Cast to access detune param
    const s = synth as any;
    if (!s.set) return;

    // Start at initial offset
    s.set({ detune: startCents });

    // Attack phase: stay at start pitch (or ramp if attack > 0)
    if (attackTime > 0) {
      // For pitch envelope, attack means staying at the offset
      // The actual envelope starts after attack
    }

    // Decay to sustain level
    const decayStart = time + attackTime;
    setTimeout(() => {
      if (s.set) s.set({ detune: sustainCents });
    }, (decayStart - Tone.now()) * 1000);

    // Release back to 0 after note duration
    const releaseStart = time + duration;
    setTimeout(() => {
      if (s.set) s.set({ detune: 0 });
    }, (releaseStart - Tone.now()) * 1000 + releaseTime * 1000);
  }

  /**
   * Trigger pitch envelope attack phase
   * Sets initial pitch offset and schedules decay to sustain
   */
  private static triggerPitchEnvelopeAttack(
    synth: Tone.PolySynth | { set: (options: { detune: number }) => void },
    pitchEnv: PitchEnvelopeConfig,
    time: number
  ): void {
    const startCents = pitchEnv.amount * 100; // Convert semitones to cents
    const sustainCents = (pitchEnv.sustain / 100) * startCents;
    const attackTime = pitchEnv.attack / 1000;
    const decayTime = pitchEnv.decay / 1000;

    const s = synth as any;
    if (!s.set) return;

    // Start at initial pitch offset
    s.set({ detune: startCents });

    // Schedule decay to sustain level
    const totalADTime = (attackTime + decayTime) * 1000;
    setTimeout(() => {
      if (s.set) s.set({ detune: sustainCents });
    }, totalADTime);
  }

  private static createDubSiren(config: InstrumentConfig): Tone.ToneAudioNode {
    const dubSirenConfig = config.dubSiren || DEFAULT_DUB_SIREN;
    const synth = new DubSirenSynth(dubSirenConfig);
    
    // Apply initial volume
    if (config.volume !== undefined) {
      synth.volume.value = config.volume;
    }
    
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createSynare(config: InstrumentConfig): Tone.ToneAudioNode {
    const synareConfig = config.synare || DEFAULT_SYNARE;
    const synth = new SynareSynth(synareConfig);
    
    if (config.volume !== undefined) {
      synth.volume.value = config.volume;
    }
    
    return synth as unknown as Tone.ToneAudioNode;
  }

  /**
   * Trigger pitch envelope release phase
   * Ramps from sustain level back to 0
   */
  private static triggerPitchEnvelopeRelease(
    synth: Tone.PolySynth | { set: (options: { detune: number }) => void },
    pitchEnv: PitchEnvelopeConfig,
    time: number
  ): void {
    const releaseTime = pitchEnv.release / 1000;
    const s = synth as any;
    if (!s.set) return;

    // Ramp back to 0 over release time
    setTimeout(() => {
      if (s.set) s.set({ detune: 0 });
    }, releaseTime * 1000);
  }
}

/**
 * Get default furnace config for a given synth type
 * Used when creating new instruments in the modal
 */
export function getDefaultFurnaceConfig(synthType: string): import('@typedefs/instrument').FurnaceConfig | undefined {
  // Map synth type to chip ID
  const chipTypeMap: Record<string, number> = {
    'FurnaceOPN': 0, 'FurnaceOPM': 1, 'FurnaceOPL': 2, 'FurnacePSG': 3,
    'FurnaceNES': 4, 'FurnaceGB': 5, 'FurnacePCE': 6, 'FurnaceSCC': 7,
    'FurnaceN163': 8, 'FurnaceVRC6': 9, 'FurnaceC64': 10, 'FurnaceOPLL': 11,
    'FurnaceAY': 12, 'FurnaceOPNA': 13, 'FurnaceOPNB': 14, 'FurnaceTIA': 15,
    'FurnaceFDS': 16, 'FurnaceMMC5': 17, 'FurnaceSAA': 18, 'FurnaceSWAN': 19,
    'FurnaceOKI': 20, 'FurnaceES5506': 21, 'FurnaceOPZ': 22, 'FurnaceY8950': 23,
    'FurnaceSNES': 24, 'FurnaceLYNX': 25, 'FurnaceOPL4': 26, 'FurnaceSEGAPCM': 27,
    'FurnaceYMZ280B': 28, 'FurnaceRF5C68': 29, 'FurnaceGA20': 30, 'FurnaceC140': 31,
    'FurnaceQSOUND': 32, 'FurnaceVIC': 33, 'FurnaceTED': 34, 'FurnaceSUPERVISION': 35,
    'FurnaceVERA': 36, 'FurnaceSM8521': 37, 'FurnaceBUBBLE': 38,
    'FurnaceK007232': 39, 'FurnaceK053260': 40, 'FurnaceX1_010': 41,
    'FurnaceUPD1771': 42, 'FurnaceT6W28': 43, 'FurnaceVB': 44,
    'FurnaceSID6581': 45, 'FurnaceSID8580': 46,
    // NEW Chips (47-72)
    'FurnaceOPN2203': 47, 'FurnaceOPNBB': 48, 'FurnaceESFM': 49,
    'FurnaceAY8930': 50, 'FurnaceNDS': 51, 'FurnaceGBA': 52,
    'FurnacePOKEMINI': 54, 'FurnaceNAMCO': 55, 'FurnacePET': 56,
    'FurnacePOKEY': 57, 'FurnaceMSM6258': 58, 'FurnaceMSM5232': 59,
    'FurnaceMULTIPCM': 60, 'FurnaceAMIGA': 61, 'FurnacePCSPKR': 62,
    'FurnacePONG': 63, 'FurnacePV1000': 64, 'FurnaceDAVE': 65,
    'FurnaceSU': 66, 'FurnacePOWERNOISE': 68,
    'FurnaceZXBEEPER': 69, 'FurnaceSCVTONE': 71, 'FurnacePCMDAC': 72,
    'Furnace': 0, // Default to OPN
  };

  const chipType = chipTypeMap[synthType];
  if (chipType === undefined) return undefined;

  // Use DEFAULT_FURNACE as base (has good FM operator settings)
  // Then override with the correct chip type
  const config: import('@typedefs/instrument').FurnaceConfig = {
    ...DEFAULT_FURNACE,
    chipType,
    // Deep copy operators to avoid mutation
    operators: DEFAULT_FURNACE.operators.map(op => ({ ...op })),
  };

  // Add chip-specific defaults
  if (synthType === 'FurnaceC64' || synthType === 'FurnaceSID6581' || synthType === 'FurnaceSID8580') {
    config.c64 = {
      triOn: false, sawOn: true, pulseOn: false, noiseOn: false,
      a: 0, d: 8, s: 12, r: 6,
      duty: 2048,
      ringMod: false, oscSync: false,
      toFilter: false, initFilter: false,
      filterCutoff: 1024, filterResonance: 8,
      filterLP: true, filterBP: false, filterHP: false,
      filterCh3Off: false,
    };
  }

  return config;
}
