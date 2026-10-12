/**
 * Scratch voice pool (owner plan `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md`
 * sections 16, 42; D4; ledger SCR-P2.5, SCR-P2.9).
 *
 * Two record voices (a THEME and an ANSWER can overlap), each a record ring
 * (`DeckScratchBuffer` in record mode, ring 4 + index) into its own scratch
 * bus, all into the DJ mixer's `samplerInput` (bypasses the crossfader,
 * like the sampler and the mic). Records are fetched from the pack once and
 * decoded at the context's sample rate.
 *
 * The registry (`DjFxActions.ts`) is the only caller that performs on it;
 * the pool itself never decides what to play.
 */

import * as Tone from 'tone';
import { getDJEngine } from '../DJEngine';
import { DeckScratchBuffer, SCRATCH_RECORD_RING_BASE } from '../DeckScratchBuffer';
import { gritRecord, demoRecordPcm } from './scratchGrit';
import { createDeckCBus, deckCDuck, deckCLevel, programmeSpan, DECK_C_TAPS, type DeckCBus, type DeckCChainName } from './scratchDeckC';
import { getGesture } from './scratchGestureCatalog';
import { renderGesture, demoGestureName, demoGestureSteps, DEMO_DECK_PROFILES, DEMO_RATE } from './scratchRender';
import { needleDrop as ttNeedleDrop, needleLift as ttNeedleLift } from '@/engine/turntable/turntableSim';
import type { ScratchRenderSpec } from './scratchTypes';
import { CHANNEL_PRESETS, createScratchBus, SCRATCH_BUS, SCRATCH_FX_PROFILES, STYLE_FX_PROFILE, type ScratchBus } from './scratchBus';
import { ScratchRecordVoice, type ScratchCue, type StrokeResult } from './ScratchRecordVoice';
import { getScratchRecord, findRecords, type ScratchRecord } from './scratchCatalogue';
import type { ScratchGesture, ScratchRole } from './scratchTypes';
import { matchedBusLevel, strokeRms, ProgrammeMeter } from './scratchLevel';
import { gestureMotion } from './scratchPhysics';
import { realTimers } from '../autodj/executorTimers';
import { useDJStore } from '@/stores/useDJStore';

/** Reachability sentinels (SCR-P2.R2). */
export const scratchPoolStats = { performs: 0, loads: 0, styleFx: 0, rendered: 0, shaped: 0 };

export const SCRATCH_VOICE_COUNT = 2;

export interface PerformOptions {
  /** Record id; the pool's current record, or the catalogue's best fit for the gesture, when omitted. */
  record?: string;
  role?: ScratchRole;
  bpm: number;
  ambience?: number;
  velocity?: number;
  cue?: ScratchCue;
  /** Context time to start at (a planner's beat); now when omitted. */
  at?: number;
  /** The style's FX on the bus (reference style preset; amount = the wet tail floor), SCR-PG-A5. */
  fx?: import('./scratchTypes').ScratchEventFx;
  /** A demo routine's stroke: rendered whole as the demo renders it, summed on the routine's Deck C bus. */
  render?: ScratchRenderSpec;
}

export interface PerformHandle {
  /** The voice performing (assigned once the pool is ready). */
  readonly voice: ScratchRecordVoice | null;
  /** Resolves with the stroke result once the record is loaded and the gesture started. */
  readonly started: Promise<StrokeResult>;
  /** Stop now, or - with `at` (context seconds) - stop sample-accurately at that time. */
  release(at?: number): void;
}

/** The programme level the pool's bus follows (`ProgrammeMeter`); `stop` releases its reads when the pool is disposed. */
export interface ProgrammeSource { readonly rms: number | null; stop?(): void }

export type RecordFetcher = (record: ScratchRecord, ctx: BaseAudioContext) => Promise<AudioBuffer>;

async function fetchRecordBytes(record: ScratchRecord): Promise<ArrayBuffer> {
  const res = await fetch(record.url);
  if (!res.ok) throw new Error(`[ScratchVoicePool] ${record.id}: ${res.status} fetching ${record.url}`);
  return res.arrayBuffer();
}

async function fetchRecord(record: ScratchRecord, ctx: BaseAudioContext): Promise<AudioBuffer> {
  const res = await fetch(record.url);
  if (!res.ok) throw new Error(`[ScratchVoicePool] ${record.id}: ${res.status} fetching ${record.url}`);
  const bytes = await res.arrayBuffer();
  return ctx.decodeAudioData(bytes);
}

export class ScratchVoicePool {
  readonly voices: ScratchRecordVoice[] = [];
  readonly buses: ScratchBus[] = [];
  readonly ready: Promise<void>;
  /** The record the next gesture takes when none is named (`fx_scratch_record`). */
  currentRecordId: string | null = null;
  /** The anchor the next gesture cues when none is named (`fx_scratch_anchor`). */
  anchor: ScratchCue | null = null;
  private readonly ctx: BaseAudioContext;
  private readonly fetcher: RecordFetcher;
  private readonly buffers = new Map<string, Promise<AudioBuffer>>();
  /** Records that are not in the crate: a tracker deck's samples (P5.6), with their decoded audio. */
  private readonly transient = new Map<string, ScratchRecord>();
  private pending = new Set<Promise<unknown>>();
  private rings: DeckScratchBuffer[] = [];
  private gritOn = true;

  /** The programme the scratch sits in (its RMS; null = unknown: the bus stays at unity). The pool owns it: dispose stops it. */
  private readonly programme: ProgrammeSource | null;
  /** Reachability sentinel: strokes whose bus level was matched to the programme. */
  readonly levelStats = { matched: 0, lastLevel: 1 };

  private readonly destination: AudioNode;
  private readonly deckC = new Map<DeckCChainName, Promise<DeckCBus>>();
  private readonly demoPcm = new Map<string, Promise<Float64Array>>();
  private readonly bytesFetcher: (record: ScratchRecord) => Promise<ArrayBuffer>;

  constructor(ctx: BaseAudioContext, destination: AudioNode, opts: { size?: number; fetcher?: RecordFetcher; programme?: ProgrammeSource; bytes?: (record: ScratchRecord) => Promise<ArrayBuffer> } = {}) {
    this.ctx = ctx;
    this.destination = destination;
    this.bytesFetcher = opts.bytes ?? fetchRecordBytes;
    this.fetcher = opts.fetcher ?? fetchRecord;
    this.programme = opts.programme ?? null;
    this.ready = this.init(destination, opts.size ?? SCRATCH_VOICE_COUNT);
  }

  private async init(destination: AudioNode, size: number): Promise<void> {
    for (let i = 0; i < size; i++) {
      const ring = new DeckScratchBuffer(this.ctx as AudioContext, SCRATCH_RECORD_RING_BASE + i, { record: true });
      await ring.init();
      const bus = createScratchBus(this.ctx, destination);
      this.rings.push(ring);
      this.buses.push(bus);
      this.voices.push(new ScratchRecordVoice(i, ring, bus));
    }
  }

  /**
   * The voice for a role: THEME keeps voice 0, ANSWER voice 1, a throw (INTRO) the last voice - the word
   * rides out under the chops that follow it, as the demo's throw sums under its scratches (three_deck) -
   * otherwise the first idle one.
   */
  acquire(role?: ScratchRole): ScratchRecordVoice {
    if (role === 'THEME') return this.voices[0]!;
    if (role === 'INTRO' && this.voices.length > 1) return this.voices[this.voices.length - 1]!;
    if (role === 'ANSWER' && this.voices.length > 1) return this.voices[1]!;
    return this.voices.find((v) => !v.busy) ?? this.voices[0]!;
  }

  /** Add a record that is not in the crate (a tracker sample) with its audio, decoded at the context's rate. */
  registerTransientRecord(record: ScratchRecord, buffer: AudioBuffer): void {
    this.transient.set(record.id, record);
    this.buffers.set(record.id, Promise.resolve(buffer));
  }

  /** A crate record or a registered transient one. */
  hasRecord(id: string): boolean {
    return this.transient.has(id) || !!getScratchRecord(id);
  }

  /** Forget the transient records whose id starts with `prefix` (a deck's song changed). */
  forgetTransientRecords(prefix: string): void {
    for (const id of [...this.transient.keys()]) {
      if (!id.startsWith(prefix)) continue;
      this.transient.delete(id);
      this.buffers.delete(id);
    }
  }

  /** Decode once per record (at the context's sample rate). */
  /**
   * The S950 grit on the crate's records (owner decision O4: a scratch-bus setting, on by default,
   * switchable to the clean record). Tracker samples stay the module's own sound.
   */
  get grit(): boolean { return this.gritOn; }

  setGrit(on: boolean): void {
    if (on === this.gritOn) return;
    this.gritOn = on;
    // the crate's records load again in the new sound; a voice reloads its record on its next gesture
    for (const id of [...this.buffers.keys()]) if (!this.transient.has(id)) this.buffers.delete(id);
    for (const v of this.voices) if (v.record && !this.transient.has(v.record.id)) v.unload();
  }

  buffer(record: ScratchRecord): Promise<AudioBuffer> {
    let p = this.buffers.get(record.id);
    if (!p) {
      scratchPoolStats.loads++;
      const fetched = this.fetcher(record, this.ctx);
      p = this.gritOn ? fetched.then((b) => gritRecord(b, this.ctx.sampleRate)) : fetched;
      this.buffers.set(record.id, p);
      p.catch(() => this.buffers.delete(record.id));
    }
    return p;
  }

  /** Resolve the record a gesture plays: named, current, or the catalogue's best fit. */
  resolveRecord(gesture: ScratchGesture, opts: Pick<PerformOptions, 'record' | 'role'>): ScratchRecord | undefined {
    if (opts.record) return this.transient.get(opts.record) ?? getScratchRecord(opts.record);
    if (this.currentRecordId) {
      const current = getScratchRecord(this.currentRecordId);
      if (current && (current.gestures.includes(gesture.id) || (current.clean && (gesture.id === 'drop' || gesture.id === 'dropPhrase')))) return current;
    }
    const isThrow = gesture.id === 'drop' || gesture.id === 'dropPhrase';
    return findRecords(isThrow ? { clean: true, vocal: true, role: opts.role } : { gesture: gesture.id, clean: true, vocal: true, role: opts.role })[0];
  }

  /** The routine's Deck C bus (the demo's chain for that routine), built once. */
  deckCBus(chain: DeckCChainName): Promise<DeckCBus> {
    let p = this.deckC.get(chain);
    if (!p) { p = createDeckCBus(this.ctx, this.destination, { chain }); this.deckC.set(chain, p); }
    return p;
  }

  /** A crate record as the demo reads it (22,050 Hz, the S950 when the grit is on), decoded once. */
  recordPcm(record: ScratchRecord): Promise<Float64Array> {
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

  /**
   * A demo routine's stroke, the demo's way (three_deck / scratch_dj `render`): the gesture rendered whole
   * by `render_gesture` (boom-bap deck, the routine's seed, the event's velocity, the demo's step length),
   * summed into the routine's bus at the planned beat's bus sample plus the demo's human timing. It plays
   * out whole, as in the demo: there is nothing to release.
   */
  /** One stroke as the demo renders it (three_deck / scratch_dj `render`): the needle, or render_gesture on the record. */
  async renderStroke(gesture: ScratchGesture, record: ScratchRecord | null, spec: ScratchRenderSpec, bpm: number, velocity: number | undefined): Promise<Float64Array | Float32Array | null> {
    if (gesture.needle) return gesture.needle === 'drop' ? ttNeedleDrop(DEMO_RATE, 'battle', spec.seed) : ttNeedleLift(DEMO_RATE, spec.seed);
    const name = demoGestureName(gesture.id);
    if (!name || !record) return null;
    const sig = await this.recordPcm(record);
    // three_deck: steps x 60 / (bpm x 4); scratch_dj: steps x int(rate x 60 / (bpm x 4)) / rate
    const stepSec = spec.chain === 'scratchDj' ? Math.trunc(DEMO_RATE * 60.0 / (bpm * 4)) / DEMO_RATE : 60.0 / (bpm * 4);
    return renderGesture({ sig, anchor: record.demoCue.anchor, safe: record.demoCue.safe }, name, demoGestureSteps(name) * stepSec, DEMO_RATE, {
      velocity: velocity ?? 1.0, profile: DEMO_DECK_PROFILES.boombap, seed: spec.seed,
    }).out;
  }

  /**
   * three_deck.render's level and duck for a routine planned whole, before it plays: its strokes rendered
   * offline through the routine's chain (the same worklet), then `deckCShape` with the deck's beat over the
   * routine's span; the live bus applies them from the span's first bus sample.
   */
  async shapeRoutine(input: { chain: DeckCChainName; spanStart: number; beat: Float64Array; strokes: ReadonlyArray<{ start: number; gesture: ScratchGesture; record: ScratchRecord | null; spec: ScratchRenderSpec; bpm: number; velocity?: number }> }): Promise<{ level: number } | null> {
    const n = input.beat.length;
    if (!n) return null;
    const live = await this.deckCBus(input.chain);
    // the duck needs only the beat: on the bus at once; the level when the planned layer is rendered
    live.shape(input.spanStart, deckCDuck(input.beat));
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
   * The routine's shape from the controller's plan (`ScratchDJDeps.shapeRoutine`) and the deck's audio: the
   * span's bus samples, the beat read the demo's way, each stroke at its bus sample (+ its human timing).
   */
  shapeRoutinePlan(shape: import('./DJScratchDJ').ScratchRoutineShape, deckAudio: Pick<AudioBuffer, 'sampleRate' | 'numberOfChannels' | 'length' | 'getChannelData'>): Promise<{ level: number } | null> {
    const spanStart = Math.trunc(shape.startSec * DEMO_RATE);
    const n = Math.trunc(shape.endSec * DEMO_RATE) - spanStart;
    const beat = programmeSpan(deckAudio, shape.trackFromSec, n);
    const strokes = shape.strokes.filter((s) => s.event.render).map((s) => ({
      start: Math.max(0, Math.trunc(s.at * DEMO_RATE) + s.event.render!.humanizeSamples),
      gesture: getGesture(s.event.gesture),
      record: s.event.source.type === 'CRATE' ? getScratchRecord(s.event.source.recordId) ?? null : null,
      spec: s.event.render!, bpm: shape.bpm, velocity: s.event.velocity,
    }));
    return this.shapeRoutine({ chain: shape.chain, spanStart, beat, strokes });
  }

  private performRendered(gesture: ScratchGesture, record: ScratchRecord | null, opts: PerformOptions & { render: ScratchRenderSpec }): PerformHandle {
    scratchPoolStats.rendered++;
    const spec = opts.render;
    const started = (async (): Promise<StrokeResult> => {
      const bus = await this.deckCBus(spec.chain);
      const samples = await this.renderStroke(gesture, record, spec, opts.bpm, opts.velocity);
      if (!samples) return { ok: false, reason: `the demo has no ${gesture.id}${record ? '' : ' without a record'}` };
      // an unshaped routine: the layer follows the programme at the demo's 0.60 ratio
      const prog = this.programme?.rms ?? null;
      if (prog !== null) bus.setProgramme(prog);
      const at = opts.at ?? this.ctx.currentTime;
      bus.stroke(Math.max(0, bus.busSampleAt(at) + spec.humanizeSamples), samples);
      return { ok: true };
    })();
    this.track(started);
    return { voice: null, started, release: () => undefined };
  }

  /** Load (if needed) and play a gesture on a voice. Never touches a deck. */
  perform(gesture: ScratchGesture, opts: PerformOptions): PerformHandle | null {
    // a demo routine's needle is a transient on its bus: no record moves
    if (opts.render && gesture.needle) return this.performRendered(gesture, null, { ...opts, render: opts.render });
    const record = this.resolveRecord(gesture, opts);
    if (!record) return null;
    // a demo routine's crate stroke is the demo's render on its bus; a tracker sample stays on the voice
    if (opts.render && !this.transient.has(record.id)) return this.performRendered(gesture, record, { ...opts, render: opts.render });
    let voice: ScratchRecordVoice | null = null;
    let cancelled = false;
    let stopAt: number | undefined;
    /** The voice's stroke this performance launched: a later performance on the voice is not ours to stop. */
    let mine: number | null = null;
    scratchPoolStats.performs++;
    const started = (async (): Promise<StrokeResult> => {
      await this.ready;
      voice = this.acquire(opts.role);
      if (voice.record?.id !== record.id) {
        const buffer = await this.buffer(record);
        if (cancelled) return { ok: false, reason: 'released before the record loaded' };
        await voice.load(record, buffer);
      }
      if (cancelled) return { ok: false, reason: 'released before the gesture started' };
      // the scratch sits in the music (owner 2026-10-12): its bus follows the programme to the reference ratio
      const prog = this.programme?.rms ?? null;
      if (prog !== null) {
        // the record's level as the stroke reads it: the record sampled along the gesture's own motion
        // from its cue (the turntable model's curve the voice plays) - reversals, slow turns and the
        // safe-range clamp included; a throw reads from its cue at natural speed
        const buffer = await this.buffer(record);
        const isThrow = gesture.id === 'drop' || gesture.id === 'dropPhrase';
        const cueSec = voice.resolveCue(opts.cue ?? this.anchor ?? 'vowel');
        const strokeSec = gesture.cycleBeats * 60 / Math.max(30, opts.bpm);
        const durSec = isThrow ? Math.max(0.01, Math.min(record.durationSec - cueSec, Math.max(strokeSec, 0.5))) : strokeSec;
        const motion = isThrow ? [{ t: 0, velocity: 1 }, { t: 1, velocity: 1 }] : gestureMotion(gesture, durSec, { velocity: opts.velocity, style: opts.fx?.style });
        const rms = strokeRms(buffer, cueSec, motion, durSec, record.safe);
        const level = matchedBusLevel(prog, rms, gesture, opts.fx?.preset ? CHANNEL_PRESETS[opts.fx.preset].room : SCRATCH_BUS.reverbMix);
        const param = this.buses[voice.index]!.level;
        const t = Math.max(this.ctx.currentTime, opts.at ?? this.ctx.currentTime);
        param.cancelScheduledValues(t);
        param.setValueAtTime(level, t);
        this.levelStats.matched++;
        this.levelStats.lastLevel = level;
      }
      // the style's preset on this voice's bus; its FX amount is the wet tail's floor
      let ambience = opts.ambience;
      if (opts.fx) {
        // the routine's preset first (it outranks the style's tone stages), then the style
        this.buses[voice.index]!.setChannelPreset(opts.fx.preset ?? null, opts.at);
        this.buses[voice.index]!.setStyleFx(opts.fx.style ? SCRATCH_FX_PROFILES[STYLE_FX_PROFILE[opts.fx.style]] : null, opts.at);
        ambience = Math.max(ambience ?? 0, Math.max(0, Math.min(1, opts.fx.amount)));
        scratchPoolStats.styleFx++;
      }
      const result = voice.playGesture(gesture, opts.bpm, {
        cue: opts.cue ?? this.anchor ?? undefined,
        ambience,
        velocity: opts.velocity,
        at: opts.at,
        style: opts.fx?.style,
      });
      if (result.ok) mine = voice.generation;
      // a scheduled stop that arrived while the record was still loading
      if (stopAt !== undefined && result.ok) voice.release(stopAt);
      return result;
    })();
    this.track(started);
    return {
      get voice() { return voice; },
      started,
      release: (at?: number) => {
        const own = voice !== null && mine !== null && voice.generation === mine;
        if (at !== undefined) { if (own && voice!.busy) voice!.release(at); else if (mine === null) stopAt = at; return; }
        cancelled = true;
        // stop now - also a stroke whose stop is only scheduled (audit SA-m7) - but never a later
        // performance that has taken the voice since
        if (own) voice!.release();
      },
    };
  }

  /** Cue the current voice (the last one used, or voice 0) to an anchor. */
  cue(at: ScratchCue, role?: ScratchRole): number | null {
    const voice = role ? this.acquire(role) : (this.voices.find((v) => v.busy) ?? this.voices[0]);
    if (!voice?.record) return null;
    return voice.cue(at);
  }

  selectRecord(id: string | null): boolean {
    if (id === null) { this.currentRecordId = null; return true; }
    if (!getScratchRecord(id)) return false;
    this.currentRecordId = id;
    return true;
  }

  releaseAll(): void {
    for (const v of this.voices) if (v.busy) v.release();
  }

  panic(): void {
    for (const v of this.voices) v.panic();
    for (const p of this.deckC.values()) void p.then((b) => b.clear(), () => undefined);
  }

  private track(p: Promise<unknown>): void {
    this.pending.add(p);
    void p.catch(() => undefined).finally(() => this.pending.delete(p));
  }

  /** Resolves once every pending load / gesture start has settled (tests, MCP). */
  async settled(): Promise<void> {
    await this.ready;
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }

  dispose(): void {
    this.panic();
    this.programme?.stop?.();
    for (const r of this.rings) r.dispose();
    for (const b of this.buses) b.dispose();
    for (const p of this.deckC.values()) void p.then((b) => b.dispose(), () => undefined);
    this.deckC.clear();
    this.voices.length = 0; this.rings.length = 0; this.buses.length = 0;
  }
}

let pool: ScratchVoicePool | null = null;

/** The app's pool: the DJ mixer's sampler input on the live context (lazy). */
export function getScratchVoicePool(): ScratchVoicePool {
  if (!pool) {
    const ctx = Tone.getContext().rawContext as BaseAudioContext;
    const engine = getDJEngine();
    const destination = engine.mixer.samplerInput;
    // the programme the scratch sits in: the decks' channel signal through the crossfader, followed over 2 s
    const programme = new ProgrammeMeter(() => deckProgrammeRms(engine)).start(realTimers, 100);
    pool = new ScratchVoicePool(ctx, destination, { programme });
  }
  return pool;
}

/** RMS of the decks as the crossfader sends them (linear weights; their channel analysers). */
function deckProgrammeRms(engine: ReturnType<typeof getDJEngine>): number | null {
  try {
    const x = useDJStore.getState().crossfaderPosition;
    let power = 0;
    for (const [id, w] of [['A', 1 - x], ['B', x]] as const) {
      const v = engine.getDeck(id).waveformAnalyser.getValue() as Float32Array;
      let s = 0;
      for (let i = 0; i < v.length; i++) s += v[i]! * v[i]!;
      power += w * w * (s / Math.max(1, v.length));
    }
    return Math.sqrt(power);
  } catch {
    return null;
  }
}

export function getScratchVoicePoolIfActive(): ScratchVoicePool | null {
  return pool;
}

/** Tests / context rebuild: drop the pool so the next call builds a fresh one. */
export function resetScratchVoicePool(): void {
  pool?.dispose();
  pool = null;
}
