// @ts-nocheck - Tone.js API type issues need resolution
/**
 * InstrumentFactory - Creates and manages Tone.js synth instances
 * Factory class to create all 12 synth types from InstrumentConfig
 */

import * as Tone from 'tone';
import type { InstrumentConfig, EffectConfig } from '@typedefs/instrument';
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
  VOWEL_FORMANTS,
} from '../types/instrument';
import { TB303Synth } from './TB303Engine';
import { TB303AccurateSynth } from './TB303AccurateSynth';
import { TapeSaturation } from './effects/TapeSaturation';
import { SidechainCompressor } from './effects/SidechainCompressor';
import { WavetableSynth } from './WavetableSynth';
import { NeuralEffectWrapper } from './effects/NeuralEffectWrapper';
import { ArpeggioEngine } from './ArpeggioEngine';

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
    switch (config.type) {
      case 'Distortion':
        return new Tone.Distortion({
          distortion: config.parameters.drive || 0.4,
          oversample: config.parameters.oversample || 'none',
          wet: wetValue,
        });

      case 'Reverb':
        return new Tone.Reverb({
          decay: config.parameters.decay || 1.5,
          preDelay: config.parameters.preDelay || 0.01,
          wet: wetValue,
        });

      case 'Delay':
        return new Tone.FeedbackDelay({
          delayTime: config.parameters.time || 0.25,
          feedback: config.parameters.feedback || 0.5,
          wet: wetValue,
        });

      case 'Chorus': {
        const chorus = new Tone.Chorus({
          frequency: config.parameters.frequency || 1.5,
          delayTime: config.parameters.delayTime || 3.5,
          depth: config.parameters.depth || 0.7,
          wet: wetValue,
        });
        chorus.start(); // Start LFO
        return chorus;
      }

      case 'Phaser':
        return new Tone.Phaser({
          frequency: config.parameters.frequency || 0.5,
          octaves: config.parameters.octaves || 3,
          baseFrequency: config.parameters.baseFrequency || 350,
          wet: wetValue,
        });

      case 'Tremolo': {
        const tremolo = new Tone.Tremolo({
          frequency: config.parameters.frequency || 10,
          depth: config.parameters.depth || 0.5,
          wet: wetValue,
        });
        tremolo.start(); // Start LFO
        return tremolo;
      }

      case 'Vibrato': {
        const vibrato = new Tone.Vibrato({
          frequency: config.parameters.frequency || 5,
          depth: config.parameters.depth || 0.1,
          wet: wetValue,
        });
        // Vibrato uses an LFO internally but doesn't need manual start
        return vibrato;
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
        return autoFilter;
      }

      case 'AutoPanner': {
        const autoPanner = new Tone.AutoPanner({
          frequency: config.parameters.frequency || 1,
          depth: config.parameters.depth || 1,
          wet: wetValue,
        });
        autoPanner.start(); // Start LFO
        return autoPanner;
      }

      case 'AutoWah':
        return new Tone.AutoWah({
          baseFrequency: config.parameters.baseFrequency || 100,
          octaves: config.parameters.octaves || 6,
          sensitivity: config.parameters.sensitivity || 0,
          Q: config.parameters.Q || 2,
          gain: config.parameters.gain || 2,
          follower: config.parameters.follower || 0.1,
          wet: wetValue,
        });

      case 'BitCrusher':
        return new Tone.BitCrusher({
          bits: config.parameters.bits || 4,
          wet: wetValue,
        });

      case 'Chebyshev':
        return new Tone.Chebyshev({
          order: config.parameters.order || 50,
          oversample: config.parameters.oversample || 'none',
          wet: wetValue,
        });

      case 'FeedbackDelay':
        return new Tone.FeedbackDelay({
          delayTime: config.parameters.time || 0.25,
          feedback: config.parameters.feedback || 0.5,
          wet: wetValue,
        });

      case 'FrequencyShifter':
        return new Tone.FrequencyShifter({
          frequency: config.parameters.frequency || 0,
          wet: wetValue,
        });

      case 'PingPongDelay':
        return new Tone.PingPongDelay({
          delayTime: config.parameters.time || 0.25,
          feedback: config.parameters.feedback || 0.5,
          wet: wetValue,
        });

      case 'PitchShift':
        return new Tone.PitchShift({
          pitch: config.parameters.pitch || 0,
          windowSize: config.parameters.windowSize || 0.1,
          delayTime: config.parameters.delayTime || 0,
          feedback: config.parameters.feedback || 0,
          wet: wetValue,
        });

      case 'Compressor':
        return new Tone.Compressor({
          threshold: config.parameters.threshold || -24,
          ratio: config.parameters.ratio || 12,
          attack: config.parameters.attack || 0.003,
          release: config.parameters.release || 0.25,
        });

      case 'EQ3':
        return new Tone.EQ3({
          low: config.parameters.low || 0,
          mid: config.parameters.mid || 0,
          high: config.parameters.high || 0,
          lowFrequency: config.parameters.lowFrequency || 400,
          highFrequency: config.parameters.highFrequency || 2500,
        });

      case 'Filter':
        return new Tone.Filter({
          type: config.parameters.type || 'lowpass',
          frequency: config.parameters.frequency || 350,
          rolloff: config.parameters.rolloff || -12,
          Q: config.parameters.Q || 1,
          gain: config.parameters.gain || 0,
        });

      case 'JCReverb':
        return new Tone.JCReverb({
          roomSize: config.parameters.roomSize || 0.5,
          wet: wetValue,
        });

      case 'StereoWidener':
        return new Tone.StereoWidener({
          width: config.parameters.width || 0.5,
        });

      case 'TapeSaturation':
        return new TapeSaturation({
          drive: (config.parameters.drive || 50) / 100,   // 0-100 -> 0-1
          tone: config.parameters.tone || 12000,          // Hz
          wet: wetValue,
        });

      case 'SidechainCompressor':
        return new SidechainCompressor({
          threshold: config.parameters.threshold ?? -24,
          ratio: config.parameters.ratio ?? 4,
          attack: config.parameters.attack ?? 0.003,
          release: config.parameters.release ?? 0.25,
          knee: config.parameters.knee ?? 6,
          sidechainGain: (config.parameters.sidechainGain ?? 100) / 100,
          wet: wetValue,
        });

      default:
        console.warn(`Unknown effect type: ${config.type}, creating bypass`);
        return new Tone.Gain(1);
    }
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

  private static createSynth(config: InstrumentConfig): Tone.PolySynth {
    return new Tone.PolySynth(Tone.Synth, {
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

  private static createTB303(config: InstrumentConfig): TB303Synth | TB303AccurateSynth {
    if (!config.tb303) {
      throw new Error('TB303 config required for TB303 synth type');
    }

    // Choose engine based on engineType (default: tonejs)
    const engineType = config.tb303.engineType || 'tonejs';

    if (engineType === 'accurate') {
      // Use Open303-based accurate engine
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

    // Return a wrapper object
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
      volume: synth.volume,
    } as any;
  }

  /**
   * PolySynth - True polyphonic synth with voice management
   */
  private static createPolySynth(config: InstrumentConfig): Tone.PolySynth {
    const psConfig = config.polySynth || DEFAULT_POLYSYNTH;

    // Select voice type
    let VoiceClass: typeof Tone.Synth | typeof Tone.FMSynth | typeof Tone.AMSynth = Tone.Synth;
    if (psConfig.voiceType === 'FMSynth') VoiceClass = Tone.FMSynth;
    else if (psConfig.voiceType === 'AMSynth') VoiceClass = Tone.AMSynth;

    return new Tone.PolySynth(VoiceClass, {
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

    switch (dmConfig.drumType) {
      case 'kick': {
        const kickConfig = {
          pitch: 80,
          pitchDecay: 50,
          tone: 50,
          toneDecay: 20,
          decay: 300,
          drive: 50,
          envAmount: 2.5,
          envDuration: 50,
          filterFreq: 3000,
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
          volume: synth.volume,
        } as any;
      }

      case 'snare': {
        const snareConfig = {
          pitch: 220,
          tone: 25,
          toneDecay: 250,
          snappy: 70,
          decay: 100,
          envAmount: 4.0,
          envDuration: 10,
          filterType: 'notch' as const,
          filterFreq: 1000,
          ...dmConfig.snare
        };

        // TR-909 snare: pitched body with aggressive pitch envelope + filtered noise
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
          volume: body.volume,
        } as any;
      }

      case 'hihat': {
        const hhConfig = dmConfig.hihat || { tone: 50, decay: 100, metallic: 50 };
        // Hi-hat: metal synth (909 uses samples, but MetalSynth is a good approximation)
        return new Tone.MetalSynth({
          frequency: 200 + hhConfig.tone * 2,
          envelope: {
            attack: 0.001,
            decay: hhConfig.decay / 1000,
            release: 0.01,
          },
          harmonicity: 5.1,
          modulationIndex: 32 + hhConfig.metallic / 3,
          resonance: 4000 + hhConfig.tone * 40,
          octaves: 1.5,
          volume: config.volume || -12,
        });
      }

      case 'clap': {
        const clapConfig = {
          tone: 55,
          decay: 80,
          toneDecay: 250,
          spread: 10,
          filterFreqs: [900, 1200] as [number, number],
          modulatorFreq: 40,
          ...dmConfig.clap
        };

        // TR-909 clap: Multiple delayed noise bursts with modulation
        // The 909 creates the "clap" effect by triggering noise at slightly
        // offset times (10ms spread) creating a richer, more realistic clap
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
          volume: noise.volume,
        } as any;
      }

      case 'tom': {
        const tomConfig = {
          pitch: 200,
          decay: 200,
          tone: 5,
          toneDecay: 100,
          envAmount: 2.0,
          envDuration: 100,
          ...dmConfig.tom
        };

        // TR-909 tom: pitched sine with moderate pitch envelope
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
          volume: synth.volume,
        } as any;
      }

      case 'rimshot': {
        const rimConfig = {
          decay: 30,
          filterFreqs: [220, 500, 950] as [number, number, number],
          filterQ: 10.5,
          saturation: 3.0,
          ...dmConfig.rimshot
        };

        // TR-909 rimshot: Parallel resonant bandpass filters with saturation
        // The high Q creates the characteristic "ping" of the rimshot
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
          volume: new Tone.Param({ value: config.volume ?? -10, units: 'decibels' }),
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
          volume: new Tone.Param({ value: config.volume ?? -10, units: 'decibels' }),
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
          volume: new Tone.Param({ value: config.volume ?? -12, units: 'decibels' }),
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

    // Create ArpeggioEngine if arpeggio is configured
    let arpeggioEngine: InstanceType<typeof ArpeggioEngine> | null = null;
    let lastArpNote: string | null = null;

    if (arpeggioConfig) {
      arpeggioEngine = new ArpeggioEngine({
        config: arpeggioConfig,
        onNoteOn: (note: string, velocity: number, duration: number) => {
          // Release last arpeggio note before playing new one
          if (lastArpNote) {
            synth.triggerRelease(lastArpNote, Tone.now());
          }
          synth.triggerAttackRelease(note, duration, Tone.now(), velocity);
          lastArpNote = note;
        },
        onNoteOff: (note: string) => {
          synth.triggerRelease(note, Tone.now());
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
      volume: synth.volume,
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
}
