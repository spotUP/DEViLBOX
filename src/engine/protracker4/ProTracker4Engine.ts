/**
 * ProTracker4Engine - plays ProTracker 4 (PT 4.1) songs with libpt4, the replayer from the ProTracker 4
 * repository, compiled to WASM (protracker4-wasm/). The whole module is the input; an edited module is
 * swapped in while the song plays (swapModule).
 */
import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class ProTracker4Engine extends WASMSingletonBase {
  private static instance: ProTracker4Engine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(ProTracker4Engine.cache);
  }

  static getInstance(): ProTracker4Engine {
    const currentCtx = getDevilboxAudioContext();
    if (!ProTracker4Engine.instance || ProTracker4Engine.instance._disposed || ProTracker4Engine.instance.audioContext !== currentCtx) {
      if (ProTracker4Engine.instance && !ProTracker4Engine.instance._disposed) ProTracker4Engine.instance.dispose();
      ProTracker4Engine.instance = new ProTracker4Engine();
    }
    return ProTracker4Engine.instance;
  }

  static hasInstance(): boolean {
    return !!ProTracker4Engine.instance && !ProTracker4Engine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return { dir: 'protracker4', workletFile: 'ProTracker4.worklet.js', wasmFile: 'ProTracker4.wasm', jsFile: 'ProTracker4.js' };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'protracker4-processor', { outputChannelCount: [2], numberOfOutputs: 1 });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;
        case 'moduleLoaded':
          this.settleModuleLoad();
          break;
        case 'error':
          console.error('[ProTracker4Engine]', data.message);
          this.failModuleLoad(String(data.message ?? 'module load failed'));
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: ProTracker4Engine.cache.wasmBinary,
      jsCode: ProTracker4Engine.cache.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('ProTracker4Engine not initialized');
    const answered = this.beginModuleLoad();
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
    await answered;
  }

  /** The edited module takes the place of the playing one, at the position the song is at. */
  swapModule(buffer: ArrayBuffer): void {
    this.workletNode?.port.postMessage({ type: 'swapModule', moduleData: buffer });
  }

  play(): void { this.workletNode?.port.postMessage({ type: 'play' }); }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'pause' }); }

  /** Bit N set = channel N audible. */
  setMuteMask(mask: number): void { this.workletNode?.port.postMessage({ type: 'setMuteMask', mask }); }

  override dispose(): void {
    super.dispose();
    if (ProTracker4Engine.instance === this) ProTracker4Engine.instance = null;
  }
}
