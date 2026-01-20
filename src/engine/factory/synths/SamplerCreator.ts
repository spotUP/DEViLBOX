import * as Tone from 'tone';
import type { InstrumentConfig } from '@typedefs/instrument';

export class SamplerCreator {
  public static create(config: InstrumentConfig): Tone.ToneAudioNode {
    const sampleUrl = config.parameters?.sampleUrl || (config.samples && config.samples[0]?.url);
    
    if (!sampleUrl) {
      // Fallback to a simple synth if no sample is provided
      return new Tone.PolySynth(Tone.Synth);
    }

    if (config.synthType === 'Player') {
      const player = new Tone.Player({
        url: sampleUrl,
        loop: config.parameters?.loopEnabled || false,
        volume: config.volume ?? -6,
      });
      return player;
    }

    // Default Sampler
    const sampler = new Tone.Sampler({
      urls: {
        'C4': sampleUrl,
      },
      onload: () => {
        console.log(`[SamplerCreator] Sample loaded for instrument ${config.id}`);
      },
      volume: config.volume ?? -6,
    });

    return sampler;
  }
}
