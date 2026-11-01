import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseMonotoneFile } from '@lib/import/formats/MonotoneParser';
import { monWordIndex, decodeMonotoneModule } from '@lib/import/formats/monotoneGrid';
import { exportMonotone } from '../MonotoneExporter';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(resolve(__dirname, '../../import/__tests__/fixtures/monotone', name)));

describe('exportMonotone', () => {
  it('exports an unedited song byte-identical', async () => {
    const bytes = fixture('PRELUDE.MON');
    const song = parseMonotoneFile(bytes, 'PRELUDE.MON')!;
    const out = new Uint8Array(await (await exportMonotone(song)).data.arrayBuffer());
    expect(Array.from(out)).toEqual(Array.from(bytes));
  });

  it('changes exactly the one word of an edited cell', async () => {
    const bytes = fixture('PRELUDE.MON');
    const song = parseMonotoneFile(bytes, 'PRELUDE.MON')!;
    const before = decodeMonotoneModule(bytes)!;
    // Pattern 0, row 5, track 1: set grid note 50 (file note 41), no effect.
    song.patterns[0].channels[1].rows[5] = { ...song.patterns[0].channels[1].rows[5], note: 50, effTyp: 0, eff: 0 };
    const out = new Uint8Array(await (await exportMonotone(song)).data.arrayBuffer());
    const after = decodeMonotoneModule(out)!;
    const at = monWordIndex(before, 0, 5, 1);
    expect(after.words[at]).toBe(41 << 9);
    const differing = after.words.reduce((n, w, i) => n + (w !== before.words[i] ? 1 : 0), 0);
    expect(differing).toBe(at < 0 ? 0 : before.words[at] === (41 << 9) ? 0 : 1);
    expect(out.length).toBe(bytes.length);
    expect(Array.from(out.slice(0, 351)).join()).toBe(Array.from(bytes.slice(0, 351)).join());
  });
});
