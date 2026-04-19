/**
 * FredEditorReplayerEngine.ts - Singleton WASM engine wrapper for Fred Editor replayer
 *
 * Manages the AudioWorklet node for Fred Editor format module playback.
 * Follows the SteveTurnerEngine singleton pattern.
 */

import { getDevilboxAudioContext } from "@/utils/audio-context";
import { getToneEngine } from '@engine/ToneEngine';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class FredEditorReplayerEngine extends WASMSingletonBase {
  private static instance: FredEditorReplayerEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _pendingRequests: Map<number, { resolve: (data: unknown) => void }> = new Map();
  private _nextRequestId = 1;

  private constructor() {
    super();
    // Connect to destination for note preview (unlike most whole-song replayers,
    // this engine is also used for instrument-preview from the editor panel).
    this.output.connect(this.audioContext.destination);
    this.initialize(FredEditorReplayerEngine.cache);
  }

  static getInstance(): FredEditorReplayerEngine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    // Without this, the engine stays attached to a dead context on HMR /
    // iOS suspend / page reload and goes silent with no error.
    const currentCtx = getDevilboxAudioContext();
    if (
      !FredEditorReplayerEngine.instance ||
      FredEditorReplayerEngine.instance._disposed ||
      FredEditorReplayerEngine.instance.audioContext !== currentCtx
    ) {
      if (FredEditorReplayerEngine.instance && !FredEditorReplayerEngine.instance._disposed) {
        FredEditorReplayerEngine.instance.dispose();
      }
      FredEditorReplayerEngine.instance = new FredEditorReplayerEngine();
    }
    return FredEditorReplayerEngine.instance;
  }

  static hasInstance(): boolean {
    return !!FredEditorReplayerEngine.instance && !FredEditorReplayerEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'fred-wasm',
      workletFile: 'FredEditorReplayer.worklet.js',
      wasmFile: 'FredEditorReplayer.wasm',
      jsFile: 'FredEditorReplayer.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'fred-editor-replayer-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[FredEditorReplayerEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded':
          console.log('[FredEditorReplayerEngine] Module loaded');
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
          console.error('[FredEditorReplayerEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: FredEditorReplayerEngine.cache.wasmBinary,
      jsCode: FredEditorReplayerEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('FredEditorReplayerEngine not initialized');

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
    if (FredEditorReplayerEngine.instance === this) {
      FredEditorReplayerEngine.instance = null;
    }
  }
}
