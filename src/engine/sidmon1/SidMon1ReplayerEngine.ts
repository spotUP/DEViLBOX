/**
 * SidMon1ReplayerEngine.ts - Singleton WASM engine for SidMon 1.0 song playback
 *
 * This is the REPLAYER engine (full song playback via Paula emulation).
 * Separate from SidMon1Engine which is the SYNTH engine (instrument preview).
 *
 * Follows the SteveTurnerEngine singleton pattern exactly.
 *
 * NOTE: SidMon1 playback has a pre-existing silence issue on some files
 * (confirmed on myfunnymazea.sid both pre- and post-refactor). The WASM
 * init + loadModule + resume sequence all complete successfully, yet no
 * audio samples reach the output. Likely a worklet/WASM format-variant
 * bug rather than a TS-side problem. Leaving a separate TODO for that.
 */

import { getToneEngine } from '@engine/ToneEngine';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class SidMon1ReplayerEngine extends WASMSingletonBase {
  private static instance: SidMon1ReplayerEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _pendingRequests: Map<number, { resolve: (data: unknown) => void }> = new Map();
  private _nextRequestId = 1;

  private constructor() {
    super();
    // Connect to destination for note preview (same reasoning as FredEditorReplayerEngine).
    this.output.connect(this.audioContext.destination);
    this.initialize(SidMon1ReplayerEngine.cache);
  }

  static getInstance(): SidMon1ReplayerEngine {
    if (!SidMon1ReplayerEngine.instance || SidMon1ReplayerEngine.instance._disposed) {
      SidMon1ReplayerEngine.instance = new SidMon1ReplayerEngine();
    }
    return SidMon1ReplayerEngine.instance;
  }

  static hasInstance(): boolean {
    return !!SidMon1ReplayerEngine.instance && !SidMon1ReplayerEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'sidmon1',
      workletFile: 'SidMon1Replayer.worklet.js',
      wasmFile: 'SidMon1Replayer.wasm',
      jsFile: 'SidMon1Replayer.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'sidmon1-replayer-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[SidMon1ReplayerEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded':
          console.log('[SidMon1ReplayerEngine] Module loaded');
          break;

        case 'chLevels':
          try {
            const engine = getToneEngine();
            const levels: number[] = data.levels;
            for (let i = 0; i < levels.length; i++) {
              engine.triggerChannelMeter(i, levels[i]);
            }
          } catch { /* ToneEngine not ready */ }
          break;

        case 'instrumentParam':
        case 'numInstruments': {
          const pending = this._pendingRequests.get(data.requestId);
          if (pending) {
            this._pendingRequests.delete(data.requestId);
            pending.resolve(data);
          }
          break;
        }

        case 'error':
          console.error('[SidMon1ReplayerEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: SidMon1ReplayerEngine.cache.wasmBinary,
      jsCode: SidMon1ReplayerEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('SidMon1ReplayerEngine not initialized');

    this.workletNode.port.postMessage(
      { type: 'loadModule', moduleData: buffer },
    );
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'resume' });
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'pause' });
  }

  pause(): void {
    this.workletNode?.port.postMessage({ type: 'pause' });
  }

  setChannelGain(channel: number, gain: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelGain', channel, gain });
  }

  setSubsong(index: number): void {
    this.workletNode?.port.postMessage({ type: 'setSubsong', subsong: index });
  }

  setInstrumentParam(inst: number, paramId: number, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setInstrumentParam', inst, paramId, value });
  }

  noteOn(instrument: number, note: number, velocity = 127): void {
    this.workletNode?.port.postMessage({ type: 'noteOn', instrument, note, velocity });
  }

  noteOff(): void {
    this.workletNode?.port.postMessage({ type: 'noteOff' });
  }

  async getInstrumentParam(inst: number, paramId: number): Promise<number> {
    await this._initPromise;
    const data = await this._sendRequest({ type: 'getInstrumentParam', inst, paramId }) as { value: number };
    return data.value;
  }

  async getNumInstruments(): Promise<number> {
    await this._initPromise;
    const data = await this._sendRequest({ type: 'getNumInstruments' }) as { count: number };
    return data.count;
  }

  private _sendRequest(msg: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve) => {
      const requestId = this._nextRequestId++;
      this._pendingRequests.set(requestId, { resolve });
      this.workletNode?.port.postMessage({ ...msg, requestId });
    });
  }

  /** Set per-channel mute mask. Bit N=1 means channel N is active, 0=muted. */
  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  override dispose(): void {
    super.dispose();
    if (SidMon1ReplayerEngine.instance === this) {
      SidMon1ReplayerEngine.instance = null;
    }
  }
}
