/**
 * EaglePlayerEngine.ts - one engine for every format the generic eagleplayer
 * runner plays (eaglePlayerFormats.ts).
 *
 * eagleplayer-wasm runs UADE's sound core `score` on the shared Musashi host
 * (musashi-host/) and score drives the format's own eagleplayer through the
 * DeliTracker/EaglePlayer ABI - the same player UADE runs, on our CPU, chips
 * and Paula. loadTune(module, formatId, fileName) fetches the player binary
 * from public/eagleplayer/players/ and boots it with the module. Four Paula
 * voices come out separately (dub sends, isolation, scopes); setMuteMask is
 * the mixer's mask (bit N set = voice N audible).
 * Ledger: thoughts/shared/plans/2026-10-05-musashi-replayer-host.md
 */

import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMChannelOutputsEngine,
  channelOutputNodeOptions,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';
import { eaglePlayerFormat, eaglePlayerModuleName, eaglePlayerUrl } from './eaglePlayerFormats';
import { SubsongRequests, reportSubsongs } from '@engine/wasm/subsongRequests';
import { advanceNativeSubsong } from '@engine/replayer/nativeSubsongPlayback';
import type { SubsongPlayer } from '@/lib/tracker/nativeSubsongs';
import { tickGridPosition, type TickGrid } from '@/lib/tracker/tickGridPosition';
import type { TrackerSong } from '@engine/TrackerReplayer';

/** What the grid follow gets: the order position and row the player is at. */
export interface EaglePlayerPosition { songPos: number; row: number; ticks: number }

/** The grid geometry the player's tick count maps onto (tickGridPosition). */
export function eaglePlayerGrid(song: Pick<TrackerSong, 'initialSpeed' | 'songPositions' | 'patterns' | 'restartPosition'>): TickGrid {
  return {
    speed: song.initialSpeed || 6,
    songPositions: song.songPositions,
    patternLengths: song.patterns.map((p) => p.length),
    // The player loops its song; the grid goes round with it.
    loopFrom: song.restartPosition ?? 0,
  };
}

export class EaglePlayerEngine extends WASMChannelOutputsEngine implements SubsongPlayer {
  private static instance: EaglePlayerEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();
  /** Player binaries by file name, fetched once per page. */
  private static players = new Map<string, Promise<ArrayBuffer>>();

  private _songEndCallback: (() => void) | null = null;
  private _positionCallbacks = new Set<(p: EaglePlayerPosition) => void>();
  private _grid: TickGrid | null = null;
  private readonly subsongRequests = new SubsongRequests();

  private constructor() {
    super();
    this.initialize(EaglePlayerEngine.cache);
  }

  static getInstance(): EaglePlayerEngine {
    // AudioContext-swap guard (see JamCrackerEngine for the reference).
    const currentCtx = getDevilboxAudioContext();
    if (
      !EaglePlayerEngine.instance ||
      EaglePlayerEngine.instance._disposed ||
      EaglePlayerEngine.instance.audioContext !== currentCtx
    ) {
      if (EaglePlayerEngine.instance && !EaglePlayerEngine.instance._disposed) {
        EaglePlayerEngine.instance.dispose();
      }
      EaglePlayerEngine.instance = new EaglePlayerEngine();
    }
    return EaglePlayerEngine.instance;
  }

  static hasInstance(): boolean {
    return !!EaglePlayerEngine.instance && !EaglePlayerEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'eagleplayer',
      workletFile: 'EaglePlayer.worklet.js',
      wasmFile: 'EaglePlayer.wasm',
      jsFile: 'EaglePlayer.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'eagleplayer-processor', channelOutputNodeOptions(4));

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          this.markNodeReady();
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          useOscilloscopeStore.getState().setChipInfo(4, 0, ['Paula 1', 'Paula 2', 'Paula 3', 'Paula 4']);
          // The player's DTP_SubSongRange, 0-based for the subsong model.
          reportSubsongs('EaglePlayer', data.subsongMax - data.subsongMin + 1, data.subsongCurrent - data.subsongMin);
          console.log(`[EaglePlayerEngine] ${data.player} loaded (${data.moduleName}, ${data.moduleBytes} bytes), subsongs ${data.subsongMin}-${data.subsongMax}, playing ${data.subsongCurrent}`);
          break;
        case 'subsongStarted':
          if ((data.index as number) >= 0) reportSubsongs('EaglePlayer', data.count as number, data.index as number);
          this.subsongRequests.settle(data.index as number);
          break;
        case 'position':
          if (this._grid && this._positionCallbacks.size > 0) {
            const at = { ...tickGridPosition(data.ticks as number, this._grid), ticks: data.ticks as number };
            for (const cb of this._positionCallbacks) cb(at);
          }
          break;
        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels, data.frame, data.sampleRate);
          break;
        case 'songEnd':
          // The player said its song is over: the next subsong, when the
          // setting asks for it (the same step the silence detector takes).
          this._songEndCallback?.();
          void advanceNativeSubsong('EaglePlayer', this);
          break;
        case 'error':
          console.error('[EaglePlayerEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      wasmBinary: EaglePlayerEngine.cache.wasmBinary, jsCode: EaglePlayerEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output, 0);
  }

  private static fetchPlayer(url: string): Promise<ArrayBuffer> {
    let p = EaglePlayerEngine.players.get(url);
    if (!p) {
      p = fetch(url).then((r) => {
        if (!r.ok) throw new Error(`eagleplayer ${url}: HTTP ${r.status}`);
        return r.arrayBuffer();
      });
      p.catch(() => EaglePlayerEngine.players.delete(url));
      EaglePlayerEngine.players.set(url, p);
    }
    return p;
  }

  /** Load a module for the format `formatId` (EAGLE_PLAYER_FORMATS key). */
  async loadTune(moduleData: ArrayBuffer, formatId?: string, fileName?: string, subsong?: number): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('EaglePlayerEngine not initialized');
    const fmt = eaglePlayerFormat(formatId);
    if (!fmt) throw new Error(`EaglePlayerEngine: unknown format "${formatId}"`);
    const playerData = (await EaglePlayerEngine.fetchPlayer(eaglePlayerUrl(fmt, import.meta.env.BASE_URL || '/'))).slice(0);
    this.workletNode.port.postMessage({
      type: 'loadModule',
      moduleData, playerData,
      moduleName: eaglePlayerModuleName(fmt, fileName || fmt.id),
      options: fmt.options,
      // 0-based into the player's subsong range; undefined = its default.
      subsongIndex: typeof subsong === 'number' && subsong >= 0 ? subsong : undefined,
    }, [moduleData, playerData]);
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play' });
    this.afterPlay();
  }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'pause' }); }

  /** Bit N set = Paula voice N audible - the mixer's solo/mute. */
  setMuteMask(mask: number): void {
    this.workletNode?.port.postMessage({ type: 'setMuteMask', mask });
  }

  /**
   * Start subsong `index` (0-based into the player's range) - score's
   * AMIGAMSG_SETSUBSONG. Resolves to the subsong started, or -1.
   */
  playSubsong(index: number): Promise<number> {
    const node = this.workletNode;
    if (!node) return Promise.resolve(-1);
    return this.subsongRequests.request(() => node.port.postMessage({ type: 'setSubsong', index }));
  }

  /**
   * The grid the player's position maps onto - the song as loaded
   * (speed ticks per row, patterns in order). Set by the route on start.
   */
  setGrid(song: Pick<TrackerSong, 'initialSpeed' | 'songPositions' | 'patterns' | 'restartPosition'>): void {
    this._grid = eaglePlayerGrid(song);
  }

  /** The player's grid position as it plays (each player tick). */
  onPositionUpdate(cb: (p: EaglePlayerPosition) => void): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  onSongEnd(callback: () => void): void { this._songEndCallback = callback; }

  override dispose(): void {
    super.dispose();
    if (EaglePlayerEngine.instance === this) EaglePlayerEngine.instance = null;
  }
}
