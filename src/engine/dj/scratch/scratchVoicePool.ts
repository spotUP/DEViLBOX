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
import { createScratchBus, type ScratchBus } from './scratchBus';
import { ScratchRecordVoice, type ScratchCue, type StrokeResult } from './ScratchRecordVoice';
import { getScratchRecord, findRecords, type ScratchRecord } from './scratchCatalogue';
import type { ScratchGesture, ScratchRole } from './scratchTypes';
import { matchedBusLevel, recordRms, ProgrammeMeter } from './scratchLevel';
import { realTimers } from '../autodj/executorTimers';
import { useDJStore } from '@/stores/useDJStore';

/** Reachability sentinels (SCR-P2.R2). */
export const scratchPoolStats = { performs: 0, loads: 0 };

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
}

export interface PerformHandle {
  /** The voice performing (assigned once the pool is ready). */
  readonly voice: ScratchRecordVoice | null;
  /** Resolves with the stroke result once the record is loaded and the gesture started. */
  readonly started: Promise<StrokeResult>;
  /** Stop now, or - with `at` (context seconds) - stop sample-accurately at that time. */
  release(at?: number): void;
}

export type RecordFetcher = (record: ScratchRecord, ctx: BaseAudioContext) => Promise<AudioBuffer>;

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

  /** The programme's RMS now (the music the scratch sits in); null = unknown: the bus stays at unity. */
  private readonly programme: (() => number | null) | null;
  /** RMS of each loaded record over its safe range (the level match's reference). */
  private readonly recordLevels = new Map<string, number>();
  /** Reachability sentinel: strokes whose bus level was matched to the programme. */
  readonly levelStats = { matched: 0, lastLevel: 1 };

  constructor(ctx: BaseAudioContext, destination: AudioNode, opts: { size?: number; fetcher?: RecordFetcher; programme?: () => number | null } = {}) {
    this.ctx = ctx;
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

  /** The voice for a role: THEME keeps voice 0, ANSWER voice 1, otherwise the first idle one. */
  acquire(role?: ScratchRole): ScratchRecordVoice {
    if (role === 'THEME') return this.voices[0]!;
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
  buffer(record: ScratchRecord): Promise<AudioBuffer> {
    let p = this.buffers.get(record.id);
    if (!p) {
      scratchPoolStats.loads++;
      p = this.fetcher(record, this.ctx);
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

  /** Load (if needed) and play a gesture on a voice. Never touches a deck. */
  perform(gesture: ScratchGesture, opts: PerformOptions): PerformHandle | null {
    const record = this.resolveRecord(gesture, opts);
    if (!record) return null;
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
      const prog = this.programme?.() ?? null;
      if (prog !== null) {
        let rms = this.recordLevels.get(record.id);
        if (rms === undefined) {
          const buffer = await this.buffer(record);
          rms = recordRms(buffer, record.safe[0], record.safe[1]);
          this.recordLevels.set(record.id, rms);
        }
        const level = matchedBusLevel(prog, rms, gesture);
        const param = this.buses[voice.index]!.level;
        const t = Math.max(this.ctx.currentTime, opts.at ?? this.ctx.currentTime);
        param.cancelScheduledValues(t);
        param.setValueAtTime(level, t);
        this.levelStats.matched++;
        this.levelStats.lastLevel = level;
      }
      const result = voice.playGesture(gesture, opts.bpm, {
        cue: opts.cue ?? this.anchor ?? undefined,
        ambience: opts.ambience,
        velocity: opts.velocity,
        at: opts.at,
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
    for (const r of this.rings) r.dispose();
    for (const b of this.buses) b.dispose();
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
    const meter = new ProgrammeMeter(() => deckProgrammeRms(engine));
    realTimers.setInterval(() => meter.sample(0.1), 100);
    pool = new ScratchVoicePool(ctx, destination, { programme: () => meter.rms });
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
