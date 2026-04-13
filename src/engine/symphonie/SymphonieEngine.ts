/**
 * SymphonieEngine.ts — Singleton AudioWorklet wrapper for Symphonie Pro (WASM)
 *
 * Loads the Emscripten-compiled Symphonie WASM module into an AudioWorklet.
 * The worklet receives the JS glue code + WASM binary, instantiates the module,
 * then accepts song data and playback commands.
 *
 * Usage: call SymphonieEngine.getInstance() to get (or create) the singleton.
 * Multiple SymphonieSynth instances share this single engine.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import type { SymphoniePlaybackData } from './SymphoniePlaybackData';

export class SymphonieEngine {
  private static instance: SymphonieEngine | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;

  private workletNode: AudioWorkletNode | null = null;
  private audioContext: AudioContext;
  private _disposed = false;

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
  }

  static hasInstance(): boolean {
    return SymphonieEngine.instance !== null && !SymphonieEngine.instance._disposed;
  }

  static getInstance(): SymphonieEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!SymphonieEngine.instance || SymphonieEngine.instance._disposed ||
        SymphonieEngine.instance.audioContext !== currentCtx) {
      if (SymphonieEngine.instance && !SymphonieEngine.instance._disposed) {
        SymphonieEngine.instance.dispose();
      }
      SymphonieEngine.instance = new SymphonieEngine();
    }
    return SymphonieEngine.instance;
  }

  async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (SymphonieEngine.loadedContexts.has(ctx)) return;

    const existing = SymphonieEngine.initPromises.get(ctx);
    if (existing) return existing;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      // Register the WASM worklet processor
      try {
        await ctx.audioWorklet.addModule(`${baseUrl}symphonie/SymphonieWasm.worklet.js`);
      } catch {
        /* Module might already be registered */
      }

      // Fetch the Emscripten JS glue and WASM binary (cached for reuse)
      if (!SymphonieEngine.wasmBinary || !SymphonieEngine.jsCode) {
        const [jsResp, wasmResp] = await Promise.all([
          fetch(`${baseUrl}symphonie/SymphonieWasm.js`),
          fetch(`${baseUrl}symphonie/SymphonieWasm.wasm`),
        ]);
        SymphonieEngine.jsCode = await jsResp.text();
        SymphonieEngine.wasmBinary = await wasmResp.arrayBuffer();
      }

      SymphonieEngine.loadedContexts.add(ctx);
    })();

    SymphonieEngine.initPromises.set(ctx, initPromise);
    return initPromise;
  }

  async loadSong(ctx: AudioContext, data: SymphoniePlaybackData): Promise<void> {
    await this.ensureInitialized(ctx);

    // Disconnect any previous node
    this.workletNode?.disconnect();
    this.workletNode = null;

    // Create the AudioWorkletNode
    this.workletNode = new AudioWorkletNode(ctx, 'symphonie-wasm-processor', {
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    // Wait for WASM module to initialize in the worklet
    const wasmReadyPromise = new Promise<void>((resolve, reject) => {
      const node = this.workletNode!;
      const timeout = setTimeout(() => reject(new Error('[SymphonieEngine] WASM init timeout')), 10000);

      node.port.onmessage = (event) => {
        const msg = event.data as { type: string; message?: string };
        if (msg.type === 'wasmReady') {
          clearTimeout(timeout);
          resolve();
        } else if (msg.type === 'error') {
          clearTimeout(timeout);
          reject(new Error(`[SymphonieEngine] ${msg.message ?? 'worklet error'}`));
        }
      };
    });

    // Send WASM binary + JS glue to worklet
    const wasmCopy = SymphonieEngine.wasmBinary!.slice(0); // copy so we can reuse the cached original
    this.workletNode.port.postMessage(
      {
        type: 'init',
        sampleRate: ctx.sampleRate,
        wasmBinary: wasmCopy,
        jsCode: SymphonieEngine.jsCode,
      },
      [wasmCopy] // transfer the same copy
    );

    await wasmReadyPromise;

    // Now load the song data
    const readyPromise = new Promise<void>((resolve, reject) => {
      const node = this.workletNode!;
      const timeout = setTimeout(() => reject(new Error('[SymphonieEngine] Song load timeout')), 10000);

      node.port.onmessage = (event) => {
        const msg = event.data as { type: string; message?: string };
        if (msg.type === 'ready') {
          clearTimeout(timeout);
          resolve();
        } else if (msg.type === 'error') {
          clearTimeout(timeout);
          reject(new Error(`[SymphonieEngine] ${msg.message ?? 'worklet error'}`));
        } else if (msg.type === 'finished') {
          // Song finished playing — handled elsewhere
        } else if (msg.type === 'debug') {
          console.log(`[SymphonieWorklet] ${msg.message}`);
        }
      };
    });

    this.workletNode.port.postMessage({ type: 'load', playbackData: data });

    await readyPromise;
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play' });
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  setVolume(v: number): void {
    this.workletNode?.port.postMessage({ type: 'volume', value: v });
  }

  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  /** Set interpolation mode: 0=none (original), 1=linear, 2=cubic */
  setInterpMode(mode: number): void {
    this.workletNode?.port.postMessage({ type: 'setInterpMode', mode });
  }

  getNode(): AudioWorkletNode | null {
    return this.workletNode;
  }

  setInstrumentParam(instrument: number, param: string, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setInstrumentParam', instrument, param, value });
  }

  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    if (SymphonieEngine.instance === this) {
      SymphonieEngine.instance = null;
    }
  }
}
