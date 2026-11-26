/**
 * Beathoven Synthesizer: volume and note off edits have no byte to land in (volume sits in the shared instrument record;
 * no gate command). They are refused with that reason and the file stays byte-identical.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildBthGrid, type BthGrid } from '@lib/import/formats/beathovenGrid';
import { applyBeathovenGridEdits } from '@lib/import/formats/beathovenEdits';

describe.each(['beathoven_smallest.bss', 'tristar_cracktro.bss'])('Beathoven %s refusals', (name) => {
  const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/beathoven-synthesizer', name)));
  const find = (g: BthGrid): [number, number, number] => {
    for (let p = 0; p < g.patterns.length; p++) for (let c = 0; c < g.patterns[p].channels.length; c++) {
      const r = g.patterns[p].channels[c].rows.findIndex((x) => x.note > 0 && x.note < 97);
      if (r >= 0) return [p, c, r];
    }
    throw new Error('no note');
  };
  it.each([['volume', /instrument record/], ['note off', /no gate or release/]] as const)('%s', (kind, re) => {
    const g = buildBthGrid(raw) as BthGrid;
    const patterns = structuredClone(g.patterns);
    const [p, c, r] = find(g);
    if (kind === 'volume') patterns[p].channels[c].rows[r].volume = 0x30; else patterns[p].channels[c].rows[r].note = 97;
    const res = applyBeathovenGridEdits(raw, patterns);
    expect(res.warnings.some((w) => re.test(w))).toBe(true);
    expect(Buffer.from(res.data).equals(Buffer.from(raw))).toBe(true);
  });
});
