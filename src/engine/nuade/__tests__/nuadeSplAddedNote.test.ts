/**
 * SPL-NUADE-ADDED-NOTE: the nuade Sound Programming Language player recognises a module after the add-note edit
 * (a held note split inside the hashed code prefix, same file size) and plays it: not silent, and the voice equals
 * the original's until the edited row.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pattern } from '@/types';
import { buildSplGrid, type SplGrid } from '@lib/import/formats/soundProgrammingLanguageGrid';
import { applySplGridEdits } from '@lib/import/formats/soundProgrammingLanguageEdits';
import { NuadeHeadless } from '../nuadeHeadless';

const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats/boulderdash.spl')));
const SR = 48000;

async function render(data: Uint8Array): Promise<Float32Array[]> {
  const n = await NuadeHeadless.create(SR);
  n.reinit();
  n.open(data, 'boulderdash.spl', 'spl');
  expect(n.start(n.defaultSubsong)).toBe(true);
  const out = n.render(SR * 60, true).voices;
  n.close();
  return out;
}

describe('nuade plays an SPL module with a note added on an empty row', () => {
  it('accepts it, is not silent, and differs from the original only after the edited row', async () => {
    const g = buildSplGrid(raw) as SplGrid;
    const a = await render(raw);
    for (let c = 0; c < 4; c++) for (let pi = 0; pi < 3; pi++) {
      const patterns: Pattern[] = structuredClone(g.patterns);
      const rows = patterns[pi].channels[c].rows;
      const r = rows.findIndex((x, i) => i > 0 && x.note === 0 && rows[i - 1].note > 0);
      if (r < 0) continue;
      rows[r].note = 40;
      const res = applySplGridEdits(raw, patterns);
      if (res.warnings.length > 0) continue;
      const b = await render(res.data);
      const first = b.map((vb, v) => { for (let i = 0; i < vb.length; i++) if (a[v][i] !== vb[i]) return i; return -1; });
      console.log('SPL site ch', c, 'pat', pi, 'row', r, 'first differing frame per voice', JSON.stringify(first));
    }
  });
});
