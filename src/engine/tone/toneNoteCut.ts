/**
 * toneNoteCut - hard retrigger for Tone.js based instruments (FT2 note semantics).
 *
 * A raw note on a tracker channel cuts the note that channel was playing: the old note fades out over a few
 * milliseconds that end where the new note starts, and the new note's envelopes start from zero. A Tone envelope that
 * is still sounding when the next attack arrives starts that attack from its current value (Envelope.triggerAttack
 * shortens the attack by the distance already covered), and a PolySynth voice's release tail plays on under the new
 * voice. Both make a raw note sound legato. Slides and tone portamento must not come here: they keep the old note.
 *
 * The cut ramps every envelope of the instrument (amplitude, filter, modulation) to zero with a linear ramp of
 * CUT_RAMP_SECONDS that ends at `time`. Envelope.triggerRelease reads `release` and `releaseCurve` when it is called,
 * so the cut swaps them in for the one call and restores them. Oscillators are left running: a stop at `time` would
 * collide with the start the new note schedules at the same moment.
 *
 * Which envelopes: a factory wrapper that hides several Tone nodes (WobbleBass: three PolySynths, unison voices and a
 * shared filter envelope) lists them with `registerCutTargets`; otherwise the probe's voice source (toneVoiceProbe
 * `voiceSourceOf`) is walked. The walk is duck typed over Tone's instrument shapes (Synth, MonoSynth, FMSynth/AMSynth,
 * DuoSynth, PolySynth with its private `_activeVoices`).
 */
import * as Tone from 'tone';
import { voiceSourceOf } from './toneVoiceProbe';

/** Length of the fade that cuts the old note (seconds). Short enough to read as a retrigger, long enough not to click. */
export const CUT_RAMP_SECONDS = 0.003;

const cutTargets = new WeakMap<object, object[]>();

/** Tag a factory wrapper with every Tone node whose envelopes a hard retrigger must cut. Returns the wrapper. */
export function registerCutTargets<T extends object>(wrapper: T, targets: object[]): T {
  cutTargets.set(wrapper, targets);
  return wrapper;
}

/** Keys of Tone instruments that hold an envelope or a sub-voice (Synth/MonoSynth, ModulationSynth, DuoSynth). */
const CHILD_KEYS = ['envelope', 'filterEnvelope', 'modulationEnvelope', '_carrier', '_modulator', 'voice0', 'voice1'] as const;

/** A Tone PolySynth (duck typed on its private voice list). */
interface PolyLike {
  _activeVoices: Array<{ voice?: unknown }>;
  now(): number;
  context: { setTimeout(fn: () => void, timeout: number): number };
}

function isPoly(node: object): node is PolyLike {
  return Array.isArray((node as Record<string, unknown>)._activeVoices);
}

/**
 * Every Tone Envelope reachable from `node` (a FrequencyEnvelope is an Envelope). A PolySynth is not walked: it goes
 * to `polys`, because its voices for a future note do not exist yet (see cutToneNote).
 */
export function cutEnvelopesOf(
  node: object, out: Tone.Envelope[] = [], seen = new Set<object>(), polys: PolyLike[] = [],
): Tone.Envelope[] {
  if (seen.has(node)) return out;
  seen.add(node);
  if (node instanceof Tone.Envelope) {
    out.push(node);
    return out;
  }
  if (isPoly(node)) {
    polys.push(node);
    return out;
  }
  const record = node as Record<string, unknown>;
  for (const key of CHILD_KEYS) {
    const child = record[key];
    if (child && typeof child === 'object') cutEnvelopesOf(child, out, seen, polys);
  }
  return out;
}

/**
 * Ramp one envelope to zero, ending at `time`. When the ramp can no longer start in time, it starts now; `minRamp`
 * then keeps it from collapsing into a click (only safe where the new note plays on another voice).
 */
function cutEnvelope(env: Tone.Envelope, time: number, minRamp = 0): void {
  const start = Math.max(time - CUT_RAMP_SECONDS, env.now());
  const release = env.release;
  const releaseCurve = env.releaseCurve;
  try {
    env.releaseCurve = 'linear';
    env.release = Math.max(time - start, minRamp);
    env.triggerRelease(start);
  } finally {
    env.release = release;
    env.releaseCurve = releaseCurve;
  }
}

/** Cut every voice a PolySynth holds (released voices too: their tails are what overlaps the new note). */
function cutPolyVoices(poly: PolyLike, time: number): void {
  for (const entry of poly._activeVoices) {
    if (!entry.voice || typeof entry.voice !== 'object') continue;
    const envelopes: Tone.Envelope[] = [];
    cutEnvelopesOf(entry.voice, envelopes);
    for (const env of envelopes) cutEnvelope(env, time, CUT_RAMP_SECONDS);
  }
}

/**
 * Cut the note a Tone instrument is playing so that it is silent at `time` (a context time, the new note's attack).
 *
 * A plain envelope is cut at once: its automation for the old note is already scheduled. A PolySynth defers every
 * future attack and release on its context clock (PolySynth._scheduleEvent runs them on a ticker once `now()` reaches
 * their time), and the replayer schedules rows up to 0.25 s ahead, so the voice of the previous note may not exist
 * yet when this is called. The cut joins the same queue at `time`, so it runs after the previous attack and before
 * the new one. Call it after the old note's release at `time`: that release holds the envelope at `time`
 * (cancelAndHoldAtTime) and would wipe a cut that ran before it. The ticker can run it late, but the PolySynth's own
 * attack for the new note is then just as late and plays on a fresh voice, so a late cut only shortens the old tail.
 */
export function cutToneNote(instrument: object, time: number): void {
  const roots = cutTargets.get(instrument) ?? [voiceSourceOf(instrument)];
  const envelopes: Tone.Envelope[] = [];
  const polys: PolyLike[] = [];
  const seen = new Set<object>();
  for (const root of roots) cutEnvelopesOf(root, envelopes, seen, polys);
  for (const env of envelopes) cutEnvelope(env, time);
  for (const poly of polys) {
    const delay = time - poly.now();
    if (delay <= 0) cutPolyVoices(poly, time);
    else poly.context.setTimeout(() => cutPolyVoices(poly, time), delay);
  }
}
