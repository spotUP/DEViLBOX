/**
 * SynthBaker - Renders synth instruments to AudioBuffers
 * 
 * Used for exporting synth instruments to sample-only formats like MOD and XM.
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
}
