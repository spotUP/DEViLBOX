/**
 * The melody voices per note (hiphop.melody_voice_note, before the per-note tail) against the host.
 * Fixture: tools/softsynth-fixtures/gen_melody_voices.py (every 13th sample, + length + RMS). Tolerance 1e-9.
 */
import { afterAll, describe, expect, it } from 'vitest';
import fixture from './fixtures/melody_voices.json';
import { renderMelodyVoiceNote, type MelodyVoice } from '../voices/melodyVoices';

const TOL = 1e-9;
const worst: Record<string, number> = {};
const counts: Record<string, number> = {};

describe('the melody voices match the reference', () => {
  fixture.cases.forEach((c, idx) => {
    it(`${c.voice} #${idx} semi ${c.semi} dur ${c.dur} prev ${c.prev} seed ${c.seed} rate ${c.rate}`, () => {
      const out = renderMelodyVoiceNote(c.voice as MelodyVoice, c.semi, c.dur, c.rate, c.seed, c.prev);
      expect(out.length).toBe(c.sig.length);
      let w = 0;
      c.sig.kept.forEach((ref, k) => { w = Math.max(w, Math.abs(out[k * fixture.keep]! - ref)); });
      worst[c.voice] = Math.max(worst[c.voice] ?? 0, w);
      counts[c.voice] = (counts[c.voice] ?? 0) + 1;
      expect(w).toBeLessThanOrEqual(TOL);
      let s = 0; for (const x of out) s += x * x;
      expect(Math.abs(Math.sqrt(s / out.length) - c.sig.rms)).toBeLessThanOrEqual(TOL);
    });
  });
  afterAll(() => { console.log('MAXDIFF ' + JSON.stringify(worst) + ' CASES ' + JSON.stringify(counts)); });
});
