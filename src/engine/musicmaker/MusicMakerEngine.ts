/**
 * MusicMakerEngine.ts - Singleton engine for MusicMaker V8 (Thomas Winischhofer).
 *
 * The replayer is a worklet without WASM (public/musicmaker/MusicMaker.worklet.js)
 * built from the author's own player source. The song's file data is one
 * FORM/MMV8 IFF; this engine decodes it with MusicMakerParser (the one decoder)
 * and posts each voice's compiled timeline and the instruments. Follows the
 * PiyoPiyoEngine singleton pattern.
 * Research: thoughts/shared/research/2026-10-05_musicmaker-native-replayer.md
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';
import { musicMakerWorkletModule } from '@lib/import/formats/MusicMakerParser';

export class MusicMakerEngine extends WASMSingletonBase {
  private static instance: MusicMakerEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    void this.initialize(MusicMakerEngine.cache);
  }

  static getInstance(): MusicMakerEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!MusicMakerEngine.instance || MusicMakerEngine.instance._disposed || MusicMakerEngine.instance.audioContext !== currentCtx) {
      if (MusicMakerEngine.instance && !MusicMakerEngine.instance._disposed) MusicMakerEngine.instance.dispose();
      MusicMakerEngine.instance = new MusicMakerEngine();
    }
    return MusicMakerEngine.instance;
  }

  static hasInstance(): boolean {
    return !!MusicMakerEngine.instance && !MusicMakerEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return { dir: 'musicmaker', workletFile: 'MusicMaker.worklet.js' };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'musicmaker-processor', { outputChannelCount: [2], numberOfOutputs: 1 });
    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log(`[MusicMakerEngine] loaded: ${data.kind === 'ext' ? 'EXT' : 'STD'} song, ${data.voices} voices`);
          break;
        case 'error':
          console.error('[MusicMakerEngine]', data.message);
          break;
      }
    };
    this.workletNode.port.postMessage({ type: 'init', sampleRate: ctx.sampleRate });
    this.workletNode.connect(this.output);
  }

  /** Load a FORM/MMV8 song (musicMakerFileData); the song starts on load. */
  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('MusicMakerEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', module: musicMakerWorkletModule(buffer) });
  }

  play(): void { this.workletNode?.port.postMessage({ type: 'play' }); }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }

  /** Bit n = voice n audible (the mixer's solo/mute). */
  setMuteMask(mask: number): void {
    this.workletNode?.port.postMessage({ type: 'setMuteMask', mask });
  }

  override dispose(): void {
    super.dispose();
    if (MusicMakerEngine.instance === this) MusicMakerEngine.instance = null;
  }
}
