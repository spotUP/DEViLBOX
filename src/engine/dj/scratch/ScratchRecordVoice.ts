/**
 * Scratch record voice (owner plan `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md`
 * sections 11, 16, 18, 39; D4, D5; ledger SCR-P2.5).
 *
 * One voice drives ONE record ring (`DeckScratchBuffer` in record mode: the
 * existing signed-rate Hermite reader over a static record, section 16 "an
 * extension of the scratch engine, not a second transport") into its own
 * scratch bus. It never touches a deck.
 *
 *   load(record, buffer)  write the record, bound the ring to `safe`, cue the vowel
 *   cue(anchor)           drop the needle at attack / vowel / tail / a word / seconds
 *   stroke(curve, sec)    a velocity curve -> frame-accurate rate curve in the worklet
 *   fader(gesture, bpm)   the gesture's fader windows (the P1 fader model is the source)
 *   release()             3 ms gain ramp to silence, worklet stopped
 *
 * Safety (section 11): the ring clamps the head to `safe` (a hand on a record
 * never runs off the sound); the voice predicts each stroke's excursion,
 * logs a clamp when it would leave the range, and REFUSES a reverse stroke
 * when the needle has no safe reverse room (it would only grind the edge).
 */

import type { DeckScratchBuffer, RingRatePoint, RingRateCurveOptions, RingFaderWindowsOptions, RingPositionReport } from '../DeckScratchBuffer';
import type { ScratchRecord } from './scratchCatalogue';
import type { ScratchGesture, ScratchHandPath, ScratchVelocityPoint } from './scratchTypes';
import { positionCurveToRateCurve } from './scratchAnchor';
import { faderWindowsMs, faderCurveShape, cutRampSec, cycleMs } from './scratchFaderModel';
import { handSpeedFactor } from './scratchHandSpeed';

/** The ring surface the voice uses (DeckScratchBuffer in record mode; a fake in tests). */
export type ScratchVoiceRing = Pick<DeckScratchBuffer,
  'sampleRate' | 'playbackGain' | 'loadRecord' | 'setBounds' | 'startAt' | 'seek' | 'rateCurve' | 'faderWindows' | 'faderGain' | 'stopScratch' | 'stopAt' | 'silenceAndStop'
> & { onPosition: ((report: RingPositionReport) => void) | null };

/** The bus surface the voice uses (`scratchBus.ts`). */
export interface ScratchVoiceBus {
  readonly input: AudioNode;
  setAmbience(amount: number, rampSec?: number): void;
  /** The stroke's velocity tone (the scratch bus, reference render_gesture). */
  setTone?(velocity: number, at?: number): void;
  /** A gesture's own echo while it plays (reference echo fx); null = the channel's. */
  setGestureFx?(fx: ScratchGesture['fx'] | null, at?: number): void;
}

export type ScratchCue = 'attack' | 'vowel' | 'tail' | number | { word: string };

export interface StrokeOptions {
  loop?: boolean;
  returnToAnchor?: boolean;
  interpolate?: boolean;
  /** Context time (seconds) to start at; now when omitted. */
  at?: number;
}

export interface StrokeResult {
  ok: boolean;
  reason?: string;
  /** The predicted path leaves `safe`: the ring holds the edge and the event is logged. */
  clamped?: boolean;
}

export interface ScratchVoiceSafetyEvent {
  kind: 'clampForward' | 'clampReverse' | 'reverseRefused';
  /** Needle position (seconds of record) when the event was raised. */
  position: number;
  detail: string;
}

/** Reachability sentinels (SCR-P2.R2, P2.8). */
export const scratchVoiceStats = { strokes: 0, clamps: 0, refused: 0, releases: 0, cues: 0, gestureFx: 0 };

/** Minimum safe reverse room (seconds) a reverse stroke needs behind the needle. */
export const MIN_REVERSE_ROOM_SEC = 0.001;

/**
 * Velocity keyframes (fraction of the cycle, playback-rate multiplier) to
 * frame-accurate rate points (D5's converter for the record voice: the hand
 * path version lands with P3). A looping curve wraps to its first rate at
 * the cycle end so the interpolation closes; a one-shot ends at rate 0.
 */
export function velocityCurveToRatePoints(curve: readonly ScratchVelocityPoint[], durationSec: number, sampleRate: number, opts: { loop?: boolean } = {}): RingRatePoint[] {
  const cycleFrames = Math.max(1, Math.round(durationSec * sampleRate));
  const points: RingRatePoint[] = curve.map((p) => ({ frame: Math.round(p.t * cycleFrames), rate: p.velocity }));
  const first = curve[0]?.velocity ?? 0;
  points.push({ frame: cycleFrames, rate: opts.loop ? first : 0 });
  return points;
}

/** Seconds of record travelled by a velocity curve over one cycle: min, max, end. */
export function predictExcursion(curve: readonly ScratchVelocityPoint[], durationSec: number, interpolate: boolean): { min: number; max: number; end: number } {
  if (curve.length === 0) return { min: 0, max: 0, end: 0 };
  const pts = [...curve].sort((a, b) => a.t - b.t);
  let pos = 0, min = 0, max = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const tEnd = i + 1 < pts.length ? pts[i + 1]!.t : 1;
    const dt = Math.max(0, tEnd - a.t) * durationSec;
    const vEnd = interpolate ? (i + 1 < pts.length ? pts[i + 1]!.velocity : a.velocity) : a.velocity;
    // linear velocity segment: its extreme lies at an end or at the zero crossing
    if (interpolate && Math.sign(a.velocity) !== Math.sign(vEnd) && a.velocity !== vEnd) {
      const tz = a.velocity / (a.velocity - vEnd); // fraction of the segment where v = 0
      const dz = dt * tz;
      const peak = pos + a.velocity * dz / 2;
      min = Math.min(min, peak); max = Math.max(max, peak);
    }
    pos += dt * (a.velocity + vEnd) / 2;
    min = Math.min(min, pos); max = Math.max(max, pos);
  }
  return { min, max, end: pos };
}

export class ScratchRecordVoice {
  readonly index: number;
  readonly ring: ScratchVoiceRing;
  readonly bus: ScratchVoiceBus;
  record: ScratchRecord | null = null;
  /** Needle position in seconds of record (predicted at each command, corrected by the ring's reports). */
  position = 0;
  /** The anchor the current gesture returns to (seconds of record). */
  cuePosition = 0;
  busy = false;
  /** Counts the strokes launched on this voice: a performance stops only its own stroke (audit SA-m7). */
  generation = 0;
  readonly safetyLog: ScratchVoiceSafetyEvent[] = [];
  private lastClamped = 0;
  private lastRate = 0;

  constructor(index: number, ring: ScratchVoiceRing, bus: ScratchVoiceBus) {
    this.index = index;
    this.ring = ring;
    this.bus = bus;
    ring.playbackGain.connect(bus.input);
    ring.onPosition = (r) => {
      this.position = r.sec;
      this.lastRate = r.rate;
      if (r.clamped > this.lastClamped) {
        this.lastClamped = r.clamped;
        this.log(r.rate >= 0 ? 'clampForward' : 'clampReverse', `the ring held the ${r.rate >= 0 ? 'end' : 'start'} of the safe range`);
      }
    };
  }

  private log(kind: ScratchVoiceSafetyEvent['kind'], detail: string): void {
    this.safetyLog.push({ kind, position: this.position, detail });
    if (kind === 'reverseRefused') scratchVoiceStats.refused++; else scratchVoiceStats.clamps++;
  }

  /** Write the decoded record (already at the context's sample rate) and cue its home. */
  async load(record: ScratchRecord, buffer: AudioBuffer): Promise<void> {
    await this.ring.loadRecord(buffer);
    this.ring.setBounds(record.safe[0], record.safe[1]);
    this.record = record;
    this.lastClamped = 0;
    this.moveNeedle('vowel');
  }

  private clampToSafe(sec: number): number {
    const r = this.record;
    if (!r) return Math.max(0, sec);
    return Math.max(r.safe[0], Math.min(r.safe[1], sec));
  }

  /** Resolve a cue to seconds of record, clamped into `safe`. */
  resolveCue(at: ScratchCue): number {
    const r = this.record;
    if (!r) return 0;
    let sec: number;
    if (typeof at === 'number') sec = at;
    else if (typeof at === 'string') sec = r.anchors[at];
    else {
      const w = r.wordSlices.find((s) => s.name === at.word);
      sec = w ? w.vowel : r.anchors.vowel;
    }
    return this.clampToSafe(sec);
  }

  /** Drop the needle (section 18 true re-cue), now or at context time `when`. Returns the position used. */
  cue(at: ScratchCue, when?: number): number {
    scratchVoiceStats.cues++;
    return this.moveNeedle(at, when);
  }

  private moveNeedle(at: ScratchCue, when?: number): number {
    const sec = this.resolveCue(at);
    this.cuePosition = sec;
    this.position = sec;
    this.ring.seek(sec, when);
    return sec;
  }

  /**
   * Play a velocity curve from the current cue as a frame-accurate rate curve.
   * Predicts the path first: a reverse stroke with no safe reverse room is
   * refused; a path that leaves `safe` is logged as a clamp (the ring holds).
   */
  stroke(curve: readonly ScratchVelocityPoint[], durationSec: number, opts: StrokeOptions = {}): StrokeResult {
    if (!this.record) return { ok: false, reason: 'no record loaded' };
    if (curve.length === 0 || durationSec <= 0) return { ok: false, reason: 'empty stroke' };
    const interpolate = opts.interpolate ?? false;
    const ex = predictExcursion(curve, durationSec, interpolate);
    const points = velocityCurveToRatePoints(curve, durationSec, this.ring.sampleRate, { loop: opts.loop });
    return this.launch(ex, points, durationSec, interpolate, opts);
  }

  /**
   * The position-driven stroke (section 17, D5): a hand path in stroke units
   * becomes a rate curve by `positionCurveToRateCurve` (rate = d(position)/dt,
   * smoothed at reversals, clamped at +-4 and reported), then runs through the
   * same safety checks and the same ring message as `stroke`.
   */
  strokePath(handPath: ScratchHandPath, durationSec: number, opts: StrokeOptions = {}): StrokeResult & { requestedPeak?: number } {
    if (!this.record) return { ok: false, reason: 'no record loaded' };
    if (handPath.length === 0 || durationSec <= 0) return { ok: false, reason: 'empty stroke' };
    const sr = this.ring.sampleRate;
    const conv = positionCurveToRateCurve(handPath, durationSec, sr);
    // excursion in seconds of record from the held rates
    let pos = 0, min = 0, max = 0;
    for (let i = 0; i < conv.points.length; i++) {
      const end = i + 1 < conv.points.length ? conv.points[i + 1]!.t : durationSec;
      pos += conv.points[i]!.rate * (end - conv.points[i]!.t);
      min = Math.min(min, pos); max = Math.max(max, pos);
    }
    const cycleFrames = Math.max(1, Math.round(durationSec * sr));
    const points: RingRatePoint[] = conv.points.map((p) => ({ frame: Math.round(p.t * sr), rate: p.rate }));
    points.push({ frame: cycleFrames, rate: opts.loop ? (conv.points[0]?.rate ?? 0) : 0 });
    const res = this.launch({ min, max, end: pos }, points, durationSec, false, opts);
    return { ...res, requestedPeak: conv.requestedPeak };
  }

  /** Safety checks (section 11) and the ring message shared by both stroke kinds. */
  private launch(ex: { min: number; max: number; end: number }, points: RingRatePoint[], durationSec: number, interpolate: boolean, opts: StrokeOptions): StrokeResult {
    const r = this.record!;
    const start = this.cuePosition;
    const goesBackward = ex.min < -1e-9;
    if (goesBackward && start - r.safeReverse[0] < MIN_REVERSE_ROOM_SEC) {
      this.log('reverseRefused', `reverse stroke at ${start.toFixed(3)} s: no safe reverse room (safeReverse starts at ${r.safeReverse[0].toFixed(3)} s)`);
      return { ok: false, reason: `reverse outside the safe reverse range of ${r.id}` };
    }
    let clamped = false;
    if (start + ex.max > r.safeForward[1] + 1e-9) {
      clamped = true;
      this.log('clampForward', `stroke would reach ${(start + ex.max).toFixed(3)} s past safeForward[1] ${r.safeForward[1].toFixed(3)} s`);
    }
    if (start + ex.min < r.safeReverse[0] - 1e-9) {
      clamped = true;
      this.log('clampReverse', `stroke would reach ${(start + ex.min).toFixed(3)} s before safeReverse[0] ${r.safeReverse[0].toFixed(3)} s`);
    }
    const ringOpts: RingRateCurveOptions = {
      interpolate,
      loop: !!opts.loop,
      cycleFrames: Math.max(1, Math.round(durationSec * this.ring.sampleRate)),
      returnToAnchor: !!opts.returnToAnchor,
    };
    this.ring.rateCurve(points, ringOpts, opts.at);
    scratchVoiceStats.strokes++;
    this.generation++;
    this.busy = true;
    if (!opts.loop) this.position = this.clampToSafe(start + ex.end);
    return { ok: true, clamped };
  }

  /** The gesture's fader windows (section 19), frame-accurate in the ring: the reference battle
   *  transfer curve on a 1-3 ms ramp, sharper as the velocity rises (O7). */
  fader(gesture: Pick<ScratchGesture, 'faderWindows' | 'cutLeadMs' | 'cycleBeats'>, bpm: number, opts: { loop?: boolean; velocity?: number; at?: number } = {}): void {
    const sr = this.ring.sampleRate;
    const windows = faderWindowsMs(gesture, bpm).map((w) => [w.open[0] / 1000 * sr, w.open[1] / 1000 * sr] as const);
    const ringOpts: RingFaderWindowsOptions = {
      cycleFrames: Math.max(1, Math.round(cycleMs(gesture, bpm) / 1000 * sr)),
      loop: !!opts.loop,
      rampFrames: Math.max(1, Math.round(cutRampSec(opts.velocity ?? 0.7) * sr)),
      curveExp: faderCurveShape('battle').exponent,
    };
    this.ring.faderWindows(windows, ringOpts, opts.at);
  }

  /** One static articulated gain (open = 1, cut = 0), now or at context time `at`. */
  faderGain(gain: 0 | 1, at?: number): void {
    this.ring.faderGain(gain, at);
  }

  /**
   * Cue + stroke + fader for a catalogue gesture at `bpm`: the record's
   * compatible gestures only (section 38/39; a pre-scratched record takes
   * `drop` alone). Throws cue the attack and ride forward with the fader
   * open; hand gestures cue the vowel and loop with a return to the anchor.
   */
  playGesture(gesture: ScratchGesture, bpm: number, opts: { cue?: ScratchCue; ambience?: number; velocity?: number; at?: number; drive?: 'velocity' | 'hand' } = {}): StrokeResult {
    const r = this.record;
    if (!r) return { ok: false, reason: 'no record loaded' };
    const isThrow = gesture.id === 'drop' || gesture.id === 'dropPhrase';
    // section 41: any clean record can be thrown; everything else follows the record's list
    if (!(isThrow && r.clean) && !r.gestures.includes(gesture.id)) return { ok: false, reason: `${gesture.id} is not a compatible gesture for ${r.id}` };
    if (opts.ambience !== undefined) this.bus.setAmbience(opts.ambience);
    // a throw is the word as recorded; a hand stroke gets its velocity tone
    this.bus.setTone?.(isThrow ? 0.7 : (opts.velocity ?? 0.7), opts.at);
    // the gesture's own effect (the echo scratch's delay), or the channel's again
    this.bus.setGestureFx?.(gesture.fx ?? null, opts.at);
    if (gesture.fx) scratchVoiceStats.gestureFx++;
    this.cue(opts.cue ?? (isThrow ? 'attack' : 'vowel'), opts.at);
    let durationSec = cycleMs(gesture, bpm) / 1000;
    if (isThrow) {
      // the whole word or phrase is heard (section 41): from the cue to the end of the safe range,
      // whatever the gesture's nominal length; the planner reserves that length (`throwBeats`)
      durationSec = Math.max(0.01, r.safe[1] - this.cuePosition);
      this.faderGain(1, opts.at);
    } else {
      this.fader(gesture, bpm, { loop: gesture.loop, velocity: opts.velocity, at: opts.at });
    }
    const strokeOpts: StrokeOptions = {
      loop: gesture.loop,
      returnToAnchor: gesture.loop && gesture.returnsToAnchor,
      interpolate: gesture.interpolateVelocity,
      at: opts.at,
    };
    // `drive: 'hand'` performs the gesture's hand path (section 17, D5); the default keeps the
    // tuned velocity keyframes the owner has heard (the hand path's reference strokes are small).
    // The plan velocity is the hand's speed (SA-m5): every rate scales, timing and fader stay.
    const speed = isThrow ? 1 : handSpeedFactor(opts.velocity);
    if (opts.drive === 'hand' && gesture.handPath && !isThrow) {
      return this.strokePath(gesture.handPath.map((p) => ({ ...p, position: p.position * speed })), durationSec, strokeOpts);
    }
    return this.stroke(gesture.velocityCurve.map((p) => ({ ...p, velocity: p.velocity * speed })), durationSec, strokeOpts);
  }

  /** Silence within the ring's 3 ms gain ramp, worklet stopped, voice free; now or at context time `at`. */
  release(at?: number): void {
    if (at !== undefined) this.ring.stopAt(at); else void this.ring.stopScratch();
    this.busy = false;
    scratchVoiceStats.releases++;
  }

  /** Immediate silence (transport stop, panic). */
  panic(): void {
    this.ring.silenceAndStop();
    this.busy = false;
  }

  /** Last rate the ring reported (UI / telemetry). */
  get rate(): number { return this.lastRate; }
}
