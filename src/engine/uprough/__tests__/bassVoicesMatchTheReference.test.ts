/**
 * The gfunk / electro / reese / 808 bass voices, per note (hiphop.render_bass_bar's dispatch branch before the per-note
 * tail), against the host. Fixture: tools/softsynth-fixtures/gen_bass_voices.py (every 13th sample, + length + RMS).
 * Tolerance 1e-9 per kept sample.
 */
import { afterAll, describe, expect, it } from 'vitest';
import fixture from './fixtures/bass_voices.json';
import { renderBassVoiceNote } from '../voices/bassSynth';

const TOL = 1e-9;
const worst: Record<string, number> = {};

describe('the synth bass voices match the reference', () => {
  fixture.cases.forEach((c, idx) => {
    it(`${c.voice} #${idx} semi ${c.semi} dur ${c.dur} glide ${c.glide} seed ${c.seed} cut ${c.bcut}`, () => {
      const out = renderBassVoiceNote(c.voice, { semi: c.semi, durS: c.dur, glide: c.glide, seed: c.seed, bcut: c.bcut }, fixture.rate);
      expect(out.length).toBe(c.sig.length);
      let w = 0;
      c.sig.kept.forEach((ref, k) => { w = Math.max(w, Math.abs(out[k * fixture.keep]! - ref)); });
      worst[c.voice] = Math.max(worst[c.voice] ?? 0, w);
      expect(w).toBeLessThanOrEqual(TOL);
      let s = 0; for (const x of out) s += x * x;
      expect(Math.abs(Math.sqrt(s / out.length) - c.sig.rms)).toBeLessThanOrEqual(TOL);
    });
  });
  afterAll(() => { console.log('MAXDIFF ' + JSON.stringify(worst)); });
});
