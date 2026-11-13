/**
 * Paul Shields (.ps): the grid is read from the module's order lists and pattern streams (paulShieldsGrid.ts).
 * Unedited export is byte-identical; one edited note moves exactly the stored byte it is played from.
 * Fixture: public/data/songs/paul-shields/jug-hiscore.ps (real module, Long layout). Unverified by ear.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parsePaulShieldsFile } from '../PaulShieldsParser';
import { exportPaulShields } from '@/lib/export/PaulShieldsExporter';
import { encodeVariableBlock } from '@/engine/uade/UADEPatternEncoder';
import { buildPaulShieldsGrid, PAUL_SHIELDS_ROWS_PER_PATTERN } from '../paulShieldsGrid';

const FIXTURE = join(process.cwd(), 'public/data/songs/paul-shields/jug-hiscore.ps');

function load() {
  const b = readFileSync(FIXTURE);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return { raw: new Uint8Array(ab), song: parsePaulShieldsFile(ab, 'jug-hiscore.ps') };
}

describe('Paul Shields pattern-stream grid', () => {
  it('reads the order lists of all four voices into a tick grid', () => {
    const { raw } = load();
    const grid = buildPaulShieldsGrid(raw, 'jug-hiscore.ps')!;
    expect(grid.variant).toBe('old');
    expect(grid.blockRows.length).toBeGreaterThan(0);
    expect(grid.patterns.length).toBe(Math.ceil(grid.ticks / PAUL_SHIELDS_ROWS_PER_PATTERN));
    for (const pl of grid.placements) {
      expect(pl.note).toBeGreaterThanOrEqual(1);
      expect(pl.note).toBeLessThanOrEqual(96);
    }
    // Pattern streams start at the offsets the order lists name, inside the song data behind the header.
    for (const a of grid.filePatternAddrs) expect(a).toBeGreaterThan(0x204);
  });

  it('re-encodes every pattern stream byte-exact and exports the module unchanged', async () => {
    const { raw, song } = load();
    const l = song.uadeVariableLayout!;
    expect(l.formatId).toBe('paulShields');
    expect(song.uadePlayerTickGrid).toBe(true);
    l.filePatternAddrs.forEach((addr, fp) => {
      const re = encodeVariableBlock(l, fp, l.blockRows![fp], fp);
      expect(Array.from(re)).toEqual(Array.from(raw.subarray(addr, addr + l.filePatternSizes[fp])));
    });
    const out = await exportPaulShields(song);
    expect(out.warnings).toEqual([]);
    expect(Array.from(out.data)).toEqual(Array.from(raw));
  });

  it('one changed note changes only the stored byte it is played from', async () => {
    const { raw, song } = load();
    const nb = song.uadeVariableLayout!.noteBytes!;
    const n = nb.find(x => raw[x.offset] < 0xf0 && x.note + 2 <= 96)!;
    expect(n).toBeTruthy();
    song.patterns[n.pattern].channels[n.channel].rows[n.row].note = n.note + 2;
    const out = await exportPaulShields(song);
    expect(out.warnings).toEqual([]);
    const diff: number[] = [];
    out.data.forEach((b, i) => { if (b !== raw[i]) diff.push(i); });
    expect(diff).toEqual([n.offset]);
    expect(out.data[n.offset]).toBe(raw[n.offset] + 2);
  });

  it('an edit on a cell with no note is refused with a warning', async () => {
    const { raw, song } = load();
    const nb = song.uadeVariableLayout!.noteBytes!;
    const used = new Set(nb.map(x => `${x.pattern}:${x.channel}:${x.row}`));
    let row = 0;
    while (used.has(`0:0:${row}`)) row++;
    song.patterns[0].channels[0].rows[row].note = 30;
    const out = await exportPaulShields(song);
    expect(out.warnings.length).toBe(1);
    expect(Array.from(out.data)).toEqual(Array.from(raw));
  });
});
