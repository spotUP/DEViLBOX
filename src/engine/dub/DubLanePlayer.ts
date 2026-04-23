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

export class DubLanePlayer {
  private cursor = 0;
  private prevRow = -1;
  private prevTimeSec = -1;
  private lane: DubLane | null = null;
  private activeHolds: Map<string, { dispose(): void }> = new Map();

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
      // Hold-style moves (future phases) track their disposer so seek can
      // release them cleanly. Trigger-only moves get `null` here.
      if (disposer && event.durationRows !== undefined) {
        this.activeHolds.set(event.id, disposer);
      }
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

    // Backwards jump — song restarted or user seeked.
    if (currentTimeSec < this.prevTimeSec) {
      this.releaseAllHolds();
      this.cursor = this.binarySearchCursorByTime(currentTimeSec);
    }

    const events = lane.events;
    while (this.cursor < events.length && (events[this.cursor].timeSec ?? 0) <= currentTimeSec) {
      const event = events[this.cursor];
      const disposer = fire(event.moveId, event.channelId, event.params, 'lane');
      if (disposer && event.durationSec !== undefined) {
        this.activeHolds.set(event.id, disposer);
      }
      this.cursor++;
    }

    this.prevTimeSec = currentTimeSec;
  }

  /** Release every in-flight hold. Called on seek and on setLane. */
  releaseAllHolds(): void {
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
