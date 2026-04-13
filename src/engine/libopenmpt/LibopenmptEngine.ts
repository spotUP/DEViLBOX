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
import type { PlaybackCoordinator } from '@engine/PlaybackCoordinator';
import type { TrackerSong } from '@engine/TrackerReplayer';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';

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
  private _lastOrder: number = 0;
  private _lastRow: number = 0;
  private _onTransportEvent: ((event: 'seek' | 'pause' | 'unpause' | 'stop', order?: number, row?: number) => void) | null = null;

  /** Per-channel effect isolation: tracks which slots are active and their channel masks. */
  static readonly MAX_ISOLATION_SLOTS = 4;
  private _isolationSlotMasks: (number | null)[] = new Array(LibopenmptEngine.MAX_ISOLATION_SLOTS).fill(null);

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

    // 5 stereo outputs: [0]=main mix, [1..4]=isolation slots for per-channel effects
    this.workletNode = new AudioWorkletNode(this.context, 'libopenmpt-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1 + LibopenmptEngine.MAX_ISOLATION_SLOTS,
      outputChannelCount: [2, 2, 2, 2, 2],
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
        this._lastOrder = order;
        this._lastRow = row;
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
        console.error('[LibopenmptEngine] Worklet error:', msg.data.val);
        this._playing = false;
        break;
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
    // Clear isolation state — worklet's play() destroys all slots
    this._isolationSlotMasks.fill(null);
    // Restore gain (muted by stop())
    try { if (this.gainNode) this.gainNode.gain.setValueAtTime(1, 0); } catch { /* best effort */ }
    this.workletNode.port.postMessage({ cmd: 'play', val: data });
    this._playing = true;

    // Rebuild per-channel effect isolation after a short delay (let worklet create the module first)
    setTimeout(() => this._rebuildIsolationAfterPlay(), 100);

    // Enable per-channel oscilloscope after worklet creates the module
    setTimeout(() => {
      if (this._playing && this.workletNode) {
        this.workletNode.port.postMessage({ cmd: 'enableOsc' });
      }
    }, 150);
  }

  /**
   * After a new song starts, recreate isolation slots if any per-channel effects exist
   * (either mixer insert effects or master effects with selectedChannels).
   */
  private _rebuildIsolationAfterPlay(): void {
    try {
      void import('../../stores/useMixerStore').then(({ scheduleWasmEffectRebuild }) => {
        scheduleWasmEffectRebuild();
      });
    } catch (e) {
      console.warn('[LibopenmptEngine] Failed to rebuild isolation after play:', e);
    }
  }

  stop(): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: 'stop' });
    this._playing = false;
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
  addIsolation(slotIndex: number, channelMask: number): void {
    if (!this.workletNode || !this.context || slotIndex < 0 || slotIndex >= LibopenmptEngine.MAX_ISOLATION_SLOTS) return;

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
   * Output 0 = main mix. Outputs 1..4 = isolation slots for per-channel effects.
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
