/**
 * Whole bass bars (hiphop.render_bass_bar: per-note tail, groove offset, tube + tape_sat bar tail) against the host.
 * Fixture: tools/softsynth-fixtures/gen_bass_bar.py (every 13th sample, + length + RMS). Tolerance 1e-9 per kept sample.
 */
import { afterAll, describe, expect, it } from 'vitest';
import fixture from './fixtures/bass_bar.json';
import { renderBassBar } from '../voices/bassBar';

const TOL = 1e-9;
const worst: Record<string, number> = {};

describe('the bass bar matches the reference', () => {
  fixture.cases.forEach((c, idx) => {
    it(`${c.style} (${c.voice}) #${idx} bpm ${c.bpm} seed ${c.seed}`, () => {
      const events = c.events.map(([semi, step, durSteps, glide, vel]) => ({ semi: semi!, step: step!, durSteps: durSteps!, glide, vel: vel! }));
      const out = renderBassBar(c.voice, events, { bpm: c.bpm, seed: c.seed, bcut: c.bcut, groove: c.groove }, fixture.rate);
      expect(out.length).toBe(c.sig.length);
      let w = 0;
      c.sig.kept.forEach((ref, k) => { w = Math.max(w, Math.abs(out[k * fixture.keep]! - ref)); });
      worst[c.style] = Math.max(worst[c.style] ?? 0, w);
      expect(w).toBeLessThanOrEqual(TOL);
      let s = 0; for (const x of out) s += x * x;
      expect(Math.abs(Math.sqrt(s / out.length) - c.sig.rms)).toBeLessThanOrEqual(TOL);
    });
  });
  afterAll(() => { console.log('MAXDIFF ' + JSON.stringify(worst)); });
});
