/**
 * The Up Rough melody voices: tools/hiphop.py `melody_voice_note` for bell / darkbell / fmbell / lead / epiano / whistle, i.e. ONE note before the per-note tail (normalise, humanize, gain stay in melody_bar_hits and
 * are not part of this module). Pitch: the host semi IS the midi number (A4 = 69), like piano.ts.
 *
 * Parity fixture: tools/softsynth-fixtures/gen_melody_voices.py.
 */
import { pexp, pexp2, psin } from '@/engine/dj/scratch/portableMath';
import { hp } from '@/engine/dj/scratch/refDsp';
import { chorus, env, fm2op, moogLadder, noise, osc, phaseOf } from '../synthDsp';
import { hzOfSemi } from './bassPluck';
import type { SoftsynthNote, SoftsynthVoice } from '../softsynthVoice';

export type MelodyVoice = 'bell' | 'darkbell' | 'fmbell' | 'lead' | 'epiano' | 'whistle';

/** synth_factory `fm_bell` with the "default" profile (feedback 0.1, carrier decay 0.6 * dur, modulator 0.3). */
function fmBell(semi: number, durS: number, rate: number, ratio: number, index: number, bright: number): Float64Array {
  return fm2op(hzOfSemi(semi), Math.trunc(durS * rate), rate, ratio, index * bright, 0.1, durS * 0.6, 0.3);
}

/** hiphop `melody_voice_note`, bell / darkbell / fmbell branch: struck two-partial FM bell, ring-out, noisy attack. */
export function bellNote(darkbell: boolean, semi: number, durS: number, rate: number, seed: number): Float64Array {
  const n = Math.max(1, Math.trunc(durS * rate));
  const b = new Float64Array(n);
  const main = fmBell(semi, durS, rate, 3.5, 4.5, darkbell ? 0.6 : 1.0);
  const strike = fmBell(semi, durS, rate, 5.4, 3.0, 0.8);
  for (let t = 0; t < n; t++) b[t] = (main[t]! + 0.3 * strike[t]!) * pexp(-t / (0.16 * rate));
  const atk = Math.trunc(0.004 * rate);
  if (n > atk) {
    const click = hp(noise('white', atk, seed), 3500, rate);
    for (let i = 0; i < atk; i++) b[i] = b[i]! + 0.5 * click[i]!;
  }
  return b;
}

/** synth_factory `analog_lead`: supersaw through a moog ladder with a decaying cutoff sweep, ADSR. */
export function analogLead(semi: number, durS: number, rate: number, cut = 3.0): Float64Array {
  const n = Math.trunc(durS * rate);
  const f = hzOfSemi(semi);
  const o = osc('supersaw', f, n, rate);
  const fc = new Float64Array(n);
  for (let i = 0; i < n; i++) fc[i] = f * cut * (1 + pexp(-i / (0.06 * rate)));
  const v = moogLadder(o, fc, 0.2, rate);
  const e = env(n, 0.01, 0.2, 0.5, 0.15, rate);
  return v.map((x, i) => x * e[i]!);
}

/** synth_factory `electric_piano` (Rhodes FM tine + short high-ratio strike), peak-normalised, then hiphop's chorus mix 0.3. */
export function electricPianoNote(semi: number, durS: number, rate: number): Float64Array {
  const n = Math.max(1, Math.trunc(durS * rate));
  const f = hzOfSemi(semi);
  const body = fm2op(f, n, rate, 1.0, 5.5, 0.0, Math.max(0.12, durS * 0.85), 0.055);
  const tine = fm2op(f, n, rate, 14.0, 1.8, 0.0, 0.030, 0.010);
  const x = new Float64Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) { x[i] = body[i]! + 0.16 * tine[i]!; peak = Math.max(peak, Math.abs(x[i]!)); }
  const norm = peak + 1e-9;
  for (let i = 0; i < n; i++) x[i] = x[i]! / norm;
  return chorus(x, rate, { mix: 0.3 });
}

/** synth_factory `whistle_lead`: sine + 3rd harmonic, delayed vibrato, exponential portamento from `glideFrom`. */
export function whistleLead(semi: number, durS: number, rate: number, glideFrom: number | null = null): Float64Array {
  const vibHz = 5.5, vibCents = 18.0, vibDelayS = 0.12, bright = 0.18;
  const n = Math.max(1, Math.trunc(durS * rate));
  const fTo = hzOfSemi(semi);
  const freq = new Float64Array(n).fill(fTo);
  if (glideFrom !== null && glideFrom !== semi) {
    const gl = Math.max(1, Math.trunc(Math.min(0.07, durS * 0.5) * rate));
    const fFrom = hzOfSemi(glideFrom);
    const ratio = fTo / fFrom;
    for (let i = 0; i < n; i++) {
      // np.concatenate([1 - exp(-linspace(0, 4, gl)), ones]): linspace(0, 4, 1) is [0]
      const k = i < gl ? 1.0 - pexp(-(gl === 1 ? 0 : (i * (4 / (gl - 1)))) ) : 1.0;
      freq[i] = fFrom * Math.pow(ratio, k);
    }
  }
  const pf = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const ramp = Math.min(1, Math.max(0, (t - vibDelayS) / Math.max(1e-6, vibDelayS)));
    const vib = pexp2((vibCents * ramp * psin(2 * Math.PI * vibHz * t)) / 1200.0) - 1.0;
    pf[i] = freq[i]! * (1.0 + vib);
  }
  const ph = phaseOf(pf, n, rate);
  const e = env(n, 0.02, 0.06, 0.85, 0.12, rate);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const y = psin(2 * Math.PI * ph[i]!) + bright * psin(6 * Math.PI * ph[i]!);
    out[i] = (y / (1.0 + bright)) * e[i]!;
  }
  return out;
}

/** One melody note of `voice`, before the per-note tail. */
export function renderMelodyVoiceNote(voice: MelodyVoice, semi: number, durS: number, rate: number, seed: number, prevSemi: number | null = null): Float64Array {
  if (voice === 'lead') return analogLead(semi, durS, rate, 3.0);
  if (voice === 'epiano') return electricPianoNote(semi, durS, rate);
  if (voice === 'whistle') return whistleLead(semi, durS, rate, prevSemi);
  return bellNote(voice === 'darkbell', semi, durS, rate, seed);
}

function melodyVoice(id: string, label: string, voice: MelodyVoice): SoftsynthVoice {
  return {
    id,
    label,
    params: [],
    render(_params: Readonly<Record<string, number>>, note: SoftsynthNote, rate: number, seed: number): Float64Array {
      const raw = renderMelodyVoiceNote(voice, note.midi, note.durSec, rate, seed);
      return note.velocity === 1 ? raw : raw.map((x) => x * note.velocity);
    },
  };
}

export const MELODY_VOICE_SOFTSYNTHS: readonly SoftsynthVoice[] = [
  melodyVoice('melodyBell', 'Up Rough Bell', 'bell'),
  melodyVoice('melodyDarkbell', 'Up Rough Dark Bell', 'darkbell'),
  melodyVoice('melodyFmbell', 'Up Rough FM Bell', 'fmbell'),
  melodyVoice('melodyLead', 'Up Rough Analog Lead', 'lead'),
  melodyVoice('melodyEpiano', 'Up Rough Electric Piano', 'epiano'),
  melodyVoice('melodyWhistle', 'Up Rough Whistle Lead', 'whistle'),
];
