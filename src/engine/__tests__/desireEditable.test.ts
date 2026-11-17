import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDesireFile } from '@/lib/import/formats/DesireParser';

const path = 'public/data/songs/desire/batmanreturns.dsr';
const load = () => { const b = readFileSync(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };

const run = async (edit: boolean) => {
  const { exportDesire } = await import('@/lib/export/DesireExporter');
  const song = parseDesireFile(load(), 'batmanreturns.dsr');
  const g = await import('@/lib/song/gridBaseline');
  g.setGridBaseline(g.baselineOf(song.patterns), g.extraBaselineOf(song.patterns));
  let off = -1;
  let note = 0;
  if (edit) {
    outer: for (let p = 0; p < song.patterns.length; p++) for (let c = 0; c < 4; c++) {
      const r = song.patterns[p].channels[c].rows.findIndex((x) => x.note > 0);
      if (r >= 0) {
        off = song.uadePatternLayout!.getCellFileOffset!(p, r, c);
        note = song.patterns[p].channels[c].rows[r].note + 1;
        song.patterns[p].channels[c].rows[r] = { ...song.patterns[p].channels[c].rows[r], note };
        break outer;
      }
    }
  }
  return { out: (await exportDesire(song)).data, off, note };
};

describe('Desire editable grid', () => {
  it('decodes the four voices of the first audible song into notes', () => {
    const song = parseDesireFile(load(), 'batmanreturns.dsr');
    expect(song.uadePatternLayout!.getCellFileOffset).toBeDefined();
    const notes = song.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows.filter((r) => r.note > 0)));
    expect(notes.length).toBeGreaterThan(20);
    expect(song.patterns[0].channels.every((c) => c.rows.some((r) => r.note > 0))).toBe(true);
  });

  it('unedited export equals the original bytes', async () => {
    const { out } = await run(false);
    expect(Buffer.from(out).equals(Buffer.from(load()))).toBe(true);
  });

  it('a note edit changes exactly that byte and re-parses to the new note', async () => {
    const { out, off, note } = await run(true);
    const orig = new Uint8Array(load());
    const diff = [...out].map((v, i) => (v !== orig[i] ? i : -1)).filter((i) => i >= 0);
    expect(diff).toEqual([off]);
    const again = parseDesireFile(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer, 'batmanreturns.dsr');
    const all = again.patterns.flatMap((p, pi) => p.channels.flatMap((c, ci) => c.rows.map((r, ri) => ({ r, o: again.uadePatternLayout!.getCellFileOffset!(pi, ri, ci) }))));
    expect(all.find((x) => x.o === off)!.r.note).toBe(note);
  });
});
