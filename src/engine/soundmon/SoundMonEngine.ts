/**
 * SoundMonEngine.ts — Singleton WASM engine wrapper for SoundMon replayer
 * Whole-song replayer: loads entire file, WASM handles sequencing + audio.
 * Follows the BdEngine/SonicArrangerEngine pattern.
 */

import { PositionCallbacks, type EnginePositionUpdate } from '@engine/wasm/PositionCallbacks';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMChannelOutputsEngine,
  channelOutputNodeOptions,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

/** SoundMon Emscripten output needs extended script-replaces + chained-HEAP style. */
function soundmonTransform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/self\.location\.href/g, "'.'")
    .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
    .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');
}

export class SoundMonEngine extends WASMChannelOutputsEngine {
  private static instance: SoundMonEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private readonly _positions = new PositionCallbacks();

  private _songEndCallback: (() => void) | null = null;

  private constructor() {
    super();
    this.initialize(SoundMonEngine.cache);
  }

  static getInstance(): SoundMonEngine {
    if (SoundMonEngine.instance && !SoundMonEngine.instance._disposed) {
      try {
        const currentCtx = getDevilboxAudioContext();
        if (SoundMonEngine.instance.audioContext !== currentCtx) {
          SoundMonEngine.instance.dispose();
        }
      } catch { /* context not yet set */ }
    }
    if (!SoundMonEngine.instance || SoundMonEngine.instance._disposed) {
      SoundMonEngine.instance = new SoundMonEngine();
    }
    return SoundMonEngine.instance;
  }

  static hasInstance(): boolean {
    return !!SoundMonEngine.instance && !SoundMonEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'soundmon',
      workletFile: 'SoundMon.worklet.js',
      wasmFile: 'SoundMon.wasm',
      jsFile: 'SoundMon.js',
      transformJS: soundmonTransform,
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'soundmon-processor', channelOutputNodeOptions(4));

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[SoundMonEngine] WASM ready');
          this.markNodeReady();
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          if (data.keyboardOnly) break; // the keyboard copy: the scopes belong to the engine playing the song
          useOscilloscopeStore.getState().setChipInfo(4, 0, ['Paula 0', 'Paula 1', 'Paula 2', 'Paula 3']);
          console.log('[SoundMonEngine] Module loaded, subsongs:', data.subsongCount);
          break;
        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels, data.frame, data.sampleRate);
          break;
        case 'songEnd':
          this._songEndCallback?.();
          break;
        case 'position':
          this._positions.emit(data);
          break;
        case 'error':
          console.error('[SoundMonEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: SoundMonEngine.cache.wasmBinary, jsCode: SoundMonEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output, 0);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('SoundMonEngine not initialized');
    this._keyboardFrom = null;
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  /** The module the keyboard copy was made from (see keyboardCopy), null while the replayer holds the song or nothing. */
  private _keyboardFrom: ArrayBuffer | null = null;

  /**
   * The song's module as a keyboard copy, when the song plays on another engine (nuade): the preview voice
   * (previewNoteOn) runs on the module the replayer holds, and this replayer holds no song then. The worklet never
   * plays a keyboard copy, so only keys sound. Once per module; playback loading the song here replaces it.
   */
  keyboardCopy(buffer: ArrayBuffer): void {
    if (!this.workletNode || this._keyboardFrom === buffer) return;
    this._keyboardFrom = buffer;
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer.slice(0), keyboardOnly: true });
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play' });
    this.afterPlay();
  }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'pause' }); }

  setMuteMask(mask: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelMask', mask });
  }

  onSongEnd(callback: () => void): void { this._songEndCallback = callback; }

  /** Edit a cell of the replayer's own track pool (its index and row, not the grid's pattern). */
  setTrackCell(index: number, row: number, note: number, instrument: number, arpeggio: number, effect: number, effectArg: number): void {
    this.workletNode?.port.postMessage({ type: 'setTrackCell', index, row, note, instrument, arpeggio, effect, effectArg });
  }

  /** Set an instrument parameter by name */
  setInstrumentParam(instrument: number, param: string, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setInstrumentParam', instrument, param, value });
  }

  /**
   * Keyboard preview on the replayer's own fifth voice. `instrument` is the
   * 1-based instrument of the loaded module, `note` the value a pattern row
   * holds (see SoundMonNotes noteToBpNote); `volume` 0-64 or omitted for the
   * instrument's own.
   */
  previewNoteOn(instrument: number, note: number, volume?: number): void {
    this.workletNode?.port.postMessage({ type: 'previewNoteOn', instrument, note, volume });
  }

  previewNoteOff(): void {
    this.workletNode?.port.postMessage({ type: 'previewNoteOff' });
  }

  /** The row and song-order index the replayer is on, as the grid shows them. */
  onPositionUpdate(cb: (update: EnginePositionUpdate) => void): () => void {
    return this._positions.add(cb);
  }

  override dispose(): void {
    this._positions.clear();
    super.dispose();
    if (SoundMonEngine.instance === this) SoundMonEngine.instance = null;
  }
}
