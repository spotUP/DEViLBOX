/**
 * CoreDesignEngine.ts — Singleton WASM engine for Core Design replayer.
 * Transpiled from 68k assembly via asm68k-to-c.
 * Follows the standard WASM engine pattern (like ArtOfNoiseEngine).
 */

import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

/** CoreDesign only strips the ESM markers — no wasmBinary / HEAP rewrites. */
function coreDesignTransform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '');
}

export class CoreDesignEngine extends WASMSingletonBase {
  private static instance: CoreDesignEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(CoreDesignEngine.cache);
  }

  static getInstance(): CoreDesignEngine {
    if (!CoreDesignEngine.instance || CoreDesignEngine.instance._disposed) {
      CoreDesignEngine.instance = new CoreDesignEngine();
    }
    return CoreDesignEngine.instance;
  }

  static hasInstance(): boolean {
    return !!CoreDesignEngine.instance && !CoreDesignEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'coredesign',
      workletFile: 'CoreDesign.worklet.js',
      wasmFile: 'CoreDesign.wasm',
      jsFile: 'CoreDesign.js',
      transformJS: coreDesignTransform,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'coredesign-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data as { type: string; [k: string]: unknown };
      switch (data.type) {
        case 'ready':
          console.log('[CoreDesignEngine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'loaded':
          console.log('[CoreDesignEngine] Module loaded:', data.title);
          break;
        case 'error':
          console.error('[CoreDesignEngine] Error:', data.msg);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: CoreDesignEngine.cache.wasmBinary,
      jsCode: CoreDesignEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async loadTune(data: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('CoreDesignEngine not initialized');
    const copy = data.slice(0);
    this.workletNode.port.postMessage({ type: 'load', data: copy }, [copy]);
  }

  play(): void { /* Starts playing on load */ }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }

  setChannelGain(channel: number, gain: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelGain', channel, gain });
  }

  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  override dispose(): void {
    // Custom: original used `stop` not `dispose` as shutdown signal, preserve.
    this._disposed = true;
    try { this.workletNode?.port.postMessage({ type: 'stop' }); } catch { /* */ }
    try { this.workletNode?.disconnect(); } catch { /* */ }
    this.workletNode = null;
    if (CoreDesignEngine.instance === this) CoreDesignEngine.instance = null;
  }
}
