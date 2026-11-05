/**
 * DavidWhittakerEngine.ts — Singleton WASM engine wrapper for DavidWhittaker replayer
 * Whole-song replayer: loads entire file, WASM handles sequencing + audio.
 * Follows the BdEngine/SonicArrangerEngine pattern.
 */

import { PositionCallbacks, type EnginePositionUpdate } from '@engine/wasm/PositionCallbacks';
import { makeRowClock, type RowClock, type SpeedChange } from '@/lib/import/formats/stepRowClock';
import { ROWS_PER_PATTERN } from '@/lib/import/formats/davidWhittakerGrid';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMChannelOutputsEngine,
  channelOutputNodeOptions,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export function davidwhittakerTransform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/self\.location\.href/g, "'.'")
    .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
    .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');
}

/** What maps the replayer's processed ticks onto the grid: its speed changes and the ticks one pass of the song lasts. */
export interface DwGridClock { speedChanges: readonly SpeedChange[]; passTicks: number }

/**
 * The grid row the replayer is on after it has run `playedTicks` processed ticks (dw_played_ticks): the tick it just ran
 * is playedTicks - 1, the song loops every `passTicks`, and the grid is one row per song step cut into 64-row patterns.
 */
export function dwGridPosition(clock: RowClock, passTicks: number, playedTicks: number): EnginePositionUpdate {
  const tick = Math.max(0, playedTicks - 1);
  const global = clock.tickToRow(passTicks > 0 ? tick % passTicks : tick).row;
  return { songPos: Math.floor(global / ROWS_PER_PATTERN), row: global % ROWS_PER_PATTERN };
}

export class DavidWhittakerEngine extends WASMChannelOutputsEngine {
  private static instance: DavidWhittakerEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _songEndCallback: (() => void) | null = null;
  private readonly _positions = new PositionCallbacks();
  private _clock: { clock: RowClock; passTicks: number } | null = null;

  private constructor() {
    super();
    this.initialize(DavidWhittakerEngine.cache);
  }

  static getInstance(): DavidWhittakerEngine {
    if (DavidWhittakerEngine.instance && !DavidWhittakerEngine.instance._disposed) {
      try {
        const currentCtx = getDevilboxAudioContext();
        if (DavidWhittakerEngine.instance.audioContext !== currentCtx) {
          DavidWhittakerEngine.instance.dispose();
        }
      } catch { /* context not yet set */ }
    }
    if (!DavidWhittakerEngine.instance || DavidWhittakerEngine.instance._disposed) {
      DavidWhittakerEngine.instance = new DavidWhittakerEngine();
    }
    return DavidWhittakerEngine.instance;
  }

  static hasInstance(): boolean {
    return !!DavidWhittakerEngine.instance && !DavidWhittakerEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'davidwhittaker',
      workletFile: 'DavidWhittaker.worklet.js',
      wasmFile: 'DavidWhittaker.wasm',
      jsFile: 'DavidWhittaker.js',
      transformJS: davidwhittakerTransform,
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'davidwhittaker-processor', channelOutputNodeOptions(4));

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[DavidWhittakerEngine] WASM ready');
          this.markNodeReady();
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          useOscilloscopeStore.getState().setChipInfo(4, 0, ['Paula 0', 'Paula 1', 'Paula 2', 'Paula 3']);
          console.log('[DavidWhittakerEngine] Module loaded, subsongs:', data.subsongCount);
          break;
        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels, data.frame, data.sampleRate);
          break;
        case 'playTick':
          if (this._clock && typeof data.ticks === 'number' && data.ticks > 0) {
            this._positions.emit(dwGridPosition(this._clock.clock, this._clock.passTicks, data.ticks));
          }
          break;
        case 'songEnd':
          this._songEndCallback?.();
          break;
        case 'error':
          console.error('[DavidWhittakerEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: DavidWhittakerEngine.cache.wasmBinary, jsCode: DavidWhittakerEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output, 0);
  }

  /** Load the module and start on `subsong` (0-based) - the tune the song's grid shows. */
  async loadTune(buffer: ArrayBuffer, subsong = 0, clock?: DwGridClock): Promise<void> {
    this.setGridClock(clock);
    await this._initPromise;
    if (!this.workletNode) throw new Error('DavidWhittakerEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer, subsong });
  }

  /** Swap the playing module for an edited one without restarting: the worklet runs it silently up to the position played. */
  swapModule(buffer: ArrayBuffer, subsong = 0, clock?: DwGridClock): void {
    this.setGridClock(clock);
    this.workletNode?.port.postMessage({ type: 'swapModule', moduleData: buffer, subsong });
  }

  /** The grid the position reports map onto; the edited module's grid when it swaps in (a speed edit moves the rows). */
  private setGridClock(clock: DwGridClock | undefined): void {
    this._clock = clock && clock.speedChanges.length > 0
      ? { clock: makeRowClock(clock.speedChanges), passTicks: clock.passTicks }
      : null;
  }

  /** The row and song-order index the replayer is on, as the grid shows them. */
  onPositionUpdate(cb: (update: EnginePositionUpdate) => void): () => void {
    return this._positions.add(cb);
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

  /** Hand the worklet the song's bytes for its keyboard copy of the module. */
  previewLoad(buffer: ArrayBuffer): void {
    this.workletNode?.port.postMessage({ type: 'previewLoad', buffer });
  }
  /**
   * One key: `sample` (0-based) sounding Paula period `period`, with the envelope and arpeggio the song pairs with it.
   * The replayer picks the note byte for that period from the loaded module (dw_preview_key).
   */
  noteOn(sample: number, period: number, atTime?: number): void {
    this.workletNode?.port.postMessage({ type: 'noteOn', atTime, sample, period });
  }
  noteOff(atTime?: number): void { this.workletNode?.port.postMessage({ type: 'noteOff', atTime }); }

  onSongEnd(callback: () => void): void { this._songEndCallback = callback; }

  /** Edit a pattern cell in the WASM replayer */
  setCell(index: number, row: number, channel: number, note: number, instrument: number, effect: number, effectArg: number): void {
    this.workletNode?.port.postMessage({ type: 'setCell', index, row, channel, note, instrument, effect, effectArg });
  }

  /** Set an instrument parameter by name */
  setInstrumentParam(instrument: number, param: string, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setInstrumentParam', instrument, param, value });
  }

  override dispose(): void {
    this._positions.clear();
    super.dispose();
    if (DavidWhittakerEngine.instance === this) DavidWhittakerEngine.instance = null;
  }
}
