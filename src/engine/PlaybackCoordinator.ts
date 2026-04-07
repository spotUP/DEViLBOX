/**
 * PlaybackCoordinator — Engine-agnostic playback infrastructure.
 *
 * Owns the pieces of the playback system that have nothing to do with any
 * particular replayer or chip emulation: position tracking, the audio-synced
 * display state ring buffer, hybrid note dispatch, mute/solo, capture sync.
 *
 * TrackerReplayer instantiates one of these and forwards the load-bearing
 * methods to it. Format-specific engines (Furnace, libopenmpt, UADE, Hively,
 * MusicLine, etc.) push position updates into the coordinator, and the UI
 * pulls visual state out of it via getStateAtTime().
 *
 * This file is being filled out incrementally as part of the TrackerReplayer
 * refactor (see thoughts/shared/research/2026-04-07_tracker-replayer-audit.md).
 * The first slice is the display state ring buffer.
 */

/**
 * Display state for audio-synced UI updates (BassoonTracker pattern).
 * One entry per row dispatch, scheduled at the audio time the row becomes audible.
 */
export interface DisplayState {
  time: number;      // Web Audio time when this state becomes active
  row: number;       // Pattern row
  pattern: number;   // Pattern number
  position: number;  // Song position index
  tick: number;      // Current tick within row
  duration: number;  // Expected duration of this row in seconds
}

/**
 * Ring-buffer queue for DisplayState entries.
 *
 * - O(1) enqueue, reuses pre-allocated DisplayState objects (no GC churn).
 * - Capacity is 256 entries (~5 seconds at 50Hz). When full, the oldest entry
 *   is overwritten.
 * - getStateAtTime() drains entries up to the requested audio time and returns
 *   the most recent one — this is what the UI render loop calls each frame.
 */
export class DisplayStateRing {
  static readonly CAPACITY = 256;

  private readonly ring: DisplayState[] = Array.from(
    { length: DisplayStateRing.CAPACITY },
    () => ({ time: 0, row: 0, pattern: 0, position: 0, tick: 0, duration: 0 }),
  );
  private head = 0;   // Next write index
  private tail = 0;   // Next read index
  private count = 0;  // Number of items currently in the ring
  private lastDequeued: DisplayState | null = null;

  /**
   * Whether playback is currently active.
   * When false, getStateAtTime() returns the last dequeued state (so the UI
   * keeps showing the last played row instead of jumping to the cursor).
   */
  playing = false;

  /** Queue a display state. O(1). */
  queue(time: number, row: number, pattern: number, position: number, tick: number, duration: number = 0): void {
    const s = this.ring[this.head];
    s.time = time;
    s.row = row;
    s.pattern = pattern;
    s.position = position;
    s.tick = tick;
    s.duration = duration;
    this.head = (this.head + 1) % DisplayStateRing.CAPACITY;
    if (this.count < DisplayStateRing.CAPACITY) {
      this.count++;
    } else {
      // Ring full — overwrite oldest by advancing the tail.
      this.tail = (this.tail + 1) % DisplayStateRing.CAPACITY;
    }
  }

  /**
   * Get display state for audio-synced UI rendering.
   * Call this in the render loop with audioContext.currentTime + lookahead.
   * Returns the most recent state that should be displayed at the given time.
   *
   * @param time Web Audio time
   * @param peek If true, just look at the state at that time without dequeuing older states
   */
  getStateAtTime(time: number, peek: boolean = false): DisplayState | null {
    if (!this.playing) {
      return this.lastDequeued;
    }

    if (peek) {
      // Just find the latest state with time <= requested
      let best = this.lastDequeued;
      let idx = this.tail;
      for (let i = 0; i < this.count; i++) {
        const state = this.ring[idx];
        if (state.time <= time) best = state;
        else break;
        idx = (idx + 1) % DisplayStateRing.CAPACITY;
      }
      return best;
    }

    // Drain entries up to the requested time, returning the most recent one.
    let result = this.lastDequeued;
    while (this.count > 0) {
      const state = this.ring[this.tail];
      if (state.time <= time) {
        result = state;
        this.lastDequeued = result;
        this.tail = (this.tail + 1) % DisplayStateRing.CAPACITY;
        this.count--;
      } else {
        break;
      }
    }
    return result;
  }

  /** Most recently dequeued state (what the UI last showed). */
  getLastDequeued(): DisplayState | null {
    return this.lastDequeued;
  }

  /** Forget the last dequeued state. Used on hard reset (loadSong). */
  clearLastDequeued(): void {
    this.lastDequeued = null;
  }

  /**
   * Empty the ring buffer (called on stop/reset).
   * Keeps lastDequeuedState — the pattern editor reads it after stop to show
   * where playback was. Nulling it causes the editor to fall back to
   * cursor.rowIndex (usually 0), jumping the view to the top.
   */
  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }
}

/**
 * UI position callbacks fired by the active playback engine.
 *
 * - onRowChange:        new row reached (drives the pattern editor cursor)
 * - onChannelRowChange: per-channel row updates (for engines with independent
 *                       channel sequencing like MusicLine Editor)
 * - onSongEnd:          song looped or finished (debounced once per loop)
 * - onTickProcess:      every tick, for diagnostics / metering
 */
export type RowChangeCallback = (row: number, pattern: number, position: number) => void;
export type ChannelRowChangeCallback = (channelRows: number[]) => void;
export type SongEndCallback = () => void;
export type TickProcessCallback = (tick: number, row: number) => void;

/**
 * PlaybackCoordinator — engine-agnostic playback infrastructure.
 *
 * Currently owns:
 *   - DisplayStateRing (audio-synced row scheduling for UI scrolling)
 *   - UI position callbacks (onRowChange / onChannelRowChange / onSongEnd / onTickProcess)
 *   - Capture sync timer (drives automation capture → store conversion)
 *
 * Subsequent refactor phases will move in: hybrid note dispatch, mute/solo
 * masks, position tracking. See thoughts/shared/research/2026-04-07_tracker-replayer-audit.md.
 */
/**
 * Per-frame context the coordinator needs to dispatch a position update.
 * Owned by TrackerReplayer (or whatever else drives playback) and read by
 * dispatchEnginePosition() each call.
 */
export interface PlaybackContext {
  /** songPositions[] from the active TrackerSong, indexed by song order. */
  songPositions: number[];
  /** Current beats-per-minute. Used to compute the row duration hint. */
  bpm: number;
  /** Current ticks-per-row. */
  speed: number;
  /**
   * Optional hook to fire ToneEngine notes for replaced instruments on the
   * current row. Called from dispatchEnginePosition() when the dispatching
   * engine wants hybrid playback. Signature: (audioTime) => void.
   */
  fireHybridNotes: ((time: number) => void) | null;
  /**
   * Optional hook to trigger per-channel VU meters from the current row's
   * pattern data. Called from dispatchEnginePosition() so WASM-backed
   * formats get VU updates without needing the TS scheduler running.
   */
  triggerVUMeters: ((time: number) => void) | null;
  /**
   * Optional hook to drive the automation player for the current row.
   * Called from dispatchEnginePosition() so WASM-backed formats apply
   * automation curves at row boundaries without the TS scheduler running.
   * Sub-row interpolation is still handled by processTick for non-WASM
   * formats — WASM engines only report row changes, not sub-row positions.
   */
  applyAutomation: (() => void) | null;
  /**
   * Audio context, used to read outputLatency for latency-compensated visuals.
   * If null, no latency compensation is applied.
   */
  audioContext: AudioContext | null;
}

export class PlaybackCoordinator {
  readonly stateRing = new DisplayStateRing();

  // ── Position state ───────────────────────────────────────────────────────
  // Mirrored from TrackerReplayer via setters so the coordinator can dispatch
  // engine position updates without calling back into the replayer.
  songPos = 0;
  pattPos = 0;

  /**
   * Set to true by an engine when it wires a position-update subscription
   * via dispatchEnginePosition(). Used by TrackerReplayer to decide whether
   * the TS scheduler can be skipped: if no engine is dispatching positions,
   * the scheduler must run for VU/automation/display state to update.
   * Reset to false on every play() before any subscription is wired.
   */
  hasActiveDispatch = false;

  /**
   * Per-frame playback context. The replayer sets this once per play() and
   * mutates `bpm`/`speed` as the song progresses. dispatchEnginePosition()
   * reads from it on every position update.
   */
  context: PlaybackContext = {
    songPositions: [],
    bpm: 125,
    speed: 6,
    fireHybridNotes: null,
    triggerVUMeters: null,
    applyAutomation: null,
    audioContext: null,
  };

  // ── UI position callbacks ────────────────────────────────────────────────
  onRowChange: RowChangeCallback | null = null;
  onChannelRowChange: ChannelRowChangeCallback | null = null;
  onSongEnd: SongEndCallback | null = null;
  onTickProcess: TickProcessCallback | null = null;

  /** Drop all callbacks (called on dispose). */
  clearCallbacks(): void {
    this.onRowChange = null;
    this.onChannelRowChange = null;
    this.onSongEnd = null;
    this.onTickProcess = null;
  }

  /**
   * Canonical position-update dispatch shared by every WASM engine subscription
   * (Hively, MusicLine, libopenmpt, UADE, TFMX, ...). Each engine has its own
   * throttling + per-format math; once it has computed `(row, position)` it
   * calls into here to update song position state, queue a display state for
   * smooth UI scrolling, fire onRowChange, and fire hybrid notes.
   *
   * Returns silently if the ring isn't playing — the engine kept ticking past
   * a stop, but we don't want to update visuals or fire notes.
   *
   * @param row        Row within the current pattern
   * @param position   Index into context.songPositions
   * @param audioTime  Optional audio-context timestamp from the engine's worklet.
   *                   When provided, output latency is added to keep visuals
   *                   in sync with audio. When omitted, the coordinator reads
   *                   `currentTime` from its own audio context.
   * @param fireHybrid Whether to fire hybrid notes via context.fireHybridNotes.
   *                   Default true. TFMX opts out because its sister UADE
   *                   subscription already handles hybrid playback.
   */
  /**
   * Engines call this from their subscribeToCoordinator/startWithCoordinator
   * method right after wiring a position-update subscription, so the
   * replayer knows it can skip the TS scheduler. The flag must be set
   * synchronously from inside play(), before play() decides whether to
   * call startScheduler.
   */
  markDispatchActive(): void {
    this.hasActiveDispatch = true;
  }

  dispatchEnginePosition(
    row: number,
    position: number,
    audioTime?: number,
    fireHybrid: boolean = true,
  ): void {
    if (!this.stateRing.playing) return;
    const ctx = this.context;
    this.songPos = position;
    this.pattPos = row;
    const patternNum = ctx.songPositions[position] ?? 0;
    let time: number;
    if (audioTime != null && ctx.audioContext) {
      const latency = ctx.audioContext.outputLatency ?? ctx.audioContext.baseLatency ?? 0;
      time = audioTime + latency;
    } else if (ctx.audioContext) {
      time = ctx.audioContext.currentTime;
    } else {
      // No audio context wired — fall back to performance.now() in seconds.
      // Should never happen in production; only during tests with no engine.
      time = performance.now() / 1000;
    }
    this.stateRing.queue(time, row, patternNum, position, 0, (2.5 / ctx.bpm) * ctx.speed);
    if (this.onRowChange) {
      this.onRowChange(row, patternNum, position);
    }
    if (fireHybrid && ctx.fireHybridNotes) {
      ctx.fireHybridNotes(time);
    }
    // VU meters: WASM-backed formats can't use processTick's per-row VU
    // dispatch (the TS scheduler doesn't run for them). Fire it from here so
    // the meters animate during playback regardless of which engine drives.
    if (ctx.triggerVUMeters) {
      ctx.triggerVUMeters(time);
    }
    // Automation: same reason — apply curve-based automation at row
    // boundaries from here so WASM-backed formats get curve playback
    // without depending on processTick.
    if (ctx.applyAutomation) {
      ctx.applyAutomation();
    }
  }

  // ── Display state ring pass-throughs ─────────────────────────────────────
  queueDisplayState(time: number, row: number, pattern: number, position: number, tick: number, duration: number = 0): void {
    this.stateRing.queue(time, row, pattern, position, tick, duration);
  }

  getStateAtTime(time: number, peek: boolean = false): DisplayState | null {
    return this.stateRing.getStateAtTime(time, peek);
  }

  // ── Capture sync timer ───────────────────────────────────────────────────
  // Drives the automation-capture → store-sync polling loop. The replayer
  // hands us a function that knows how to read the current pattern context
  // and call syncCaptureToStore(); we just own the interval lifecycle.
  private _captureSyncInterval: number | null = null;

  /**
   * Start the capture sync polling loop. Calls `tick` every `intervalMs`
   * (default 100ms) until stopCaptureSync() is called. Replaces any existing
   * timer so it's safe to call repeatedly.
   */
  startCaptureSync(tick: () => void, intervalMs: number = 100): void {
    if (this._captureSyncInterval != null) {
      clearInterval(this._captureSyncInterval);
    }
    this._captureSyncInterval = window.setInterval(tick, intervalMs);
  }

  /** Stop the capture sync polling loop. No-op if not running. */
  stopCaptureSync(): void {
    if (this._captureSyncInterval != null) {
      clearInterval(this._captureSyncInterval);
      this._captureSyncInterval = null;
    }
  }
}
