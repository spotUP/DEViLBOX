/**
 * The scratch stroke renderer and its Deck C buses (scratch null test; ledger PG-J "one stroke renderer").
 *
 * Every scratch stroke on a record - the Auto Scratch overlay and its routines, the 32-bar routines, the
 * short arc features, the juggle response, transitions, pads, MCP, a tracker deck's sample - is rendered
 * whole the demo's way (`scratchRender.renderGesture` = scratch.render_gesture: the two-body physics, the
 * Catmull-Rom read, surface noise, the crossfader, the velocity tone, the gesture's FX) from the record as
 * the demo reads it (22,050 Hz mono, the S950 on a crate record), and summed at its bus sample into a
 * Deck C bus (`scratchDeckC.ts`, the worklet): the routine's chain (three_deck, scratch_dj, a stored
 * version) or the overlay's (a chain per section, `apply_fx` with the profile's FX). There is no other
 * stroke path: the record voices and their ring are gone.
 *
 * All buses sit on the DJ mixer's `samplerInput` (they bypass the crossfader, like the demo's Deck C) and
 * hear decks A + B on their input for the live level (X6). The registry (`DjFxActions.ts`) is the only
 * caller that performs on it; the pool never decides what to play.
 */

import * as Tone from 'tone';
import { getDJEngine } from '../DJEngine';
import { demoRecordPcm } from './scratchGrit';
import { createDeckCBus, deckCDuck, deckCLevel, programmeSpan, DECK_C_TAPS, PRESET_CHAIN, type DeckCBus, type DeckCChainName } from './scratchDeckC';
import { getGesture } from './scratchGestureCatalog';
import {
  renderGesture, renderFromMotion, renderMacro, parseMacro, catalogueDemoGesture, demoGestureName, demoGestureSteps, demoStepSamples, routineEndingDelay,
  DEMO_DECK_PROFILES, DEMO_RATE, type DemoSource, type GestureViz,
} from './scratchRender';
import { getDeckCMotion } from './deckCMotion';
import { needleDrop as ttNeedleDrop, needleLift as ttNeedleLift, linspace } from '@/engine/turntable/turntableSim';
import type { ScratchCue, ScratchEventFx, ScratchGesture, ScratchRenderSpec, ScratchRole } from './scratchTypes';
import { getScratchRecord, findRecords, lastWordSlice, registerExtraRecord, forgetExtraRecords, type ScratchRecord } from './scratchCatalogue';
import { realTimers, type ExecutorTimers } from '../autodj/executorTimers';

/** Reachability sentinels: strokes rendered and handed to a bus, records read, routines shaped, loops. */
export const scratchPoolStats = { rendered: 0, loads: 0, shaped: 0, loops: 0 };

export interface PerformOptions {
  /** Record id; the pool's current record, or the catalogue's best fit for the gesture, when omitted. */
  record?: string;
  role?: ScratchRole;
  bpm: number;
  velocity?: number;
  /** The record position the stroke reads from (a user's cue); the record's demo anchor when omitted. */
  cue?: ScratchCue;
  /** Context time to start at (a planner's beat); now when omitted. */
  at?: number;
  /** A routine preset: the stroke plays through that stored version's chain (C3). */
  fx?: ScratchEventFx;
  /** How the demo renders the stroke (seed, human timing, deck, bus); a one-off stroke on Deck C when omitted. */
  render?: ScratchRenderSpec;
}

export interface PerformHandle {
  /** Resolves once the stroke is rendered and on its bus. */
  readonly started: Promise<StrokeResult>;
  /** A rendered stroke plays out whole, as in the demo; a loop stops repeating. */
  release(at?: number): void;
}

export interface StrokeResult { ok: boolean; reason?: string }

/** A stroke's bytes: a pack record's WAV. */
export type RecordBytes = (record: ScratchRecord) => Promise<ArrayBuffer>;

async function fetchRecordBytes(record: ScratchRecord): Promise<ArrayBuffer> {
  const res = await fetch(record.url);
  if (!res.ok) throw new Error(`[ScratchVoicePool] ${record.id}: ${res.status} fetching ${record.url}`);
  return res.arrayBuffer();
}

/** One-off strokes (pads, MCP, a transition, a tracker sample) play on the demo's Deck C. */
const ONE_OFF: ScratchRenderSpec = { seed: 0, humanizeSamples: 0, chain: 'threeDeck' };

export class ScratchVoicePool {
  readonly ready: Promise<void> = Promise.resolve();
  /** The record the next gesture takes when none is named (`fx_scratch_record`). */
  currentRecordId: string | null = null;
  /** The cue the next user gesture reads from when none is named (`fx_scratch_anchor`, `fx_scratch_cue`). */
  anchor: ScratchCue | null = null;
  private readonly ctx: BaseAudioContext;
  private readonly destination: AudioNode;
  private readonly beat: AudioNode | null;
  private readonly timers: ExecutorTimers;
  /** Records that are not in the crate (a tracker deck's samples), read at 22,050 Hz. */
  private readonly transient = new Map<string, { record: ScratchRecord; pcm: Float64Array }>();
  private readonly pending = new Set<Promise<unknown>>();
  private readonly loops = new Set<{ stop(): void }>();
  private gritOn = true;
  private readonly deckC = new Map<DeckCChainName, Promise<DeckCBus>>();
  private readonly demoPcm = new Map<string, Promise<Float64Array>>();
  private readonly bytesFetcher: RecordBytes;

  /** `beat`: decks A + B summed (their channel outputs), the live level's reference (X6); none in a test. */
  constructor(ctx: BaseAudioContext, destination: AudioNode, opts: { bytes?: RecordBytes; beat?: AudioNode | null; timers?: ExecutorTimers } = {}) {
    this.ctx = ctx;
    this.destination = destination;
    this.beat = opts.beat ?? null;
    this.timers = opts.timers ?? realTimers;
    this.bytesFetcher = opts.bytes ?? fetchRecordBytes;
  }

  /** Add a record that is not in the crate (a tracker sample) with its audio read at 22,050 Hz (`demoMonoPcm`). */
  registerTransientRecord(record: ScratchRecord, pcm: Float64Array): void {
    this.transient.set(record.id, { record, pcm });
    registerExtraRecord(record);
  }

  /** A crate record or a registered transient one. */
  hasRecord(id: string): boolean {
    return this.transient.has(id) || !!getScratchRecord(id);
  }

  /** Forget the transient records whose id starts with `prefix` (a deck's song changed). */
  forgetTransientRecords(prefix: string): void {
    for (const id of [...this.transient.keys()]) if (id.startsWith(prefix)) this.transient.delete(id);
    forgetExtraRecords(prefix);
  }

  /**
   * The S950 grit on the crate's records (owner decision O4: a scratch-bus setting, on by default,
   * switchable to the clean record). Tracker samples stay the module's own sound.
   */
  get grit(): boolean { return this.gritOn; }

  setGrit(on: boolean): void {
    this.gritOn = on;
  }

  /** Resolve the record a gesture plays: named, current, or the catalogue's best fit. */
  resolveRecord(gesture: ScratchGesture, opts: Pick<PerformOptions, 'record' | 'role'>): ScratchRecord | undefined {
    if (opts.record) return this.transient.get(opts.record)?.record ?? getScratchRecord(opts.record);
    if (this.currentRecordId) {
      const current = getScratchRecord(this.currentRecordId);
      if (current && (current.gestures.includes(gesture.id) || (current.clean && (gesture.id === 'drop' || gesture.id === 'dropPhrase')))) return current;
    }
    const isThrow = gesture.id === 'drop' || gesture.id === 'dropPhrase';
    return findRecords(isThrow ? { clean: true, vocal: true, role: opts.role } : { gesture: gesture.id, clean: true, vocal: true, role: opts.role })[0];
  }

  /** The bus for a chain, built once: live, following decks A + B. */
  deckCBus(chain: DeckCChainName): Promise<DeckCBus> {
    let p = this.deckC.get(chain);
    if (!p) { p = createDeckCBus(this.ctx, this.destination, { chain, follow: true, beat: this.beat }); this.deckC.set(chain, p); }
    return p;
  }

  /** A crate record as the demo reads it (22,050 Hz, the S950 when the grit is on), decoded once. */
  recordPcm(record: ScratchRecord): Promise<Float64Array> {
    const own = this.transient.get(record.id);
    if (own) return Promise.resolve(own.pcm);
    const key = `${record.id}:${this.gritOn ? 'grit' : 'clean'}`;
    let p = this.demoPcm.get(key);
    if (!p) {
      scratchPoolStats.loads++;
      const grit = this.gritOn;
      p = this.bytesFetcher(record).then((b) => demoRecordPcm(b, DEMO_RATE, { grit }));
      this.demoPcm.set(key, p);
      p.catch(() => this.demoPcm.delete(key));
    }
    return p;
  }

  /** Read these crate records the demo's way now, so their strokes render on time. */
  prepareRecords(ids: readonly string[]): void {
    for (const id of ids) {
      const r = getScratchRecord(id);
      if (r) void this.recordPcm(r).catch((err) => console.warn('[ScratchVoicePool] record not ready:', id, err));
    }
  }

  /** The record sample a cue names (22,050 Hz), inside the record's safe range; the demo's anchor for its vowel. */
  cueSample(record: ScratchRecord, cue: ScratchCue | null | undefined): number {
    const [lo, hi] = record.demoCue.safe;
    if (cue === undefined || cue === null || cue === 'vowel') return record.demoCue.anchor;
    let sec: number;
    if (typeof cue === 'number') sec = cue;
    else if (typeof cue === 'string') sec = record.anchors[cue];
    else sec = record.wordSlices.find((s) => s.name === cue.word)?.vowel ?? record.anchors.vowel;
    return Math.max(lo, Math.min(hi, Math.round(sec * DEMO_RATE)));
  }

  /**
   * One stroke as the demo renders it: the needle (turntable.needle_drop / lift), or render_gesture on the
   * record - the spec's deck physics and seed, the event's velocity (the demo's default 1.0), the demo's step
   * length (three_deck: steps x 60 / (bpm x 4) s; scratch_dj, the overlay, render_routine: steps x
   * int(rate x 60 / (bpm x 4)) samples) - and a routine's ending delay (C2). A gesture the demo does not have
   * is its catalogue definition on the same renderer.
   */
  async renderStroke(gesture: ScratchGesture, record: ScratchRecord | null, spec: ScratchRenderSpec, bpm: number, velocity: number | undefined, cue?: ScratchCue | null): Promise<Float64Array | Float32Array | null> {
    return (await this.renderStrokeViz(gesture, record, spec, bpm, velocity, cue))?.out ?? null;
  }

  /** `renderStroke` with the stroke's viz capture (D1: Deck C's platter, fader and slip); a needle has none. */
  async renderStrokeViz(gesture: ScratchGesture, record: ScratchRecord | null, spec: ScratchRenderSpec, bpm: number, velocity: number | undefined, cue?: ScratchCue | null): Promise<{ out: Float64Array | Float32Array; viz: GestureViz | null } | null> {
    if (gesture.needle) return { out: gesture.needle === 'drop' ? ttNeedleDrop(DEMO_RATE, 'battle', spec.seed) : ttNeedleLift(DEMO_RATE, spec.seed), viz: null };
    if (!record) return null;
    const name = demoGestureName(gesture.id);
    const sig = await this.recordPcm(record);
    let source: DemoSource = { sig, anchor: this.cueSample(record, cue), safe: record.demoCue.safe };
    // statement and chop (C16): the phrase thrown from its first sample, the scratches on its last word
    if (spec.slice === 'phrase') source = { ...source, anchor: 0 };
    else if (spec.slice === 'word') {
      const w = lastWordSlice(record, DEMO_RATE);
      if (w) source = { sig: sig.slice(w.start, w.end), anchor: w.vowel, safe: [0, w.end - w.start - 1] };
    }
    const stepSec = spec.chain === 'threeDeck' ? 60.0 / (bpm * 4) : demoStepSamples(bpm) / DEMO_RATE;
    const steps = name ? demoGestureSteps(name) : gesture.durationSteps;
    // three_deck.render: `steps * step / rate` (whole samples a step, the product first)
    const durSec = spec.stepSamples ? steps * spec.stepSamples / DEMO_RATE : steps * stepSec;
    const r = renderGesture(source, name ?? catalogueDemoGesture(gesture), durSec, DEMO_RATE, {
      velocity: velocity ?? 1.0, profile: DEMO_DECK_PROFILES[spec.deck ?? 'boombap'], seed: spec.seed,
    });
    const out = spec.ending ? routineEndingDelay(r.out, demoStepSamples(bpm), DEMO_RATE) : r.out;
    return { out, viz: r.viz };
  }

  /**
   * three_deck.render's level and duck for a routine planned whole, before it plays: its strokes rendered
   * offline through the routine's chain (the same worklet), then the level and duck against the beat over the
   * routine's span; the live bus applies them from the span's first bus sample.
   */
  async shapeRoutine(input: { chain: DeckCChainName; spanStart: number; beat: Float64Array; strokes: ReadonlyArray<{ start: number; gesture: ScratchGesture; record: ScratchRecord | null; spec: ScratchRenderSpec; bpm: number; velocity?: number }> }): Promise<{ level: number } | null> {
    const n = input.beat.length;
    if (!n) return null;
    const live = await this.deckCBus(input.chain);
    // the duck needs only the beat: on the bus at once; the level when the planned layer is rendered
    // three_deck ducks its layer on the beat; scratch_dj does not (an empty duck: the level alone)
    live.shape(input.spanStart, input.chain === 'threeDeck' ? deckCDuck(input.beat) : new Float32Array(0));
    const off = new OfflineAudioContext(1, n + Math.trunc(0.6 * DEMO_RATE), DEMO_RATE);
    const layerBus = await createDeckCBus(off, off.destination, { chain: input.chain, tap: DECK_C_TAPS.tail, planned: true });
    for (const s of input.strokes) {
      const samples = await this.renderStroke(s.gesture, s.record, s.spec, s.bpm, s.velocity);
      if (samples) layerBus.stroke(Math.max(0, s.start - input.spanStart), samples);
    }
    await new Promise((r) => setTimeout(r, 0));
    const layer = (await off.startRendering()).getChannelData(0);
    const level = deckCLevel(layer, input.beat);
    live.shapeLevel(input.spanStart, level);
    scratchPoolStats.shaped++;
    return { level };
  }

  /**
   * The routine's shape from the controller's plan (`ScratchDJDeps.shapeRoutine`) and the decks' audio (X6:
   * decks A AND B, each read the demo's way from its own track position, weighted as the mixer sends it, and
   * summed): the span's bus samples, each stroke at its bus sample (+ its human timing).
   */
  shapeRoutinePlan(shape: import('./DJScratchDJ').ScratchRoutineShape, decks: ReadonlyArray<{ audio: Pick<AudioBuffer, 'sampleRate' | 'numberOfChannels' | 'length' | 'getChannelData'>; trackFromSec: number; gain: number }>): Promise<{ level: number } | null> {
    const spanStart = Math.trunc(shape.startSec * DEMO_RATE);
    const n = Math.trunc(shape.endSec * DEMO_RATE) - spanStart;
    const beat = new Float64Array(Math.max(0, n));
    for (const d of decks) {
      const x = programmeSpan(d.audio, d.trackFromSec, beat.length);
      for (let i = 0; i < beat.length; i++) beat[i] = beat[i]! + d.gain * x[i]!;
    }
    const strokes = shape.strokes.filter((s) => s.event.render).map((s) => ({
      start: Math.max(0, Math.trunc(s.at * DEMO_RATE) + s.event.render!.humanizeSamples),
      gesture: getGesture(s.event.gesture),
      record: s.event.source.type === 'CRATE' ? getScratchRecord(s.event.source.recordId) ?? null : null,
      spec: s.event.render!, bpm: shape.bpm, velocity: s.event.velocity,
    }));
    return this.shapeRoutine({ chain: shape.chain, spanStart, beat, strokes });
  }

  /** Render a gesture and put it on its bus (see the class comment). Never touches a deck. */
  perform(gesture: ScratchGesture, opts: PerformOptions): PerformHandle | null {
    const record = gesture.needle ? null : this.resolveRecord(gesture, opts);
    if (!gesture.needle && !record) return null;
    const preset = opts.fx?.preset ? PRESET_CHAIN[opts.fx.preset] : null;
    const spec: ScratchRenderSpec = opts.render ?? (preset ? { ...ONE_OFF, chain: preset } : ONE_OFF);
    // a planned stroke reads from the record's demo anchor (the demo's rule); a user's stroke from its cue
    const cue = opts.render ? null : (opts.cue ?? this.anchor);
    scratchPoolStats.rendered++;
    const started = (async (): Promise<StrokeResult> => {
      const bus = await this.deckCBus(spec.chain);
      const rendered = await this.renderStrokeViz(gesture, record ?? null, spec, opts.bpm, opts.velocity, cue);
      if (!rendered) return { ok: false, reason: `no ${gesture.id} without a record` };
      const samples = rendered.out;
      const at = bus.busSampleAt(opts.at ?? this.ctx.currentTime);
      let placed: number;
      if (spec.section) {
        // the overlay: the stroke's section on the demo's grid from the stroke's own step
        // (render_scratch_section: o = max(0, bar x bar_len + step x step_samp + off) from the section's start)
        const stepSamp = demoStepSamples(opts.bpm);
        const start = at - spec.section.step * stepSamp;
        placed = Math.max(start, at + spec.humanizeSamples);
        bus.stroke(placed, samples, { key: spec.section.key, start, end: start + spec.section.bars * 16 * stepSamp, fx: spec.section.fx }, !gesture.needle);
      } else {
        placed = Math.max(0, at + spec.humanizeSamples);
        bus.stroke(placed, samples, undefined, !gesture.needle);
      }
      // D1: Deck C's platter, fader and slip follow the same render (three_deck's viz capture)
      if (rendered.viz) getDeckCMotion().addStroke(placed, rendered.viz);
      else getDeckCMotion().addNeedle(placed, samples.length);
      return { ok: true };
    })();
    this.track(started);
    return { started, release: () => undefined };
  }

  /**
   * A scratch macro (the demo's `render_macro`, G11): the script's hand path on a record (named, the current
   * one, or the catalogue's), read from its cue - the script's ANCHOR moves it - at the tempo, as a one-off
   * stroke on Deck C. Lines the demo's parser skips are reported, never thrown.
   */
  performMacro(text: string, opts: { record?: string; bpm: number; velocity?: number; at?: number; cue?: ScratchCue | null }): (PerformHandle & { errors: string[] }) | null {
    const record = this.resolveRecord(getGesture('baby'), { record: opts.record });
    if (!record) return null;
    const errors = parseMacro(text, opts.bpm).errors;
    scratchPoolStats.rendered++;
    const started = (async (): Promise<StrokeResult> => {
      const bus = await this.deckCBus(ONE_OFF.chain);
      const sig = await this.recordPcm(record);
      const source: DemoSource = { sig, anchor: this.cueSample(record, opts.cue ?? this.anchor), safe: record.demoCue.safe };
      const samples = renderMacro(source, text, DEMO_RATE, { tempo: opts.bpm, velocity: opts.velocity ?? 1.0 });
      bus.stroke(Math.max(0, bus.busSampleAt(opts.at ?? this.ctx.currentTime)), samples);
      return { ok: true };
    })();
    this.track(started);
    return { started, release: () => undefined, errors };
  }

  /**
   * Scratch Loop (section 82): the record's safe region from its attack, forward at natural speed (the demo's
   * reader, a throw's 10 ms ends), laid end to end on Deck C until released.
   */
  loop(record: ScratchRecord, opts: { at?: number } = {}): PerformHandle {
    scratchPoolStats.loops++;
    let stopped = false;
    let interval: unknown = null;
    const stop = (): void => { stopped = true; if (interval !== null) this.timers.clearInterval(interval); interval = null; this.loops.delete(entry); };
    const entry = { stop };
    this.loops.add(entry);
    const started = (async (): Promise<StrokeResult> => {
      const sig = await this.recordPcm(record);
      const anchor = this.cueSample(record, 'attack');
      const end = Math.min(record.demoCue.safe[1], sig.length - 3);
      const n = Math.max(1, end - anchor);
      const seg = renderFromMotion(sig, anchor, record.demoCue.safe, new Float64Array(n).fill(1));
      const k = Math.min(Math.max(1, Math.trunc(0.01 * DEMO_RATE)), Math.floor(n / 2) || 1);
      const up = linspace(0, 1, k), down = linspace(1, 0, k);
      for (let i = 0; i < k; i++) { seg[i] = seg[i]! * up[i]!; seg[n - k + i] = seg[n - k + i]! * down[i]!; }
      if (stopped) return { ok: false, reason: 'released before the record loaded' };
      const bus = await this.deckCBus('threeDeck');
      let next = bus.busSampleAt(opts.at ?? this.ctx.currentTime);
      const feed = (): void => {
        // keep half a second laid ahead of the clock
        while (!stopped && next / DEMO_RATE - this.ctx.currentTime < 0.5) { bus.stroke(next, seg); next += n - k; }
      };
      feed();
      if (!stopped) interval = this.timers.setInterval(feed, 100);
      return { ok: true };
    })();
    this.track(started);
    return { started, release: () => stop() };
  }

  selectRecord(id: string | null): boolean {
    if (id === null) { this.currentRecordId = null; return true; }
    if (!getScratchRecord(id)) return false;
    this.currentRecordId = id;
    return true;
  }

  /** Stop every loop (a stroke on a bus plays out whole). */
  releaseAll(): void {
    for (const l of [...this.loops]) l.stop();
  }

  /** Silence now: loops stopped, every bus's strokes dropped (transport stop, an engine error). */
  panic(): void {
    this.releaseAll();
    for (const p of this.deckC.values()) void p.then((b) => b.clear(), () => undefined);
    getDeckCMotion().clear();
  }

  private track(p: Promise<unknown>): void {
    this.pending.add(p);
    void p.catch(() => undefined).finally(() => this.pending.delete(p));
  }

  /** Resolves once every pending render has settled (tests, MCP). */
  async settled(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }

  dispose(): void {
    this.panic();
    this.forgetTransientRecords('');
    for (const p of this.deckC.values()) void p.then((b) => b.dispose(), () => undefined);
    this.deckC.clear();
    try { this.beat?.disconnect(); } catch { /* gone */ }
  }
}

let pool: ScratchVoicePool | null = null;
let poolEngine: unknown = null;

/**
 * The app's pool: the DJ mixer's sampler input on the live context (lazy), hearing decks A + B for its level. Built
 * again when the DJ engine is (leaving the DJ view with nothing playing disposes it): a pool on the old mixer would
 * play into a disposed sampler input and measure its level on disposed deck inputs.
 */
export function getScratchVoicePool(): ScratchVoicePool {
  const engine = getDJEngine();
  // the engine's mixer is the pool's world: its sampler input (where the buses play) names it
  if (pool && poolEngine !== engine.mixer.samplerInput) { pool.dispose(); pool = null; }
  if (!pool) {
    const ctx = Tone.getContext().rawContext as BaseAudioContext;
    poolEngine = engine.mixer.samplerInput;
    // decks A and B as the crossfader sends them (X6: the level is 0.60 x their RMS, a module deck's too)
    let beat: GainNode | null = null;
    try {
      beat = ctx.createGain();
      for (const input of [engine.mixer.inputA, engine.mixer.inputB]) if (input) Tone.connect(input, beat);
    } catch (err) { console.warn('[ScratchVoicePool] decks A + B not tapped for the scratch level:', err); }
    pool = new ScratchVoicePool(ctx, engine.mixer.samplerInput, { beat });
  }
  return pool;
}

export function getScratchVoicePoolIfActive(): ScratchVoicePool | null {
  return pool;
}

/** Tests / context rebuild: drop the pool so the next call builds a fresh one. */
export function resetScratchVoicePool(): void {
  pool?.dispose();
  pool = null;
  poolEngine = null;
}
