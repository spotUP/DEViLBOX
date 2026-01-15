// @ts-nocheck - Tone.js API type issues need resolution
/**
 * InstrumentFactory - Creates and manages Tone.js synth instances
 * Factory class to create all 12 synth types from InstrumentConfig
 */

import * as Tone from 'tone';
import type { InstrumentConfig, EffectConfig } from '@typedefs/instrument';
import { TB303Synth } from './TB303Engine';

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
        instrument = this.createSampler(config);
        break;

      case 'Player':
        instrument = this.createPlayer(config);
        break;

      default:
        console.warn(`Unknown synth type: ${config.synthType}, defaulting to Synth`);
        instrument = this.createSynth(config);
    }

    return instrument;
  }

  /**
   * Create effect chain from config
   */
  public static createEffectChain(effects: EffectConfig[]): Tone.ToneAudioNode[] {
    return effects
      .filter((fx) => fx.enabled)
      .map((fx) => this.createEffect(fx));
  }

  /**
   * Create single effect instance
   */
  public static createEffect(config: EffectConfig): Tone.ToneAudioNode {
    const wetValue = config.wet / 100;

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
        attack: (config.envelope?.attack || 10) / 1000,
        decay: (config.envelope?.decay || 200) / 1000,
        sustain: (config.envelope?.sustain || 50) / 100,
        release: (config.envelope?.release || 1000) / 1000,
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
        attack: (config.envelope?.attack || 10) / 1000,
        decay: (config.envelope?.decay || 200) / 1000,
        sustain: (config.envelope?.sustain || 50) / 100,
        release: (config.envelope?.release || 1000) / 1000,
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
          attack: (config.envelope?.attack || 10) / 1000,
          decay: (config.envelope?.decay || 200) / 1000,
          sustain: (config.envelope?.sustain || 50) / 100,
          release: (config.envelope?.release || 1000) / 1000,
        },
      },
      voice1: {
        oscillator: {
          type: config.oscillator?.type || 'sawtooth',
        },
        envelope: {
          attack: (config.envelope?.attack || 10) / 1000,
          decay: (config.envelope?.decay || 200) / 1000,
          sustain: (config.envelope?.sustain || 50) / 100,
          release: (config.envelope?.release || 1000) / 1000,
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
        attack: (config.envelope?.attack || 10) / 1000,
        decay: (config.envelope?.decay || 200) / 1000,
        sustain: (config.envelope?.sustain || 50) / 100,
        release: (config.envelope?.release || 1000) / 1000,
      },
      modulationIndex: 10,
      volume: config.volume || -12,
    });
  }

  private static createAMSynth(config: InstrumentConfig): Tone.PolySynth {
    return new Tone.PolySynth(Tone.AMSynth, {
      oscillator: {
        type: config.oscillator?.type || 'sine',
      },
      envelope: {
        attack: (config.envelope?.attack || 10) / 1000,
        decay: (config.envelope?.decay || 200) / 1000,
        sustain: (config.envelope?.sustain || 50) / 100,
        release: (config.envelope?.release || 1000) / 1000,
      },
      volume: config.volume || -12,
    });
  }

  private static createPluckSynth(config: InstrumentConfig): Tone.PolySynth {
    return new Tone.PolySynth(Tone.PluckSynth, {
      attackNoise: 1,
      dampening: 4000,
      resonance: 0.7,
      volume: config.volume || -12,
    });
  }

  private static createMetalSynth(config: InstrumentConfig): Tone.MetalSynth {
    return new Tone.MetalSynth({
      envelope: {
        attack: (config.envelope?.attack || 1) / 1000,
        decay: (config.envelope?.decay || 100) / 1000,
        release: (config.envelope?.release || 100) / 1000,
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
        attack: (config.envelope?.attack || 1) / 1000,
        decay: (config.envelope?.decay || 400) / 1000,
        sustain: 0.01,
        release: (config.envelope?.release || 100) / 1000,
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
        attack: (config.envelope?.attack || 10) / 1000,
        decay: (config.envelope?.decay || 200) / 1000,
        sustain: (config.envelope?.sustain || 50) / 100,
        release: (config.envelope?.release || 1000) / 1000,
      },
      volume: config.volume || -12,
    });
  }

  private static createTB303(config: InstrumentConfig): TB303Synth {
    if (!config.tb303) {
      throw new Error('TB303 config required for TB303 synth type');
    }

    const synth = new TB303Synth(config.tb303);
    synth.setVolume(config.volume || -12);
    return synth;
  }

  private static createSampler(config: InstrumentConfig): Tone.Sampler {
    // Get sample URL from parameters (base64 data URL from user upload)
    const sampleUrl = config.parameters?.sampleUrl;

    if (sampleUrl) {
      // Use uploaded sample mapped to C4
      return new Tone.Sampler({
        urls: {
          C4: sampleUrl,
        },
        volume: config.volume || -12,
      });
    }

    // No sample loaded - create empty sampler
    return new Tone.Sampler({
      volume: config.volume || -12,
    });
  }

  private static createPlayer(config: InstrumentConfig): Tone.Player {
    // Get sample URL from parameters (base64 data URL from user upload)
    const sampleUrl = config.parameters?.sampleUrl;

    if (sampleUrl) {
      return new Tone.Player({
        url: sampleUrl,
        volume: config.volume || -12,
      });
    }

    // No sample loaded - create empty player
    return new Tone.Player({
      volume: config.volume || -12,
    });
  }
}
