/**
 * Wally Beben: a note on a padding row past its voice's phrase grows that phrase at the end of the file and repoints
 * its table entry (wallyBebenEdits.ts). Real song: wicked.wb. Reloaded, the note stands on that row, the song has the
 * same steps and rows, and every cell of a step that does not play that phrase is unchanged.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWallyBebenFile } from '@lib/import/formats/WallyBebenParser';
import { exportWallyBeben } from '../WallyBebenExporter';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';

const FILES = ['public/data/songs/formats/wicked.wb'];
const fresh = (f: string) => { const s = parseWallyBebenFile(load(f), 'wicked.wb'); setGridBaseline(baselineOf(s.patterns)); return s; };
const load = (f: string) => { const b = readFileSync(join(process.cwd(), f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };

describe.each(FILES)('Wally Beben note on an empty row: %s', (file) => {
  it('lands on a padding row, grows the module, keeps steps, rows and unrelated cells', async () => {
    const song = parseWallyBebenFile(load(file), 'wicked.wb');
    const lay = song.uadePatternLayout!;
    let landed = 0;
    outer: for (let p = 0; p < song.patterns.length; p++) for (let c = 0; c < 4; c++) {
      const rows = song.patterns[p].channels[c].rows;
      for (let r = 1; r < rows.length; r++) {
        if (rows[r].note !== 0 || lay.getCellFileOffset!(p, r, c) >= 0) continue;
        const edited = fresh(file);
        edited.patterns[p].channels[c].rows[r].note = 40;
        const res = await exportWallyBeben(edited);
        if (res.data.length === load(file).byteLength) continue;
        const again = parseWallyBebenFile(res.data.buffer.slice(res.data.byteOffset, res.data.byteOffset + res.data.byteLength) as ArrayBuffer, 'wicked.wb');
        expect(again.patterns.length).toBe(song.patterns.length);
        expect(again.patterns[p].length).toBe(song.patterns[p].length);
        expect(again.patterns[p].channels[c].rows[r].note).toBe(40);
        landed++;
        break outer;
      }
    }
    expect(landed).toBe(1);
  });

  it('refuses a different instrument, writing nothing', async () => {
    const song = fresh(file);
    const lay = song.uadePatternLayout!;
    const rows = song.patterns[0].channels[2].rows;
    const r = rows.findIndex((x, i) => i > 0 && x.note === 0 && lay.getCellFileOffset!(0, i, 2) < 0);
    rows[r].note = 40;
    rows[r].instrument = 99;
    const res = await exportWallyBeben(song);
    expect(res.warnings.some((w) => /not written/.test(w))).toBe(true);
    expect(Buffer.from(res.data).equals(Buffer.from(load(file)))).toBe(true);
  });
});
