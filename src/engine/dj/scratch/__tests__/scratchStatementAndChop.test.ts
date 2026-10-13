/**
 * C16: STATEMENT AND CHOP (Up Rough `three_deck.build_scratch_events(phrase_emphasis=True)`,
 * `scratch_dj.cues_with_word_emphasis`, `scratch_bank.word_source`). A crate narrowed to one spoken phrase throws
 * the whole phrase clean (HOME, drop_phrase, from its first sample) and chops its last word (ACCENT) for the rest
 * of each phrase. Fixture `fixtures/statement_and_chop.json` from `tools/scratch-fixtures/gen_statement_and_chop.py`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fixture from './fixtures/statement_and_chop.json';
import { buildThreeDeckRoutine, demoRoutineRenderSpecs } from '../scratchDemoRoutines';
import { getScratchRecord, lastWordSlice, wordEmphasisRecord, type CueRole } from '../scratchCatalogue';
import { REFERENCE_GESTURE_IDS, getGesture } from '../scratchGestureCatalog';
import { ScratchVoicePool } from '../scratchVoicePool';
import type { ScratchGestureId } from '../scratchTypes';

const F = fixture as unknown as {
  record: string; bpm: number; rate: number; keep: number; events: Record<string, Array<[number, number, CueRole, string, number]>>;
  homeAnchor: number; wordName: string; wordAnchor: number; wordLen: number;
  strokes: Array<{ role: CueRole; gesture: string; velocity: number; seed: number; n: number; out: number[] }>;
};
const gid = (ref: string): ScratchGestureId => (ref === 'needle_drop' ? 'needleDrop' : ref === 'needle_lift' ? 'needleLift' : REFERENCE_GESTURE_IDS[ref]!);
const one = { HOME: [F.record], SECONDARY: [F.record], ACCENT: [F.record], FX: [F.record] };

function residualDb(ref: readonly number[], x: ArrayLike<number>, keep: number): number {
  let e = 0, r = 0;
  for (let i = 0; i < ref.length; i++) { const d = ref[i]! - (x[i * keep] ?? 0); e += d * d; r += ref[i]! * ref[i]!; }
  return 10 * Math.log10(e / (r + 1e-300) + 1e-300);
}

describe('statement and chop is the demo\'s (C16)', () => {
  it('build_scratch_events(phrase_emphasis=True): every event of seeds 0, 7, 42 = the demo; the phrase slots throw the statement, the word slots chop', () => {
    for (const [seed, rows] of Object.entries(F.events)) {
      const mine = buildThreeDeckRoutine(Number(seed), { pools: one, phraseEmphasis: true });
      expect(mine.map((e) => [e.bar, e.step, e.cueRole, e.gesture])).toEqual(rows.map(([b, s, r, g]) => [b, s, r, gid(g)]));
      mine.forEach((e, i) => expect(e.velocity).toBeCloseTo(rows[i]![4], 12));
      for (const e of mine.filter((x) => x.gesture !== 'needleDrop' && x.gesture !== 'needleLift')) {
        expect(e.record).toBe(F.record);
        expect(e.slice).toBe(e.cueRole === 'HOME' || e.cueRole === 'SECONDARY' ? 'phrase' : 'word');
      }
      expect(mine.some((e) => e.gesture === 'dropPhrase')).toBe(true);
    }
  });

  it('cues_with_word_emphasis: only a crate of ONE record with word slices; its last word re-based (word_source)', () => {
    expect(wordEmphasisRecord([F.record])).toBe(F.record);
    expect(wordEmphasisRecord([F.record, 'AH_YEAH'])).toBeNull();
    expect(wordEmphasisRecord(['AH_YEAH'])).toBeNull();
    const w = lastWordSlice(getScratchRecord(F.record)!)!;
    expect(w.end - w.start).toBe(F.wordLen);
    expect(w.vowel).toBe(F.wordAnchor);
    expect(F.homeAnchor).toBe(0);
  });

  it('the strokes on those cues (render_gesture, three_deck step, boom-bap deck): the statement from sample 0 and the chopped word within -200 dB', async () => {
    const rec = getScratchRecord(F.record)!;
    const bytes = async () => { const b = readFileSync(join(process.cwd(), 'public', 'data', 'samples', 'packs', 'scratch-originals', rec.file)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
    const pool = new ScratchVoicePool({} as BaseAudioContext, {} as AudioNode, { bytes });
    for (const s of F.strokes) {
      const out = await pool.renderStroke(getGesture(gid(s.gesture)), rec, { seed: s.seed, humanizeSamples: 0, chain: 'threeDeck', slice: s.role === 'HOME' ? 'phrase' : 'word' }, F.bpm, s.velocity);
      expect(out!.length, s.gesture).toBe(s.n);
      expect(residualDb(s.out, out!, F.keep), s.gesture).toBeLessThan(-200);
    }
  });

  it('the render specs carry the slice to the pool', () => {
    const ev = buildThreeDeckRoutine(7, { pools: one, phraseEmphasis: true });
    const specs = demoRoutineRenderSpecs(ev, 7, 'threeDeck');
    ev.forEach((e, i) => expect(specs[i]!.slice).toBe(e.slice));
  });
});
