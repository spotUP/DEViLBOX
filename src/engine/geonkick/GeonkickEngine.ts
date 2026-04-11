/**
 * GeonkickEngine.ts — singleton WASM wrapper for the Geonkick percussion synth.
 *
 * Geonkick bakes each kick sample offline via its synth engine, then reads
 * from the baked buffer when a note is triggered. The worklet handles the
 * bake (worker_stub.c runs it synchronously on any parameter change) and
 * exposes a tiny trigger-only surface over a MessagePort.
 *
 * MVP: default single-kick preset, no parameter tweaking exposed beyond
 * length and limiter. Expand the wire protocol in Geonkick.worklet.js to
 * surface the ~130 upstream setters when UI work starts.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export class GeonkickEngine {
  private static instance: GeonkickEngine | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  readonly output: GainNode;

  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _rejectInit: ((err: Error) => void) | null = null;
  private _disposed = false;

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this._initPromise = new Promise<void>((resolve, reject) => {
      this._resolveInit = resolve;
      this._rejectInit = reject;
    });

    this.initialize();
  }

  static getInstance(): GeonkickEngine {
    const currentCtx = getDevilboxAudioContext();
    if (
      !GeonkickEngine.instance ||
      GeonkickEngine.instance._disposed ||
      GeonkickEngine.instance.audioContext !== currentCtx
    ) {
      if (GeonkickEngine.instance && !GeonkickEngine.instance._disposed) {
        GeonkickEngine.instance.dispose();
      }
      GeonkickEngine.instance = new GeonkickEngine();
    }
    return GeonkickEngine.instance;
  }

  static hasInstance(): boolean {
    return !!GeonkickEngine.instance && !GeonkickEngine.instance._disposed;
  }

  /** Resolves when the worklet has created its WASM synth instance. */
  ready(): Promise<void> {
    return this._initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      await GeonkickEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[GeonkickEngine] initialization failed:', err);
      this._rejectInit?.(err as Error);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;
    const existing = this.initPromises.get(context);
    if (existing) return existing;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      await context.audioWorklet.addModule(`${baseUrl}geonkick/Geonkick.worklet.js`);

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResp, jsResp] = await Promise.all([
          fetch(`${baseUrl}geonkick/Geonkick.wasm`),
          fetch(`${baseUrl}geonkick/Geonkick.js`),
        ]);
        if (wasmResp.ok) this.wasmBinary = await wasmResp.arrayBuffer();
        if (jsResp.ok) {
          let code = await jsResp.text();
          // Transform the Emscripten glue so it evaluates cleanly inside
          // `new Function()` in an AudioWorklet context, and so HEAPF32 /
          // HEAPU8 become accessible via the returned Module object.
          code = code
            .replace(/import\.meta\.url/g, "'.'")
            .replace(/export\s+default\s+\w+;?/g, '')
            .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
            .replace(
              /HEAPU8=new Uint8Array\(b\);/,
              'HEAPU8=new Uint8Array(b);Module["HEAPU8"]=HEAPU8;',
            )
            .replace(
              /HEAPF32=new Float32Array\(b\);/,
              'HEAPF32=new Float32Array(b);Module["HEAPF32"]=HEAPF32;',
            );
          this.jsCode = code;
        }
      }

      this.loadedContexts.add(context);
    })();

    this.initPromises.set(context, initPromise);
    return initPromise;
  }

  private createNode(): void {
    this.workletNode = new AudioWorkletNode(this.audioContext, 'geonkick-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'ready') {
        this._resolveInit?.();
        this._resolveInit = null;
      } else if (data.type === 'error') {
        console.error('[GeonkickEngine] worklet error:', data.message);
        this._rejectInit?.(new Error(data.message));
        this._rejectInit = null;
      }
    };

    this.workletNode.connect(this.output);

    this.workletNode.port.postMessage({
      type: 'init',
      wasmBinary: GeonkickEngine.wasmBinary,
      jsCode: GeonkickEngine.jsCode,
    });
  }

  /** Trigger a note. Note is MIDI number; velocity is 0-127. */
  triggerNote(note: number, velocity = 127): void {
    this.workletNode?.port.postMessage({
      type: 'noteOn',
      note: note | 0,
      velocity: Math.max(0, Math.min(127, velocity | 0)),
    });
  }

  /** Release a note. Most kick presets ignore note-off (one-shot). */
  releaseNote(note: number): void {
    this.workletNode?.port.postMessage({
      type: 'noteOff',
      note: note | 0,
    });
  }

  /** Set the kick length in seconds (0.05..4.0). Triggers a rebake. */
  setLength(seconds: number): void {
    this.workletNode?.port.postMessage({
      type: 'setLength',
      seconds: Math.max(0.05, Math.min(4.0, seconds)),
    });
  }

  /** Master limiter (0..1.5 in upstream units, 1.0 = unity). */
  setLimiter(value: number): void {
    this.workletNode?.port.postMessage({
      type: 'setLimiter',
      value: Math.max(0, Math.min(1.5, value)),
    });
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    if (this.workletNode) {
      try {
        this.workletNode.port.postMessage({ type: 'dispose' });
      } catch {
        /* port may already be closed */
      }
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    try {
      this.output.disconnect();
    } catch {
      /* ignore */
    }
    if (GeonkickEngine.instance === this) {
      GeonkickEngine.instance = null;
    }
  }
}
