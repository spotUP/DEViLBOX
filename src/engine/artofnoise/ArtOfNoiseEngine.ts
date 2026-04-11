/**
 * ArtOfNoiseEngine.ts - Singleton WASM engine for Art of Noise (AON4/AON8) replayer
 *
 * Uses a clean C11 port (from RetrovertApp/NostalgicPlayer) that supports
 * 4-channel (AON4) and 8-channel (AON8) formats with stereo float output.
 * Follows the PreTrackerEngine singleton pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import { getToneEngine } from '@engine/ToneEngine';

export class ArtOfNoiseEngine {
  private static instance: ArtOfNoiseEngine | null = null;
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

    this._initPromise = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    this.initialize();
  }

  static getInstance(): ArtOfNoiseEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!ArtOfNoiseEngine.instance || ArtOfNoiseEngine.instance._disposed ||
        ArtOfNoiseEngine.instance.audioContext !== currentCtx) {
      if (ArtOfNoiseEngine.instance && !ArtOfNoiseEngine.instance._disposed) {
        ArtOfNoiseEngine.instance.dispose();
      }
      ArtOfNoiseEngine.instance = new ArtOfNoiseEngine();
    }
    return ArtOfNoiseEngine.instance;
  }

  static hasInstance(): boolean {
    return !!ArtOfNoiseEngine.instance && !ArtOfNoiseEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await ArtOfNoiseEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[ArtOfNoiseEngine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}artofnoise/ArtOfNoise.worklet.js`);
      } catch {
        // Module might already be registered
      }

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}artofnoise/ArtOfNoise.wasm`),
          fetch(`${baseUrl}artofnoise/ArtOfNoise.js`),
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
      }

      this.loadedContexts.add(context);
    })();

    this.initPromises.set(context, initPromise);
    return initPromise;
  }

  private createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'artofnoise-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[ArtOfNoiseEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded':
          console.log('[ArtOfNoiseEngine] Module loaded');
          break;

        case 'chLevels':
          try {
            const engine = getToneEngine();
            const levels: number[] = data.levels;
            // levels is [ch0_L, ch0_R, ch1_L, ch1_R, ...] up to 8 channels
            for (let ch = 0; ch < levels.length / 2; ch++) {
              const peak = Math.max(levels[ch * 2], levels[ch * 2 + 1]);
              engine.triggerChannelMeter(ch, peak);
            }
          } catch { /* ToneEngine not ready */ }
          break;

        case 'error':
          console.error('[ArtOfNoiseEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: ArtOfNoiseEngine.wasmBinary,
      jsCode: ArtOfNoiseEngine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async ready(): Promise<void> {
    return this._initPromise;
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('ArtOfNoiseEngine not initialized');

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

  setChannelGain(channel: number, gain: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelGain', channel, gain });
  }

  setSubsong(index: number): void {
    this.workletNode?.port.postMessage({ type: 'setSubsong', subsong: index });
  }

  /** Set per-channel mute mask. Bit N=1 means channel N is active, 0=muted. */
  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    if (ArtOfNoiseEngine.instance === this) {
      ArtOfNoiseEngine.instance = null;
    }
  }
}
