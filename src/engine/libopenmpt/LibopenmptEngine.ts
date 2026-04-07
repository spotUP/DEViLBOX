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
import { getToneEngine } from '@engine/ToneEngine';
import * as Tone from 'tone';
import type { PlaybackCoordinator } from '@engine/PlaybackCoordinator';
import type { TrackerSong } from '@engine/TrackerReplayer';
import { useSettingsStore } from '@stores/useSettingsStore';

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
  volume: number;       // 0-16384 (nRealVolume, post-processing)
  frequency: number;    // Hz, after portamento/vibrato/arpeggio
  panning: number;      // 0-256 (nRealPan)
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
  private _durationSeconds: number = 0;

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
    try {
      await this.context.audioWorklet.addModule(`${baseUrl}chiptune3/chiptune3.worklet.js`);
    } catch (err) {
      console.warn('[LibopenmptEngine] Failed to load worklet:', err);
      this._ready = true;
      this._available = false;
      return;
    }

    this.workletNode = new AudioWorkletNode(this.context, 'libopenmpt-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

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

  private handleMessage(msg: MessageEvent): void {
    const { cmd, order, pattern, row, chLevels, chState, audioTime } = msg.data;
    switch (cmd) {
      case 'pos':
        if (this._playing) this._onPosition?.(order, pattern, row, audioTime);
        if (chLevels) {
          try {
            const engine = getToneEngine();
            // Update trigger meters only for significant level increases (note-on events)
            // This prevents constant small values from resetting the decay
            for (let i = 0; i < chLevels.length; i++) {
              // Only trigger if level is above noise floor threshold
              if (chLevels[i] > 0.05) {
                engine.triggerChannelMeter(i, chLevels[i]);
              }
            }
            // Always update realtime levels for realtime VU mode
            engine.updateRealtimeChannelLevels(chLevels);
          } catch { /* ToneEngine not ready */ }
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
              volume: arr[base + 2],
              frequency: arr[base + 3],
              panning: arr[base + 4],
              active: arr[base + 5] !== 0,
            });
          }
          const rawCtx = this.output.context as AudioContext;
          const latency = (rawCtx as unknown as { outputLatency?: number; baseLatency?: number }).outputLatency
            ?? (rawCtx as unknown as { baseLatency?: number }).baseLatency
            ?? 0;
          const time = rawCtx.currentTime + latency;
          this._onChannelState(state, time);
        }
        break;
      case 'meta':
        if (msg.data.meta?.dur > 0) {
          this._durationSeconds = msg.data.meta.dur;
        }
        break;
      case 'end':
        this._playing = false;
        this._onEnded?.();
        break;
      case 'err':
        console.error('[LibopenmptEngine] Worklet error:', msg.data.val);
        this._playing = false;
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

  /** Duration of the loaded module in seconds (0 if unknown). */
  getDurationSeconds(): number {
    return this._durationSeconds;
  }

  /** Load a module file (raw binary) into the worklet. */
  async loadTune(data: ArrayBuffer): Promise<void> {
    if (!this._available || !this.workletNode) {
      throw new Error('LibopenmptEngine not available');
    }
    // Stop any current playback before loading new module
    this.stop();
    // The actual load happens in play() — we store the data
    this._pendingData = data;
  }

  private _pendingData: ArrayBuffer | null = null;

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
    this.workletNode.port.postMessage({ cmd: 'play', val: data });
    this._playing = true;
  }

  stop(): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: 'stop' });
    this._playing = false;
  }

  pause(): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: 'pause' });
  }

  resume(): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: 'unpause' });
  }

  /** Hot-reload module data without restarting playback. Preserves position. */
  hotReload(data: ArrayBuffer): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: 'hotReload', val: data });
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
    },
  ): Promise<{ started: boolean }> {
    await this.ready();
    if (!this.isAvailable()) return { started: false };

    if (!opts.song.libopenmptFileData) {
      throw new Error('LibopenmptEngine.startWithCoordinator: song.libopenmptFileData is null');
    }

    // If the user has unsaved soundlib edits, re-serialize from the soundlib
    // (the canonical document model) and use that as the load buffer. The
    // bridge clears its dirty flag and cancels any pending hot-reload timer.
    let tuneData: ArrayBuffer = opts.song.libopenmptFileData;
    const bridge = await import('@engine/libopenmpt/OpenMPTEditBridge');
    if (bridge.isActive() && bridge.isDirty()) {
      const serialized = await bridge.serialize();
      if (serialized) {
        tuneData = serialized;
        // Cache the serialized buffer so subsequent plays don't re-serialize.
        opts.song.libopenmptFileData = serialized;
      }
    }

    await this.loadTune(tuneData);

    // Route output exactly once per engine instance. The destination is
    // typically the stereo separation chain's input node; pass null to
    // route directly to context.destination.
    if (!this._routed) {
      const target = opts.destination ?? this.output.context.destination;
      try {
        this.output.connect(target);
        this._routed = true;
      } catch (err) {
        console.warn('[LibopenmptEngine] startWithCoordinator: routing failed, falling back to context.destination:', err);
        try {
          this.output.connect(this.output.context.destination);
          this._routed = true;
        } catch { /* truly broken — return failure */ }
      }
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
      coordinator.dispatchEnginePosition(row, order, audioTime, Tone.now());
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

  dispose(): void {
    this.stop();
    try { this.workletNode?.disconnect(); } catch { /* ignored */ }
    try { this.gainNode?.disconnect(); } catch { /* ignored */ }
    this.workletNode = null;
    this.gainNode = null;
    this._ready = false;
    this._available = false;
    this._pendingData = null;
    this._routed = false;
    LibopenmptEngine.instance = null;
  }
}
