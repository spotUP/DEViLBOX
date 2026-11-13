/**
 * PiyoPiyoEngine.ts - Singleton engine for Studio Pixel PiyoPiyo (.pmd).
 *
 * The replayer is a worklet without WASM (public/piyopiyo/PiyoPiyo.worklet.js,
 * a port of piyopiyo-rs, 0BSD); its six drum samples are fetched once from
 * public/piyopiyo/drums and posted with 'init'. Follows the AyletEngine
 * singleton pattern (2026-10-05 broken-formats sweep, B5).
 */

import { decodePiyoPiyoModule, piyoPiyoTrackMask } from '@/lib/import/formats/piyoPiyoGrid';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

const DRUM_NAMES = ['bass1', 'bass2', 'snare', 'hat1', 'hat2', 'cymbal'] as const;

export class PiyoPiyoEngine extends WASMSingletonBase {
  private static instance: PiyoPiyoEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();
  private static drums: Record<string, ArrayBuffer> | null = null;
  /** Lanes per track of the loaded module: the grid's channels are lanes, the engine's mask is per track. */
  private lanes: number[] = [1, 1, 1, 1];
  private channelMask = 0xffffffff;

  private constructor() {
    super();
    void this._initPiyoPiyo();
  }

  /** The drums must be in hand before the node posts 'init'. */
  private async _initPiyoPiyo(): Promise<void> {
    if (!PiyoPiyoEngine.drums) {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const buffers = await Promise.all(DRUM_NAMES.map(async (name) => {
        const r = await fetch(`${baseUrl}piyopiyo/drums/${name}.bin`);
        if (!r.ok) throw new Error(`[PiyoPiyoEngine] drum sample ${name}.bin: HTTP ${r.status}`);
        return r.arrayBuffer();
      }));
      PiyoPiyoEngine.drums = Object.fromEntries(DRUM_NAMES.map((name, i) => [name, buffers[i]]));
    }
    await this.initialize(PiyoPiyoEngine.cache);
  }

  static getInstance(): PiyoPiyoEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!PiyoPiyoEngine.instance || PiyoPiyoEngine.instance._disposed || PiyoPiyoEngine.instance.audioContext !== currentCtx) {
      if (PiyoPiyoEngine.instance && !PiyoPiyoEngine.instance._disposed) PiyoPiyoEngine.instance.dispose();
      PiyoPiyoEngine.instance = new PiyoPiyoEngine();
    }
    return PiyoPiyoEngine.instance;
  }

  static hasInstance(): boolean {
    return !!PiyoPiyoEngine.instance && !PiyoPiyoEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return { dir: 'piyopiyo', workletFile: 'PiyoPiyo.worklet.js' };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'piyopiyo-processor', { outputChannelCount: [2], numberOfOutputs: 1 });
    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          this.settleModuleLoad();
          console.log(`[PiyoPiyoEngine] loaded: ${data.records} records, ${data.waitMs} ms each`);
          break;
        case 'error':
          console.error('[PiyoPiyoEngine]', data.message);
          this.failModuleLoad(String(data.message ?? 'module load failed'));
          break;
      }
    };
    // The drums are copied, not transferred: the next node needs them too.
    this.workletNode.port.postMessage({ type: 'init', sampleRate: ctx.sampleRate, drums: PiyoPiyoEngine.drums });
    this.workletNode.connect(this.output);
  }

  /** Load a whole .pmd; the song starts on load. */
  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('PiyoPiyoEngine not initialized');
    this.noteLanes(buffer);
    const answered = this.beginModuleLoad();
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
    await answered;
  }

  /** Swap an edited module in while the song plays; the cursor and wait timer stay. */
  replaceModule(buffer: ArrayBuffer): void {
    this.noteLanes(buffer);
    this.workletNode?.port.postMessage({ type: 'replaceModule', moduleData: buffer });
  }

  play(): void { this.workletNode?.port.postMessage({ type: 'play' }); }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }

  private noteLanes(buffer: ArrayBuffer): void {
    const m = decodePiyoPiyoModule(new Uint8Array(buffer));
    if (!m) return;
    this.lanes = m.lanes;
    this.sendMuteMask();
  }

  private sendMuteMask(): void {
    // Worklet mask: bits 0-2 = melody tracks 1-3, bit 3 = drums; set = audible.
    this.workletNode?.port.postMessage({ type: 'setMuteMask', mask: piyoPiyoTrackMask(this.channelMask, this.lanes) });
  }

  /** The mixer's mask by grid channel (one bit per lane); mapped to the four tracks here. */
  setMuteMask(mask: number): void {
    this.channelMask = mask;
    this.sendMuteMask();
  }

  override dispose(): void {
    super.dispose();
    if (PiyoPiyoEngine.instance === this) PiyoPiyoEngine.instance = null;
  }
}
