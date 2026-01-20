// @ts-nocheck
/**
 * InstrumentFactory - Delegates to specialized creators
 */

import * as Tone from 'tone';
import type { InstrumentConfig, EffectConfig } from '@typedefs/instrument';
import { TB303Creator } from './factory/synths/TB303Creator';
import { DrumMachineCreator } from './factory/synths/DrumMachineCreator';
import { BasicSynthCreator } from './factory/synths/BasicSynthCreator';
import { SamplerCreator } from './factory/synths/SamplerCreator';

export class InstrumentFactory {
  public static createInstrument(config: InstrumentConfig): Tone.ToneAudioNode {
    switch (config.synthType) {
      case 'TB303':
        return TB303Creator.create(config);
      case 'DrumMachine':
        return DrumMachineCreator.create(config);
      case 'Sampler':
      case 'Player':
        return SamplerCreator.create(config);
      case 'Synth':
      case 'MonoSynth':
      case 'DuoSynth':
      case 'FMSynth':
      case 'AMSynth':
      case 'MembraneSynth':
      case 'MetalSynth':
      case 'PluckSynth':
      case 'NoiseSynth':
      case 'PolySynth':
      case 'SuperSaw':
        return BasicSynthCreator.create(config);
      default:
        console.warn(`[InstrumentFactory] Unknown synth type: ${config.synthType}, defaulting to BasicSynth`);
        return BasicSynthCreator.create(config);
    }
  }

  public static createEffect(config: EffectConfig): Tone.ToneAudioNode {
    const wetValue = config.wet / 100;
    switch (config.type) {
      case 'Distortion':
        return new Tone.Distortion({ distortion: config.parameters.drive || 0.4, wet: wetValue });
      case 'Reverb':
        return new Tone.Reverb({ decay: config.parameters.decay || 1.5, wet: wetValue });
      case 'Delay':
        return new Tone.FeedbackDelay({ delayTime: config.parameters.time || 0.25, wet: wetValue });
      // ... Add other effects
      default:
        return new Tone.Gain(1);
    }
  }

  public static createEffectChain(effects: EffectConfig[]): Tone.ToneAudioNode[] {
    return effects.filter(fx => fx.enabled).map(fx => this.createEffect(fx));
  }

  public static connectWithEffects(instrument: Tone.ToneAudioNode, effects: Tone.ToneAudioNode[], destination: Tone.ToneAudioNode): void {
    if (effects.length === 0) {
      instrument.connect(destination);
      return;
    }
    instrument.connect(effects[0]);
    for (let i = 0; i < effects.length - 1; i++) {
      effects[i].connect(effects[i + 1]);
    }
    effects[effects.length - 1].connect(destination);
  }

  public static disposeInstrument(instrument: Tone.ToneAudioNode, effects: Tone.ToneAudioNode[]): void {
    effects.forEach(fx => fx.dispose());
    instrument.dispose();
  }
}