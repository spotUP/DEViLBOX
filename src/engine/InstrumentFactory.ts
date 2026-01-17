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
import { TapeSaturation } from './effects/TapeSaturation';
import { SidechainCompressor } from './effects/SidechainCompressor';
import { WavetableSynth } from './WavetableSynth';

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

  private static createTB303(config: InstrumentConfig): TB303Synth {
    if (!config.tb303) {
      throw new Error('TB303 config required for TB303 synth type');
    }

    const synth = new TB303Synth(config.tb303);
    synth.setVolume(config.volume || -12);
    return synth;
  }

  private static createWavetable(config: InstrumentConfig): WavetableSynth {
    const wavetableConfig = config.wavetable || DEFAULT_WAVETABLE;
    return new WavetableSynth(wavetableConfig);
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
   * DrumMachine - 808/909 style drum synthesis
   * Note: These drums use FIXED frequencies for authentic sound regardless of input note
   */
  private static createDrumMachine(config: InstrumentConfig): Tone.ToneAudioNode {
    const dmConfig = config.drumMachine || DEFAULT_DRUM_MACHINE;

    switch (dmConfig.drumType) {
      case 'kick': {
        const kickConfig = dmConfig.kick || DEFAULT_DRUM_MACHINE.kick!;
        // 808 kick: pitched sine with pitch envelope
        // Transpose down 2 octaves so C3 plays like C1 (proper kick range)
        const synth = new Tone.MembraneSynth({
          pitchDecay: (kickConfig.pitchDecay || 100) / 1000,
          octaves: 6,
          oscillator: { type: 'sine' },
          envelope: {
            attack: 0.001,
            decay: (kickConfig.decay || 500) / 1000,
            sustain: 0,
            release: 0.1,
          },
          volume: config.volume ?? -6,
        });

        // Transpose note down 2 octaves for kick range
        const transposeNote = (note: string, semitones: number): string => {
          const freq = Tone.Frequency(note).toFrequency();
          return Tone.Frequency(freq * Math.pow(2, semitones / 12)).toNote();
        };

        return {
          triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
            synth.triggerAttackRelease(transposeNote(note, -24), duration, time, velocity);
          },
          triggerAttack: (note: string, time?: number, velocity?: number) => {
            synth.triggerAttack(transposeNote(note, -24), time, velocity);
          },
          triggerRelease: (_note: string, time?: number) => {
            synth.triggerRelease(time);
          },
          releaseAll: () => { try { synth.triggerRelease(); } catch { /* ignore */ } },
          connect: (dest: Tone.InputNode) => synth.connect(dest),
          disconnect: () => synth.disconnect(),
          dispose: () => synth.dispose(),
          volume: synth.volume,
        } as any;
      }

      case 'snare': {
        const snareConfig = dmConfig.snare || { pitch: 200, tone: 50, snappy: 70, decay: 200 };
        // Snare: pitched oscillator + noise
        // Transpose down 1 octave so C3 plays like C2 (proper snare range)
        const body = new Tone.MembraneSynth({
          pitchDecay: 0.05,
          octaves: 4,
          oscillator: { type: 'sine' },
          envelope: {
            attack: 0.001,
            decay: snareConfig.decay / 1000,
            sustain: 0,
            release: 0.1,
          },
          volume: config.volume ?? -6,
        });
        const noise = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: {
            attack: 0.001,
            decay: snareConfig.decay / 1500,
            sustain: 0,
            release: 0.05,
          },
          volume: (config.volume ?? -6) + (snareConfig.snappy / 10 - 5),
        });

        const output = new Tone.Gain(1);
        body.connect(output);
        noise.connect(output);

        // Transpose note down 1 octave for snare range
        const transposeNote = (note: string, semitones: number): string => {
          const freq = Tone.Frequency(note).toFrequency();
          return Tone.Frequency(freq * Math.pow(2, semitones / 12)).toNote();
        };

        return {
          triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
            body.triggerAttackRelease(transposeNote(note, -12), duration, time, velocity);
            noise.triggerAttackRelease(duration, time, velocity);
          },
          triggerAttack: (note: string, time?: number, velocity?: number) => {
            body.triggerAttack(transposeNote(note, -12), time, velocity);
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
            output.dispose();
          },
          volume: body.volume,
        } as any;
      }

      case 'hihat': {
        const hhConfig = dmConfig.hihat || { tone: 50, decay: 100, metallic: 50 };
        // Hi-hat: metal synth with short decay
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
        const clapConfig = dmConfig.clap || { tone: 50, decay: 200, spread: 50 };
        // Clap: filtered noise with multiple triggers
        const noise = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: {
            attack: 0.001,
            decay: clapConfig.decay / 1000,
            sustain: 0,
            release: 0.05,
          },
          volume: config.volume || -12,
        });

        const filter = new Tone.Filter({
          type: 'bandpass',
          frequency: 1000 + clapConfig.tone * 20,
          Q: 2,
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

      default:
        // Default to kick
        return new Tone.MembraneSynth({
          pitchDecay: 0.05,
          octaves: 10,
          envelope: {
            attack: 0.001,
            decay: 0.4,
            sustain: 0.01,
            release: 0.1,
          },
          volume: config.volume || -12,
        });
    }
  }

  /**
   * ChipSynth - 8-bit video game console sounds
   * Uses square/triangle waves with bit crushing for authentic lo-fi character
   */
  private static createChipSynth(config: InstrumentConfig): Tone.ToneAudioNode {
    const chipConfig = config.chipSynth || DEFAULT_CHIP_SYNTH;

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
      connect: (dest: Tone.InputNode) => bitCrusher.connect(dest),
      disconnect: () => bitCrusher.disconnect(),
      dispose: () => {
        synth.dispose();
        bitCrusher.dispose();
      },
      volume: synth.volume,
    } as any;
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
