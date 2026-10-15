/**
 * toneVoiceProbe - one voice probe for every Tone.js based instrument (the live markers of the editor curves).
 *
 * The engine creates a Tone instrument per synth type (a PolySynth, a MonoSynth, a NoiseSynth, or a plain wrapper
 * object around one). This module watches the instrument's triggerAttack / triggerRelease calls (the times the engine
 * really scheduled), reads the playing voice's Tone Envelope (`Envelope.value`, its timings) and, where the voice has
 * one, the filter cutoff (a FrequencyEnvelope-driven filter: base + (peak - base) * env^exponent; a static filter:
 * `frequency.value`), and reports { stage, elapsedMs, level, cutoffHz } to subscribers keyed by the instrument id.
 *
 * Voices that Tone keeps private:
 *  - `PolySynth._activeVoices` (`{ midi, voice, released }`), `_voices`, `_dummyVoice`: Tone has no public per-voice
 *    read. `PolyInternals` below is the one typed accessor for them (Tone 14.7.39, PolySynth.d.ts:49).
 *  - A wrapper object returned by a factory hides the Tone instrument in a closure: the factory tags it with
 *    `registerVoiceSource(wrapper, source, extras)`; the probe patches and reads `source`.
 *
 * Time base: `Tone.now()` (context time plus look-ahead), the base `time` arguments and `Envelope.value` use.
 * Pure parts (`envelopeStageAt`) are exported for tests; everything that touches the clock is injectable.
 */
import * as Tone from 'tone';

export type ToneStage = 'attack' | 'decay' | 'sustain' | 'release' | 'off';

/** What a marker needs to place a voice on a curve. */
export interface ToneVoiceReport {
  stage: ToneStage;
  /** Milliseconds since the note's attack. */
  elapsedMs: number;
  /** Milliseconds since the current stage began. */
  stageElapsedMs: number;
  /** The voice's Envelope.value (0..1). */
  level: number;
  /** Effective filter cutoff in Hz, when the voice has a filter. */
  cutoffHz?: number;
  /** Phase in cycles (0..1) of the instrument's free-running LFO, when it has one that is registered. */
  lfoPhase?: number;
  /** Phase in cycles (0..1) of the editor's LFO (the `lfo.*` knobs): it restarts at every note attack. Absent while that LFO is off. */
  modLfoPhase?: number;
}

/** Envelope timings in seconds; sustain is a 0..1 level. */
export interface EnvelopeTimes { attack: number; decay: number; sustain: number; release: number }

/** One voice as read from the instrument. */
export interface VoiceReadout { level: number; env: EnvelopeTimes; cutoffHz?: number }

// ---------------------------------------------------------------------------------------------------------
// Pure stage model
// ---------------------------------------------------------------------------------------------------------

/**
 * The stage of a note `now`, given when it was attacked and (if scheduled) released. Seconds in and out.
 * Returns null before the attack time. A note released during its attack or decay goes straight to its release.
 */
export function envelopeStageAt(
  now: number, attackAt: number, releaseAt: number | null, env: EnvelopeTimes,
): { stage: ToneStage; stageElapsed: number } | null {
  if (now < attackAt) return null;
  if (releaseAt !== null && now >= releaseAt) {
    const sinceRelease = now - releaseAt;
    return sinceRelease < env.release ? { stage: 'release', stageElapsed: sinceRelease } : { stage: 'off', stageElapsed: sinceRelease };
  }
  const t = now - attackAt;
  if (t < env.attack) return { stage: 'attack', stageElapsed: t };
  const hasDecay = env.sustain < 1 && env.decay > 0;
  if (hasDecay && t < env.attack + env.decay) return { stage: 'decay', stageElapsed: t - env.attack };
  return { stage: 'sustain', stageElapsed: t - env.attack - (hasDecay ? env.decay : 0) };
}

/** Effective cutoff of a Tone FrequencyEnvelope-driven filter (FrequencyEnvelope.js: Pow(exponent) then Scale(base, base * 2^octaves)). */
export function frequencyEnvelopeHz(base: number, octaves: number, exponent: number, envValue: number): number {
  const peak = base * Math.pow(2, octaves);
  const v = Math.max(0, Math.min(1, envValue));
  return base + (peak - base) * Math.pow(v, exponent);
}

// ---------------------------------------------------------------------------------------------------------
// Reading Tone instruments (duck typed, so a stub in a test is a Tone instrument as far as the probe knows)
// ---------------------------------------------------------------------------------------------------------

interface EnvelopeLike {
  value: number;
  attack: number | string; decay: number | string; sustain: number; release: number | string;
  getValueAtTime?: (t: number) => number;
  toSeconds?: (v: number | string) => number;
}
interface FrequencyEnvelopeLike extends EnvelopeLike { baseFrequency: number; octaves: number; exponent: number }
interface FilterLike { frequency: { readonly value: number | string } }
interface MonoVoiceLike { envelope: EnvelopeLike; filterEnvelope?: FrequencyEnvelopeLike; filter?: FilterLike }

/** The PolySynth members Tone keeps private (see the module comment). */
interface PolyInternals {
  _activeVoices: Array<{ midi: number; voice: MonoVoiceLike; released: boolean }>;
  _voices?: MonoVoiceLike[];
  _dummyVoice?: MonoVoiceLike;
}

/** A native (non-Tone) instrument that can read its newest voice itself (WavetableSynth). */
export interface VoiceReadable { readVoice(): VoiceReadout | null }

type TriggerKind = 'poly' | 'mono' | 'noise';

/** Extras a factory registers with the instrument it wraps. */
export interface VoiceSourceExtras {
  /** A filter node the voice sounds through that no envelope drives (its `frequency.value` is the cutoff). */
  filter?: FilterLike;
  /** A free-running LFO: its rate now; `startTime` is when it started (Tone.now() frame), default the tracker's creation. */
  lfo?: { rateHz: () => number; startTime?: number };
  /** The editor's per-voice LFO (toneSynthKnobs ToneRig): its rate now, 0 while it is off. It restarts at every attack. */
  modLfo?: { rateHz: () => number };
}

interface Registration { source: object; extras: VoiceSourceExtras }
const registrations = new WeakMap<object, Registration>();

/** The Tone node a factory wrapper hides (as registered with registerVoiceSource), else the instrument itself. */
export function voiceSourceOf(instrument: object): object {
  return registrations.get(instrument)?.source ?? instrument;
}

/** Tag a factory wrapper with the Tone instrument it hides, so the probe can patch and read it. Returns the wrapper. */
export function registerVoiceSource<T extends object>(wrapper: T, source: object, extras: VoiceSourceExtras = {}): T {
  registrations.set(wrapper, { source, extras });
  return wrapper;
}

const secondsOf = (env: EnvelopeLike, v: number | string): number => {
  if (typeof v === 'number') return v;
  try { return env.toSeconds ? env.toSeconds(v) : Number(v); } catch { return Number(v); }
};
const envTimesOf = (env: EnvelopeLike): EnvelopeTimes => ({
  attack: secondsOf(env, env.attack), decay: secondsOf(env, env.decay), sustain: env.sustain, release: secondsOf(env, env.release),
});

function readMonoVoice(voice: MonoVoiceLike, staticFilter?: FilterLike): VoiceReadout {
  const { envelope, filterEnvelope } = voice;
  const readout: VoiceReadout = { level: Number(envelope.value), env: envTimesOf(envelope) };
  if (filterEnvelope && typeof filterEnvelope.baseFrequency === 'number') {
    readout.cutoffHz = frequencyEnvelopeHz(filterEnvelope.baseFrequency, filterEnvelope.octaves, filterEnvelope.exponent, filterEnvelope.value);
  } else if (staticFilter ?? voice.filter) {
    readout.cutoffHz = Number((staticFilter ?? voice.filter)!.frequency.value);
  }
  return readout;
}

interface Adapter {
  kind: TriggerKind;
  target: Record<string, unknown>;
  /** The readout of the voice playing `midi` (null = the newest voice). Null when nothing can be read. */
  read: (midi: number | null) => VoiceReadout | null;
  lfo?: VoiceSourceExtras['lfo'];
  modLfo?: VoiceSourceExtras['modLfo'];
}

const hasEnvelope = (o: unknown): o is MonoVoiceLike =>
  !!o && typeof o === 'object' && typeof (o as MonoVoiceLike).envelope?.getValueAtTime === 'function';

function adapt(instrument: object): Adapter | null {
  const reg = registrations.get(instrument);
  const target = (reg?.source ?? instrument) as Record<string, unknown>;
  // A factory wrapper registers the Tone node it hides; the node may carry extras of its own (the rig's LFO clock).
  const extras = { ...registrations.get(target)?.extras, ...reg?.extras };
  const base = { target, lfo: extras.lfo, modLfo: extras.modLfo };

  if (typeof (target as unknown as VoiceReadable).readVoice === 'function') {
    return { ...base, kind: 'poly', read: () => (target as unknown as VoiceReadable).readVoice() };
  }
  if (Array.isArray(target._activeVoices)) {
    const poly = target as unknown as PolyInternals;
    return {
      ...base, kind: 'poly',
      read: (midi) => {
        const entries = poly._activeVoices;
        const match = (midi !== null ? [...entries].reverse().find((e) => e.midi === midi) : undefined) ?? entries[entries.length - 1];
        const voice = match?.voice ?? poly._voices?.[0] ?? poly._dummyVoice;
        return voice && hasEnvelope(voice) ? readMonoVoice(voice, extras.filter) : null;
      },
    };
  }
  if (hasEnvelope((target as { voice0?: unknown }).voice0)) {
    const duo = target as unknown as { voice0: MonoVoiceLike; vibratoRate?: { value: number } };
    // DuoSynth runs a free vibrato LFO from its construction; its rate is a public Signal.
    const vibrato = duo.vibratoRate ? { rateHz: () => Number(duo.vibratoRate!.value) } : undefined;
    return { ...base, lfo: extras.lfo ?? vibrato, kind: 'mono', read: () => readMonoVoice(duo.voice0, extras.filter) };
  }
  if (hasEnvelope(target)) {
    return { ...base, kind: typeof (target as { noise?: unknown }).noise === 'object' ? 'noise' : 'mono', read: () => readMonoVoice(target as unknown as MonoVoiceLike, extras.filter) };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// Trackers
// ---------------------------------------------------------------------------------------------------------

interface NoteEvent { midi: number | null; attackAt: number; releaseAt: number | null }
const MAX_EVENTS = 24;

const NOTE_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** MIDI number of a note name ("C#4", "Db3", "C-4") or of a frequency in Hz (Tone reads a bare number as Hz); null when unreadable. */
export function midiOf(note: unknown): number | null {
  if (typeof note === 'number') return note > 0 ? Math.round(69 + 12 * Math.log2(note / 440)) : null;
  if (typeof note !== 'string') return null;
  const m = /^([A-Ga-g])([#b]?)-?(-?\d+)$/.exec(note.trim());
  if (!m) return null;
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + NOTE_SEMITONE[m[1].toUpperCase()] + accidental;
}

class VoiceTracker {
  private events: NoteEvent[] = [];
  private readonly restore: Array<() => void> = [];
  private readonly createdAt: number;
  private readonly adapter: Adapter;
  private readonly now: () => number;

  constructor(adapter: Adapter, now: () => number) {
    this.adapter = adapter;
    this.now = now;
    this.createdAt = now();
    const { kind } = adapter;
    const timeOf = (t: unknown): number => (typeof t === 'number' && Number.isFinite(t) ? t : this.now());
    // Argument layouts: PolySynth attack(notes, time, velocity) / release(notes, time); Monophonic attack(note, time,
    // velocity) / release(time); NoiseSynth attack(time, velocity) / release(time).
    const notesOf = (arg: unknown): unknown[] => (Array.isArray(arg) ? arg : [arg]);
    this.patch('triggerAttack', (args) => {
      if (kind === 'noise') { this.onAttack(null, timeOf(args[0])); return; }
      for (const n of notesOf(args[0])) this.onAttack(midiOf(n), timeOf(args[1]));
    });
    this.patch('triggerRelease', (args) => {
      if (kind !== 'poly') { this.onRelease(null, timeOf(args[0])); return; }
      for (const n of notesOf(args[0])) this.onRelease(midiOf(n), timeOf(args[1]));
    });
  }

  private patch(name: string, hook: (args: unknown[]) => void): void {
    const target = this.adapter.target;
    const original = target[name];
    if (typeof original !== 'function') return;
    const hadOwn = Object.prototype.hasOwnProperty.call(target, name);
    target[name] = function patched(this: unknown, ...args: unknown[]) {
      try { hook(args); } catch { /* a probe must never break a note */ }
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
    this.restore.push(() => { if (hadOwn) target[name] = original; else delete target[name]; });
  }

  private onAttack(midi: number | null, attackAt: number): void {
    this.events.push({ midi, attackAt, releaseAt: null });
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }

  private onRelease(midi: number | null, releaseAt: number): void {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (e.releaseAt === null && (midi === null || e.midi === midi)) { e.releaseAt = releaseAt; return; }
    }
  }

  /** The newest started note that has not finished, as a report; null when nothing sounds. */
  current(): ToneVoiceReport | null {
    const now = this.now();
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (e.attackAt > now) continue;
      let readout: VoiceReadout | null = null;
      try { readout = this.adapter.read(e.midi); } catch { readout = null; }
      if (!readout) return null;
      const at = envelopeStageAt(now, e.attackAt, e.releaseAt, readout.env);
      if (!at || at.stage === 'off') {
        // This note is over; an older one may still be held.
        this.events.splice(i, 1);
        continue;
      }
      const report: ToneVoiceReport = {
        stage: at.stage, elapsedMs: (now - e.attackAt) * 1000, stageElapsedMs: at.stageElapsed * 1000, level: readout.level,
      };
      if (readout.cutoffHz !== undefined && Number.isFinite(readout.cutoffHz)) report.cutoffHz = readout.cutoffHz;
      const lfo = this.adapter.lfo;
      if (lfo) {
        const cycles = lfo.rateHz() * (now - (lfo.startTime ?? this.createdAt));
        report.lfoPhase = cycles - Math.floor(cycles);
      }
      const modRate = this.adapter.modLfo?.rateHz() ?? 0;
      if (modRate > 0) {
        const cycles = modRate * (now - e.attackAt);
        report.modLfoPhase = cycles - Math.floor(cycles);
      }
      return report;
    }
    return null;
  }

  dispose(): void {
    for (const undo of this.restore.splice(0)) undo();
    this.events = [];
  }
}

// ---------------------------------------------------------------------------------------------------------
// The probe
// ---------------------------------------------------------------------------------------------------------

export interface ToneVoiceProbeOptions {
  now?: () => number;
  /** Starts a repeating callback and returns its stop function (default: a 30 ms interval). */
  schedule?: (fn: () => void) => () => void;
}

type Listener = (report: ToneVoiceReport | null) => void;

export class ToneVoiceProbe {
  private readonly byId = new Map<number, Set<VoiceTracker>>();
  private readonly byInstrument = new WeakMap<object, { id: number; tracker: VoiceTracker }>();
  private readonly listeners = new Map<number, Set<{ cb: Listener; hadVoice: boolean }>>();
  private stopTimer: (() => void) | null = null;
  private readonly now: () => number;
  private readonly schedule: (fn: () => void) => () => void;

  constructor(opts: ToneVoiceProbeOptions = {}) {
    this.now = opts.now ?? (() => Tone.now());
    this.schedule = opts.schedule ?? ((fn) => { const h = setInterval(fn, 30); return () => clearInterval(h); });
  }

  /** Start watching `instrument` (idempotent; false when it is not a probe-able Tone instrument). */
  track(instrumentId: number, instrument: object): boolean {
    if (this.byInstrument.has(instrument)) return true;
    const adapter = adapt(instrument);
    if (!adapter) return false;
    const tracker = new VoiceTracker(adapter, this.now);
    this.byInstrument.set(instrument, { id: instrumentId, tracker });
    let set = this.byId.get(instrumentId);
    if (!set) { set = new Set(); this.byId.set(instrumentId, set); }
    set.add(tracker);
    return true;
  }

  untrack(instrument: object): void {
    const entry = this.byInstrument.get(instrument);
    if (!entry) return;
    entry.tracker.dispose();
    this.byInstrument.delete(instrument);
    const set = this.byId.get(entry.id);
    set?.delete(entry.tracker);
    if (set && set.size === 0) this.byId.delete(entry.id);
  }

  /** The voice of `instrumentId` that was attacked most recently and still sounds, across all its instances. */
  voice(instrumentId: number): ToneVoiceReport | null {
    let best: ToneVoiceReport | null = null;
    for (const tracker of this.byId.get(instrumentId) ?? []) {
      const r = tracker.current();
      if (r && (best === null || r.elapsedMs < best.elapsedMs)) best = r;
    }
    return best;
  }

  /** Report the sounding voice of `instrumentId` (null when none) to `cb` while subscribed. */
  subscribe(instrumentId: number, cb: Listener): () => void {
    const entry = { cb, hadVoice: false };
    let set = this.listeners.get(instrumentId);
    if (!set) { set = new Set(); this.listeners.set(instrumentId, set); }
    set.add(entry);
    if (!this.stopTimer) this.stopTimer = this.schedule(() => this.tick());
    return () => {
      set.delete(entry);
      if (set.size === 0) this.listeners.delete(instrumentId);
      if (this.listeners.size === 0 && this.stopTimer) { this.stopTimer(); this.stopTimer = null; }
    };
  }

  /** One polling step (exported through the scheduler; tests call it directly). */
  tick(): void {
    for (const [id, set] of this.listeners) {
      const report = this.voice(id);
      for (const entry of [...set]) {
        if (report) { entry.hadVoice = true; entry.cb(report); }
        else if (entry.hadVoice) { entry.hadVoice = false; entry.cb(null); }
      }
    }
  }

  /** True while a timer runs (it runs only while something subscribes). */
  get running(): boolean { return this.stopTimer !== null; }
}

export const toneVoiceProbe = new ToneVoiceProbe();

/** Engine hook: watch a freshly created instrument. Safe on any object; does nothing for non-Tone instruments. */
export function trackToneVoices(instrumentId: number, instrument: unknown): void {
  if (instrument && typeof instrument === 'object') {
    try { toneVoiceProbe.track(instrumentId, instrument); } catch { /* never break instrument creation */ }
  }
}

/** Engine hook: stop watching a disposed instrument. */
export function untrackToneVoices(instrument: unknown): void {
  if (instrument && typeof instrument === 'object') toneVoiceProbe.untrack(instrument);
}
