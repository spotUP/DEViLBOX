/**
 * Sd2Engine.ts - Singleton WASM engine wrapper for SidMon 2.0 replayer
 *
 * Follows the MaEngine/BdEngine singleton pattern.
 */

import { PositionCallbacks, type EnginePositionUpdate } from '@engine/wasm/PositionCallbacks';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class Sd2Engine extends WASMSingletonBase {
  private static instance: Sd2Engine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private readonly _positions = new PositionCallbacks();

  private _requestId = 0;
  private _pendingRequests = new Map<number, (data: unknown) => void>();

  private constructor() {
    super();
    this.initialize(Sd2Engine.cache);
  }

  static getInstance(): Sd2Engine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    // Without this, the engine stays attached to a dead context on HMR /
    // iOS suspend / page reload and goes silent with no error.
    const currentCtx = getDevilboxAudioContext();
    if (
      !Sd2Engine.instance ||
      Sd2Engine.instance._disposed ||
      Sd2Engine.instance.audioContext !== currentCtx
    ) {
      if (Sd2Engine.instance && !Sd2Engine.instance._disposed) {
        Sd2Engine.instance.dispose();
      }
      Sd2Engine.instance = new Sd2Engine();
    }
    return Sd2Engine.instance;
  }

  static hasInstance(): boolean {
    return !!Sd2Engine.instance && !Sd2Engine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'sidmon2',
      workletFile: 'Sd2.worklet.js',
      wasmFile: 'Sd2.wasm',
      jsFile: 'Sd2.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'sd2-processor', {
      outputChannelCount: [2], numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      // Check if this is a response to a pending request
      if (this.handleResponse(data)) return;

      switch (data.type) {
        case 'ready':
          console.log('[Sd2Engine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log('[Sd2Engine] Module loaded');
          break;
        case 'position':
          this._positions.emit(data);
          break;
        case 'error':
          console.error('[Sd2Engine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: Sd2Engine.cache.wasmBinary, jsCode: Sd2Engine.cache.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  /** Swap the playing module for an edited one without restarting: the worklet runs it silently up to the position played. */
  swapModule(buffer: ArrayBuffer): void {
    this.workletNode?.port.postMessage({ type: 'swapModule', moduleData: buffer });
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('Sd2Engine not initialized');
    this.setKeyboardCopy(null);
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  /** The module the keyboard copy was made from (see keyboardCopy), null while the replayer holds the song or nothing. */
  private _keyboardFrom: ArrayBuffer | null = null;
  /** The keyboard voice's own way to the synth that plays the key: open only while the replayer holds a keyboard copy. */
  private _keyboardOut: GainNode | null = null;
  private _keyboardDest: AudioNode | null = null;

  private setKeyboardCopy(buffer: ArrayBuffer | null): void {
    this._keyboardFrom = buffer;
    if (this._keyboardOut) this._keyboardOut.gain.value = buffer ? 1 : 0;
  }

  /**
   * The song's module as a keyboard copy, when the song plays on another engine (nuade): sd2_note_on runs on the module
   * the replayer holds, and this replayer holds no song then. The worklet renders a keyboard copy only while a key is
   * down. Its sound leaves through `keyboardTo`: the engine output is routed to the master only while this replayer
   * plays the song (NativeEngineRouting). Once per module; playback loading the song here replaces it.
   */
  keyboardCopy(buffer: ArrayBuffer): void {
    if (!this.workletNode || this._keyboardFrom === buffer) return;
    this.setKeyboardCopy(buffer);
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer.slice(0), keyboardOnly: true });
  }

  /**
   * Route the keyboard voice to `dest` (the output of the synth that plays the key; one destination at a time, so a
   * key is heard once). Silent while the replayer plays the song: its output reaches the master then, and a second
   * path would double the song.
   */
  keyboardTo(dest: AudioNode): void {
    if (!this._keyboardOut) {
      this._keyboardOut = this.output.context.createGain();
      this._keyboardOut.gain.value = this._keyboardFrom ? 1 : 0;
      this.output.connect(this._keyboardOut);
    }
    if (this._keyboardDest === dest) return;
    if (this._keyboardDest) { try { this._keyboardOut.disconnect(this._keyboardDest); } catch { /* already gone */ } }
    this._keyboardOut.connect(dest);
    this._keyboardDest = dest;
  }

  setChannelGain(channel: number, gain: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelGain', channel, gain });
  }

  play(): void { this.workletNode?.port.postMessage({ type: 'play' }); }
  // The worklet's stop destroys the module (player_stop): a keyboard copy goes with it.
  stop(): void { this.setKeyboardCopy(null); this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.setKeyboardCopy(null); this.workletNode?.port.postMessage({ type: 'stop' }); }

  noteOn(instrument: number, note: number, velocity: number): void {
    this.workletNode?.port.postMessage({ type: 'noteOn', instrument, note, velocity });
  }

  noteOff(): void {
    this.workletNode?.port.postMessage({ type: 'noteOff' });
  }

  async save(): Promise<ArrayBuffer | null> {
    await this._initPromise;
    const result = await this.sendRequest<{ data: ArrayBuffer | null }>({ type: 'save' });
    return result.data;
  }

  // ---- Track editing API ----

  private sendRequest<T>(message: Record<string, unknown>): Promise<T> {
    return new Promise<T>((resolve) => {
      const requestId = ++this._requestId;
      this._pendingRequests.set(requestId, resolve as (data: unknown) => void);
      this.workletNode?.port.postMessage({ ...message, requestId });
    });
  }

  private handleResponse(data: { requestId?: number }): boolean {
    if (data.requestId !== undefined) {
      const resolve = this._pendingRequests.get(data.requestId);
      if (resolve) {
        this._pendingRequests.delete(data.requestId);
        resolve(data);
        return true;
      }
    }
    return false;
  }

  async getNumTracks(): Promise<number> {
    await this._initPromise;
    const result = await this.sendRequest<{ count: number }>({ type: 'getNumTracks' });
    return result.count;
  }

  async getTrackLength(trackIdx: number): Promise<number> {
    await this._initPromise;
    const result = await this.sendRequest<{ length: number }>({ type: 'getTrackLength', trackIdx });
    return result.length;
  }

  async getCell(trackIdx: number, row: number): Promise<{ note: number; instrument: number; effect: number; param: number }> {
    await this._initPromise;
    return this.sendRequest<{ note: number; instrument: number; effect: number; param: number }>({
      type: 'getCell', trackIdx, row,
    });
  }

  async setCell(trackIdx: number, row: number, note: number, instrument: number, effect: number, param: number): Promise<void> {
    await this._initPromise;
    await this.sendRequest<unknown>({ type: 'setCell', trackIdx, row, note, instrument, effect, param });
  }

  async getTrackData(trackIdx: number): Promise<Array<{ note: number; instrument: number; effect: number; param: number }>> {
    await this._initPromise;
    const result = await this.sendRequest<{ cells: Array<{ note: number; instrument: number; effect: number; param: number }> }>({
      type: 'getTrackData', trackIdx,
    });
    return result.cells;
  }

  /** Set per-channel mute mask. Bit N=1 means channel N is active, 0=muted. */
  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  /** The row and song-order index the replayer is on, as the grid shows them. */
  onPositionUpdate(cb: (update: EnginePositionUpdate) => void): () => void {
    return this._positions.add(cb);
  }

  override dispose(): void {
    this._positions.clear();
    super.dispose();
    this._pendingRequests.clear();
    if (Sd2Engine.instance === this) Sd2Engine.instance = null;
  }
}
