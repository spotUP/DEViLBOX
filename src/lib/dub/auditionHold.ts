/**
 * Holding a set of gains down, and handing them back.
 *
 * X6 — the bus audition: a solo button for the send. Press it and the PARALLEL
 * colour stages duck so the core wet chain can be heard on its own; let go and
 * they come back exactly as they were.
 *
 * The bookkeeping lives here rather than in `DubBus` because it is not about
 * audio: it is about who owns a value while someone else is borrowing it — the
 * same question the dub sends answer with their baselines. Two things have to
 * be true and neither is obvious:
 *
 *  - Pressing twice must not snapshot the DUCKED values as if they were the
 *    user's, or one stuck press leaves a permanently colourless bus.
 *  - A stage changed WHILE held must land on the restore. Writing it to the
 *    live gain would undo the duck, and restoring afterwards would hand back
 *    the value from before the change.
 *
 * Kept free of Web Audio so the ordering can be tested without an
 * AudioContext — importing `DubBus` into a test drags in the whole WASM effect
 * chain.
 */

/** The slice of `AudioParam` this needs. */
export interface RampableParam {
  value: number;
  cancelScheduledValues(atTime: number): void;
  setValueAtTime(value: number, atTime: number): void;
  linearRampToValueAtTime(value: number, atTime: number): void;
}

export class AuditionHold {
  private held: Array<{ param: RampableParam; value: number }> | null = null;

  get active(): boolean {
    return this.held !== null;
  }

  /**
   * Duck `params` to zero over `rampSec`, remembering where each was.
   *
   * Returns false when an audition is already in progress — the caller should
   * hand back a releaser for THAT one rather than starting a second.
   */
  begin(params: ReadonlyArray<RampableParam | null | undefined>, now: number, rampSec: number): boolean {
    if (this.held) return false;
    const held: Array<{ param: RampableParam; value: number }> = [];
    for (const param of params) {
      if (!param) continue;              // a stage switched off entirely
      held.push({ param, value: param.value });
      ramp(param, 0, now, rampSec);
    }
    this.held = held;
    return true;
  }

  /**
   * Hand every stage back over `rampSec`.
   *
   * Restores the remembered values rather than re-reading settings, so a stage
   * the user had part-way down comes back part-way down and not at whatever a
   * preset nominally says.
   */
  end(now: number, rampSec: number): void {
    const held = this.held;
    if (!held) return;
    this.held = null;
    for (const { param, value } of held) ramp(param, value, now, rampSec);
  }

  /**
   * Absorb a change made while held.
   *
   * Returns true when the value was taken into the snapshot (the caller must
   * NOT write the live param); false when nothing is holding it and the caller
   * should write as usual.
   */
  noteChange(param: RampableParam, value: number): boolean {
    const entry = this.held?.find(e => e.param === param);
    if (!entry) return false;
    entry.value = value;
    return true;
  }
}

function ramp(param: RampableParam, to: number, now: number, rampSec: number): void {
  try {
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(to, now + rampSec);
  } catch {
    // A detached or disposed node. The audition is a convenience; it must
    // never take the bus down with it.
  }
}
