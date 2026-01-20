import * as Tone from 'tone';
import type { InstrumentConfig } from '@typedefs/instrument';

export class BasicSynthCreator {
  public static create(config: InstrumentConfig): Tone.ToneAudioNode {
    const volume = config.volume ?? -12;
    const oscType = config.oscillator?.type || 'sawtooth';
    const envelope = {
      attack: (config.envelope?.attack ?? 10) / 1000,
      decay: (config.envelope?.decay ?? 200) / 1000,
      sustain: (config.envelope?.sustain ?? 50) / 100,
      release: (config.envelope?.release ?? 1000) / 1000,
    };

    switch (config.synthType) {
      case 'Synth':
      case 'PolySynth':
      case 'SuperSaw':
        return new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: oscType },
          envelope,
          volume,
        });
      case 'MonoSynth':
        return new Tone.MonoSynth({
          oscillator: { type: oscType },
          envelope,
          volume,
        });
      case 'FMSynth':
        return new Tone.PolySynth(Tone.FMSynth, {
          oscillator: { type: oscType },
          envelope,
          volume,
        });
      case 'AMSynth':
        return new Tone.PolySynth(Tone.AMSynth, {
          oscillator: { type: oscType },
          envelope,
          volume,
        });
      case 'MembraneSynth':
        return new Tone.MembraneSynth({
          volume,
        });
      case 'MetalSynth':
        return new Tone.MetalSynth({
          volume,
        });
      case 'PluckSynth':
        return new Tone.PluckSynth({
          volume,
        });
      case 'NoiseSynth':
        return new Tone.NoiseSynth({
          volume,
        });
      default:
        return new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: oscType },
          envelope,
          volume,
        });
    }
  }
}
