/**
 * Suppressing a lane fire that is the echo of a live one.
 *
 * Observed 2026-09-18 in the performance journal: one press of `springSlam`
 * produced two entries at the same row — the user's, and a `lane` copy 125 ms
 * later. One press, two sounds.
 *
 * The path is a loop nobody designed: `DubRecorder` writes the move as an
 * automation curve point AT THE ROW CURRENTLY PLAYING, and
 * `TrackerReplayer.applyAutomationForRow` rebuilds the automation table from
 * the store on EVERY row before processing it. So the point the press just
 * wrote is in the table by the next tick, still within the row's window, and
 * `AutomationPlayer` fires it back as playback.
 *
 * The router is where every fire converges — live, lane, cell-decoded — and is
 * therefore the one place that can see the duplicate at all. Fixing it in the
 * recorder (write the point elsewhere) or the player (know what was just
 * played live) would put the knowledge in a component that has no business
 * holding it, and would still leave the cell-decoded path uncovered.
 *
 * What this must NOT do is suppress a genuine replay. A recorded take played
 * back on a later pass is the whole point of recording, and by then the live
 * fire is long past — so the guard is a short window, measured from the live
 * fire, not a permanent memory of what was played.
 */

/**
 * How long a lane fire is treated as the echo of a live one.
 *
 * A row at 125 BPM and speed 12 is about 115 ms; the replay lands on the tick
 * after the press. Wide enough to cover that and a little jitter, far narrower
 * than a pattern — a real replay pass is seconds away, not a third of a second.
 */
export const LIVE_ECHO_WINDOW_MS = 400;

export interface LiveFireKey {
  moveId: string;
  channelId?: number;
  row: number;
}

/** Same move, same channel, same row — the three things a duplicate shares. */
function keyOf(k: LiveFireKey): string {
  return `${k.moveId}|${k.channelId ?? 'global'}|${Math.round(k.row)}`;
}

export class LiveEchoGuard {
  private recent = new Map<string, number>();

  /** Remember a live fire so its replay can be recognised. */
  noteLive(k: LiveFireKey, nowMs: number): void {
    this.recent.set(keyOf(k), nowMs);
    // Opportunistic sweep — this runs on every fire, so it must stay cheap and
    // must never grow without bound during a long session.
    if (this.recent.size > 64) {
      for (const [key, at] of this.recent) {
        if (nowMs - at > LIVE_ECHO_WINDOW_MS) this.recent.delete(key);
      }
    }
  }

  /**
   * True when this lane fire is the echo of a live one that just happened.
   *
   * Consumes the match: a curve legitimately holding two points for the same
   * move at the same row should not be silenced twice by one press.
   */
  isEcho(k: LiveFireKey, nowMs: number): boolean {
    const key = keyOf(k);
    const at = this.recent.get(key);
    if (at === undefined) return false;
    if (nowMs - at > LIVE_ECHO_WINDOW_MS) {
      this.recent.delete(key);
      return false;
    }
    this.recent.delete(key);
    return true;
  }

  clear(): void {
    this.recent.clear();
  }

  get size(): number {
    return this.recent.size;
  }
}
