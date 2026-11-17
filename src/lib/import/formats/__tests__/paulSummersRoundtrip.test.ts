/**
 * Paul Summers (.snk): the grid is read from the voice command streams of subsong 1 (paulSummersGrid.ts).
 * Real song: everton_fc_-_jingles.snk.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parsePaulSummersFile, isPaulSummersFormat } from '../PaulSummersParser';
import { exportPaulSummers } from '@/lib/export/PaulSummersExporter';
import { encodeVariableBlock } from '@/engine/uade/UADEPatternEncoder';
import { buildPaulSummersGrid, PAUL_SUMMERS_ROWS_PER_PATTERN } from '../paulSummersGrid';

const FIXTURE = resolve(__dirname, '../../../../../public/data/songs/formats/everton_fc_-_jingles.snk');

function load() {
  const b = readFileSync(FIXTURE);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return { raw: new Uint8Array(ab), song: parsePaulSummersFile(ab, 'everton_fc_-_jingles.snk') };
}

describe('Paul Summers command-stream grid', () => {
  it('detects the real module and rejects junk', () => {
    expect(isPaulSummersFormat(load().raw)).toBe(true);
    expect(isPaulSummersFormat(new Uint8Array(4096))).toBe(false);
  });

  it('shows real notes on the tick grid', () => {
    const { raw } = load();
    const grid = buildPaulSummersGrid(raw, 'x.snk')!;
    expect(grid.placements.length).toBeGreaterThan(20);
    expect(grid.patterns.length).toBe(Math.ceil(grid.ticks / PAUL_SUMMERS_ROWS_PER_PATTERN));
    for (const pl of grid.placements) {
      expect(pl.note).toBeGreaterThanOrEqual(1);
      expect(pl.note).toBeLessThanOrEqual(96);
    }
    // Every placement is a note on the grid.
    const notes = grid.patterns.reduce((n, p) => n + p.channels.reduce((m, c) => m + c.rows.filter(r => r.note > 0).length, 0), 0);
    expect(notes).toBe(grid.placements.length);
    // The first voice plays the C-2 .. B-3 band the period table spans (36 = C-3 and 42 = F#-3 in this jingle).
    expect(grid.placements[0].note).toBe(36);
  });

  it('re-encodes every stream byte-exact and exports the module unchanged', async () => {
    const { raw, song } = load();
    const l = song.uadeVariableLayout!;
    expect(l.formatId).toBe('paulSummers');
    expect(song.uadePlayerTickGrid).toBe(true);
    l.filePatternAddrs.forEach((addr, fp) => {
      const re = encodeVariableBlock(l, fp, l.blockRows![fp], fp);
      expect(Array.from(re)).toEqual(Array.from(raw.subarray(addr, addr + l.filePatternSizes[fp])));
    });
    const out = await exportPaulSummers(song);
    expect(out.warnings).toEqual([]);
    expect(Array.from(out.data)).toEqual(Array.from(raw));
  });

  it('one changed note changes only the stored byte it is played from', async () => {
    const { raw, song } = load();
    const nb = song.uadeVariableLayout!.noteBytes!;
    let hit = 0;
    for (const n of nb) {
      const cell = song.patterns[n.pattern].channels[n.channel].rows[n.row];
      cell.note = n.note + 1;
      const out = await exportPaulSummers(song);
      cell.note = n.note;
      if (out.warnings.length) continue;
      const diff: number[] = [];
      out.data.forEach((b, i) => { if (b !== raw[i]) diff.push(i); });
      // A byte shared by several cells moves them all, so more than one cell may read it; the file differs only there.
      expect(diff).toEqual([n.offset]);
      expect(out.data[n.offset]).toBe(raw[n.offset] + 1);
      hit++;
      break;
    }
    expect(hit).toBe(1);
  });

  it('an edit on a cell with no note is refused with a warning', async () => {
    const { raw, song } = load();
    const nb = song.uadeVariableLayout!.noteBytes!;
    const used = new Set(nb.map(x => `${x.pattern}:${x.channel}:${x.row}`));
    let row = 0;
    while (used.has(`0:0:${row}`)) row++;
    song.patterns[0].channels[0].rows[row].note = 30;
    const out = await exportPaulSummers(song);
    expect(out.warnings.length).toBe(1);
    expect(Array.from(out.data)).toEqual(Array.from(raw));
  });
});
