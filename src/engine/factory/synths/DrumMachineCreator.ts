import * as Tone from 'tone';
import type { InstrumentConfig } from '@typedefs/instrument';
import { DEFAULT_DRUM_MACHINE } from '../../../types/instrument';

export class DrumMachineCreator {
  public static create(config: InstrumentConfig): Tone.ToneAudioNode {
    const dmConfig = config.drumMachine || DEFAULT_DRUM_MACHINE;

    switch (dmConfig.drumType) {
      case 'kick': {
        const kickConfig = dmConfig.kick || DEFAULT_DRUM_MACHINE.kick!;
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
      // ... other drum types (snare, clap, hihat)
      default:
        return new Tone.MembraneSynth().toDestination();
    }
  }
}
