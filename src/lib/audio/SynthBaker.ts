/**
 * SynthBaker - Renders synth instruments to AudioBuffers
 *
 * Used for exporting synth instruments to sample-only formats like MOD and XM.
 * Also provides chord baking — rendering multiple notes into a single mixed sample.
 */

import * as Tone from 'tone';
import { InstrumentFactory } from '@engine/InstrumentFactory';
import type { InstrumentConfig } from '@typedefs/instrument';

/** Common interface for instruments returned by InstrumentFactory */
interface BakeableInstrument {
  connect?(destination: Tone.ToneAudioNode | AudioNode): void;
  triggerAttackRelease?(note: string, duration: number, time?: number): void;
  triggerAttack?(note: string, time?: number): void;
  triggerRelease?(note?: string, time?: number): void;
  dispose?(): void;
}

export class SynthBaker {
  /**
   * Bake a synth instrument to a sample (AudioBuffer)
   * Renders a single C-4 note for 2 seconds.
   */
  public static async bakeToSample(
    config: InstrumentConfig,
    duration: number = 2.0,
    note: string = 'C4'
  ): Promise<AudioBuffer> {
    // 1. Create offline context
    const sampleRate = 44100;
    const offlineContext = new OfflineAudioContext(1, sampleRate * duration, sampleRate);
    
    // 2. Temporarily switch Tone to offline context
    const originalContext = Tone.getContext();
    const offlineToneContext = new Tone.Context(offlineContext);
    Tone.setContext(offlineToneContext);

    try {
      // 3. Create the real instrument instance in the offline context
      const instrument = InstrumentFactory.createInstrument(config) as BakeableInstrument;

      // Connect to offline destination - must use raw Web Audio connection if node is not a Tone object
      if (instrument.connect) {
        instrument.connect(Tone.getContext().destination);
      }

      // Trigger note
      if (instrument.triggerAttackRelease) {
        instrument.triggerAttackRelease(note, duration * 0.8, 0);
      } else if (instrument.triggerAttack) {
        instrument.triggerAttack(note, 0);
        setTimeout(() => {
          if (instrument.triggerRelease) instrument.triggerRelease(note, duration * 0.8);
        }, duration * 800);
      }

      // 4. Render
      const renderedBuffer = await offlineContext.startRendering();

      // Cleanup instrument
      if (instrument.dispose) instrument.dispose();
      
      return renderedBuffer;
    } finally {
      // 5. Restore original context
      Tone.setContext(originalContext);
    }
  }

  /**
   * Compute smart duration from instrument envelope config.
   * Uses attack + decay + 0.3s sustain + release, clamped to 0.5s–4s.
   */
  public static getSmartDuration(config: InstrumentConfig): number {
    const env = config.envelope;
    if (!env) return 2.0;
    const attackS = (env.attack ?? 10) / 1000;
    const decayS = (env.decay ?? 500) / 1000;
    const releaseS = (env.release ?? 100) / 1000;
    const total = attackS + decayS + 0.3 + releaseS;
    return Math.max(0.5, Math.min(4.0, total));
  }

  /**
   * Bake a chord — render multiple notes through the same instrument,
   * mix into a single AudioBuffer, and normalize.
   */
  public static async bakeChord(
    config: InstrumentConfig,
    notes: string[],
  ): Promise<AudioBuffer> {
    const duration = SynthBaker.getSmartDuration(config);

    // Render each note sequentially — bakeToSample switches Tone.js to an
    // OfflineAudioContext and back, so parallel calls would corrupt the context.
    const buffers: AudioBuffer[] = [];
    for (const note of notes) {
      buffers.push(await SynthBaker.bakeToSample(config, duration, note));
    }

    // Mix all buffers by summing sample-by-sample
    const sampleRate = buffers[0].sampleRate;
    const maxLength = Math.max(...buffers.map(b => b.length));
    const mixed = new Float32Array(maxLength);

    for (const buf of buffers) {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        mixed[i] += data[i];
      }
    }

    // Normalize to prevent clipping
    let peak = 0;
    for (let i = 0; i < mixed.length; i++) {
      const abs = Math.abs(mixed[i]);
      if (abs > peak) peak = abs;
    }
    if (peak > 0) {
      const scale = 1.0 / peak;
      for (let i = 0; i < mixed.length; i++) {
        mixed[i] *= scale;
      }
    }

    // Create output AudioBuffer
    const output = new AudioBuffer({
      length: maxLength,
      numberOfChannels: 1,
      sampleRate,
    });
    output.copyToChannel(mixed, 0);
    return output;
  }
}
