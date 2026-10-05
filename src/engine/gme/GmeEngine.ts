/**
 * GmeEngine.ts - Singleton WASM engine wrapper for console game music
 *
 * game-music-emu-wasm/ compiles game-music-emu (libgme, LGPL-2.1+): NSF/NSFE
 * (NES), GBS (Game Boy), HES (PC Engine), KSS (MSX), SPC (SNES), VGM/VGZ
 * (Master System / Mega Drive) and GYM (Mega Drive) play on the emulated CPU
 * and sound chips. It takes the whole file and plays one track; the song
 * opens in the scope view (GameMusicParser). Follows the PsgplayEngine
 * singleton pattern.
 */

import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { getDevilboxAudioContext } from "@/utils/audio-context";
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class GmeEngine extends WASMSingletonBase {
  private static instance: GmeEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(GmeEngine.cache);
  }

  static getInstance(): GmeEngine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    const currentCtx = getDevilboxAudioContext();
    if (
      !GmeEngine.instance ||
      GmeEngine.instance._disposed ||
      GmeEngine.instance.audioContext !== currentCtx
    ) {
      if (GmeEngine.instance && !GmeEngine.instance._disposed) {
        GmeEngine.instance.dispose();
      }
      GmeEngine.instance = new GmeEngine();
    }
    return GmeEngine.instance;
  }

  static hasInstance(): boolean {
    return !!GmeEngine.instance && !GmeEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'gme',
      workletFile: 'Gme.worklet.js',
      wasmFile: 'Gme.wasm',
      jsFile: 'Gme.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'gme-processor', {
      outputChannelCount: [2], numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[GmeEngine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded': {
          // The voices the oscilloscopes get, named by game-music-emu.
          const names = (data.voices as string[]).slice(0, data.scopes as number);
          useOscilloscopeStore.getState().setChipInfo(names.length, 0, names);
          console.log(`[GmeEngine] loaded, track ${data.track + 1} of ${data.tracks}, voices ${(data.voices as string[]).join(', ')}`);
          break;
        }
        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels, data.frame, data.sampleRate);
          break;
        case 'error':
          console.error('[GmeEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: GmeEngine.cache.wasmBinary, jsCode: GmeEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  /** Load a whole game-music file and start `track` (0-based). */
  async loadTune(buffer: ArrayBuffer, track = 0): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('GmeEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer, track });
  }

  play(): void { /* the track starts on load */ }

  /** Bit N set = voice N audible - the mixer's solo/mute. */
  setMuteMask(mask: number): void {
    this.workletNode?.port.postMessage({ type: 'setMuteMask', mask });
  }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }

  override dispose(): void {
    super.dispose();
    if (GmeEngine.instance === this) GmeEngine.instance = null;
  }
}
