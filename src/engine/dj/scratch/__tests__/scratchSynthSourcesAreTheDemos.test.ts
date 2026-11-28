/**
 * R6 / R12: the demo's synthesized sources (scratch.build_sources) and routine word cues
 * (scratch_routine.build_cue_sources) are baked by tools/scratch-fixtures/gen_synth_sources.py.
 * The public WAVs read back through demoRecordPcm must be the demo's samples, and the catalogue must
 * resolve each one with the demo's anchor and safe range.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { demoRecordPcm } from '../scratchGrit';
import { getScratchRecord, isSynthRecord, synthWordRecordId } from '../scratchCatalogue';
import meta from '../synthSources.json';
import check from './fixtures/synth_sources.json';

const BASE = resolve(process.cwd(), 'public/data/samples/packs/scratch-originals');
const read = (file: string) => {
  const b = readFileSync(resolve(BASE, file));
  return demoRecordPcm(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 22050, { grit: false });
};

describe('synthesized scratch sources are the demo renders', () => {
  const cases: Array<[string, string, { file: string; n: number; anchor: number; safe: number[] }, number[]]> = [
    ...Object.entries(meta.sources).map(([n, c]) => [n, n, c, (check.sources as Record<string, number[]>)[n]!] as [string, string, typeof c, number[]]),
    ...Object.entries(meta.words).map(([w, c]) => [w, synthWordRecordId(w), c, (check.words as Record<string, number[]>)[w]!] as [string, string, typeof c, number[]]),
  ];
  it('bakes 7 sources and 7 word cues', () => {
    expect(Object.keys(meta.sources).sort()).toEqual(['horn', 'noise', 'robot', 'snare', 'vocal_ah', 'vocal_fresh', 'vocal_yeah']);
    expect(Object.keys(meta.words).sort()).toEqual(['BEAT', 'FUNKY', 'IF', 'PHRASE', 'REALLY', 'ROCK', 'YOU']);
  });
  it.each(cases)('%s reads back sample for sample', (_n, _id, c, want) => {
    const pcm = read(c.file);
    expect(pcm.length).toBe(c.n);
    let worst = 0;
    want.forEach((v, i) => { worst = Math.max(worst, Math.abs(pcm[i * check.idx_step]! - v)); });
    expect(worst).toBeLessThan(1e-6);
  });
  it.each(cases)('%s resolves in the catalogue with the demo anchor and safe range', (_n, id, c) => {
    const r = getScratchRecord(id);
    expect(r).toBeDefined();
    expect(isSynthRecord(id)).toBe(true);
    expect(r!.demoCue.anchor).toBe(c.anchor);
    expect(r!.demoCue.safe).toEqual(c.safe);
    expect(r!.durationSec).toBeCloseTo(c.n / 22050, 9);
  });
});
