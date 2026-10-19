/**
 * The Up Rough per-note bass voice dispatch: tools/hiphop.py `bass_voice_note`, i.e. the synthesis of ONE note before
 * the per-note tail (mean removal, humanize resample, fades, groove, 0.85 * vel) and the bar tail / bus.
 *
 * pluck voices (sampled / electric / warmsub) live in bassPluck.ts; this adds gfunk (synth_factory `fm_bass`), electro
 * (`electro_bass`) and reese (`reese_bass`) and the `808` / unknown-name branches (`_sub808`, NOT the trap808 renderer
 * of bass808.ts: bass_voice_note's 808 is the plain sub with drive 0.18, unknown names the same sub with drive 0.3).
 *
 * Parity fixture: tools/softsynth-fixtures/gen_bass_voices.py.
 */
import { pexp } from '@/engine/dj/scratch/portableMath';
import { distort, driftCurve, env, fm2op, moogLadder, osc } from '../synthDsp';
import { hzOfSemi, renderPluckBassNote, sub808, type PluckBassNote, type PluckBassVoice } from './bassPluck';

export type BassVoice = 'gfunk' | 'electro' | 'reese' | '808' | PluckBassVoice | (string & {});

/** synth_factory `fm_bass`: 2-op FM into a moog ladder, soft clip, envelope. `semi` is already the dropped (lo) pitch. */
export function fmBass(semi: number, durS: number, rate: number, ratio = 1.0, index = 3.0, cut = 1400, _seed = 0): Float64Array {
  const n = Math.trunc(durS * rate);
  let v = fm2op(hzOfSemi(semi), n, rate, ratio, index, 0.2, durS * 0.5, 0.12);
  v = moogLadder(v, cut, 0.25, rate);
  v = distort(v, 'soft', 1.6);
  const e = env(n, 0.003, 0, 0.75, 0.06, rate);
  return v.map((x, i) => x * e[i]!);
}

/** synth_factory `electro_bass`: drifting PWM through a moog ladder with a decaying cutoff sweep, then distortion. */
export function electroBass(semi: number, durS: number, rate: number, cut = 1000, res = 0.4, drive = 'soft', seed = 0): Float64Array {
  const n = Math.trunc(durS * rate);
  const o = osc('pwm', hzOfSemi(semi), n, rate, { pw: 0.35, drift: driftCurve(n, rate, 3, 0.3, seed) });
  const fenv = new Float64Array(n);
  for (let i = 0; i < n; i++) fenv[i] = cut * (1 + 1.6 * pexp(-i / (0.05 * rate)));
  const v = moogLadder(o, fenv, res, rate);
  const e = env(n, 0.003, 0, 0.7, 0.05, rate);
  return distort(v.map((x, i) => x * e[i]!), drive, 2.0);
}

/** synth_factory `reese_bass`: two detuned saws through a moog ladder, tape distortion, envelope. */
export function reeseBass(semi: number, durS: number, rate: number, detune = 18, cut = 1400, seed = 0): Float64Array {
  const n = Math.trunc(durS * rate);
  const a = osc('saw', hzOfSemi(semi), n, rate, { detune: -detune, seed });
  const b = osc('saw', hzOfSemi(semi), n, rate, { detune, seed: seed + 1 });
  const s = a.map((x, i) => x + b[i]!);
  const v = distort(moogLadder(s, cut, 0.35, rate), 'tape', 1.6);
  const e = env(n, 0.005, 0, 0.85, 0.08, rate);
  return v.map((x, i) => x * e[i]!);
}

/** hiphop `bass_voice_note`. `seed` is the per-note seed (the host's seed + step); `bcut` the style's bass_cut. */
export function renderBassVoiceNote(voice: BassVoice, note: PluckBassNote, rate: number): Float64Array {
  const { semi, durS, seed } = note;
  const bcut = note.bcut ?? 1.0;
  const lo = semi - 12;
  if (voice === '808') return sub808(semi, durS, rate, note.glide ?? null, 0.18);
  if (voice === 'electro') return electroBass(lo, durS, rate, Math.trunc(700 * bcut), 0.4, 'soft', seed);
  if (voice === 'reese') return reeseBass(lo, durS, rate, 16, Math.trunc(800 * bcut), seed);
  if (voice === 'gfunk') return fmBass(lo, durS, rate, 1.0, 1.7, Math.trunc(900 * bcut), seed);
  if (voice === 'sampled' || voice === 'electric' || voice === 'warmsub') return renderPluckBassNote(voice as PluckBassVoice, note, rate);
  return sub808(semi, durS, rate, note.glide ?? null);
}
