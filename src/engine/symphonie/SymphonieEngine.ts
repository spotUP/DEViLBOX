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
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@/engine/wasm/WASMSingletonBase';
import type { SymphoniePlaybackData } from './SymphoniePlaybackData';

export class SymphonieEngine extends WASMSingletonBase {
  private static instance: SymphonieEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(SymphonieEngine.cache);
  }

  static hasInstance(): boolean {
    return !!SymphonieEngine.instance && !SymphonieEngine.instance.isDisposed;
  }

  static getInstance(): SymphonieEngine {
    const currentCtx = getDevilboxAudioContext();
    const existing = SymphonieEngine.instance;
    if (!existing || existing.isDisposed || existing['audioContext'] !== currentCtx) {
      if (existing && !existing.isDisposed) existing.dispose();
      SymphonieEngine.instance = new SymphonieEngine();
    }
    return SymphonieEngine.instance as SymphonieEngine;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'symphonie',
      workletFile: 'SymphonieWasm.worklet.js',
      wasmFile: 'SymphonieWasm.wasm',
      jsFile: 'SymphonieWasm.js',
      // Symphonie's JS glue is evaluated in-worklet via the {wasmBinary, jsCode}
      // init message, so no additional transform is required beyond the default.
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'symphonie-wasm-processor', {
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    // The worklet acknowledges 'init' with 'wasmReady'. Resolve the engine's
    // ready() promise at that point; loadSong() awaits ready() before posting.
    const timeout = setTimeout(() => {
      console.error('[SymphonieEngine] WASM init timeout');
      this._resolveInit?.();
      this._resolveInit = null;
    }, 10000);

    this.workletNode.port.onmessage = (event) => {
      const msg = event.data as { type: string; message?: string };
      if (msg.type === 'wasmReady') {
        clearTimeout(timeout);
        this._resolveInit?.();
        this._resolveInit = null;
      } else if (msg.type === 'error') {
        clearTimeout(timeout);
        console.error('[SymphonieEngine]', msg.message);
        this._resolveInit?.();
        this._resolveInit = null;
      } else if (msg.type === 'debug') {
        console.log(`[SymphonieWorklet] ${msg.message}`);
      }
      // 'ready' (post-loadSong), 'finished' etc. are handled by loadSong's
      // own temporary onmessage handler installed below.
    };

    // Hand off the cached WASM + JS glue to the worklet for module init.
    const wasmBinary = SymphonieEngine.cache.wasmBinary;
    const jsCode = SymphonieEngine.cache.jsCode;
    if (!wasmBinary || !jsCode) {
      console.error('[SymphonieEngine] assets missing after initialize');
      return;
    }
    const wasmCopy = wasmBinary.slice(0);
    this.workletNode.port.postMessage(
      {
        type: 'init',
        sampleRate: ctx.sampleRate,
        wasmBinary: wasmCopy,
        jsCode,
      },
      [wasmCopy],
    );
  }

  /**
   * Send a song to the already-initialised worklet. The `ctx` arg is retained
   * for caller compatibility — the engine always uses its own audio context.
   */
  async loadSong(_ctx: AudioContext, data: SymphoniePlaybackData): Promise<void> {
    await this.ready();
    if (!this.workletNode) throw new Error('[SymphonieEngine] workletNode missing');

    const node = this.workletNode;
    // Temporarily override onmessage to catch the 'ready' reply, then restore
    // the default handler so future messages (finished, debug, error) keep flowing.
    const defaultHandler = node.port.onmessage;
    const readyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('[SymphonieEngine] Song load timeout')), 10000);
      node.port.onmessage = (event) => {
        const msg = event.data as { type: string; message?: string };
        if (msg.type === 'ready') {
          clearTimeout(timeout);
          node.port.onmessage = defaultHandler;
          resolve();
        } else if (msg.type === 'error') {
          clearTimeout(timeout);
          node.port.onmessage = defaultHandler;
          reject(new Error(`[SymphonieEngine] ${msg.message ?? 'worklet error'}`));
        } else if (msg.type === 'debug') {
          console.log(`[SymphonieWorklet] ${msg.message}`);
        }
      };
    });

    node.port.postMessage({ type: 'load', playbackData: data });
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

  override dispose(): void {
    super.dispose();
    if (SymphonieEngine.instance === this) {
      SymphonieEngine.instance = null;
    }
  }
}
