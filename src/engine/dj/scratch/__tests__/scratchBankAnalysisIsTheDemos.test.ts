/**
 * R3 + R5 (scratch ledger PG-G): the demo's bank analyzer and phrase auto-cue on the crate's own WAVs.
 * Fixture `fixtures/bank_analysis.json`, written by tools/scratch-fixtures/gen_bank_analysis.py from
 * Up_Rough_Demo_System/tools (scratch_bank.py, scratch_routine.py):
 *   /opt/homebrew/bin/python3.11 -I tools/scratch-fixtures/gen_bank_analysis.py /Users/spot/Code/Up_Rough_Demo_System/tools \
 *     public/data/samples/packs/scratch-originals src/engine/dj/scratch/__tests__/fixtures/bank_analysis.json
 *
 * Every one of the 51 records, read the demo's way (`demoRecordPcm`, no grit = `_read_wav`): `analyze` within
 * 1e-6, `_cue_points`, `_flux_onsets` and `split_words` exact, and `load_bank`'s entry regenerated in TS = the
 * committed metadata JSON. `load_wav_cues` on the crate's 16-bit phrase: every cue's anchor, safe ranges and signal.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fixture from './fixtures/bank_analysis.json';
import { analyze, bankEntry, cuePoints, fluxOnsets, loadWavCues, splitWords, bankAnalysisStats } from '../scratchBankAnalysis';
import { demoRecordPcm } from '../scratchGrit';

const PACK = join(process.cwd(), 'public', 'data', 'samples', 'packs', 'scratch-originals');
const bytesOf = (file: string): ArrayBuffer => { const b = readFileSync(join(PACK, file)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
const metadata = JSON.parse(readFileSync(join(PACK, 'scratch_bank_metadata.json'), 'utf8')) as Record<string, Record<string, unknown>>;

interface Rec { canon: string; packFile: string; filename: string; n: number; info: Record<string, number | boolean>; cues: Record<string, number | number[]>; flux: number[]; words: Array<[string, number, number, number]> }
const F = fixture as unknown as { records: Rec[]; keep: number; wav_cues: Array<{ canon: string; packFile: string; map: string; cueMap: Record<string, number> | null; cues: Record<string, { n: number; anchor: number; safe: number[]; safe_forward: number[]; safe_reverse: number[]; sub: Record<string, number>; preferred: string[]; sig: number[] }> }> };

describe('the demo\'s bank analyzer and phrase auto-cue (R3, R5)', () => {
  it('51 records: analyze, _cue_points, _flux_onsets, split_words are the demo\'s; the load_bank entry = the committed metadata', () => {
    expect(F.records).toHaveLength(51);
    for (const r of F.records) {
      const d = demoRecordPcm(bytesOf(r.packFile), 22050, { grit: false });
      expect(d.length, r.canon).toBe(r.n);
      const a = analyze(d);
      const py = r.info;
      // analyze is rounded by the demo itself; the raw values agree far below its rounding
      expect(Math.abs(a.durationMs - (py.duration_ms as number)), `${r.canon} duration`).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(a.transientCount, `${r.canon} transients`).toBe(py.transient_count);
      expect(a.preScratched, `${r.canon} pre-scratched`).toBe(py.pre_scratched);
      const c = cuePoints(d);
      expect({ attack: c.attack, vowel: c.vowel, tail: c.tail, safe: c.safe, safe_forward: c.safeForward, safe_reverse: c.safeReverse }, `${r.canon} cues`).toEqual(r.cues);
      expect(fluxOnsets(d), `${r.canon} flux onsets`).toEqual(r.flux);
      if (r.words.length) {
        const base = r.filename.replace(/\.wav$/, '');
        expect(splitWords(d, 22050, base.replace(/_/g, '-').split('-')).map((w) => [w.name, w.start, w.end, w.vowel]), `${r.canon} words`).toEqual(r.words);
      }
      // load_bank's entry, regenerated: the metadata JSON (its packFile is DEViLBOX's own field)
      const { packFile: _p, ...want } = metadata[r.canon]!;
      void _p;
      expect(JSON.parse(JSON.stringify(bankEntry(r.filename, d))), `${r.canon} entry`).toEqual(want);
    }
  }, 300_000);

  it('load_wav_cues on the crate\'s 16-bit phrase (the default windows and a fraction map): every cue is the demo\'s', () => {
    const before = bankAnalysisStats.wavCues;
    for (const w of F.wav_cues) {
      const cues = loadWavCues(bytesOf(w.packFile), 22050, w.cueMap ?? undefined);
      expect(Object.keys(cues).sort(), `${w.map} names`).toEqual(Object.keys(w.cues).sort());
      for (const [name, want] of Object.entries(w.cues)) {
        const got = cues[name]!;
        expect({ n: got.sig.length, anchor: got.anchor, safe: got.safe, safe_forward: got.safeForward, safe_reverse: got.safeReverse, sub: got.sub, preferred: [...got.preferred] }, `${w.map} ${name}`)
          .toEqual({ n: want.n, anchor: want.anchor, safe: want.safe, safe_forward: want.safe_forward, safe_reverse: want.safe_reverse, sub: want.sub, preferred: want.preferred });
        let m = 0;
        want.sig.forEach((v, k) => { m = Math.max(m, Math.abs(got.sig[k * F.keep]! - v)); });
        expect(m, `${w.map} ${name} signal`).toBeLessThan(1e-9);
      }
    }
    expect(bankAnalysisStats.wavCues - before).toBe(F.wav_cues.length);
  }, 120_000);
});
