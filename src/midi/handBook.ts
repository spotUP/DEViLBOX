/**
 * Which controls the performer's hand is on right now.
 *
 * A motorised fader says so itself: it has a touch sensor, and the X-Touch
 * sends a CC the instant you make contact. An ENCODER has nothing of the kind.
 * The only evidence that a hand is on a knob is that the knob is sending
 * values.
 *
 * Without this, AutoDub could not tell. `getHeldDubParams` asked a
 * `TakeoverBook` that nothing fed once soft takeover was removed on
 * 2026-09-23, so it always answered "no hands anywhere" — and a ride is
 * allowed to take any parameter no hand is on. The machine therefore grabbed
 * the exact knob being turned and pulled it back along its own curve:
 * "the auto dub does it, it doesn't let me override" (2026-09-23).
 *
 * Kept apart from the mapper so the rule is a few lines that can be driven
 * directly by a test, with no MIDI device and no browser.
 */

/**
 * How long after its last message a control still counts as held.
 *
 * Long enough to cover the pause between two turns of the same knob — a hand
 * resting mid-gesture is still a hand — and short enough that a knob let go of
 * is free again before the next bar line, which is the soonest a ride can
 * start.
 */
export const HAND_ON_CONTROL_MS = 1200;

export class HandBook {
  private lastSeen = new Map<string, number>();

  /** A message arrived for this parameter, so a hand is on its control. */
  note(param: string, nowMs: number): void {
    this.lastSeen.set(param, nowMs);
  }

  /** Every parameter whose control has been touched recently enough. */
  held(nowMs: number): string[] {
    const out: string[] = [];
    for (const [param, at] of this.lastSeen) {
      if (nowMs - at <= HAND_ON_CONTROL_MS) out.push(param);
      // Drop what has gone cold, so the map cannot grow for a whole session.
      else this.lastSeen.delete(param);
    }
    return out;
  }

  /** Is a hand on this one control? */
  holds(param: string, nowMs: number): boolean {
    const at = this.lastSeen.get(param);
    return at !== undefined && nowMs - at <= HAND_ON_CONTROL_MS;
  }

  clear(): void {
    this.lastSeen.clear();
  }
}

/** The one book, shared by the mapper that fills it and the engine that reads it. */
export const handBook = new HandBook();
