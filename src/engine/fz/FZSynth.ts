import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';

/**
 * FZSynth - Casio FZ-1 16-bit PCM Sampler (WASM)
 * 8-voice sample playback with fractional pitch, loop modes, reverse playback.
 * Extracted from MAME's fz_pcm emulator by Devin Acker.
 */
export class FZSynth extends MAMEBaseSynth {
  readonly name = 'FZSynth';
  protected readonly chipName = 'FZ';
  protected readonly workletFile = 'FZ.worklet.js';
  protected readonly processorName = 'fz-processor';

  constructor() {
    super();
    this.initSynth();
  }

  /**
   * Generate a default sine wave sample (16-bit PCM, one full cycle at 44100 Hz)
   * and load it into all FZ voices so the synth produces sound out of the box.
   */
  protected async initialize(): Promise<void> {
    await super.initialize();

    try {
      // Generate one cycle of a sine wave at 440 Hz root pitch (100 samples at 44100 Hz)
      // The FZ-1 uses 16-bit signed PCM (little-endian)
      const sampleRate = 44100;
      const frequency = 440;
      const numSamples = Math.round(sampleRate / frequency); // ~100 samples per cycle
      const pcmBuffer = new ArrayBuffer(numSamples * 2); // 2 bytes per 16-bit sample
      const pcmData = new Int16Array(pcmBuffer);

      for (let i = 0; i < numSamples; i++) {
        pcmData[i] = Math.round(Math.sin((2 * Math.PI * i) / numSamples) * 32767);
      }

      // Load into all 8 voices
      this.workletNode!.port.postMessage(
        { type: 'loadSample', data: pcmBuffer },
        [pcmBuffer]
      );

      this.romLoaded = true;
      console.log('[FZ] Default sine wave sample loaded:', numSamples, 'samples');
    } catch (error) {
      console.error('[FZ] Failed to load default sample:', error);
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
    volume: 0, filter_cutoff: 1, attack: 2, release: 3, loop_mode: 4,
  };

  setParam(param: string, value: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'setParam', args: [param, value] });
      return;
    }
    if (!this.workletNode || this._disposed) return;
    const paramId = FZSynth.PARAM_IDS[param];
    if (paramId !== undefined) {
      this.workletNode.port.postMessage({ type: 'setParameter', paramId, value });
    }
  }
}
