/**
 * OrganyaEngine.ts - Singleton WASM engine wrapper for Organya replayer
 *
 * Manages the AudioWorklet node for Organya (Cave Story) module playback.
 * Follows the JamCrackerEngine/FCEngine/PreTrackerEngine singleton pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
  loadWASMAssets,
} from '@engine/wasm/WASMSingletonBase';

export class OrganyaEngine extends WASMSingletonBase {
  private static instance: OrganyaEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();
  private static soundbankData: ArrayBuffer | null = null;

  private constructor() {
    super();
    // Use overridden initialize() below to also fetch the soundbank.
    void this._initOrganya();
  }

  static getInstance(): OrganyaEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!OrganyaEngine.instance || OrganyaEngine.instance._disposed ||
        OrganyaEngine.instance.audioContext !== currentCtx) {
      if (OrganyaEngine.instance && !OrganyaEngine.instance._disposed) {
        OrganyaEngine.instance.dispose();
      }
      OrganyaEngine.instance = new OrganyaEngine();
    }
    return OrganyaEngine.instance;
  }

  static hasInstance(): boolean {
    return !!OrganyaEngine.instance && !OrganyaEngine.instance._disposed;
  }

  private async _initOrganya(): Promise<void> {
    try {
      // Fetch the soundbank in parallel with standard WASM asset loading.
      const baseUrl = import.meta.env.BASE_URL || '/';
      const [, sbResp] = await Promise.all([
        loadWASMAssets(this.audioContext, OrganyaEngine.cache, this.getLoaderConfig()),
        !OrganyaEngine.soundbankData
          ? fetch(`${baseUrl}organya/wave100.wdb`).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (sbResp && sbResp.ok && !OrganyaEngine.soundbankData) {
        OrganyaEngine.soundbankData = await sbResp.arrayBuffer();
        console.log('[OrganyaEngine] Loaded wave100.wdb soundbank:', OrganyaEngine.soundbankData.byteLength, 'bytes');
      }
      this.createNode();
    } catch (err) {
      console.error('[OrganyaEngine] Initialization failed:', err);
    }
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'organya',
      workletFile: 'Organya.worklet.js',
      wasmFile: 'Organya.wasm',
      jsFile: 'Organya.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'organya-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[OrganyaEngine] WASM ready');
          // Send soundbank before resolving init so loadTune() can use it
          if (OrganyaEngine.soundbankData && this.workletNode) {
            this.workletNode.port.postMessage(
              { type: 'loadSoundbank', soundbankData: OrganyaEngine.soundbankData },
            );
          }
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded':
          console.log('[OrganyaEngine] Module loaded');
          break;

        case 'error':
          console.error('[OrganyaEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: OrganyaEngine.cache.wasmBinary,
      jsCode: OrganyaEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('OrganyaEngine not initialized');

    this.workletNode.port.postMessage(
      { type: 'loadModule', moduleData: buffer },
    );
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play' });
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  pause(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  override dispose(): void {
    super.dispose();
    if (OrganyaEngine.instance === this) {
      OrganyaEngine.instance = null;
    }
  }
}
