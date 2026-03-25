import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { loadZSG2ROMs } from '@engine/mame/MAMEROMLoader';

/**
 * ZSG2Synth - ZOOM ZSG-2 48-Channel Wavetable Synthesizer (WASM)
 *
 * 48-channel wavetable synth with 2:1 compressed samples,
 * emphasis filter, IIR lowpass with ramping, volume ramping,
 * 4 output busses (reverb, chorus, left, right).
 * Extracted from MAME's zsg2 emulator.
 */
export class ZSG2Synth extends MAMEBaseSynth {
  readonly name = 'ZSG2Synth';
  protected readonly chipName = 'ZSG2';
  protected readonly workletFile = 'ZSG2.worklet.js';
  protected readonly processorName = 'zsg2-processor';

  constructor() {
    super();
    this.initSynth();
  }

  /**
   * Override initialize to auto-load ZSG-2 ROM before worklet initialization
   */
  protected async initialize(): Promise<void> {
    try {
      const romData = await loadZSG2ROMs();

      await super.initialize();

      if (!romData) {
        console.warn('[ZSG2] ROM not found — synth will be silent until ROM is uploaded');
        return;
      }

      // Transfer ROM buffer to worklet
      const romBuffer = romData.buffer.slice(romData.byteOffset, romData.byteOffset + romData.byteLength);
      this.workletNode!.port.postMessage(
        { type: 'loadROM', data: romBuffer },
        [romBuffer]
      );

      this.romLoaded = true;
      this._updateRomStatus(true);
      console.log('[ZSG2] ROM loaded successfully:', romData.length, 'bytes');
    } catch (error) {
      console.error('[ZSG2] ROM loading failed:', error);
      console.error('Place ROM files in /public/roms/zsg2/ — see /public/roms/README.md');
    }
  }

  protected writeKeyOn(note: number, velocity: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'noteOn', note, velocity: Math.floor(velocity * 127) });
  }

  protected writeKeyOff(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'noteOff', note: this.currentNote });
  }

  protected writeFrequency(freq: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setFrequency', freq });
  }

  protected writeVolume(volume: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setVolume', value: Math.round(volume * 255) });
  }

  protected writePanning(pan: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setPanning', pan });
  }

  private static readonly PARAM_IDS: Record<string, number> = {
    volume: 0, attack: 1, release: 2,
  };

  setParam(param: string, value: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'setParam', args: [param, value] });
      return;
    }
    if (!this.workletNode || this._disposed) return;
    const paramId = ZSG2Synth.PARAM_IDS[param];
    if (paramId !== undefined) {
      this.workletNode.port.postMessage({ type: 'setParameter', paramId, value });
    }
  }
}
