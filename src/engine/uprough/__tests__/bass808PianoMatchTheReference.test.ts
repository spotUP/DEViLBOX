/**
 * The 808 bass and piano voices against the Up Rough reference (trap808.render_808_note, synth_factory.piano).
 * Fixture: tools/softsynth-fixtures/gen_bass808_piano.py (every 13th sample, float64, + length + RMS).
 *
 * Tolerance 1e-9 per kept sample. Not bit-exact only because V8's Math.sin/exp/tanh/asin differ from numpy's
 * libm in the last ulps, and the Butterworth/one-pole recursions carry that forward.
 */
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/bass808_piano.json';
import { bass808Voice, render808Sequence } from '../voices/bass808';
import { pianoVoice } from '../voices/piano';
import { voiceDefaults, type SoftsynthVoice } from '../softsynthVoice';

const TOL = 1e-9;
const voices: Record<string, SoftsynthVoice> = { bass808: bass808Voice, piano: pianoVoice };

interface Case {
  voice: string; params: Record<string, number>; midi: number; durSec: number; velocity: number; seed: number;
  sig: { length: number; rms: number; kept: number[] };
}

describe('bass808 + piano match the reference', () => {
  (fixture.cases as Case[]).forEach((c, i) => {
    it(`${c.voice} #${i} midi ${c.midi} ${c.durSec}s ${Object.keys(c.params).length ? 'custom' : 'defaults'}`, () => {
      const v = voices[c.voice]!;
      const out = v.render({ ...voiceDefaults(v), ...c.params }, { midi: c.midi, durSec: c.durSec, velocity: c.velocity }, fixture.rate, c.seed);
      expect(out.length).toBe(c.sig.length);
      let worst = 0;
      c.sig.kept.forEach((ref, k) => { worst = Math.max(worst, Math.abs(out[k * fixture.keep]! - ref)); });
      expect(worst).toBeLessThanOrEqual(TOL);
      let s = 0; for (const x of out) s += x * x;
      expect(Math.abs(Math.sqrt(s / out.length) - c.sig.rms)).toBeLessThanOrEqual(TOL);
    });
  });

  (fixture.sequences as { events: [number, number, number, boolean][]; profile: Record<string, number>; seed: number; sig: Case['sig'] }[]).forEach((c, i) => {
    it(`render808Sequence #${i} (mono law, choke, slides)`, () => {
      const out = render808Sequence(c.events.map(([startS, durS, semi, slide]) => ({ startS, durS, semi, slide })), c.profile, fixture.rate, c.seed);
      expect(out.length).toBe(c.sig.length);
      let worst = 0;
      c.sig.kept.forEach((ref, k) => { worst = Math.max(worst, Math.abs(out[k * fixture.keep]! - ref)); });
      expect(worst).toBeLessThanOrEqual(TOL);
    });
  });
});
