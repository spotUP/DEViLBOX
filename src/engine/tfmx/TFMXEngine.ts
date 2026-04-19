/**
 * TFMXEngine.ts — Singleton AudioWorklet wrapper for TFMX WASM synth
 *
 * Manages loading TFMX.wasm + TFMX.worklet.js and creating/communicating
 * with the AudioWorklet. Follows the SoundMonEngine singleton pattern exactly.
 *
 * Usage: call TFMXEngine.getInstance() to get (or create) the singleton.
 * Multiple TFMXSynth instances share this single engine.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

function tfmxTransform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
    .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');
}

export class TFMXEngine extends WASMSingletonBase {
  private static instance: TFMXEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _playerHandleResolvers: Array<(handle: number) => void> = [];
  private _positionCallbacks: Array<(update: { samplesRendered: number; elapsedMs?: number; songEnd: boolean }) => void> = [];
  private _moduleLoadedResolvers: Array<(info: { voices: number; songs: number; duration: number }) => void> = [];

  private constructor() {
    super();
    this.initialize(TFMXEngine.cache);
  }

  static getInstance(): TFMXEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!TFMXEngine.instance || TFMXEngine.instance._disposed ||
        TFMXEngine.instance.audioContext !== currentCtx) {
      if (TFMXEngine.instance && !TFMXEngine.instance._disposed) {
        TFMXEngine.instance.dispose();
      }
      TFMXEngine.instance = new TFMXEngine();
    }
    return TFMXEngine.instance;
  }

  static hasInstance(): boolean {
    return !!TFMXEngine.instance && !TFMXEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'tfmx',
      workletFile: 'TFMX.worklet.js',
      wasmFile: 'TFMX.wasm',
      jsFile: 'TFMX.js',
      transformJS: tfmxTransform,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'tfmx-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'error':
          console.error('[TFMXEngine]', data.message);
          // Unblock any pending waitForPlayerHandle() callers (e.g. pool-full) with sentinel -1
          if (this._playerHandleResolvers.length > 0) {
            const resolve = this._playerHandleResolvers.shift()!;
            resolve(-1);
          }
          // Unblock any pending loadTune() callers on module load failure
          if (this._moduleLoadedResolvers.length > 0) {
            const resolve = this._moduleLoadedResolvers.shift()!;
            resolve({ voices: 0, songs: 0, duration: 0 });
          }
          break;

        case 'playerCreated':
          if (this._playerHandleResolvers.length > 0) {
            const resolve = this._playerHandleResolvers.shift()!;
            resolve(data.handle);
          }
          break;

        case 'moduleLoaded':
          if (this._moduleLoadedResolvers.length > 0) {
            const resolve = this._moduleLoadedResolvers.shift()!;
            resolve({ voices: data.voices, songs: data.songs, duration: data.duration });
          }
          break;

        case 'modulePosition':
          for (const cb of this._positionCallbacks) {
            cb({ samplesRendered: data.samplesRendered, elapsedMs: data.elapsedMs, songEnd: data.songEnd });
          }
          break;

        case 'songEnd':
          console.log('[TFMXEngine] Song ended');
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: TFMXEngine.cache.wasmBinary,
      jsCode: TFMXEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  sendMessage(msg: Record<string, unknown>, transfers?: Transferable[]): void {
    if (!this.workletNode) return;
    if (transfers) {
      this.workletNode.port.postMessage(msg, transfers);
    } else {
      this.workletNode.port.postMessage(msg);
    }
  }

  waitForPlayerHandle(): Promise<number> {
    return new Promise<number>((resolve) => {
      this._playerHandleResolvers.push(resolve);
    });
  }

  // ── Full-module playback API (singleton engine pattern) ──────────────────

  /**
   * Load a full TFMX module (mdat + optional smpl companion) for playback.
   * Returns module info: { voices, songs, duration }.
   */
  async loadTune(mdatData: ArrayBuffer, smplData?: ArrayBuffer): Promise<{ voices: number; songs: number; duration: number }> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('TFMXEngine not initialized');

    const mdatCopy = mdatData.slice(0);
    const smplCopy = smplData ? smplData.slice(0) : null;
    const transfers: Transferable[] = [mdatCopy];
    if (smplCopy) transfers.push(smplCopy);

    const promise = new Promise<{ voices: number; songs: number; duration: number }>((resolve) => {
      this._moduleLoadedResolvers.push(resolve);
    });

    this.workletNode.port.postMessage({
      type: 'loadModule',
      mdatBuffer: mdatCopy,
      smplBuffer: smplCopy,
      subsong: 0,
    }, transfers);

    return promise;
  }

  /**
   * Re-load a TFMX module without resetting the engine — used by the macro
   * editor for live preview after editing instruments. The patched mdat
   * buffer is shipped to the worklet which runs `_tfmx_load_module` again.
   * If playback was active before reload it resumes automatically.
   */
  reloadModule(mdatData: ArrayBuffer, smplData?: ArrayBuffer | null): void {
    if (!this.workletNode) return;
    const mdatCopy = mdatData.slice(0);
    const smplCopy = smplData ? smplData.slice(0) : null;
    const transfers: Transferable[] = [mdatCopy];
    if (smplCopy) transfers.push(smplCopy);
    this.workletNode.port.postMessage({
      type: 'reloadModule',
      mdatBuffer: mdatCopy,
      smplBuffer: smplCopy,
      subsong: 0,
    }, transfers);
  }

  play(): void {
    this.sendMessage({ type: 'modulePlay' });
  }

  pause(): void {
    // TFMX doesn't support true pause — stop the module
    this.sendMessage({ type: 'moduleStop' });
  }

  stop(): void {
    this.sendMessage({ type: 'moduleStop' });
    this.sendMessage({ type: 'resetPlayers' });
    this._positionCallbacks = [];
  }

  onPositionUpdate(callback: (update: { samplesRendered: number; elapsedMs?: number; songEnd: boolean }) => void): () => void {
    this._positionCallbacks.push(callback);
    return () => {
      const idx = this._positionCallbacks.indexOf(callback);
      if (idx >= 0) this._positionCallbacks.splice(idx, 1);
    };
  }

  /**
   * DEViLBOX extension: trigger a single instrument macro on a chosen voice
   * for editor preview/audition. Hits the new C export
   * `tfmx_module_preview_macro` which sets up the sequencer's `cmd` struct
   * and runs the regular noteCmd path; the next render tick produces audio.
   *
   * @param macroIdx 0..127  TFMX macro pointer-table index
   * @param note     0..63   TFMX note value (matches the editor's note range)
   * @param volume   0..15   relative volume (high nibble of cmd.cd)
   * @param channel  0..7    voice index — defaults to 0
   */
  previewMacro(macroIdx: number, note: number, volume: number, channel: number = 0): void {
    this.sendMessage({
      type: 'modulePreviewMacro',
      macroIdx,
      note,
      volume,
      channel,
    });
  }

  setMuteMask(mask: number): void {
    // mask: bit N = 1 means voice N is muted
    for (let v = 0; v < 7; v++) {
      this.sendMessage({ type: 'moduleMuteVoice', voice: v, mute: (mask & (1 << v)) !== 0 });
    }
  }

  override dispose(): void {
    super.dispose();
    this._positionCallbacks = [];
    if (TFMXEngine.instance === this) {
      TFMXEngine.instance = null;
    }
  }
}
