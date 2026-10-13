/**
 * NuadeEngine.ts - the one engine for every format played by nuade (emoon/nuade: native C ports of the UADE players).
 *
 * nuade-wasm renders the stereo mix plus one mono buffer per voice; the worklet (public/nuade/Nuade.worklet.js) hands
 * the voices to the per-channel dub sends, isolation slots and scopes. Which player runs is the song's `nuadePlayerId`
 * (the nuade player id), forced at load. Protocol: nuadeProtocol.ts. Plan: thoughts/shared/plans/2026-10-13-nuade-engine.md.
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
import { SubsongRequests, reportSubsongs } from '@engine/wasm/subsongRequests';
import { advanceNativeSubsong } from '@engine/replayer/nativeSubsongPlayback';
import type { SubsongPlayer } from '@/lib/tracker/nativeSubsongs';
import { ChannelMeterFeed } from '@engine/tone/channelMeterFeed';
import { GridFollow, songTickGrid, type GridFollowPosition, type TickGridSong } from '@engine/replayer/tickGridFollow';
import {
  parseNuadeOut,
  NUADE_NODE_VOICES, type NuadeIn, type NuadeOut, type NuadeVoiceState,
} from './nuadeProtocol';
import { nuadeVoiceCounter } from './nuadeProbe';
import { nuadeFormatForPlayer } from './nuadeFormats';
import { createNuadeEditPort, recordNuadePlayerCaps, type NuadeEditPort } from './nuadeEditPort';

export type NuadePosition = GridFollowPosition;

/** How the player's position maps to the grid: its order and row, or its tick count (reconstructed grids). */
export type NuadeFollowBy = 'orderRow' | 'tick';

/** What a load reported: the player that runs and what it knows about the song. */
export interface NuadeLoaded {
  voices: number; subsongs: number; defaultSubsong: number;
  playerId: string; playerName: string;
  meta: Record<string, string>;
  instruments: { index: number; name: string }[];
  caps: number;
}

export class NuadeEngine extends WASMChannelOutputsEngine implements SubsongPlayer {
  private static instance: NuadeEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _songEndCallback: (() => void) | null = null;
  private readonly follow = new GridFollow();
  private followBy: NuadeFollowBy = 'orderRow';
  private readonly subsongRequests = new SubsongRequests();
  private readonly meterFeed = new ChannelMeterFeed();
  private _loaded: NuadeLoaded | null = null;
  /** The voices the audio node is declared for (outputs 1 + 4 + voices): the loaded song's, NUADE_NODE_VOICES before one. */
  private _nodeVoices = NUADE_NODE_VOICES;
  private _muteMask: number | null = null;
  private _editPort: NuadeEditPort | null = null;
  private _lastSwapMs: number | null = null;
  private readonly swapCallbacks = new Set<(ms: number) => void>();
  private readonly loadCallbacks = new Set<(l: NuadeLoaded) => void>();
  private readonly voiceCallbacks = new Set<(voices: NuadeVoiceState[]) => void>();
  private readonly stateRequests: Array<(bytes: ArrayBuffer) => void> = [];

  private constructor() {
    super();
    this.initialize(NuadeEngine.cache);
  }

  static getInstance(): NuadeEngine {
    // AudioContext-swap guard (see JamCrackerEngine for the reference).
    const currentCtx = getDevilboxAudioContext();
    if (!NuadeEngine.instance || NuadeEngine.instance._disposed || NuadeEngine.instance.audioContext !== currentCtx) {
      if (NuadeEngine.instance && !NuadeEngine.instance._disposed) NuadeEngine.instance.dispose();
      NuadeEngine.instance = new NuadeEngine();
    }
    return NuadeEngine.instance;
  }

  static hasInstance(): boolean {
    return !!NuadeEngine.instance && !NuadeEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return { dir: 'nuade', workletFile: 'Nuade.worklet.js', wasmFile: 'Nuade.wasm', jsFile: 'Nuade.js' };
  }

  /** The voices the node is declared for. A song's own count once one is loaded (see resizeNode). */
  get nodeVoices(): number { return this._nodeVoices; }

  protected createNode(): void {
    this.workletNode = new AudioWorkletNode(this.audioContext, 'nuade-processor', channelOutputNodeOptions(this._nodeVoices));
    this.workletNode.port.onmessage = (event) => this.handleWorkletMessage(event.data);
    this.post({
      type: 'init',
      wasmBinary: NuadeEngine.cache.wasmBinary, jsCode: NuadeEngine.cache.jsCode,
      sampleRate: this.audioContext.sampleRate,
    });
    this.workletNode.connect(this.output, 0);
  }

  /**
   * Replace the audio node with one declared for exactly `voices` voices: each declared output costs audio-thread time
   * whether it is connected or not (channelOutputsSizedByVoices.test.ts), and nuade's voice count differs per player (2 to 8).
   * The old node is disposed and disconnected; the new one boots like the first (init message, ready) and the engine
   * state a node holds (the mute mask) is posted again. Isolation slots and dub sends are the mixer's: they are re-posted
   * by afterPlay when the song plays, to the node that is there then.
   */
  private async resizeNode(voices: number): Promise<void> {
    const old = this.workletNode;
    if (old) {
      try { old.port.postMessage({ type: 'dispose' }); } catch { /* port closed */ }
      old.port.onmessage = null;
      try { old.disconnect(); } catch { /* already disconnected */ }
    }
    this.workletNode = null;
    this.markNodeNotReady();
    this._initPromise = new Promise((resolve) => { this._resolveInit = resolve; });
    this._nodeVoices = voices;
    this.createNode();
    const node = this.workletNode as AudioWorkletNode | null;
    if (node) {
      node.onprocessorerror = (event) => console.error('[NuadeEngine] worklet processor error - the engine stopped:', event);
    }
    await this._initPromise;
    if (this._muteMask !== null) this.post({ type: 'setMuteMask', mask: this._muteMask });
  }

  private post(msg: NuadeIn, transfer?: Transferable[]): void {
    this.workletNode?.port.postMessage(msg, transfer ?? []);
  }

  /** Everything the worklet posts. Public so tests can feed the real worklet's messages through the same path. */
  handleWorkletMessage(raw: unknown): void {
    const data: NuadeOut | null = parseNuadeOut(raw);
    if (!data) {
      console.error('[NuadeEngine] unrecognised worklet message', raw);
      return;
    }
    switch (data.type) {
      case 'ready':
        this.markNodeReady();
        if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
        break;
      case 'moduleLoaded': {
        this._loaded = data;
        recordNuadePlayerCaps(data.playerId, data.caps);
        this._editPort = createNuadeEditPort(data.caps, (m) => this.post(m));
        useOscilloscopeStore.getState().setChipInfo(data.voices, 0, Array.from({ length: data.voices }, (_, i) => `Voice ${i + 1}`));
        // nuade subsongs are 0-based already; the file's start subsong is what plays.
        reportSubsongs('Nuade', data.subsongs, data.defaultSubsong);
        for (const cb of this.loadCallbacks) cb(data);
        break;
      }
      case 'subsongStarted':
        if (data.index >= 0) reportSubsongs('Nuade', this._loaded?.subsongs ?? 1, data.index);
        this.subsongRequests.settle(data.index);
        break;
      case 'position': {
        if (this.followBy === 'tick') this.follow.followTicks(data.row * Math.max(1, data.speed) + data.tick);
        else this.follow.followOrderRow(data.order, data.row);
        for (const cb of this.voiceCallbacks) cb(data.voices);
        break;
      }
      case 'vu':
        // The same meter feed the other engines report to (what the channel meters and get_audio_level's callers read).
        this.meterFeed.report(data.levels);
        break;
      case 'oscData':
        useOscilloscopeStore.getState().updateChannelData(data.channels, data.frame, data.sampleRate);
        break;
      case 'songEnd':
        this._songEndCallback?.();
        void advanceNativeSubsong('Nuade', this);
        break;
      case 'swapDone':
        this._lastSwapMs = data.ms;
        for (const cb of this.swapCallbacks) cb(data.ms);
        break;
      case 'state':
        this.stateRequests.shift()?.(data.bytes);
        break;
      case 'writeResult':
        if (data.status < 0) console.warn(`[NuadeEngine] ${data.op} write refused (${data.status})`);
        break;
      case 'stopped':
        break;
      case 'error':
        console.error('[NuadeEngine]', data.message);
        break;
    }
  }

  /**
   * Load a module on the player `playerId` (the nuade player id), under `fileName`, with the files the player opens
   * beside it (`companions`, by name). `subsong` is 0-based; undefined plays the file's default.
   */
  async loadTune(moduleData: ArrayBuffer, playerId?: string, fileName?: string, subsong?: number, companions?: Map<string, ArrayBuffer>): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('NuadeEngine not initialized');
    if (!playerId) throw new Error('NuadeEngine: no player id');
    // The node is sized for this song: ask the player how many voices it has before the module goes to the worklet.
    const voices = await nuadeVoiceCounter()(new Uint8Array(moduleData), fileName || playerId, playerId, companions);
    if (voices !== null && voices >= 1 && voices <= NUADE_NODE_VOICES && voices !== this._nodeVoices) await this.resizeNode(voices);
    if (!this.workletNode) throw new Error('NuadeEngine not initialized');
    this._editPort = null;
    this._loaded = null;
    this.post({
      type: 'loadModule',
      bytes: moduleData, playerId, fileName: fileName || playerId,
      subsong: typeof subsong === 'number' && subsong >= 0 ? subsong : undefined,
      companions: Array.from(companions ?? [], ([name, data]) => ({ name, data: data.slice(0) })),
    }, [moduleData]);
  }

  play(): void {
    const ctx = this.audioContext;
    const latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    this.post({ type: 'play', latencyFrames: Math.round(latency * ctx.sampleRate) });
    this.afterPlay();
  }
  stop(): void { this.post({ type: 'stop' }); }
  pause(): void { this.post({ type: 'pause' }); }

  /** Bit N set = voice N audible - the mixer's solo/mute. */
  setMuteMask(mask: number): void { this._muteMask = mask; this.post({ type: 'setMuteMask', mask }); }

  setStereoSeparation(value: number): void { this.post({ type: 'setStereoSeparation', value }); }

  /** Move playback to an output frame (restart and silent render up to it). */
  seek(frame: number): void { this.post({ type: 'seek', frame }); }

  /**
   * Start subsong `index` (0-based). Resolves to the subsong started, or -1.
   */
  playSubsong(index: number): Promise<number> {
    if (!this.workletNode) return Promise.resolve(-1);
    return this.subsongRequests.request(() => this.post({ type: 'setSubsong', index }));
  }

  /**
   * The edited module while the song plays (liveSwap, engineModuleSwap.ts): the worklet opens it, runs it silently
   * to the frame already played and goes on from there. `onSwapDone` reports how long that took.
   */
  swapModule(moduleData: ArrayBuffer, ..._loadArgs: unknown[]): void {
    this.post({ type: 'swapModule', bytes: moduleData }, [moduleData]);
  }

  /** From the worklet taking the last swapModule to the edited module playing (ms; it is caught up across render quanta), null before any. */
  get lastSwapMs(): number | null { return this._lastSwapMs; }
  onSwapDone(cb: (ms: number) => void): () => void {
    this.swapCallbacks.add(cb);
    return () => this.swapCallbacks.delete(cb);
  }

  /** What the last load reported (null before it, and while a new load is in flight). */
  get loaded(): NuadeLoaded | null { return this._loaded; }
  onLoaded(cb: (l: NuadeLoaded) => void): () => void {
    this.loadCallbacks.add(cb);
    return () => this.loadCallbacks.delete(cb);
  }

  /** Per-voice state (note, instrument, volume, pan, active) at each row change. */
  onVoiceState(cb: (voices: NuadeVoiceState[]) => void): () => void {
    this.voiceCallbacks.add(cb);
    return () => this.voiceCallbacks.delete(cb);
  }

  /** The player's capability bits (nuadeProtocol NuadeCap) as of the last load; 0 before one. */
  get capabilities(): number { return this._loaded?.caps ?? 0; }

  /** Non-null only while the loaded player can be written into (never at the pinned upstream). */
  get editPort(): NuadeEditPort | null { return this._editPort; }

  /** The registry's `gridCellEdits` shape: one grid cell into the player, when it has a cell write. */
  setCell(pattern: number, row: number, channel: number, note: number, instrument: number, effTyp: number, eff: number, volume: number): void {
    this._editPort?.setCell?.(pattern, row, channel, [note, instrument, effTyp, eff, volume]);
  }

  /** Read `len` bytes at `offset` of the player's typed state (<id>_from_nuade). */
  readState(offset: number, len: number): Promise<ArrayBuffer> {
    return new Promise((resolve) => {
      this.stateRequests.push(resolve);
      this.post({ type: 'requestState', offset, len });
    });
  }

  /**
   * The grid the player's position maps onto. `followBy`: 'orderRow' for a player whose order and row are the grid's,
   * 'tick' for a reconstructed grid (the position's row * speed + tick is the player's tick count).
   */
  setGrid(song: TickGridSong & { eaglePlayerTickGrid?: undefined; nuadePlayerId?: string }, followBy?: NuadeFollowBy): void {
    // The table says how the player's position maps onto the grid (the registry may not import the table: dedicatedEngineFromRegistry).
    this.followBy = followBy ?? nuadeFormatForPlayer(song.nuadePlayerId)?.followBy ?? 'orderRow';
    this.follow.setGrid(songTickGrid(song));
  }

  /** The player's grid position as it plays. */
  onPositionUpdate(cb: (p: NuadePosition) => void): () => void {
    return this.follow.onPosition(cb);
  }

  onSongEnd(callback: () => void): void { this._songEndCallback = callback; }

  override dispose(): void {
    super.dispose();
    if (NuadeEngine.instance === this) NuadeEngine.instance = null;
  }
}
