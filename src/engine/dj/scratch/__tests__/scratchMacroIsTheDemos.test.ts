/**
 * G11: the demo's scratch macro language (Up Rough `tools/scratch.py` `parse_macro` / `render_macro`, crossfader
 * s.40). Fixture `fixtures/scratch_macro.json` from `tools/scratch-fixtures/gen_scratch_macro.py`: five scripts on
 * the AH_YEAH record as the demo's bank reads it - the ANCHOR, FADER_OPEN / FADER_CLOSE windows, the CUT's
 * transform pattern, lower-case ops, blank lines, Python's int / float rules (`1_0`, `x`, `0.5` as a count) and
 * the skipped lines, an empty script - each parsed and rendered the demo's way.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fixture from './fixtures/scratch_macro.json';
import { parseMacro, renderMacro, scratchMacroStats } from '../scratchRender';
import { demoRecordPcm } from '../scratchGrit';
import { getScratchRecord } from '../scratchCatalogue';

interface MacroCase { text: string; tempo: number; velocity: number; segs: Array<[number, number, boolean]>; cut: [number, number] | null; anchor: number; errors: string[]; stepS: number; n: number; out: number[] }
const F = fixture as unknown as { rate: number; keep: number; record: string; cases: MacroCase[] };

function source() {
  const rec = getScratchRecord(F.record)!;
  const b = readFileSync(join(process.cwd(), 'public', 'data', 'samples', 'packs', 'scratch-originals', rec.file));
  return { sig: demoRecordPcm(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)), anchor: rec.demoCue.anchor, safe: rec.demoCue.safe };
}

function residualDb(ref: readonly number[], x: ArrayLike<number>, keep: number): number {
  let e = 0, r = 0;
  for (let i = 0; i < ref.length; i++) { const d = ref[i]! - (x[i * keep] ?? 0); e += d * d; r += ref[i]! * ref[i]!; }
  return 10 * Math.log10(e / (r + 1e-300) + 1e-300);
}

describe('the scratch macro is the demo\'s (G11)', () => {
  const src = source();

  it.each(F.cases.map((c, i) => [i, c] as const))('script %i: parse_macro - segments, cut, anchor, skipped lines', (_i, c) => {
    const p = parseMacro(c.text, c.tempo, src.anchor, F.rate);
    expect(p.errors).toEqual(c.errors);
    expect(p.anchor).toBe(c.anchor);
    expect(p.cut).toEqual(c.cut);
    expect(p.stepS).toBe(c.stepS);
    expect(p.segs.length).toBe(c.segs.length);
    p.segs.forEach((s, k) => { expect(s[0]).toBeCloseTo(c.segs[k]![0], 12); expect(s[1]).toBeCloseTo(c.segs[k]![1], 9); expect(s[2]).toBe(c.segs[k]![2]); });
  });

  it.each(F.cases.map((c, i) => [i, c] as const))('script %i: render_macro on the record within -200 dB', (_i, c) => {
    const before = scratchMacroStats.rendered;
    const y = renderMacro(src, c.text, F.rate, { tempo: c.tempo, velocity: c.velocity });
    expect(scratchMacroStats.rendered - before).toBe(1);
    expect(y.length).toBe(c.n);
    expect(residualDb(c.out, y, F.keep)).toBeLessThan(-200);
  });
});
