/**
 * JayTrax (.jxs): every fixture parses and exports byte-identical; one note edit changes exactly the
 * pattern-row bytes it sits on (shared-pattern semantics), nothing else.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parseJxsFile, isJxsFormat } from '@lib/import/formats/JxsParser';
import { decodeJxsModule, jxsPlacement, JXS_ROWS } from '@lib/import/formats/jxsGrid';
import { exportJxs } from '@lib/export/JxsExporter';

const DIR = 'public/data/songs/formats';
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.jxs'));

describe('JayTrax corpus', () => {
  it('has the fetched fixtures', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(5);
  });

  for (const f of FILES) {
    it(`${f}: parses with notes and exports byte-identical`, async () => {
      const raw = new Uint8Array(readFileSync(`${DIR}/${f}`));
      expect(isJxsFormat(raw)).toBe(true);
      const song = parseJxsFile(raw, f)!;
      expect(song).not.toBeNull();
      expect(song.patterns.some((p) => p.channels.some((c) => c.rows.some((r) => r.note > 0)))).toBe(true);
      const out = new Uint8Array(await (await exportJxs(song)).data.arrayBuffer());
      expect(Buffer.from(out).equals(Buffer.from(raw))).toBe(true);
    });
  }

  it('a note edit changes exactly the 5-byte pattern row it sits on', async () => {
    const raw = new Uint8Array(readFileSync(`${DIR}/${FILES[0]}`));
    const m = decodeJxsModule(raw)!;
    const song = parseJxsFile(raw, FILES[0])!;
    let hit: { bar: number; ch: number; row: number } | null = null;
    outer: for (let b = 0; b < song.patterns.length; b++) {
      for (let ch = 0; ch < m.channels; ch++) {
        for (let r = 0; r < JXS_ROWS; r++) {
          if (song.patterns[b].channels[ch].rows[r].note > 0) { hit = { bar: b, ch, row: r }; break outer; }
        }
      }
    }
    expect(hit).not.toBeNull();
    const cell = song.patterns[hit!.bar].channels[hit!.ch].rows[hit!.row];
    const before = cell.note;
    cell.note = before === 100 ? 99 : before + 1;
    const [pat, prow] = jxsPlacement(m, hit!.ch, hit!.bar * JXS_ROWS + hit!.row)!;
    const out = new Uint8Array(await (await exportJxs(song)).data.arrayBuffer());
    expect(out.length).toBe(raw.length);
    const noteByte = m.patternOffset + (pat * 64 + prow) * 5;
    const diff: number[] = [];
    raw.forEach((v, i) => { if (out[i] !== v) diff.push(i); });
    expect(diff).toEqual([noteByte]);
    expect(out[noteByte]).toBe(cell.note);
  });
});
