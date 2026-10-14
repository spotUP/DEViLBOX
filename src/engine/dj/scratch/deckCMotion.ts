/**
 * Deck C's motion from the strokes it plays (D1, owner 2026-10-12: "activated deck 3 and saw no animated
 * scratching"): three_deck.render's viz capture (:397-436) on the live Deck C bus timeline. The platter spins
 * forward at nominal speed (record velocity 1) between strokes; each stroke overwrites the record velocity and the
 * slip with its own (`render_gesture(collect_viz=True)`) and opens the crossfader to its fade (the max of what
 * overlaps); a needle flourish opens the fader fully. The platter angle is the record velocity integrated
 * (`np.cumsum`), in source samples at 22,050 Hz; dj_viz turns it into revolutions at 33 1/3 rpm.
 *
 * Timeline: the Deck C bus sample (context seconds x 22,050), the same clock every Deck C bus strokes on.
 * The views read it through one consumer per view (`subscribeDeckCMotion`).
 */

import { faderTravelSamples, type GestureViz } from './scratchRender';

export const DECK_C_MOTION_RATE = 22050;
/** dj_viz: 50 Hz ticks, the SL-1200's 33 1/3 rpm. */
export const DECK_C_VIZ_FPS = 50;
export const PLATTER_RPM = 33.3333;
/** Source samples per platter revolution (dj_viz `_angle_to_bytes`: rate x 60 / PLATTER_RPM). */
export const SAMPLES_PER_REV = DECK_C_MOTION_RATE * 60.0 / PLATTER_RPM;

interface Segment { start: number; end: number; viz: GestureViz | null; order: number; owner?: string }

/** Reachability sentinels: strokes and needles placed, samples read by a view. */
export const deckCMotionStats = { strokes: 0, needles: 0, reads: 0, consumers: 0 };

export interface DeckCMotionSample {
  /** The platter angle: the record velocity integrated from the bus's first sample, in source samples. */
  angle: number;
  /** The record velocity here (1 = nominal forward spin). */
  recordVel: number;
  /** The crossfader gain (0 closed .. 1 open): the max of the strokes and needles over this sample. */
  fade: number;
  /** The fader's position under the hand (0 closed .. 1 open), travelling at hand speed: what the lane draws. */
  position: number;
  /** The slip (platter - record velocity) of the stroke over this sample. */
  slip: number;
  /** A stroke or needle covers this sample. */
  active: boolean;
}

/** A needle flourish's fader throw (a full-velocity stroke's: 1 ms cut-in ramp at the motion rate). */
const NEEDLE_TRAVEL = faderTravelSamples(Math.trunc(1e-3 * DECK_C_MOTION_RATE));

/** Strokes are kept this long after they end (the integral is carried forward past them). */
const KEEP_SAMPLES = 2 * DECK_C_MOTION_RATE;

export class DeckCMotion {
  private segs: Segment[] = [];
  private order = 0;
  /** The integral up to (not including) `cursor`: Σ rv_c[0 .. cursor - 1]. */
  private cursor = 0;
  private angleAtCursor = 0;

  /** A stroke summed into a Deck C bus at `start` with its viz capture (three_deck: rv_c / slip / fader). */
  addStroke(start: number, viz: GestureViz, owner?: string): void {
    deckCMotionStats.strokes++;
    this.insert({ start: Math.max(0, Math.trunc(start)), end: Math.max(0, Math.trunc(start)) + viz.recordVel.length, viz, order: this.order++, owner });
  }

  /** A needle flourish (drop / lift): the fader open over its length, the platter untouched. */
  addNeedle(start: number, length: number, owner?: string): void {
    deckCMotionStats.needles++;
    this.insert({ start: Math.max(0, Math.trunc(start)), end: Math.max(0, Math.trunc(start)) + Math.max(0, Math.trunc(length)), viz: null, order: this.order++, owner });
  }

  /** End `owner`'s performance at bus sample `from` (ended early): its later strokes will not sound. */
  endOwner(owner: string, from: number): void {
    this.segs = this.segs.filter((g) => g.owner !== owner || g.start < from);
  }

  private insert(seg: Segment): void {
    // a stroke placed behind the integral's cursor: its velocity replaces what was integrated there
    if (seg.viz && seg.start < this.cursor) {
      const end = Math.min(seg.end, this.cursor);
      let d = 0;
      for (let s = seg.start; s < end; s++) d += seg.viz.recordVel[s - seg.start]! - this.recordVelAt(s);
      this.angleAtCursor += d;
    }
    this.segs.push(seg);
    for (const l of [...strokeListeners]) l();
  }

  /** rv_c at one sample: the last-placed stroke covering it (the demo's overwrite order), else 1. */
  private recordVelAt(s: number): number {
    let best: Segment | null = null;
    for (const g of this.segs) if (g.viz && s >= g.start && s < g.end && (!best || g.order > best.order)) best = g;
    return best ? best.viz!.recordVel[s - best.start]! : 1;
  }

  /** Σ rv_c over [a, b): the gaps between strokes spin at nominal (1 per sample). */
  private sumRv(a: number, b: number): number {
    if (b <= a) return 0;
    const touch = this.segs.filter((g) => g.viz && g.end > a && g.start < b);
    if (!touch.length) return b - a;
    const lo = Math.max(a, Math.min(...touch.map((g) => g.start)));
    const hi = Math.min(b, Math.max(...touch.map((g) => g.end)));
    let sum = (lo - a) + (b - hi);
    for (let s = lo; s < hi; s++) {
      let best: Segment | null = null;
      for (const g of touch) if (s >= g.start && s < g.end && (!best || g.order > best.order)) best = g;
      sum += best ? best.viz!.recordVel[s - best.start]! : 1;
    }
    return sum;
  }

  private advance(to: number): void {
    if (to <= this.cursor) return;
    this.angleAtCursor += this.sumRv(this.cursor, to);
    this.cursor = to;
  }

  /** The motion at bus sample `s` (angle = Σ rv_c[0..s], the demo's cumsum, inclusive). */
  sampleAt(s: number): DeckCMotionSample {
    deckCMotionStats.reads++;
    const at = Math.max(0, Math.trunc(s));
    this.advance(at);
    const rv = this.recordVelAt(at);
    const before = at < this.cursor ? this.angleAtCursor - this.sumRv(at, this.cursor) : this.angleAtCursor;
    let fade = 0, position = 0, slip = 0, active = false, slipOrder = -1;
    for (const g of this.segs) {
      if (at < g.start || at >= g.end) continue;
      active = true;
      fade = Math.max(fade, g.viz ? g.viz.fade[at - g.start]! : 1.0);
      // a needle opens the fader fully: the hand throws it open and back at the same speed as a stroke's
      position = Math.max(position, g.viz ? g.viz.position[at - g.start]! : Math.min(1, Math.min(at - g.start, g.end - 1 - at) / NEEDLE_TRAVEL));
      if (g.viz && g.order > slipOrder) { slip = g.viz.slipVel[at - g.start]!; slipOrder = g.order; }
    }
    // drop strokes long past; their integral is in the cursor
    if (this.segs.length > 64) this.segs = this.segs.filter((g) => g.end + KEEP_SAMPLES > this.cursor);
    return { angle: before + rv, recordVel: rv, fade, position, slip, active };
  }

  /** Is a stroke or needle placed at or after bus sample `s` (the platter is being driven)? */
  busyFrom(s: number): boolean {
    return this.segs.some((g) => g.end > s);
  }

  clear(): void {
    this.segs = [];
    this.cursor = 0;
    this.angleAtCursor = 0;
  }
}

const strokeListeners = new Set<() => void>();
/** Called whenever a stroke or needle is placed on Deck C (a sleeping view wakes up). */
export function onDeckCMotionPlaced(fn: () => void): () => void { strokeListeners.add(fn); return () => { strokeListeners.delete(fn); }; }

let motion: DeckCMotion | null = null;

/** The app's Deck C motion (one timeline for every Deck C bus). */
export function getDeckCMotion(): DeckCMotion {
  if (!motion) motion = new DeckCMotion();
  return motion;
}

/** Tests: a fresh timeline. */
export function resetDeckCMotion(): void {
  motion = null;
}

/** Deck C is driven by its strokes while one was placed within this many samples of now. */
const DRIVE_HOLD = 4 * DECK_C_MOTION_RATE;

/** The motion at a context time while Deck C is being performed (strokes within 4 s), else null (the deck's own clock). */
export function deckCMotionNow(contextSec: number): DeckCMotionSample | null {
  const m = getDeckCMotion();
  const s = Math.trunc(contextSec * DECK_C_MOTION_RATE);
  if (!m.busyFrom(s - DRIVE_HOLD)) return null;
  return m.sampleAt(s);
}

/** A view's one subscription to Deck C's motion; the returned function unsubscribes. */
export function subscribeDeckCMotion(): () => void {
  deckCMotionStats.consumers++;
  let done = false;
  return () => { if (!done) { done = true; deckCMotionStats.consumers--; } };
}

/** Revolutions of the platter for an angle in source samples (dj_viz: rate x 60 / 33 1/3 per revolution). */
export const angleToRevolutions = (angle: number): number => angle / SAMPLES_PER_REV;

/**
 * Deck C's platter angle in radians at a context time while its strokes drive it, else null (the deck's own clock).
 * Every Deck C platter view reads this one value (the CSS turntable and the canvas turntable).
 */
export function deckCPlatterRadians(contextSec: number): number | null {
  const m = deckCMotionNow(contextSec);
  return m ? angleToRevolutions(m.angle) * 2 * Math.PI : null;
}
