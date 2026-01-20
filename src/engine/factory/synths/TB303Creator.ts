import type { InstrumentConfig } from '@typedefs/instrument';
import { TB303 } from '../../TB303Engine';

export class TB303Creator {
  public static create(config: InstrumentConfig): TB303 {
    if (!config.tb303) {
      throw new Error('TB303 config required for TB303 synth type');
    }
    
    // Create node - volume is handled separately via the volume signal
    const synth = new TB303({
      cutoff: config.tb303.filter.cutoff,
      resonance: config.tb303.filter.resonance,
      envMod: config.tb303.filterEnvelope.envMod,
      decay: config.tb303.filterEnvelope.decay,
      accent: config.tb303.accent.amount,
      waveform: config.tb303.oscillator.type,
    });

    // Access Volume signal correctly
    if (synth.volume) {
      synth.volume.volume.value = config.volume || -12;
    }
    
    // Load model if specified
    if (config.tb303.neuralModel) {
      synth.loadNeuralModel(config.tb303.neuralModel);
    }

    // Handle Devil Fish
    if (config.tb303.devilFish?.enabled) {
      synth.enableDevilFish(true, config.tb303.devilFish);
    }

    return synth;
  }
}
