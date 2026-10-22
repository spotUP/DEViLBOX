/**
 * LibopenmptEngine — Singleton WASM engine for MOD/XM/IT/S3M playback via libopenmpt.
 *
 * Uses the chiptune3 AudioWorklet (public/chiptune3/chiptune3.worklet.js) which
 * wraps libopenmpt's C API compiled to WASM. Reports order/pattern/row position
 * so the pattern editor follows playback.
 *
 * Falls back gracefully: if the worklet fails to load, callers can detect via
 * isAvailable() and let ToneEngine handle note-by-note playback instead.
 */

import { getDevilboxAudioContext } from '@utils/audio-context';
import type { PlaybackCoordinator } from '@engine/PlaybackCoordinator';
import type { TrackerSong } from '@engine/TrackerReplayer';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { registerDubOutputBase } from '../tone/dubOutputBase';
import { ChannelMeterFeed } from '../tone/channelMeterFeed';

const meterFeed = new ChannelMeterFeed();

/** Seconds from the destination to the speakers (outputLatency, else baseLatency). */
function outputLatencyOf(ctx: AudioContext): number {
  const c = ctx as unknown as { outputLatency?: number; baseLatency?: number };
  return c.outputLatency ?? c.baseLatency ?? 0;
}

/** Highest pattern note number libopenmpt reports for a played note (254 and 255 are cut and off). */
const MAX_PLAYED_NOTE = 120;

/**
 * Add one note start to `counts[ch]` for every channel whose pattern row holds a
 * note. `state` is the worklet's per-row dump, six numbers per channel with the
 * note first.
 */
export function countRowNoteStarts(counts: number[], state: ArrayLike<number>): void {
  const channels = Math.floor(state.length / 6);
  for (let ch = 0; ch < channels; ch++) {
    const note = state[ch * 6];
    if (note >= 1 && note <= MAX_PLAYED_NOTE) counts[ch] = (counts[ch] ?? 0) + 1;
  }
}

// ---------------------------------------------------------------------------
// Position callback type
// ---------------------------------------------------------------------------

export type LibopenmptPositionCallback = (order: number, pattern: number, row: number, audioTime?: number) => void;

// ---------------------------------------------------------------------------
// Channel state types
// ---------------------------------------------------------------------------

export interface LibopenmptChannelState {
  note: number;
  instrument: number;
  volcmd: number;       // Volume column command type (openmpt volcmd enum)
  volume: number;       // Volume column parameter
  effect: number;       // Effect column command (0=none, 1=Axx, etc.)
  param: number;        // Effect column parameter
  active: boolean;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class LibopenmptEngine {
  private static instance: LibopenmptEngine | null = null;

  private context: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private gainNode: GainNode | null = null;
  private _ready = false;
  private _available = false;
  private _initPromise: Promise<void> | null = null;
  private _playing = false;
  private _onPosition: LibopenmptPositionCallback | null = null;
  private _onEnded: (() => void) | null = null;
  private _onChannelState: ((state: LibopenmptChannelState[], time: number) => void) | null = null;
  /** Unthrottled per-position callback for tick-level synth effect processing */
  private _onPositionTick: ((audioTime: number, row: number, order: number, speed: number, tempo: number) => void) | null = null;
  private _durationSeconds: number = 0;
  private _lastOrder: number = 0;
  private _lastRow: number = 0;
  private _lastSpeed: number = 6;
  private _lastTempo: number = 125;
  private _onTransportEvent: ((event: 'seek' | 'pause' | 'unpause' | 'stop', order?: number, row?: number) => void) | null = null;

  /** Per-channel effect isolation: tracks which slots are active and their channel masks. */
  static readonly MAX_ISOLATION_SLOTS = 16;
  /** Per-channel dub-send outputs. Indices [MAX_DUB_OFFSET + ch] on the worklet. */
  static readonly MAX_DUB_CHANNELS = 32;
  static readonly DUB_OUTPUT_BASE = 1 + LibopenmptEngine.MAX_ISOLATION_SLOTS; // = 17
  /**
   * Output lead of a hybrid song (one with replaced or synth instruments), in seconds. The worklet holds
   * every output back this long and stamps each row's `audioTime` that far ahead, so the row reaches the
   * coordinator and its synth notes are scheduled before the row's samples are heard. Without it the first
   * note of a song was scheduled at or after its own time (main-thread hop plus voice build, 6-10 ms) and
   * lost its attack: a click. Sample-only songs run with lead 0.
   */
  static readonly HYBRID_POSITION_LEAD_SEC = 0.03;
  private _isolationSlotMasks: (number | null)[] = new Array(LibopenmptEngine.MAX_ISOLATION_SLOTS).fill(null);
  /** Pending getWorkletDiag() resolvers, settled by the 'diagState' reply. */
  private _diagStateWaiters: ((v: Record<string, unknown> | null) => void)[] = [];

  /** Subscribe to transport events (seek, pause, unpause, stop) for syncing isolation nodes. */
  set onTransportEvent(cb: ((event: 'seek' | 'pause' | 'unpause' | 'stop', order?: number, row?: number) => void) | null) {
    this._onTransportEvent = cb;
  }

  /** The raw Web Audio output node for routing into the stereo separation chain */
  public output!: GainNode;

  private constructor() {}

  static getInstance(): LibopenmptEngine {
    if (!LibopenmptEngine.instance) {
      LibopenmptEngine.instance = new LibopenmptEngine();
    }
    return LibopenmptEngine.instance;
  }

  static hasInstance(): boolean {
    return LibopenmptEngine.instance !== null;
  }

  /** Wait until the worklet is loaded and ready. */
  async ready(): Promise<void> {
    if (this._ready) return;
    if (this._initPromise) return this._initPromise;
    this._initPromise = this.init();
    return this._initPromise;
  }

  /** Whether libopenmpt worklet loaded successfully. */
  isAvailable(): boolean {
    return this._available;
  }

  private async init(): Promise<void> {
    try {
      this.context = getDevilboxAudioContext();
    } catch {
      this.context = new AudioContext();
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    this.gainNode = this.context.createGain();
    this.gainNode.gain.value = 1;
    this.output = this.gainNode;

    const baseUrl = import.meta.env.BASE_URL || '/';
    const cacheBuster = import.meta.env.DEV ? `?v=${Date.now()}` : '';
    try {
      await this.context.audioWorklet.addModule(`${baseUrl}chiptune3/chiptune3.worklet.js${cacheBuster}`);
    } catch (err) {
      console.warn('[LibopenmptEngine] Failed to load worklet:', err);
      this._ready = true;
      this._available = false;
      return;
    }

    // 37 stereo outputs: [0]=main mix, [1..16]=isolation slots for per-channel
    // effects, [17..48]=per-channel dub sends (lazy — muted output costs nothing
    // in the worklet). See src/engine/tone/ChannelRoutedEffects.ts.
    const TOTAL_OUTPUTS = 1 + LibopenmptEngine.MAX_ISOLATION_SLOTS + LibopenmptEngine.MAX_DUB_CHANNELS;
    this.workletNode = new AudioWorkletNode(this.context, 'libopenmpt-processor', {
      numberOfInputs: 0,
      numberOfOutputs: TOTAL_OUTPUTS,
      outputChannelCount: new Array(TOTAL_OUTPUTS).fill(2),
    });

    registerDubOutputBase(this.workletNode, LibopenmptEngine.DUB_OUTPUT_BASE);
    this.workletNode.port.onmessage = this.handleMessage.bind(this);

    // Configure: repeat forever, 100% stereo separation, sinc interpolation
    this.workletNode.port.postMessage({
      cmd: 'config',
      val: { repeatCount: -1, stereoSeparation: 100, interpolationFilter: 0 },
    });

    this.workletNode.connect(this.gainNode);

    this._ready = true;
    this._available = true;
    console.log('[LibopenmptEngine] Ready');
  }

  /** Cumulative note starts per channel, from the pattern rows the worklet reports. */
  private _noteStarts: number[] = [];

  private handleMessage(msg: MessageEvent): void {
    const { cmd, order, pattern, row, chLevels, chState, audioTime, speed, tempo } = msg.data;
    switch (cmd) {
      case 'pos':
        this._lastOrder = order;
        this._lastRow = row;
        this._lastSpeed = speed ?? 6;
        this._lastTempo = tempo ?? 125;
        if (this._playing) this._onPosition?.(order, pattern, row, audioTime);
        // Unthrottled tick callback for SynthEffectProcessor (fires every ~2.9ms)
        if (this._playing) this._onPositionTick?.(audioTime, row, order, this._lastSpeed, this._lastTempo);
        // The module's own pattern rows say when a note starts (sent once per row
        // change). libopenmpt's channel VU is smoothed, so a note retriggered on a
        // channel that is still sounding moves it by less than any jump threshold.
        if (chState) countRowNoteStarts(this._noteStarts, chState as ArrayLike<number>);
        if (chLevels) {
          // Levels go to the level feed; note starts to the note feed. Held
          // until this row is heard: audioTime is when the worklet's output
          // reaches the destination, the output latency is the rest.
          const rawCtx = this.output.context as AudioContext;
          meterFeed.reportAt(chLevels, this._noteStarts, (audioTime ?? rawCtx.currentTime) + outputLatencyOf(rawCtx), rawCtx.currentTime);
        }
        if (chState && this._onChannelState) {
          const arr = chState as Float64Array;
          const numChannels = arr.length / 6;
          const state: LibopenmptChannelState[] = [];
          for (let i = 0; i < numChannels; i++) {
            const base = i * 6;
            state.push({
              note: arr[base + 0],
              instrument: arr[base + 1],
              volcmd: arr[base + 2],
              volume: arr[base + 3],
              effect: arr[base + 4],
              param: arr[base + 5],
              active: true, // Active determined by VU levels separately
            });
          }
          const rawCtx = this.output.context as AudioContext;
          const time = rawCtx.currentTime + outputLatencyOf(rawCtx);
          this._onChannelState(state, time);
        }
        break;
      case 'meta':
        if (msg.data.meta?.dur > 0) {
          this._durationSeconds = msg.data.meta.dur;
        }
        // Set up oscilloscope store with channel info from module metadata
        if (msg.data.meta?.song?.channels) {
          const chNames: string[] = msg.data.meta.song.channels;
          const names = chNames.map((name: string, i: number) => name || `CH${i + 1}`);
          useOscilloscopeStore.getState().setChipInfo(names.length, 0, names);
        }
        break;
      case 'end':
        this._playing = false;
        useOscilloscopeStore.getState().clear();
        this._onEnded?.();
        break;
      case 'err':
        // 'dur' means the module has 0 duration — normal for empty songs.
        // Only treat non-dur errors as fatal.
        if (msg.data.val === 'dur') {
          console.warn('[LibopenmptEngine] Module has zero duration (empty song)');
        } else {
          console.error('[LibopenmptEngine] Worklet error:', msg.data.val);
          this._playing = false;
        }
        break;
      case 'playReady':
        // The worklet has finished `play()` and the module exists. Its
        // `play()` tears down every dub slot first, so this is the only
        // moment at which restoring them is safe. Doing it on a timer raced
        // the teardown and left the dub bus starved for the whole song —
        // see the comment beside the postMessage in chiptune3.worklet.js.
        // The backstop timer must not run a second rebuild for the same play.
        this._clearIsolationBackstop();
        if (this._pendingLoad !== null) {
          const token = this._pendingLoad;
          this._pendingLoad = null;
          void this._startAfterIsolation(token);
        } else {
          this._rebuildIsolationAfterPlay();
        }
        break;
      case 'diagState': {
        const pending = this._diagStateWaiters;
        this._diagStateWaiters = [];
        for (const resolve of pending) resolve(msg.data as Record<string, unknown>);
        break;
      }
      case 'isolationReady':
        console.log(`[LibopenmptEngine] Isolation slot ${msg.data.slotIndex} ready:`, {
          channelMask: '0x' + (msg.data.channelMask ?? 0).toString(16),
          muteFunc: msg.data.muteFunc,
          effectiveSlotMask: '0x' + (msg.data.effectiveSlotMask ?? 0).toString(16),
          userMuteMask: '0x' + (msg.data.userMuteMask ?? 0).toString(16),
          isolatedBits: '0x' + (msg.data.isolatedBits ?? 0).toString(16),
        });
        break;
      case 'isolationError':
        console.warn(`[LibopenmptEngine] Isolation slot ${msg.data.slotIndex} failed: ${msg.data.error}`);
        // Clean up the slot mask so main module doesn't mute this channel
        if (msg.data.slotIndex >= 0 && msg.data.slotIndex < LibopenmptEngine.MAX_ISOLATION_SLOTS) {
          this._isolationSlotMasks[msg.data.slotIndex] = null;
          this._updateMainMuteMask();
        }
        break;
      case 'diagIsolation':
        console.log('[LibopenmptEngine] Isolation diagnostics:', msg.data);
        break;
      case 'isolationDiag':
        console.log('[LibopenmptEngine] Periodic isolation state:', {
          isolatedBits: '0x' + (msg.data.isolatedBits ?? 0).toString(16),
          userMuteMask: '0x' + (msg.data.userMuteMask ?? 0).toString(16),
          effectiveMainMask: '0x' + (msg.data.effectiveMainMask ?? 0).toString(16),
          channels: msg.data.channels,
          activeSlots: msg.data.activeSlots,
          slotMasks: msg.data.slotMasks,
        });
        break;
      case 'oscData':
        useOscilloscopeStore.getState().updateChannelData(msg.data.channels);
        break;
    }
  }

  /** Set callback for position updates (order, pattern, row). */
  set onPosition(cb: LibopenmptPositionCallback | null) {
    this._onPosition = cb;
  }

  /** Set callback for song end. */
  set onEnded(cb: (() => void) | null) {
    this._onEnded = cb;
  }

  /** Set callback for per-row channel state updates (note, instrument, volume, frequency, panning, active). */
  set onChannelState(cb: ((state: LibopenmptChannelState[], time: number) => void) | null) {
    this._onChannelState = cb;
  }

  /** Set unthrottled position callback for tick-level synth effect processing (~344/sec). */
  set onPositionTick(cb: ((audioTime: number, row: number, order: number, speed: number, tempo: number) => void) | null) {
    this._onPositionTick = cb;
  }

  /** Duration of the loaded module in seconds (0 if unknown). */
  getDurationSeconds(): number {
    return this._durationSeconds;
  }

  /** Load a module file (raw binary) into the worklet. */
  async loadTune(data: ArrayBuffer): Promise<void> {
    this._noteStarts = [];
    meterFeed.clearHeld();
    if (!this._available || !this.workletNode) {
      throw new Error('LibopenmptEngine not available');
    }
    // Stop any current playback before loading new module
    this.stop();
    // The actual load happens in play() — we store the data
    this._pendingData = data;
  }

  private _pendingData: ArrayBuffer | null = null;

  /**
   * Scale playback tempo without changing pitch. Factor 1.0 = normal speed;
   * 0.5 = half speed (same pitch); 2.0 = double. Uses libopenmpt's
   * `play.tempo_factor` ctl which adjusts tick rate at the sequencer level.
   */
  setTempoFactor(factor: number): void {
    const clamped = Math.max(0.05, Math.min(4.0, factor));
    this.workletNode?.port.postMessage({ cmd: 'setTempo', val: clamped });
  }

  /**
   * Scale playback pitch without changing tempo. Factor 1.0 = original;
   * 0.5 = octave down; 2.0 = octave up. Together with setTempoFactor this
   * gives a real tape-stop (tempo and pitch drop together).
   */
  setPitchFactor(factor: number): void {
    const clamped = Math.max(0.05, Math.min(4.0, factor));
    this.workletNode?.port.postMessage({ cmd: 'setPitch', val: clamped });
  }

  play(): void {
    if (!this._available || !this.workletNode) {
      console.warn('[LibopenmptEngine] play() aborted: available =', this._available, 'workletNode =', !!this.workletNode);
      return;
    }
    const data = this._pendingData;
    if (!data) {
      console.warn('[LibopenmptEngine] play() aborted: no pending data');
      return;
    }
    console.log('[LibopenmptEngine] play(): sending', data.byteLength, 'bytes to worklet');
    // Clear isolation state — worklet's load destroys all slots
    this._isolationSlotMasks.fill(null);
    // Restore gain (muted by stop())
    try { if (this.gainNode) this.gainNode.gain.setValueAtTime(1, 0); } catch { /* best effort */ }
    // Load PAUSED: the worklet creates the module and answers playReady
    // without rendering. The channels' slots and the master chain are built
    // then (awaited), and only after that does the module start. A play that
    // rendered at once ran the effects aimed at channels on the whole mix, or
    // left the channels dry, for the 100-500 ms the async build took — every
    // play distorted for its first 1-3 rows (2026-10-22). A seek posted right
    // after play() lands before the slots exist, and each slot module starts
    // at the main module's position, which has not rendered since the seek.
    const token = ++this._playToken;
    this._pendingLoad = token;
    this.workletNode.port.postMessage({ cmd: 'load', val: data });
    this._playing = true;

    // A cached worklet build older than 'load' never answers: play it the old
    // way rather than stay silent.
    this._clearIsolationBackstop();
    this._isolationBackstop = setTimeout(() => {
      this._isolationBackstop = null;
      if (this._pendingLoad !== token) return;
      this._pendingLoad = null;
      this.workletNode?.port.postMessage({ cmd: 'play', val: data });
      // The per-channel scopes are built inside the paused 'load', before any
      // sample renders; a build without 'load' needs them asked for.
      this.workletNode?.port.postMessage({ cmd: 'enableOsc' });
      this._rebuildIsolationAfterPlay();
    }, 1000);
  }

  /**
   * After a new song starts, recreate isolation slots if any per-channel effects exist
   * (either mixer insert effects or master effects with selectedChannels).
   */
  private _isolationBackstop: ReturnType<typeof setTimeout> | null = null;
  /** Bumped by every play() and stop(): a stale start never unpauses a newer one. */
  private _playToken = 0;
  /** The play whose paused load awaits playReady. */
  private _pendingLoad: number | null = null;

  /**
   * The module exists, paused. Build the routing every effect aimed at
   * channels needs (master chain, isolation slots and their effects), then
   * start rendering. A failed build still starts the song.
   */
  private async _startAfterIsolation(token: number): Promise<void> {
    try {
      const { settleChannelIsolationBeforeRender } = await import('../tone/ChannelRoutedEffects');
      await settleChannelIsolationBeforeRender();
    } catch (e) {
      console.warn('[LibopenmptEngine] isolation build before the first sample failed:', e);
    }
    if (token !== this._playToken || !this._playing || !this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: 'unpause' });
    // Dub sends: the load destroyed the worklet's dub slots too.
    void import('../tone/ChannelRoutedEffects').then(({ getChannelRoutedEffectsManager }) => {
      try { void getChannelRoutedEffectsManager()?.rebuildDubConnections(); } catch { /* ok */ }
    }).catch(() => { /* ok */ });
  }

  private _clearIsolationBackstop(): void {
    if (this._isolationBackstop === null) return;
    clearTimeout(this._isolationBackstop);
    this._isolationBackstop = null;
  }

  private _rebuildIsolationAfterPlay(): void {
    try {
      void import('../../stores/useMixerStore').then(({ scheduleWasmEffectRebuild }) => {
        scheduleWasmEffectRebuild();
      });
      void import('../tone/ChannelRoutedEffects').then(({ getChannelRoutedEffectsManager }) => {
        try { void getChannelRoutedEffectsManager()?.rebuildDubConnections(); } catch { /* ok */ }
      });
    } catch (e) {
      console.warn('[LibopenmptEngine] Failed to rebuild isolation after play:', e);
    }
  }

  stop(): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: 'stop' });
    this._playing = false;
    this._playToken++;
    this._pendingLoad = null;
    // The worklet's stop destroys its slot modules; the effects stay (ChannelRoutedEffects).
    this._isolationSlotMasks.fill(null);
    this._clearIsolationBackstop();
    meterFeed.clearHeld();
    useOscilloscopeStore.getState().clear();
    // Immediately mute output to prevent audio leaking while the async
    // stop message is processed by the worklet thread.
    try { if (this.gainNode) this.gainNode.gain.setValueAtTime(0, 0); } catch { /* best effort */ }
    this._onTransportEvent?.('stop');
  }

  pause(): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: 'pause' });
    this._onTransportEvent?.('pause');
  }

  resume(): void {
    if (!this.workletNode) return;
    try { if (this.gainNode) this.gainNode.gain.setValueAtTime(1, 0); } catch { /* best effort */ }
    this.workletNode.port.postMessage({ cmd: 'unpause' });
    this._onTransportEvent?.('unpause');
  }

  /** Hot-reload module data without restarting playback. Preserves position. */
  hotReload(data: ArrayBuffer): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: 'hotReload', val: data });
  }

  /**
   * Ask the worklet what it is actually doing — module present, paused, the
   * mute/isolation masks it is applying, and the RMS of its last render.
   *
   * The main thread can read every gain downstream of the worklet but none of
   * this, so a silent master with a ticking transport was undiagnosable from
   * outside. Resolves null if the worklet does not answer (no worklet, or it
   * is wedged), which is itself the answer.
   */
  getWorkletDiag(timeoutMs = 1500): Promise<Record<string, unknown> | null> {
    if (!this.workletNode) return Promise.resolve(null);
    return new Promise((resolve) => {
      let settled = false;
      const done = (v: Record<string, unknown> | null) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      this._diagStateWaiters.push(done);
      setTimeout(() => {
        this._diagStateWaiters = this._diagStateWaiters.filter(w => w !== done);
        done(null);
      }, timeoutMs);
      try {
        this.workletNode!.port.postMessage({ cmd: 'diagState' });
      } catch {
        done(null);
      }
    });
  }

  /** Set channel mute mask (bit N=1 means channel N is ACTIVE). */
  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: 'setMuteMask', val: mask });
  }

  /** Seek to a specific order and row. */
  seekTo(order: number, row: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: 'setOrderRow', val: { o: order, r: row } });
    this._onTransportEvent?.('seek', order, row);
  }

  /** Set stereo separation (0-200, libopenmpt scale). */
  setStereoSeparation(percent: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      cmd: 'config',
      val: { stereoSeparation: percent },
    });
  }

  isPlaying(): boolean {
    return this._playing;
  }

  /** Current speed (ticks per row) as reported by libopenmpt */
  getCurrentSpeed(): number { return this._lastSpeed; }

  /** Current tempo (BPM) as reported by libopenmpt */
  getCurrentTempo(): number { return this._lastTempo; }

  /**
   * Whether this engine has already wired its output into a destination
   * AudioNode for the active TrackerReplayer session. Reset on dispose() and
   * stays false on every fresh getInstance() — startWithCoordinator() guards
   * against double-routing during play() reloads.
   */
  private _routed = false;

  /**
   * High-level "start playing this song under the given coordinator" entry
   * point. Replaces ~80 lines of glue that previously lived inline in
   * TrackerReplayer.play(). Owns:
   *
   *   - readiness check + availability fallback
   *   - bridge serialize (if user has unsaved soundlib edits)
   *   - loadTune
   *   - one-time audio routing into the destination AudioNode
   *   - stereo separation read from settings store
   *   - position-update subscription that dispatches through the coordinator
   *   - song-end forwarding to coordinator.onSongEnd
   *   - play() + initial seek (unless `startMuted`)
   *
   * Returns `{ started: true }` on success. Returns `{ started: false }` if
   * the worklet failed to initialize so the caller can fall back to its TS
   * scheduler. Throws on programming errors only — load failures are reported
   * via the return value.
   */
  async startWithCoordinator(
    coordinator: PlaybackCoordinator,
    opts: {
      song: TrackerSong;
      /** AudioNode to route engine output to. Pass null to use context.destination. */
      destination: AudioNode | null;
      /** Initial seek position. (0, 0) skips the seek. */
      initialSongPos: number;
      initialPattPos: number;
      /** If true, loadTune but don't call play() (used when the replayer is muted). */
      startMuted: boolean;
      /** Output lead in seconds (HYBRID_POSITION_LEAD_SEC for a hybrid song); default 0. */
      positionLeadSec?: number;
    },
  ): Promise<{ started: boolean }> {
    await this.ready();
    if (!this.isAvailable()) return { started: false };

    if (!opts.song.libopenmptFileData) {
      throw new Error('LibopenmptEngine.startWithCoordinator: song.libopenmptFileData is null');
    }

    // When the soundlib module holds this song, it is the canonical document
    // model: bring its structure to the song (patterns, channels and order
    // edited since the last sync), then load it whenever it carries any edit.
    // The song's bytes may be the original import, older than those edits.
    // The bridge clears its dirty flag and cancels any pending hot-reload timer.
    let tuneData: ArrayBuffer = opts.song.libopenmptFileData;
    const bridge = await import('@engine/libopenmpt/OpenMPTEditBridge');
    if (bridge.ownsSongData(opts.song.libopenmptFileData)) await bridge.syncSongStructure(opts.song);
    if (bridge.isActive() && (bridge.isDirty() || bridge.hasEdits())) {
      const serialized = await bridge.serialize();
      if (serialized) {
        tuneData = serialized;
        // Cache the serialized buffer so subsequent plays don't re-serialize.
        opts.song.libopenmptFileData = serialized;
      }
    }

    await this.loadTune(tuneData);
    // Per song: a sample-only song after a hybrid one must run without the lead.
    this.workletNode?.port.postMessage({ cmd: 'setLead', val: opts.positionLeadSec ?? 0 });

    // Route output to the destination node (typically the stereo separation
    // chain's input). Reconnect every time — the TrackerReplayer may have been
    // recreated by HMR with a new separationNode, but this engine singleton
    // persists. Disconnecting first is safe even if nothing was connected.
    if (opts.destination) {
      try { this.output.disconnect(); } catch { /* nothing was connected */ }
      try {
        this.output.connect(opts.destination);
      } catch (err) {
        console.warn('[LibopenmptEngine] startWithCoordinator: routing failed, falling back to context.destination:', err);
        try { this.output.connect(this.output.context.destination); } catch { /* truly broken */ }
      }
    } else if (!this._routed) {
      // No destination provided (DJ deck or first-ever call) — route to context.destination once
      try { this.output.connect(this.output.context.destination); } catch { /* ignored */ }
      this._routed = true;
    }

    // Apply current stereo separation setting from the settings store.
    {
      const settings = useSettingsStore.getState();
      const sep = settings.stereoSeparationMode === 'pt2'
        ? settings.stereoSeparation * 2  // PT2 0-100 → libopenmpt 0-200
        : settings.modplugSeparation;     // ModPlug already 0-200
      this.setStereoSeparation(sep);
    }

    // Position subscription. The worklet posts position updates ~344 times/sec
    // at 44.1kHz; we throttle to row-change events and dispatch through the
    // coordinator (which handles songPos/pattPos, display state, callbacks,
    // hybrid notes).
    let lastRow = -1;
    let lastOrder = -1;
    this.onPosition = (order, _pattern, row, audioTime) => {
      if (row === lastRow && order === lastOrder) return;
      lastRow = row;
      lastOrder = order;
      coordinator.dispatchEnginePosition(row, order, audioTime);
    };

    // Song end → coordinator.onSongEnd. The coordinator forwards to the
    // TrackerReplayer's debounced song-end handling.
    this.onEnded = () => {
      if (coordinator.onSongEnd) coordinator.onSongEnd();
    };

    // Start playback unless the replayer is muted (paused-on-load case).
    if (!opts.startMuted) {
      this.play();
      if (opts.initialSongPos > 0 || opts.initialPattPos > 0) {
        this.seekTo(opts.initialSongPos, opts.initialPattPos);
      }
    }

    return { started: true };
  }

  /** Get the current module buffer (for creating isolation worklet instances). */
  getModuleBuffer(): ArrayBuffer | null {
    return this._pendingData;
  }

  /** Get the AudioContext used by this engine (for creating additional worklet nodes). */
  getAudioContext(): AudioContext | null {
    return this.context;
  }

  /** Get current playback position (last known from worklet position messages). */
  getCurrentPosition(): { order: number; row: number } {
    return { order: this._lastOrder, row: this._lastRow };
  }

  // ---------------------------------------------------------------------------
  // Per-channel effect isolation (multi-output worklet)
  // ---------------------------------------------------------------------------

  /**
   * Create (or update) an isolation slot that renders ONLY the specified channels.
   * The worklet creates a secondary openmpt module instance and renders its audio
   * to output[slotIndex+1]. The main module's mute mask is automatically updated
   * to exclude isolated channels.
   * @param slotIndex 0..MAX_ISOLATION_SLOTS-1
   * @param channelMask Bitmask where bit N=1 means channel N is audible in this slot
   */
  maxIsolationSlots(): number {
    return LibopenmptEngine.MAX_ISOLATION_SLOTS;
  }

  addIsolation(slotIndex: number, channelMask: number): void {
    if (!this.workletNode || !this.context || slotIndex < 0 || slotIndex >= LibopenmptEngine.MAX_ISOLATION_SLOTS) return;
    // The worklet has this slot already: re-adding recreates its module, which
    // restarts the slot at the start of the row. Load, stop and the worklet's
    // isolationError clear the mask, so a slot the worklet lost is re-added.
    if (this._isolationSlotMasks[slotIndex] === channelMask) return;

    this._isolationSlotMasks[slotIndex] = channelMask;

    // Tell worklet to create the isolation module for this slot
    this.workletNode.port.postMessage({ cmd: 'addIsolation', val: { slotIndex, channelMask } });
    this._updateMainMuteMask();

    console.log(`[LibopenmptEngine] addIsolation: slot=${slotIndex}, mask=0x${channelMask.toString(16)}, output=${slotIndex + 1}`);
  }

  /**
   * Destroy an isolation slot and return its channels to the main mix.
   */
  removeIsolation(slotIndex: number): void {
    if (!this.workletNode || slotIndex < 0 || slotIndex >= LibopenmptEngine.MAX_ISOLATION_SLOTS) return;
    this._isolationSlotMasks[slotIndex] = null;
    this.workletNode.port.postMessage({ cmd: 'removeIsolation', val: { slotIndex } });
    this._updateMainMuteMask();
  }

  /**
   * Update which channels an isolation slot renders (without destroying/recreating).
   */
  updateIsolationMask(slotIndex: number, channelMask: number): void {
    if (!this.workletNode || slotIndex < 0 || slotIndex >= LibopenmptEngine.MAX_ISOLATION_SLOTS) return;
    this._isolationSlotMasks[slotIndex] = channelMask;
    this.workletNode.port.postMessage({ cmd: 'updateIsolationMask', val: { slotIndex, channelMask } });
    this._updateMainMuteMask();
  }

  /**
   * Get the AudioWorkletNode (main worklet).
   * Output 0 = main mix. Outputs 1..16 = isolation slots for per-channel effects.
   */
  getWorkletNode(): AudioWorkletNode | null {
    return this.workletNode;
  }

  /**
   * Remove all isolation slots (called on stop/dispose).
   */
  removeAllIsolation(): void {
    for (let i = 0; i < LibopenmptEngine.MAX_ISOLATION_SLOTS; i++) {
      if (this._isolationSlotMasks[i] !== null) {
        this.removeIsolation(i);
      }
    }
  }

  /**
   * Recompute and send the main module's mute mask.
   * The main module renders all channels EXCEPT those currently isolated.
   */
  private _updateMainMuteMask(): void {
    if (!this.workletNode) return;
    // Combine all isolation masks
    let isolatedBits = 0;
    for (const mask of this._isolationSlotMasks) {
      if (mask !== null) isolatedBits |= mask;
    }
    // Main module renders everything EXCEPT isolated channels
    const mainMask = 0xFFFFFFFF & ~isolatedBits;
    console.log(`[LibopenmptEngine] updateMainMask: isolatedBits=0x${isolatedBits.toString(16)}, mainMask=0x${mainMask.toString(16)}, slotMasks=${JSON.stringify(this._isolationSlotMasks)}`);
    this.workletNode.port.postMessage({ cmd: 'updateMainMask', val: mainMask });
  }

  /**
   * Request diagnostic info about isolation state from the worklet.
   * Results are logged to the console via handleMessage.
   */
  diagIsolation(): void {
    if (!this.workletNode) { console.warn('[LibopenmptEngine] No worklet node'); return; }
    console.log(`[LibopenmptEngine] TS-side isolation masks:`, this._isolationSlotMasks);
    this.workletNode.port.postMessage({ cmd: 'diagIsolation' });
  }

  dispose(): void {
    this.removeAllIsolation();
    this.stop();
    try { this.workletNode?.disconnect(); } catch { /* ignored */ }
    try { this.gainNode?.disconnect(); } catch { /* ignored */ }
    this.workletNode = null;
    this.gainNode = null;
    this._ready = false;
    this._available = false;
    this._pendingData = null;
    this._routed = false;
    this._isolationSlotMasks = new Array(LibopenmptEngine.MAX_ISOLATION_SLOTS).fill(null);
    LibopenmptEngine.instance = null;
  }
}
