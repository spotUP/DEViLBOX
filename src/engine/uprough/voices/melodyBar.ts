/**
 * The Up Rough melody bar: tools/hiphop.py `melody_voice_note` dispatch (piano, the six melody timbres, pluck fallback),
 * the per-note tail of `melody_bar_hits` (peak normalise, `humanize(seed*1733 + step*13 + i)`, half-strength cents resample
 * when |cents| > 0.1, gain, start jitter, x0.45) and the bar sum of `render_melody_bar`.
 *
 * The caller passes the bar's DECISION (`notes`, the host's melody_bar_notes list of (semi, step, durSteps)); deciding the
 * notes (chord transpose, scale snap) is not mirrored. The host's "sample" voice (sample_osc, "tine" ROM sample) is NOT
 * ported and throws instead of falling to the pluck.
 *
 * Float precision follows numpy: a humanize-resampled note is float32, so the gain and 0.45 multiplies are float32.
 * Parity fixture: tools/softsynth-fixtures/gen_melody_bar.py.
 */
import { karplus } from '../synthDsp';
import { humanizeDraw, resampleRatio } from '../humanize';
import { pexp2 } from '@/engine/dj/scratch/portableMath';
import { hzOfSemi } from './bassPluck';
import { renderPiano } from './piano';
import { renderMelodyVoiceNote, type MelodyVoice } from './melodyVoices';

/** One decided melody note: the host's (semi, step16, dur16). */
export interface MelodyBarNote { semi: number; step: number; durSteps: number }
export interface MelodyBarOptions { bpm: number; seed: number }

const TIMBRES: ReadonlySet<string> = new Set(['bell', 'darkbell', 'fmbell', 'lead', 'epiano', 'whistle']);

/** hiphop.melody_voice_note: one note before the tail. Unknown names are the pluck (`_fac.pluck`, damp 0.5, integer line). */
export function melodyVoiceNote(voice: string, semi: number, durS: number, prevSemi: number | null, seed: number, rate: number): Float64Array {
  if (voice === 'piano') return renderPiano(semi, durS, rate, 0.55, seed);
  if (TIMBRES.has(voice)) return renderMelodyVoiceNote(voice as MelodyVoice, semi, durS, rate, seed, prevSemi);
  if (voice === 'sample') throw new Error('melody voice "sample" (sample_osc) is not ported');
  return karplus(hzOfSemi(semi), durS, rate, 0.5, 'pluck', seed, false);
}

/** melody_bar_hits: one (sample offset, signal) per note, cut to the bar buffer (bar + 0.6 s). */
export function melodyBarHits(voice: string, notes: readonly MelodyBarNote[], opts: MelodyBarOptions, rate: number): Array<{ offset: number; sig: Float64Array }> {
  const stepSamp = Math.trunc(rate * 60.0 / (opts.bpm * 4));
  const bufLen = stepSamp * 16 + Math.trunc(0.6 * rate);
  const hits: Array<{ offset: number; sig: Float64Array }> = [];
  let prev: number | null = null;
  notes.forEach((n, i) => {
    const dur = n.durSteps * stepSamp / rate;
    let note = melodyVoiceNote(voice, n.semi, dur, prev, opts.seed + n.step, rate);
    let peak = 0;
    for (let k = 0; k < note.length; k++) peak = Math.max(peak, Math.abs(note[k]!));
    const norm = peak + 1e-9;
    note = note.map((x) => x / norm);
    const h = humanizeDraw(opts.seed * 1733 + n.step * 13 + i);
    let f32 = false;
    if (Math.abs(h.cents) > 0.1) {
      note = resampleRatio(note, pexp2(h.cents * 0.5 / 1200.0));
      f32 = true;
    }
    const cast = f32 ? Math.fround : (x: number) => x;
    const g = cast(h.gain);
    const o = n.step * stepSamp + Math.trunc(h.start * rate);
    const e = Math.min(bufLen, o + note.length);
    const c = cast(0.45);
    const sig = new Float64Array(Math.max(0, e - o));
    for (let k = 0; k < sig.length; k++) sig[k] = cast(c * cast(note[k]! * g));
    hits.push({ offset: o, sig });
    prev = n.semi;
  });
  return hits;
}

/** render_melody_bar: the hits summed into the bar, cut to 16 steps. */
export function renderMelodyBar(voice: string, notes: readonly MelodyBarNote[], opts: MelodyBarOptions, rate: number): Float64Array {
  const stepSamp = Math.trunc(rate * 60.0 / (opts.bpm * 4));
  const barLen = stepSamp * 16;
  const buf = new Float64Array(barLen);
  for (const { offset, sig } of melodyBarHits(voice, notes, opts, rate)) {
    const end = Math.min(barLen, offset + sig.length);
    for (let k = offset; k < end; k++) buf[k] = buf[k]! + sig[k - offset]!;
  }
  return buf;
}
