import * as Tone from 'tone';
import type { InstrumentConfig } from '@typedefs/instrument';
import { InstrumentFactory } from '../InstrumentFactory';

export class InstrumentManager {
  // Instruments keyed by "instrumentId-channelIndex" for per-channel independence
  public instruments: Map<string, Tone.ToneAudioNode> = new Map();
  // Multi-sampler instances keyed by instrumentId
  private multiSamplers: Map<string, Tone.Sampler> = new Map();
  // Track synth types for proper release handling
  private instrumentSynthTypes: Map<string, string> = new Map();

  constructor() {}

  public getInstrumentKey(instrumentId: number, channelIndex?: number): string {
    return `${instrumentId}-${channelIndex ?? -1}`;
  }

  public getInstrumentInstance(key: string): Tone.ToneAudioNode | undefined {
    return this.instruments.get(key);
  }

  public getSynthType(key: string): string | undefined {
    return this.instrumentSynthTypes.get(key);
  }

  public getAllInstruments(): Map<string, Tone.ToneAudioNode> {
    return this.instruments;
  }

  public async preloadInstruments(configs: InstrumentConfig[]): Promise<void> {
    // Only preloads samplers as they need to load files
    const samplers = configs.filter(c => c.synthType === 'Sampler');
    if (samplers.length === 0) return;

    await Promise.all(samplers.map(async (config) => {
      // If instrument has multiple samples, create a multi-sampler
      if (config.samples && config.samples.length > 0) {
        await this.createMultiSampler(config);
      } else {
        this.createInstrument(config.id, config);
      }
    }));

    // Wait for Tone.js buffers to load
    await Tone.loaded();
  }

  private async createMultiSampler(config: InstrumentConfig): Promise<Tone.Sampler> {
    const urls: Record<string, string> = {};
    
    // Map samples to their respective base notes or use the sampleMap
    config.samples?.forEach((sample) => {
      // Use sample name or note name as key
      urls[sample.baseNote] = sample.url;
    });

    return new Promise((resolve) => {
      const sampler = new Tone.Sampler({
        urls,
        onload: () => {
          this.multiSamplers.set(config.id.toString(), sampler);
          resolve(sampler);
        }
      });
    });
  }

  public createInstrument(
    instrumentId: number, 
    config: InstrumentConfig, 
    channelIndex?: number
  ): Tone.ToneAudioNode {
    const key = this.getInstrumentKey(instrumentId, channelIndex);

    // Check if instrument already exists
    if (this.instruments.has(key)) {
      return this.instruments.get(key)!;
    }

    // Special case for Multi-Sample Sampler
    if (config.synthType === 'Sampler' && config.samples && config.samples.length > 0) {
      const sampler = this.multiSamplers.get(instrumentId.toString()) || new Tone.Sampler();
      // Clone sampler settings if needed...
      this.instruments.set(key, sampler);
      this.instrumentSynthTypes.set(key, config.synthType);
      return sampler;
    }

    const instrument = InstrumentFactory.createInstrument(config);

    // Apply filter if specified (and if the instrument has a built-in filter exposed)
    if (config.filter && (instrument as any).filter) {
      const inst = instrument as any;
      inst.filter.type = config.filter.type;
      inst.filter.frequency.value = config.filter.frequency;
      inst.filter.Q.value = config.filter.Q;
    }

    this.instruments.set(key, instrument);
    this.instrumentSynthTypes.set(key, config.synthType);

    return instrument;
  }

  public disposeInstrument(instrumentId: number): void {
    const keysToDelete: string[] = [];
    this.instruments.forEach((instrument, key) => {
      if (key.startsWith(`${instrumentId}-`)) {
        try {
          instrument.disconnect();
          instrument.dispose();
        } catch (error) {
          // May already be disposed
        }
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => {
      this.instruments.delete(key);
      this.instrumentSynthTypes.delete(key);
    });
  }

  public disposeAll(): void {
    this.instruments.forEach((instrument) => {
      try {
        instrument.dispose();
      } catch (e) {
        console.warn('[InstrumentManager] Failed to dispose instrument:', e);
      }
    });
    this.instruments.clear();
    this.instrumentSynthTypes.clear();
  }

  public updateTB303Parameters(instrumentId: number, tb303Config: NonNullable<InstrumentConfig['tb303']>): void {
    this.instruments.forEach((instrument, key) => {
      if (key.startsWith(`${instrumentId}-`) && (instrument as any).isTB303) {
        const synth = instrument as any;
        if (tb303Config.tuning !== undefined) synth.setTuning(tb303Config.tuning);
        if (tb303Config.filter) {
            synth.setCutoff(tb303Config.filter.cutoff);
            synth.setResonance(tb303Config.filter.resonance);
        }
        if (tb303Config.filterEnvelope) {
            synth.setEnvMod(tb303Config.filterEnvelope.envMod);
            synth.setDecay(tb303Config.filterEnvelope.decay);
        }
        if (tb303Config.accent) synth.setAccentAmount(tb303Config.accent.amount);
        if (tb303Config.slide) synth.setSlideTime(tb303Config.slide.time);
        if (tb303Config.oscillator) synth.setWaveform(tb303Config.oscillator.type);

        if (tb303Config.devilFish) {
            synth.enableDevilFish(tb303Config.devilFish.enabled, tb303Config.devilFish);
        }
      }
    });
  }
}
