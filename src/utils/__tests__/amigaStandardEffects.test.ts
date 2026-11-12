import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { AMIGA_STANDARD_DOC, AMIGA_STANDARD_ROWS, AMIGA_STANDARD_TOPIC } from '../../../server/src/ai/amigaStandardEffects';

const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

/** Same extraction rule as the one that produced the table: literal effTyp / effTyp2 numbers 1..35. */
function literalIds(src: string): Set<number> {
  const ids = new Set<number>();
  for (const m of src.matchAll(/\beffTyp2?\s*[:=]\s*(0x[0-9A-Fa-f]+|\d+)(?![\w.(])/g)) {
    const n = Number(m[1]);
    if (n > 0 && n < 36) ids.add(n);
  }
  return ids;
}

describe('amiga standard-effect help topic', () => {
  it('covers 46 formats and every parser file exists', () => {
    expect(AMIGA_STANDARD_ROWS).toHaveLength(46);
    for (const r of AMIGA_STANDARD_ROWS) {
      expect(r.parsers.length).toBeGreaterThan(0);
      for (const p of r.parsers) expect(existsSync(resolve(root, 'src/lib/import/formats', p))).toBe(true);
    }
  });
  it('every listed id is still written by its parser, and no literal id is missing', () => {
    for (const r of AMIGA_STANDARD_ROWS) {
      const found = new Set<number>();
      for (const p of r.parsers) for (const n of literalIds(read(`src/lib/import/formats/${p}`))) found.add(n);
      expect([...found].sort((a, b) => a - b), r.formatId).toEqual([...r.ids]);
    }
  });
  it('names a standard effect from the editor table', () => {
    expect(AMIGA_STANDARD_DOC).toContain('effTyp 15 (F');
    expect(AMIGA_STANDARD_DOC).toContain('Speed');
  });
  it('docs file equals the single source, and both servers serve the topic', () => {
    expect(read('docs/formats/amiga-standard-effects.md')).toBe(AMIGA_STANDARD_DOC);
    expect(read('server/src/mcp/mcpServer.ts')).toContain('AMIGA_STANDARD_DOC');
    expect(read('server/src/ai/freeToolset.ts')).toContain('AMIGA_STANDARD_DOC');
    expect(AMIGA_STANDARD_TOPIC).toBe('amiga-standard-effects');
  });
});
