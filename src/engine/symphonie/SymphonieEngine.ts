/**
 * SymphonieEngine.ts — Singleton AudioWorklet wrapper for Symphonie Pro
 *
 * Manages loading Symphonie.worklet.js and creating/communicating
 * with the AudioWorklet processor. The worklet is pure JS (no WASM),
 * so initialization only requires addModule().
 *
 * Usage: call SymphonieEngine.getInstance() to get (or create) the singleton.
 * Multiple SymphonieSynth instances share this single engine.
 */

import type { SymphoniePlaybackData } from './SymphoniePlaybackData';

export class SymphonieEngine {
  private static instance: SymphonieEngine | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private workletNode: AudioWorkletNode | null = null;
  private _disposed = false;

  private constructor() {}

  static getInstance(): SymphonieEngine {
    if (!SymphonieEngine.instance || SymphonieEngine.instance._disposed) {
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
      try {
        await ctx.audioWorklet.addModule(`${baseUrl}symphonie/Symphonie.worklet.js`);
      } catch {
        /* Module might already be registered */
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
    this.workletNode = new AudioWorkletNode(ctx, 'symphonie-processor', {
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    // Set up the ready promise before posting to avoid a race
    const readyPromise = new Promise<void>((resolve, reject) => {
      const node = this.workletNode!;
      node.port.onmessage = (event) => {
        const msg = event.data as { type: string; message?: string };
        if (msg.type === 'ready') {
          resolve();
        } else if (msg.type === 'error') {
          reject(new Error(`[SymphonieEngine] ${msg.message ?? 'worklet error'}`));
        }
      };
    });

    // Collect transferable ArrayBuffers from instrument sample data
    const transfers: Transferable[] = [];
    for (const inst of data.instruments) {
      if (inst.samples !== null) {
        transfers.push(inst.samples.buffer);
      }
    }

    this.workletNode.port.postMessage({ type: 'load', playbackData: data }, transfers);

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

  getNode(): AudioWorkletNode | null {
    return this.workletNode;
  }

  dispose(): void {
    this._disposed = true;
    this.workletNode?.disconnect();
    this.workletNode = null;
    if (SymphonieEngine.instance === this) {
      SymphonieEngine.instance = null;
    }
  }
}
