/**
 * CoreDesignEngine.ts — Singleton WASM engine for Core Design replayer.
 * Transpiled from 68k assembly via asm68k-to-c.
 * Follows the standard WASM engine pattern (like ArtOfNoiseEngine).
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export class CoreDesignEngine {
  private static instance: CoreDesignEngine | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  readonly output: GainNode;

  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _disposed = false;

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this._initPromise = new Promise<void>((resolve) => { this._resolveInit = resolve; });
    this.initialize();
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

  private async initialize(): Promise<void> {
    try {
      await CoreDesignEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[CoreDesignEngine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;
    const existing = this.initPromises.get(context);
    if (existing) return existing;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      try {
        await context.audioWorklet.addModule(`${baseUrl}coredesign/CoreDesign.worklet.js`);
      } catch { /* Module may already be registered */ }

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResp, jsResp] = await Promise.all([
          fetch(`${baseUrl}coredesign/CoreDesign.wasm`),
          fetch(`${baseUrl}coredesign/CoreDesign.js`),
        ]);
        if (wasmResp.ok) this.wasmBinary = await wasmResp.arrayBuffer();
        if (jsResp.ok) {
          let code = await jsResp.text();
          code = code
            .replace(/import\.meta\.url/g, "'.'")
            .replace(/export\s+default\s+\w+;?/g, '');
          this.jsCode = code;
        }
      }
      this.loadedContexts.add(context);
    })();

    this.initPromises.set(context, initPromise);
    return initPromise;
  }

  private createNode(): void {
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
      wasmBinary: CoreDesignEngine.wasmBinary,
      jsCode: CoreDesignEngine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async ready(): Promise<void> { return this._initPromise; }

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

  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'stop' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    if (CoreDesignEngine.instance === this) CoreDesignEngine.instance = null;
  }
}
