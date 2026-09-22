/**
 * Gate F4 — the gesture engine.
 *
 * A dub move is a press. A GESTURE is the whole shape: when it starts, how
 * long it is held, when it lets go, and whether it bounces. Until now that
 * shape lived as an ad-hoc `Set` of disposers and a `Map` of `setTimeout`s
 * inside AutoDub, which meant the user's hands, the lane player and the AI
 * each had their own idea of what "a held move" is, and only the AI's could
 * be cancelled coherently.
 *
 * This engine owns the shape. It does NOT own execution: every gesture still
 * fires through `DubRouter.fire`, so the router remains the single execution
 * path and the Gate D memory keeps hearing about every move through the same
 * subscription it already uses.
 *
 * What the engine can actually shape today:
 *
 *  - `hold`    — start (optionally quantized), hold, release (optionally
 *                quantized). The ordinary case.
 *  - `rebound` — release, then immediately re-fire a short second gesture:
 *                the "bounce" a hand makes coming off a mute button.
 *
 * `ramp` and `sweep` describe a parameter MOVING while the gesture is held,
 * and no move can do that yet: `DubMove.execute` returns `{ dispose }` with no
 * way to update its parameters mid-flight. Rather than pretend, the engine
 * looks for an optional `update` on the handle a move returns, and a gesture
 * asking for a shape the move cannot serve is marked `degraded` with the
 * reason — visible to the caller and to the fire log, instead of silently
 * behaving like a plain hold.
 */

import { fire } from './DubRouter';
import { msToNextGridBoundary } from './dubGrid';
import {
  SHAPE_TICK_MS,
  shapeProgressFrom,
  shapeValue,
  type AutomatedShape,
  type ShapeCurve,
} from '@/lib/dub/gestureShape';
import type { DubMoveHandle } from './moves/_types';
import type { DubBusSettings } from '@/types/dub';

export type GestureShape = 'hold' | 'rebound' | 'ramp' | 'sweep';

/** Quantization grid for a gesture's start or release. */
export type GestureQuantize = DubBusSettings['throwQuantize'];

export interface GestureSpec {
  moveId: string;
  channelId?: number;
  params?: Record<string, number>;
  /** How long to hold before releasing, in ms. 0 or less = one-shot. */
  holdMs: number;
  shape?: GestureShape;
  /** Grid for the START. 'off' fires immediately. */
  quantizeStart?: GestureQuantize;
  /** Grid for the RELEASE. 'off' releases exactly at `holdMs`. */
  quantizeRelease?: GestureQuantize;
  /** For 'rebound': how long the bounce is held, in ms. */
  reboundMs?: number;
  /**
   * For 'ramp' and 'sweep': which parameter the shape moves, and between what.
   *
   * The shape says HOW the value travels; this says WHAT travels and over
   * what range, because that is the move's business and differs per move.
   * `durationMs` defaults to the hold — give it only when the travel should
   * finish before the gesture does.
   */
  automate?: {
    param: string;
    from: number;
    to: number;
    curve?: ShapeCurve;
    durationMs?: number;
  };
  bpm: number;
  source?: 'live' | 'lane';
  /** Who is firing. Omitted means the user — the AI declares itself. */
  origin?: 'user' | 'ai' | 'lane';
  /** Called when the gesture actually starts (after any quantize wait). */
  onStart?: (gesture: ActiveGestureRecord) => void;
  /** Called after the final release, whatever ended it. */
  onEnd?: (gesture: ActiveGestureRecord, reason: GestureEndReason) => void;
}

export type GestureEndReason = 'completed' | 'ended' | 'cancelled' | 'stopped' | 'seeked';

export interface ActiveGestureRecord {
  id: string;
  moveId: string;
  channelId?: number;
  shape: GestureShape;
  startedAtMs: number;
  holdMs: number;
  /** Set when the requested shape could not be served, with the reason. */
  degraded?: string;
}

/** Handle a move returns. `update` is optional and rare — see `_types.ts`. */
type MoveHandle = DubMoveHandle;

interface LiveGesture extends ActiveGestureRecord {
  handle: MoveHandle | null;
  timers: Set<ReturnType<typeof setTimeout>>;
  spec: GestureSpec;
  released: boolean;
  /**
   * Where the shape had reached, and when, the last time its schedule was set.
   * Extending a hold re-anchors here rather than restarting, so the travel
   * slows instead of jumping backwards.
   */
  automation: { anchorMs: number; anchorProgress: number; endMs: number } | null;
}

let _counter = 0;
const _gestures = new Map<string, LiveGesture>();

function nextId(): string {
  _counter = (_counter + 1) | 0;
  return `g${Date.now().toString(36)}-${_counter.toString(36)}`;
}

/**
 * Start a gesture. Returns its id immediately, even when the start is
 * quantized and the move has not fired yet — so a release that arrives before
 * the boundary still cancels the right thing instead of orphaning it.
 */
export function beginGesture(spec: GestureSpec): string {
  const id = nextId();
  const shape = spec.shape ?? 'hold';
  const gesture: LiveGesture = {
    id,
    moveId: spec.moveId,
    channelId: spec.channelId,
    shape,
    startedAtMs: performance.now(),
    holdMs: Math.max(0, spec.holdMs),
    handle: null,
    timers: new Set(),
    spec,
    released: false,
    automation: null,
  };
  _gestures.set(id, gesture);

  const waitMs = spec.quantizeStart && spec.quantizeStart !== 'off'
    ? msToNextGridBoundary(spec.quantizeStart, spec.bpm)
    : 0;

  if (waitMs > 0) {
    schedule(gesture, () => startNow(gesture), waitMs);
  } else {
    startNow(gesture);
  }
  return id;
}

function startNow(gesture: LiveGesture): void {
  if (!_gestures.has(gesture.id)) return;   // cancelled during the quantize wait
  const { spec } = gesture;

  // Execution goes through the router, always. Quantization was already
  // applied here, so the router is told not to apply its own on top — two
  // quantizers in series would push the gesture a whole grid step late.
  const handle = fire(
    spec.moveId,
    spec.channelId,
    spec.params ?? {},
    spec.source ?? 'live',
    {
      preQuantized: spec.quantizeStart !== undefined && spec.quantizeStart !== 'off',
      origin: spec.origin,
    },
  ) as MoveHandle | null;

  gesture.handle = handle;
  gesture.startedAtMs = performance.now();

  if (gesture.shape === 'ramp' || gesture.shape === 'sweep') {
    startAutomation(gesture, gesture.shape);
  }

  spec.onStart?.(snapshot(gesture));

  // One-shot: nothing to hold, nothing to release.
  if (!handle) {
    finish(gesture, 'completed');
    return;
  }
  if (gesture.holdMs > 0) {
    schedule(gesture, () => endGesture(gesture.id), gesture.holdMs);
  }
  // `holdMs === 0` is an OPEN-ENDED hold, not a mistake: a finger on a pad, a
  // sustained MIDI note, a toggle. It ends when the caller ends it, or when a
  // panic cancels everything. Callers with no finger — AutoDub — must supply a
  // length; `AutoDub.fireChoice` enforces that.
}

/**
 * Drive a `ramp` or `sweep` while the gesture is held.
 *
 * Three things have to be true before a shape can actually be traced, and
 * each failure is recorded rather than papered over — a gesture that silently
 * behaves like a plain hold is worse than one that says why it could not.
 *
 *   1. The move accepts parameters mid-flight (`handle.update`).
 *   2. The spec says WHICH parameter travels, and between what values.
 *   3. The travel has a known duration. A hold whose end is not yet known —
 *      a finger still down — has no progress to be at.
 *
 * Values are pushed on a timer rather than scheduled as one AudioParam curve
 * because the hold can be extended or cut short at any moment, and a curve
 * scheduled at the start would have to be cancelled and rebuilt anyway.
 */
function startAutomation(gesture: LiveGesture, shape: AutomatedShape): void {
  const { spec } = gesture;
  const update = gesture.handle?.update;
  if (!update) {
    gesture.degraded = `${shape} needs a move that can update its params mid-flight; ${spec.moveId} cannot, so it is held instead`;
    return;
  }
  const automate = spec.automate;
  if (!automate) {
    gesture.degraded = `${shape} needs an automate spec saying which parameter travels; none was given, so ${spec.moveId} is held instead`;
    return;
  }
  const now = performance.now();
  // Where the shape has already got to. Zero on the first start; on a hold
  // that was extended mid-travel it is wherever the player had reached, and
  // the remaining travel is spread over the remaining time from there.
  const carried = gesture.automation
    ? currentProgress(gesture, now) ?? 0
    : 0;
  const totalMs = automate.durationMs ?? gesture.holdMs;
  const endMs = automate.durationMs !== undefined
    ? gesture.startedAtMs + automate.durationMs
    : gesture.startedAtMs + gesture.holdMs;
  if (!(totalMs > 0) || endMs <= now) {
    gesture.degraded = `${shape} needs a known duration to travel over; this gesture has an open-ended hold, so ${spec.moveId} is held instead`;
    gesture.automation = null;
    return;
  }
  gesture.automation = { anchorMs: now, anchorProgress: carried, endMs };

  const push = (progress: number) => {
    const value = shapeValue(shape, progress, automate.from, automate.to, automate.curve);
    try {
      gesture.handle?.update?.({ [automate.param]: value });
    } catch (err) {
      console.warn(`[GestureEngine] ${spec.moveId} rejected a ${shape} value:`, err);
    }
  };

  push(carried);
  if (carried >= 1) return;

  const tick = () => {
    if (!_gestures.has(gesture.id)) return;
    const progress = currentProgress(gesture, performance.now());
    if (progress === null) return;
    push(progress);
    // Stop at the far end: the exact landing is pinned on release, and ticking
    // on past 1 would only push the same value over and over.
    if (progress >= 1) return;
    schedule(gesture, tick, SHAPE_TICK_MS);
  };
  schedule(gesture, tick, SHAPE_TICK_MS);
}

/** How far along the shape is now, honouring any mid-gesture re-anchor. */
function currentProgress(gesture: LiveGesture, nowMs: number): number | null {
  const a = gesture.automation;
  if (!a) return null;
  return shapeProgressFrom(a.anchorProgress, nowMs - a.anchorMs, a.endMs - a.anchorMs);
}

/**
 * Change a gesture in flight: extend the hold, or push new parameters into a
 * move that can take them. Returns false when the gesture is gone, or when
 * parameters were asked for and the move cannot accept them.
 */
export function updateGesture(
  id: string,
  patch: { holdMs?: number; params?: Record<string, number> },
): boolean {
  const gesture = _gestures.get(id);
  if (!gesture) return false;

  let ok = true;
  if (patch.holdMs !== undefined) {
    clearTimers(gesture);
    gesture.holdMs = Math.max(0, patch.holdMs);
    const remaining = gesture.startedAtMs + gesture.holdMs - performance.now();
    if (remaining <= 0) {
      endGesture(id);
      return ok;
    }
    schedule(gesture, () => endGesture(id), remaining);
    // Clearing the timers above stopped the shape's ticks too. Restart it
    // against the NEW duration rather than leaving the value frozen where it
    // stood: holding a sweep longer should sweep for longer, which is the
    // whole reason the shape lives out here and not inside the move.
    if (gesture.shape === 'ramp' || gesture.shape === 'sweep') {
      startAutomation(gesture, gesture.shape);
    }
  }
  if (patch.params) {
    if (gesture.handle?.update) gesture.handle.update(patch.params);
    else ok = false;
  }
  return ok;
}

/**
 * End a gesture the way a player would: on the grid when one is asked for.
 *
 * This is the release that makes dub dub, so it gets the same quantize
 * treatment as the start — a mute that comes back a sixteenth early sounds
 * like a mistake, not like a move.
 */
export function endGesture(id: string): void {
  const gesture = _gestures.get(id);
  if (!gesture || gesture.released) return;

  const q = gesture.spec.quantizeRelease;
  const waitMs = q && q !== 'off' ? msToNextGridBoundary(q, gesture.spec.bpm) : 0;
  if (waitMs > 0) {
    gesture.released = true;                  // no second release while waiting
    schedule(gesture, () => release(gesture, 'completed'), waitMs);
    return;
  }
  release(gesture, 'completed');
}

/** Stop a gesture immediately: no grid wait, no rebound. */
export function cancelGesture(id: string, reason: GestureEndReason = 'cancelled'): void {
  const gesture = _gestures.get(id);
  if (!gesture) return;
  clearTimers(gesture);
  try { gesture.handle?.dispose(); } catch (err) {
    console.error(`[GestureEngine] dispose threw for ${gesture.moveId}:`, err);
  }
  finish(gesture, reason);
}

/**
 * Cancel everything. Transport stop and seek both land here: a gesture is a
 * shape in time, and after a stop or a jump there is no time it belongs to.
 */
export function cancelAllGestures(reason: GestureEndReason = 'stopped'): number {
  const ids = Array.from(_gestures.keys());
  for (const id of ids) cancelGesture(id, reason);
  return ids.length;
}

export function activeGestures(): readonly ActiveGestureRecord[] {
  return Array.from(_gestures.values()).map(snapshot);
}

export function gestureCount(): number {
  return _gestures.size;
}

// ── internals ──

function release(gesture: LiveGesture, reason: GestureEndReason): void {
  clearTimers(gesture);
  // Land the shape BEFORE disposing. Ticks run on a 25 ms timer, so the last
  // one is up to a tick short of the end and a ramp would stop just above the
  // frequency the player aimed at. A gesture played to its end arrives at its
  // end — and it has to arrive while the move is still there to hear it.
  landAutomation(gesture);
  try { gesture.handle?.dispose(); } catch (err) {
    console.error(`[GestureEngine] dispose threw for ${gesture.moveId}:`, err);
  }
  gesture.handle = null;

  // The bounce: a short second press straight off the release, the way a hand
  // comes off a mute. Fired as its own gesture so it is cancellable and shows
  // up in the memory like any other move.
  if (gesture.shape === 'rebound' && reason === 'completed') {
    const reboundMs = Math.max(0, gesture.spec.reboundMs ?? Math.round(gesture.holdMs / 4));
    if (reboundMs > 0) {
      beginGesture({
        ...gesture.spec,
        shape: 'hold',
        holdMs: reboundMs,
        quantizeStart: 'off',
        onStart: undefined,
        onEnd: undefined,
      });
    }
  }
  finish(gesture, reason);
}

function finish(gesture: LiveGesture, reason: GestureEndReason): void {
  clearTimers(gesture);
  _gestures.delete(gesture.id);
  gesture.spec.onEnd?.(snapshot(gesture), reason);
}

/**
 * Push the shape's final value: the far end for a ramp, home for a sweep.
 *
 * Only on a gesture that was played out. `cancelGesture` does not call this —
 * cancel means abandon, and driving a parameter to a target nobody reached
 * would be the engine finishing a gesture the player did not.
 */
function landAutomation(gesture: LiveGesture): void {
  if (gesture.shape !== 'ramp' && gesture.shape !== 'sweep') return;
  if (gesture.degraded) return;
  const automate = gesture.spec.automate;
  const update = gesture.handle?.update;
  if (!automate || !update) return;
  const value = shapeValue(gesture.shape, 1, automate.from, automate.to, automate.curve);
  try {
    update({ [automate.param]: value });
  } catch (err) {
    console.warn(`[GestureEngine] ${gesture.moveId} rejected its final ${gesture.shape} value:`, err);
  }
}

function schedule(gesture: LiveGesture, fn: () => void, ms: number): void {
  const timer = setTimeout(() => {
    gesture.timers.delete(timer);
    fn();
  }, ms);
  gesture.timers.add(timer);
}

function clearTimers(gesture: LiveGesture): void {
  for (const t of gesture.timers) clearTimeout(t);
  gesture.timers.clear();
}

function snapshot(g: LiveGesture): ActiveGestureRecord {
  return {
    id: g.id,
    moveId: g.moveId,
    channelId: g.channelId,
    shape: g.shape,
    startedAtMs: g.startedAtMs,
    holdMs: g.holdMs,
    degraded: g.degraded,
  };
}
