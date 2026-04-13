/**
 * OrganyaEngine.ts - Singleton WASM engine wrapper for Organya replayer
 *
 * Manages the AudioWorklet node for Organya (Cave Story) module playback.
 * Follows the JamCrackerEngine/FCEngine/PreTrackerEngine singleton pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export class OrganyaEngine {
  private static instance: OrganyaEngine | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static soundbankData: ArrayBuffer | null = null;
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

    this._initPromise = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    this.initialize();
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

  private async initialize(): Promise<void> {
    try {
      await OrganyaEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[OrganyaEngine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}organya/Organya.worklet.js`);
      } catch {
        // Module might already be registered
      }

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse, sbResponse] = await Promise.all([
          fetch(`${baseUrl}organya/Organya.wasm`),
          fetch(`${baseUrl}organya/Organya.js`),
          !this.soundbankData ? fetch(`${baseUrl}organya/wave100.wdb`) : Promise.resolve(null),
        ]);

        if (wasmResponse.ok) {
          this.wasmBinary = await wasmResponse.arrayBuffer();
        }
        if (jsResponse.ok) {
          let code = await jsResponse.text();
          code = code
            .replace(/import\.meta\.url/g, "'.'")
            .replace(/export\s+default\s+\w+;?/g, '')
            .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
            .replace(/HEAPU8=new Uint8Array\(b\);/, 'HEAPU8=new Uint8Array(b);Module["HEAPU8"]=HEAPU8;')
            .replace(/HEAPF32=new Float32Array\(b\);/, 'HEAPF32=new Float32Array(b);Module["HEAPF32"]=HEAPF32;');
          this.jsCode = code;
        }
        if (sbResponse && sbResponse.ok && !this.soundbankData) {
          this.soundbankData = await sbResponse.arrayBuffer();
          console.log('[OrganyaEngine] Loaded wave100.wdb soundbank:', this.soundbankData.byteLength, 'bytes');
        }
      }

      this.loadedContexts.add(context);
    })();

    this.initPromises.set(context, initPromise);
    return initPromise;
  }

  private createNode(): void {
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
      wasmBinary: OrganyaEngine.wasmBinary,
      jsCode: OrganyaEngine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async ready(): Promise<void> {
    return this._initPromise;
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

  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    if (OrganyaEngine.instance === this) {
      OrganyaEngine.instance = null;
    }
  }
}
