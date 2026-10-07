/**
 * SteveTurnerEngine.ts - Singleton WASM engine wrapper for Steve Turner replayer
 *
 * Manages the AudioWorklet node for Steve Turner format module playback.
 * Follows the PumaTrackerEngine singleton pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import { getToneEngine } from '@engine/ToneEngine';
import { ChannelMeterFeed } from '../tone/channelMeterFeed';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

const meterFeed = new ChannelMeterFeed();

export class SteveTurnerEngine extends WASMSingletonBase {
  private static instance: SteveTurnerEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _pendingRequests: Map<number, { resolve: (data: unknown) => void }> = new Map();
  private _nextRequestId = 1;
  /** True between play() and stop()/pause(): the song is running in the worklet. */
  private _songPlaying = false;
  /** The module bytes a key loaded (paused) when no song was running; null when the engine holds the song's own load. */
  private _previewSource: ArrayBuffer | null = null;

  private constructor() {
    super();
    // Connect to destination for note preview (startNativeEngines will
    // reconnect through stereo separation during song playback)
    this.output.connect(this.audioContext.destination);
    this.initialize(SteveTurnerEngine.cache);
  }

  static getInstance(): SteveTurnerEngine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    // Without this, the engine stays attached to a dead context on HMR /
    // iOS suspend / page reload and goes silent with no error.
    const currentCtx = getDevilboxAudioContext();
    if (
      !SteveTurnerEngine.instance ||
      SteveTurnerEngine.instance._disposed ||
      SteveTurnerEngine.instance.audioContext !== currentCtx
    ) {
      if (SteveTurnerEngine.instance && !SteveTurnerEngine.instance._disposed) {
        SteveTurnerEngine.instance.dispose();
      }
      SteveTurnerEngine.instance = new SteveTurnerEngine();
    }
    return SteveTurnerEngine.instance;
  }

  static hasInstance(): boolean {
    return !!SteveTurnerEngine.instance && !SteveTurnerEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'steveturner',
      workletFile: 'SteveTurner.worklet.js',
      wasmFile: 'SteveTurner.wasm',
      jsFile: 'SteveTurner.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'steveturner-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[SteveTurnerEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded':
          console.log('[SteveTurnerEngine] Module loaded');
          break;

        case 'chLevels':
          try {
            const engine = getToneEngine();
            const levels: number[] = data.levels;
            const noteStarts: number[] | null = data.noteStarts;
            if (noteStarts) meterFeed.feedCounted(engine, levels, noteStarts);
            else meterFeed.feed(engine, levels);
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
          console.error('[SteveTurnerEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: SteveTurnerEngine.cache.wasmBinary,
      jsCode: SteveTurnerEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('SteveTurnerEngine not initialized');

    this.workletNode.port.postMessage(
      { type: 'loadModule', moduleData: buffer },
    );
    this._previewSource = null;
  }

  /**
   * Make the replayer hold `module` for a key when no song is running (a key before the first Play, or after
   * Stop): player_load starts the song, so the load is followed at once by a pause, which keeps the module and
   * the preview voice (it ticks while the song is paused) without the song sounding. A running song, or the
   * module this engine already holds for the keys, is left alone.
   */
  async loadPreviewModule(module: ArrayBuffer): Promise<void> {
    if (this._songPlaying || this._previewSource === module) return;
    await this._initPromise;
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: module.slice(0) });
    this.workletNode.port.postMessage({ type: 'pause' });
    this._previewSource = module;
  }

  play(): void {
    // Resume playback (loadTune already starts the song via player_load)
    this._songPlaying = true;
    this.workletNode?.port.postMessage({ type: 'resume' });
  }

  stop(): void {
    // Pause instead of stop to keep module loaded for note preview
    this._songPlaying = false;
    this.workletNode?.port.postMessage({ type: 'pause' });
  }

  pause(): void {
    this._songPlaying = false;
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
    if (SteveTurnerEngine.instance === this) {
      SteveTurnerEngine.instance = null;
    }
  }
}
