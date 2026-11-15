/**
 * Richard Joseph: a note on the first blank row after a pattern's last event grows the pattern stream by one byte
 * (richardJosephEdits.ts). Real song: cannon fodder (intro).sng. Reloaded, the note stands on that row and the song
 * has the same number of steps; a row further down the pattern is refused with nothing written.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const NAME = 'cannon fodder (intro).sng';
const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/richard-joseph', NAME)));

async function load(bytes: Uint8Array) {
  const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
  const song = await parseModuleToSong(new File([new Uint8Array(bytes)], NAME));
  const { setGridBaseline, baselineOf } = await import('@/lib/song/gridBaseline');
  setGridBaseline(baselineOf(song.patterns)); // what the load path records: the edits are the cells that differ from it
  return song;
}
async function exportOf(song: Awaited<ReturnType<typeof load>>) {
  const { exportNativeSong } = await import('@lib/export/nativeExportRouter');
  const res = await exportNativeSong(song);
  if (!res) throw new Error('no native export');
  return res;
}

describe('Richard Joseph note on a blank row', () => {
  it('inserts the note byte, grows the file by one, and reloads it on that row', async () => {
    const base = await load(raw);
    const layout = base.uadePatternLayout as unknown as { appendSlot: (p: number, r: number, c: number) => unknown };
    let hit: { p: number; c: number; r: number } | null = null;
    for (let p = 0; p < base.patterns.length && !hit; p++) for (let c = 0; c < 4 && !hit; c++) {
      const rows = base.patterns[p].channels[c].rows;
      for (let r = 1; r < rows.length; r++) if (layout.appendSlot(p, r, c)) { hit = { p, c, r }; break; }
    }
    expect(hit, 'some pattern has a blank row after its last event').not.toBeNull();
    const { p, c, r } = hit!;
    const song = await load(raw);
    song.patterns[p].channels[c].rows[r].note = 30;
    const res = await exportOf(song);
    expect(res.warnings).toEqual([]);
    expect(res.data.length).toBe(raw.length + 1);
    const back = await load(res.data);
    expect(back.patterns.length).toBe(base.patterns.length);
    expect(back.patterns[p].channels[c].rows[r].note).toBe(30);
  }, 120000);

  it('refuses a note two rows past the last event, writing nothing', async () => {
    const base = await load(raw);
    const layout = base.uadePatternLayout as unknown as { appendSlot: (p: number, r: number, c: number) => unknown };
    let hit: { p: number; c: number; r: number } | null = null;
    for (let p = 0; p < base.patterns.length && !hit; p++) for (let c = 0; c < 4 && !hit; c++) {
      const rows = base.patterns[p].channels[c].rows;
      for (let r = 1; r < rows.length - 1; r++) if (layout.appendSlot(p, r, c)) { hit = { p, c, r: r + 1 }; break; }
    }
    expect(hit).not.toBeNull();
    const song = await load(raw);
    song.patterns[hit!.p].channels[hit!.c].rows[hit!.r].note = 30;
    const res = await exportOf(song);
    expect(res.warnings.join('\n')).toMatch(/not written/);
    expect(Array.from(res.data)).toEqual(Array.from(raw));
  }, 120000);
});
