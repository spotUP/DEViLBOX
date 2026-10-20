/**
 * The Up Rough melody voices: tools/hiphop.py `melody_voice_note` for bell / darkbell / fmbell / lead (this commit)
 * and epiano / whistle, i.e. ONE note before the per-note tail (normalise, humanize, gain stay in melody_bar_hits and
 * are not part of this module). Pitch: the host semi IS the midi number (A4 = 69), like piano.ts.
 *
 * Parity fixture: tools/softsynth-fixtures/gen_melody_voices.py.
 */
import { pexp } from '@/engine/dj/scratch/portableMath';
import { hp } from '@/engine/dj/scratch/refDsp';
import { env, fm2op, moogLadder, noise, osc } from '../synthDsp';
import { hzOfSemi } from './bassPluck';
import type { SoftsynthNote, SoftsynthVoice } from '../softsynthVoice';

export type MelodyVoice = 'bell' | 'darkbell' | 'fmbell' | 'lead';

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

/** One melody note of `voice`, before the per-note tail. */
export function renderMelodyVoiceNote(voice: MelodyVoice, semi: number, durS: number, rate: number, seed: number, _prevSemi: number | null = null): Float64Array {
  if (voice === 'lead') return analogLead(semi, durS, rate, 3.0);
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
];
