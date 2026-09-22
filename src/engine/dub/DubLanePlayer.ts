/**
 * DubLanePlayer — fires lane events through DubRouter as the pattern plays.
 *
 * Cursor-based: maintains a pointer into the current lane's `events[]` sorted
 * by row. On each tick, advances the cursor and fires every event whose row
 * has arrived. Handles seek (backwards row jumps force a cursor re-find via
 * binary search) and loop boundary (the same backwards-seek path covers it).
 *
 * Every event fires through the same DubRouter.fire entry as a live
 * performance, so the audio character of recorded playback matches what the
 * user heard when they recorded it — one code path, zero drift.
 *
 * Hold-style moves aren't implemented this phase (Phase 1 only has echoThrow
 * which is trigger-only). The activeHolds map is plumbed for later phases;
 * current behavior is trigger-only and releases all holds on any seek.
 */

import { fire } from './DubRouter';
import type { DubLane } from '@/types/dub';

/**
 * How long a lane hold with no stated duration may run.
 *
 * Long enough for a real gesture — a tape stop, a drop — and short enough that
 * a lane which never releases costs a couple of bars rather than the rest of
 * the session.
 */
const UNBOUNDED_HOLD_MS = 4000;

/**
 * Is a live performer already driving the bus?
 *
 * A dub lane is a RECORDING; AutoDub is a performer improvising now. They are
 * two performers on one bus, and nothing stopped them both running. Measured
 * 2026-09-22 on jennipha.ahx, which carries a saved lane: every move fired
 * twice, once `source=live origin=ai` and again `source=lane origin=lane` —
 * delayTimeThrow, combSweep, eqSweep, echoThrow and reverseEcho all doubled.
 * That is the "one big reverb wash", and it is also why switching persona
 * appeared to change nothing: the lane kept replaying the old performance
 * whatever the new persona decided.
 *
 * Enabling AutoDub is the user asking for a performance NOW, so the live
 * performer wins and the recording stands down. Turning AutoDub off hands the
 * lane back. Read through a late import so this module stays a leaf — the
 * store pulls the whole dub engine behind it.
 */
function liveDubPerformerActive(): boolean {
  try {
    const store = (globalThis as {
      __devilboxDubStore?: { getState: () => { autoDubEnabled?: boolean } };
    }).__devilboxDubStore;
    return store?.getState().autoDubEnabled === true;
  } catch {
    return false;
  }
}

export class DubLanePlayer {
  private cursor = 0;
  private prevRow = -1;
  private prevTimeSec = -1;
  private lane: DubLane | null = null;
  private activeHolds: Map<string, { dispose(): void }> = new Map();
  /** Watchdogs for holds the lane never gave a length. */
  private holdTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /** Set the active lane (or clear it with `null`). Replaying the same lane
   *  multiple times is fine — call this once per pattern change. */
  setLane(lane: DubLane | null): void {
    this.releaseAllHolds();
    this.lane = lane;
    this.cursor = 0;
    this.prevRow = -1;
    this.prevTimeSec = -1;
  }

  /** True when the current lane is time-indexed. Consumers use this to
   *  choose between calling `onTick(row)` vs `onTimeTick(sec)`. */
  get isTimeMode(): boolean {
    return this.lane?.kind === 'time';
  }

  /**
   * Call from the tracker tick loop with the current row. Idempotent within
   * the same row — firing `onTick(5)` twice only fires each row-5 event once.
   * No-op on time-mode lanes (use `onTimeTick` instead).
   */
  onTick(currentRow: number): void {
    const lane = this.lane;
    if (!lane || !lane.enabled) return;
    if (lane.kind === 'time') return;
    // A recording does not play over a live performer. Holds already in flight
    // are released rather than stranded.
    if (liveDubPerformerActive()) { this.releaseAllHolds(); return; }

    // Backwards jump (seek or loop restart) — reset all holds and binary-
    // search the cursor to the new position.
    if (currentRow < this.prevRow) {
      this.releaseAllHolds();
      this.cursor = this.binarySearchCursorByRow(currentRow);
    }

    // Fire every event from cursor forward whose row <= currentRow.
    const events = lane.events;
    while (this.cursor < events.length && events[this.cursor].row <= currentRow) {
      const event = events[this.cursor];
      const disposer = fire(event.moveId, event.channelId, event.params, 'lane');
      // Trigger-only moves get `null` here and need no bookkeeping.
      this.trackHold(event.id, disposer, event.durationRows !== undefined);
      this.cursor++;
    }

    this.prevRow = currentRow;
  }

  /**
   * Call with current song-time in seconds. Used by time-mode lanes (raw SID,
   * SC68, any non-structured format). Same semantics as onTick but indexed
   * by `DubEvent.timeSec` instead of `row`.
   */
  onTimeTick(currentTimeSec: number): void {
    const lane = this.lane;
    if (!lane || !lane.enabled) return;
    if (lane.kind !== 'time') return;
    // Same rule as `onTick`: a recording stands down for a live performer.
    if (liveDubPerformerActive()) { this.releaseAllHolds(); return; }

    // Backwards jump — song restarted or user seeked.
    if (currentTimeSec < this.prevTimeSec) {
      this.releaseAllHolds();
      this.cursor = this.binarySearchCursorByTime(currentTimeSec);
    }

    const events = lane.events;
    while (this.cursor < events.length && (events[this.cursor].timeSec ?? 0) <= currentTimeSec) {
      const event = events[this.cursor];
      const disposer = fire(event.moveId, event.channelId, event.params, 'lane');
      this.trackHold(event.id, disposer, event.durationSec !== undefined);
      this.cursor++;
    }

    this.prevTimeSec = currentTimeSec;
  }

  /**
   * Take ownership of whatever a lane event started.
   *
   * A hold move returns a disposer. This used to keep it only when the event
   * carried a duration, and drop it otherwise — so a hold event with no
   * duration held FOREVER, with nothing left able to release it.
   *
   * Measured 2026-09-22 on jennipha.ahx. Its lane fires `transportTapeStop` at
   * the start of the song, which sweeps the master low-pass to 400 Hz and holds
   * it there until release. The disposer was discarded, so the tune played
   * through a closed filter and then died, and every later `reverseEcho`
   * captured silence because nothing was reaching `bus.input` any more. These
   * lane events had never run before the `require()` sweep, which is why a
   * years-old lane only started doing this today.
   *
   * A duration-less hold is an authoring gap in the lane, not a licence to hold
   * forever: it is tracked either way, so seek and lane changes can release it,
   * and bounded by `UNBOUNDED_HOLD_MS` so a lane that never releases cannot
   * take the mix with it.
   */
  private trackHold(id: string, disposer: { dispose(): void } | null, bounded: boolean): void {
    if (!disposer) return;
    this.activeHolds.set(id, disposer);
    if (bounded) return;
    console.warn(
      `[DubLanePlayer] lane event "${id}" holds a move with no duration — ` +
      `releasing after ${UNBOUNDED_HOLD_MS} ms. Give the event a duration.`,
    );
    const timer = setTimeout(() => {
      this.holdTimers.delete(id);
      const held = this.activeHolds.get(id);
      if (!held) return;
      this.activeHolds.delete(id);
      try { held.dispose(); } catch { /* ok */ }
    }, UNBOUNDED_HOLD_MS);
    this.holdTimers.set(id, timer);
  }

  /** Release every in-flight hold. Called on seek and on setLane. */
  releaseAllHolds(): void {
    for (const t of this.holdTimers.values()) clearTimeout(t);
    this.holdTimers.clear();
    for (const h of this.activeHolds.values()) {
      try { h.dispose(); } catch { /* ok */ }
    }
    this.activeHolds.clear();
  }

  private binarySearchCursorByRow(row: number): number {
    const events = this.lane?.events ?? [];
    let lo = 0, hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (events[mid].row < row) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private binarySearchCursorByTime(timeSec: number): number {
    const events = this.lane?.events ?? [];
    let lo = 0, hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((events[mid].timeSec ?? 0) < timeSec) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}

/** Singleton used by the tracker tick loop. Mounted by TrackerView via
 *  `dubLanePlayer.setLane(currentPattern.dubLane ?? null)`. */
export const dubLanePlayer = new DubLanePlayer();

/**
 * Fire lane events on every row the transport reaches.
 *
 * The transport used to call this through `require()`, which does not exist in
 * an ESM browser bundle — so it threw into a silent catch and no lane event
 * ever fired. Registration lives here, with the player, so the transport does
 * not need to know this module exists (the import cycle that `require` was
 * dodging is real).
 */
import { registerRowHook } from '@/lib/dev/rowTickHooks';
registerRowHook('dubLanePlayer', (row) => dubLanePlayer.onTick(row));
