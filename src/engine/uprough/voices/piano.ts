/**
 * The Up Rough piano voice: tools/synth_factory.py `piano` (felt-hammer force pulse, strike-position comb,
 * fractional-delay string with stiffness allpass, two polarisations + a unison string, soundboard one-pole
 * low-pass, peak normalise). Same op order and numpy RandomState (MT19937) as the reference.
 */

import type { ParameterDef } from '@/engine/registry/SynthDescriptor';
import { NumpyRandomState } from '@/engine/turntable/turntableSim';
import { onepoleLp } from '@/engine/dj/scratch/demoDrums';
import { SOFTSYNTH_RATE, type SoftsynthNote, type SoftsynthVoice } from '../softsynthVoice';
import { pcos, pexp, pexp2, plog } from '@/engine/dj/scratch/portableMath';

/** synth_common.hz: the host note number (song file C-4 = 48) IS the semitone (A4 = 69 = 440 Hz). */
export const pianoHz = (semi: number): number => 440.0 * pexp2((semi - 69) / 12.0);

function contactTime(freq: number, hardness: number): number {
  let c = 0.0012 * pexp(0.45 * plog(440.0 / Math.max(20.0, freq)));
  c *= 1.35 - 0.7 * hardness;
  return Math.min(0.006, Math.max(0.00035, c));
}

/** `_hammer`: raised-cosine force pulse + a trace of felt noise, DC removed. */
function hammer(p: number, rate: number, seed: number, hardness: number, contactS: number): Float64Array {
  const nC = Math.max(2, Math.min(p, Math.trunc(contactS * rate)));
  const rng = new NumpyRandomState(seed >>> 0);
  const u = new Float64Array(nC);
  for (let i = 0; i < nC; i++) u[i] = rng.uniform(-1, 1);
  const exc = new Float64Array(p);
  const k = 0.05 * (1.0 + 2.0 * hardness);
  for (let i = 0; i < nC; i++) {
    const pulse = 0.5 * (1.0 - pcos(2.0 * Math.PI * i / nC));
    exc[i] = pulse * (1.0 + k * u[i]!);
  }
  let s = 0;
  for (let i = 0; i < p; i++) s += exc[i]!;
  const mean = s / p;
  for (let i = 0; i < p; i++) exc[i] = exc[i]! - mean;
  return exc;
}

/** `_string`: one struck string with a fractional delay line. */
function stringVoice(freq: number, n: number, rate: number, seed: number, damp: number, hardness: number, strike = 0.125, inharm = 0.0004): Float64Array {
  const L = Math.max(4.0, rate / freq - 0.5);
  const Di = Math.trunc(L);
  const Df = L - Di;
  const buf = new Float64Array(Di);
  let exc = hammer(Di, rate, seed, hardness, contactTime(freq, hardness));
  const sh = Math.max(1, Math.trunc(strike * exc.length));
  const rolled = new Float64Array(exc.length);
  for (let i = 0; i < exc.length; i++) rolled[i] = exc[i]! - exc[(((i - sh) % exc.length) + exc.length) % exc.length]!;
  exc = rolled;
  for (let i = 0; i < Math.min(exc.length, buf.length); i++) buf[i] = exc[i]!;
  const out = new Float64Array(n);
  const a = 1.0 - damp * 0.5;
  let prev = 0.0;
  let ap = 0.0;
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const j = (idx + 1) % buf.length;
    const s = buf[idx]! * (1.0 - Df) + buf[j]! * Df;
    const lpf = 0.5 * (s + prev); prev = s;
    const apo = -inharm * lpf + ap;
    ap = lpf + inharm * apo;
    buf[idx] = a * apo;
    out[i] = s;
    idx = j;
  }
  return out;
}

/** synth_factory.piano(semi, dur_s, rate, bright, seed, detune_cents). */
export function renderPiano(semi: number, durSec: number, rate = SOFTSYNTH_RATE, bright = 0.55, seed = 0, detuneCents = 2.0): Float64Array {
  const n = Math.max(1, Math.trunc(durSec * rate));
  const f = pianoHz(semi);
  const vert = stringVoice(f, n, rate, seed, 0.075, bright);
  const horiz = stringVoice(f * pexp2(0.7 / 1200.0), n, rate, seed + 2, 0.012, bright);
  const uni = stringVoice(f * pexp2(detuneCents / 1200.0), n, rate, seed + 1, 0.06, bright);
  const mixed = new Float64Array(n);
  for (let i = 0; i < n; i++) mixed[i] = 0.62 * vert[i]! + 0.30 * horiz[i]! + 0.28 * uni[i]!;
  const x = onepoleLp(mixed, 5200, rate);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i]!));
  const norm = peak + 1e-9;
  for (let i = 0; i < n; i++) x[i] = x[i]! / norm;
  return x;
}

export const PIANO_PARAMS: readonly ParameterDef[] = [
  { key: 'bright', label: 'Hammer Hardness', group: 'Hammer', type: 'knob', min: 0, max: 1, default: 0.55 },
  { key: 'detune_cents', label: 'Unison Detune (cents)', group: 'Strings', type: 'knob', min: 0, max: 50, default: 2.0 },
];

export const pianoVoice: SoftsynthVoice = {
  id: 'piano',
  label: 'Up Rough Piano',
  params: PIANO_PARAMS,
  render(params: Readonly<Record<string, number>>, note: SoftsynthNote, rate: number, seed: number): Float64Array {
    const out = renderPiano(note.midi, note.durSec, rate, params.bright ?? 0.55, seed, params.detune_cents ?? 2.0);
    const v = Math.max(0, Math.min(1, note.velocity));
    for (let i = 0; i < out.length; i++) out[i] = out[i]! * v;
    return out;
  },
};
