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
 * PlaybackCoordinator — top-level coordinator class.
 *
 * Currently a thin shell around DisplayStateRing. Subsequent refactor phases
 * will add: hybrid note dispatch, mute/solo masks, capture sync, etc.
 */
export class PlaybackCoordinator {
  readonly stateRing = new DisplayStateRing();

  // Convenience pass-throughs so callers don't need to reach into the ring.
  queueDisplayState(time: number, row: number, pattern: number, position: number, tick: number, duration: number = 0): void {
    this.stateRing.queue(time, row, pattern, position, tick, duration);
  }

  getStateAtTime(time: number, peek: boolean = false): DisplayState | null {
    return this.stateRing.getStateAtTime(time, peek);
  }
}
