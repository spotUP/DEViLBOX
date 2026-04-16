/**
 * SoundMonSynth.ts — SoundMon synth interface with automation param routing
 * Routes params via SoundMonEngine.setInstrumentParam() → WASM _sm_set_instrument_param()
 */
import { SoundMonEngine } from './SoundMonEngine';

export class SoundMonSynth {
  private engine: SoundMonEngine;
  readonly output: GainNode;
  readonly name = 'SoundMonSynth';

  constructor(_audioContext?: AudioContext) {
    this.engine = SoundMonEngine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): SoundMonEngine { return this.engine; }

  set(param: string, value: number): void {
    switch (param) {
      case 'volume':
        this.output.gain.value = Math.max(0, Math.min(1, value));
        // Also set instrument volume (0-64 range)
        this.engine.setInstrumentParam(0, 'volume', Math.round(value * 64));
        break;
      case 'lfoSpeed':
        this.engine.setInstrumentParam(0, 'lfoSpeed', Math.round(value * 255));
        break;
      case 'lfoDepth':
        this.engine.setInstrumentParam(0, 'lfoDepth', Math.round(value * 255));
        break;
      case 'lfoDelay':
        this.engine.setInstrumentParam(0, 'lfoDelay', Math.round(value * 255));
        break;
      case 'adsrSpeed':
        this.engine.setInstrumentParam(0, 'adsrSpeed', Math.round(value * 255));
        break;
      case 'adsrControl':
        this.engine.setInstrumentParam(0, 'adsrControl', Math.round(value * 255));
        break;
      case 'waveTable':
        this.engine.setInstrumentParam(0, 'waveTable', Math.round(value * 15));
        break;
      case 'egControl':
        this.engine.setInstrumentParam(0, 'egControl', Math.round(value * 255));
        break;
    }
  }

  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
