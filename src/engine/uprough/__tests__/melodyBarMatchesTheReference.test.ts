/**
 * Whole melody bars (hiphop.render_melody_bar: voice dispatch, per-note tail, bar sum) against the host.
 * Fixture: tools/softsynth-fixtures/gen_melody_bar.py (every 13th sample, + length + RMS). Tolerance 1e-9 per kept sample.
 */
import { afterAll, describe, expect, it } from 'vitest';
import fixture from './fixtures/melody_bar.json';
import { renderMelodyBar } from '../voices/melodyBar';

const TOL = 1e-9;
const worst: Record<string, number> = {};

describe('the melody bar matches the reference', () => {
  fixture.cases.forEach((c, idx) => {
    it(`${c.voice} #${idx} seed ${c.seed} chord root ${c.chordRoot}`, () => {
      const notes = c.notes.map(([semi, step, durSteps]) => ({ semi: semi!, step: step!, durSteps: durSteps! }));
      const out = renderMelodyBar(c.voice, notes, { bpm: c.bpm, seed: c.seed }, fixture.rate);
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
