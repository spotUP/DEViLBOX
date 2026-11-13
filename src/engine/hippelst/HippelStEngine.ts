/**
 * HippelStEngine.ts - singleton WASM engine for Jochen Hippel's Atari ST formats
 * (.hst, .sog TFMX-ST/MMME, .soc COSO-ST).
 *
 * hippelst-wasm/ runs the Wanted Team ST player (transpiled to C, the song's tick as the YM2149's
 * register values) in front of Furnace's YM2149 core. The engine takes the playback image the
 * parser builds (HstSongEdit.image) and the mode flags the player derives from it
 * (hstNativeSong). A second player over the same song serves the keyboard.
 */
import { getDevilboxAudioContext } from '@/utils/audio-context';
import { useFormatStore } from '@/stores/useFormatStore';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';
import { hstNativeSong } from '@/lib/import/formats/JochenHippelSTNative';

/** Where the player is: a step of the step table and the row in it. */
export interface HippelStPosition { step: number; row: number }

export class HippelStEngine extends WASMSingletonBase {
  private static instance: HippelStEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _positionCallbacks = new Set<(p: HippelStPosition) => void>();
  private _keyResolvers: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];
  /** The image the keyboard player holds (once per song). */
  private _keyImage: ArrayBuffer | null = null;

  private constructor() {
    super();
    this.initialize(HippelStEngine.cache);
  }

  static getInstance(): HippelStEngine {
    const ctx = getDevilboxAudioContext();
    if (!HippelStEngine.instance || HippelStEngine.instance._disposed || HippelStEngine.instance.audioContext !== ctx) {
      if (HippelStEngine.instance && !HippelStEngine.instance._disposed) HippelStEngine.instance.dispose();
      HippelStEngine.instance = new HippelStEngine();
    }
    return HippelStEngine.instance;
  }

  static hasInstance(): boolean {
    return !!HippelStEngine.instance && !HippelStEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return { dir: 'hippelst', workletFile: 'HippelST.worklet.js', wasmFile: 'HippelST.wasm', jsFile: 'HippelST.js' };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'hippelst-processor', { outputChannelCount: [2], numberOfOutputs: 1 });
    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'tuneLoaded':
          this.settleModuleLoad();
          break;
        case 'keyLoaded':
          for (const r of this._keyResolvers.splice(0)) r.resolve();
          break;
        case 'position':
          for (const cb of this._positionCallbacks) cb({ step: data.step, row: data.row });
          break;
        case 'error':
          console.error('[HippelStEngine]', data.message);
          // A refusal rejects the load in flight (a song the player refused must not report loaded).
          this.failModuleLoad(String(data.message ?? 'HippelSt worklet error'));
          for (const r of this._keyResolvers.splice(0)) r.reject(new Error(String(data.message ?? 'HippelSt worklet error')));
          break;
      }
    };
    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: HippelStEngine.cache.wasmBinary, jsCode: HippelStEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  sendMessage(msg: Record<string, unknown>, transfers?: Transferable[]): void {
    if (!this.workletNode) return;
    if (transfers) this.workletNode.port.postMessage(msg, transfers); else this.workletNode.port.postMessage(msg);
  }

  /** The message that carries a playback image to the worklet. */
  private static imageMessage(image: ArrayBuffer): { image: ArrayBuffer; shortPointers: boolean; laterPlayer: boolean; newSid: boolean; subsongs: number } {
    const n = hstNativeSong(new Uint8Array(image));
    const copy = n.song.slice().buffer as ArrayBuffer;
    return { image: copy, shortPointers: n.shortPointers, laterPlayer: n.laterPlayer, newSid: n.newSid, subsongs: n.subsongs };
  }

  /**
   * Load a playback image and ready subsong `subsong` (0-based; by default the one the format store
   * says the grid shows, like UADE's loadTune).
   */
  async loadTune(image: ArrayBuffer, subsong?: number): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('HippelStEngine not initialized');
    const sub = subsong ?? useFormatStore.getState().uadeEditableCurrentSubsong ?? 0;
    const msg = HippelStEngine.imageMessage(image);
    const done = this.beginModuleLoad();
    this.workletNode.port.postMessage({ type: 'loadTune', ...msg, subsong: sub }, [msg.image]);
    await done;
  }

  /** A live edit: the same song with new bytes. The worklet plays on from the tick it had reached. */
  reloadModule(image: ArrayBuffer): void {
    if (!this.workletNode) return;
    const msg = HippelStEngine.imageMessage(image);
    this.workletNode.port.postMessage({ type: 'reloadModule', ...msg }, [msg.image]);
    this._keyImage = null;
  }

  play(): void { this.sendMessage({ type: 'play' }); }
  stop(): void { this.sendMessage({ type: 'stop' }); }
  pause(): void { this.sendMessage({ type: 'stop' }); }

  /** Project-wide convention: bit N set = voice N audible. The worklet takes the inverse. */
  setMuteMask(mask: number): void {
    this.sendMessage({ type: 'setMuteMask', mask: ~mask & 7 });
  }

  onPositionUpdate(cb: (p: HippelStPosition) => void): () => void {
    this._positionCallbacks.add(cb);
    return () => { this._positionCallbacks.delete(cb); };
  }

  // ── Keyboard voice ─────────────────────────────────────────────────────

  /** The song the keyboard plays the instruments of (once per image). */
  async keyLoad(image: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode || this._keyImage === image) return;
    this._keyImage = image;
    const msg = HippelStEngine.imageMessage(image);
    const done = new Promise<void>((resolve, reject) => { this._keyResolvers.push({ resolve, reject }); });
    this.workletNode.port.postMessage({ type: 'keyLoad', ...msg }, [msg.image]);
    try { await done; } catch (err) { this._keyImage = null; throw err; }
  }

  /** Start instrument `instrument` (0-based volume sequence) on the pattern note byte `note`. */
  keyNote(instrument: number, note: number, atTime?: number): void {
    this.sendMessage({ type: 'keyNote', atTime, instrument, note });
  }

  keyOff(atTime?: number): void { this.sendMessage({ type: 'keyOff', atTime }); }

  override dispose(): void {
    super.dispose();
    this._positionCallbacks.clear();
    if (HippelStEngine.instance === this) HippelStEngine.instance = null;
  }
}
