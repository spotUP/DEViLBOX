/**
 * Soft takeover — a knob does not grab a value until it has caught up with it.
 *
 * An absolute MIDI control sends its OWN position. The app's value is wherever
 * the performer last left it, and the two have no reason to agree: the knob on
 * the desk sits at 0 while Return Gain sits at 0.75. The first tick of the
 * encoder then slams the parameter to the knob's position — "when i pull the
 * knobs on the behringer compact they reset and start from 0" (2026-09-23).
 *
 * Mid-take that is not a small annoyance. It is the echo return collapsing
 * because a hand brushed a knob.
 *
 * The fix every desk uses: ignore the control until its position CROSSES the
 * value it is trying to take, then hand it over and keep it. Nothing moves
 * until the hand is somewhere honest.
 *
 * Deliberately NOT relative-mode decoding. The X-Touch can be configured
 * either way, and a relative-mode guess that is wrong makes every knob send
 * nonsense. Takeover is correct for absolute controls and harmless for
 * relative ones, which reach the target on the first tick and latch.
 */

/** How close counts as "caught up". About one MIDI step in 0..1. */
export const TAKEOVER_EPSILON = 1 / 127;

export interface TakeoverState {
  /** Has this control caught up and taken control? */
  engaged: boolean;
  /** The last position it reported, to see which way it crossed. */
  lastIncoming: number | null;
}

export function initialTakeover(): TakeoverState {
  return { engaged: false, lastIncoming: null };
}

/**
 * Should this incoming position be applied?
 *
 * Accepts once the control is close enough to the live value, or once it has
 * moved from one side of it to the other. Both matter: a knob nudged gently
 * up to the value catches it, and a knob swept quickly past it catches it too
 * rather than sailing through and needing a second pass.
 */
export function takeover(
  state: TakeoverState,
  incoming: number,
  current: number,
): { accept: boolean; next: TakeoverState } {
  if (state.engaged) {
    return { accept: true, next: { engaged: true, lastIncoming: incoming } };
  }

  if (Math.abs(incoming - current) <= TAKEOVER_EPSILON) {
    return { accept: true, next: { engaged: true, lastIncoming: incoming } };
  }

  const last = state.lastIncoming;
  if (last !== null && (last - current) * (incoming - current) < 0) {
    // It went past. Hand over rather than make the performer come back.
    return { accept: true, next: { engaged: true, lastIncoming: incoming } };
  }

  return { accept: false, next: { engaged: false, lastIncoming: incoming } };
}

/**
 * The value moved somewhere else — by hand on screen, or by automation — so
 * the control no longer holds it and has to catch up again.
 *
 * Without this, a knob that took a parameter at boot keeps it for ever, and
 * the performer's next touch after an AutoDub ride jumps the value back.
 */
export function releaseTakeover(state: TakeoverState): TakeoverState {
  return { engaged: false, lastIncoming: state.lastIncoming };
}

/**
 * Takeover state for a whole surface, keyed however the caller keys controls.
 *
 * A map rather than a field per control, because which controls exist is the
 * descriptor's business and this should not have to know.
 */
export class TakeoverBook {
  private states = new Map<string, TakeoverState>();

  /** Apply the rule for one control, remembering the outcome. */
  accept(key: string, incoming: number, current: number): boolean {
    const state = this.states.get(key) ?? initialTakeover();
    const { accept, next } = takeover(state, incoming, current);
    this.states.set(key, next);
    return accept;
  }

  /** One control must catch up again. */
  release(key: string): void {
    const state = this.states.get(key);
    if (state) this.states.set(key, releaseTakeover(state));
  }

  /** Every control must catch up again — a preset or layer change. */
  releaseAll(): void {
    for (const [key, state] of this.states) {
      this.states.set(key, releaseTakeover(state));
    }
  }

  /** Is this control currently holding its parameter? */
  engaged(key: string): boolean {
    return this.states.get(key)?.engaged ?? false;
  }
}
