import { describe, expect, it } from 'vitest';
import fixture from './fixtures/e6.uprough-song.json';
import { parseSongFile, songFileToSong, cellKey } from '../songFile';
import { deleteRow, editCell, insertRow, moveBlock, transposeCell } from '../songEdits';

const fresh = () => songFileToSong(parseSongFile(structuredClone(fixture)));
const sid = 'verse_0';
const side = (s: ReturnType<typeof fresh>) => s.meta.side[sid] ?? {};
const order = (s: ReturnType<typeof fresh>) => s.meta.sections[0]!.bars[0]!.order;

describe('side table edit rules', () => {
  it('keeps the entry on an effect edit, drops it on a volume change', () => {
    const s = fresh();
    const cell = s.patterns[0]!.channels.find((c) => c.id === 'kick')!.rows[6]!;
    expect(side(s)['kick:6']).toBeDefined();
    const fx = editCell(s, 0, 'kick', 6, { ...cell, effTyp: 0xe, eff: 0xd2 });
    expect(side(fx)['kick:6']).toEqual(side(s)['kick:6']);
    const vol = editCell(s, 0, 'kick', 6, { ...cell, volume: cell.volume - 3 });
    expect(side(vol)['kick:6']).toBeUndefined();
    expect(order(vol)).toContain('kick:6');
  });

  it('clearing a cell drops its entry and its order key', () => {
    const s = fresh();
    const cell = s.patterns[0]!.channels.find((c) => c.id === 'kick')!.rows[6]!;
    const out = editCell(s, 0, 'kick', 6, { ...cell, note: 0, instrument: 0, volume: 0 });
    expect(side(out)['kick:6']).toBeUndefined();
    expect(order(out)).not.toContain('kick:6');
  });

  it('transpose keeps vel and role, drops cents and glide', () => {
    const s = fresh();
    s.meta.side[sid]!['kick:6'] = { vel: 0.5, role: 'pickup', cents: 3, glide: 1 };
    const out = transposeCell(s, 0, 'kick', 6, 2);
    expect(side(out)['kick:6']).toEqual({ vel: 0.5, role: 'pickup' });
  });

  it('insert and delete a row shift entries with their cells', () => {
    const s = fresh();
    const e = side(s)['kick:6'];
    const ins = insertRow(s, 0, 'kick', 2);
    expect(side(ins)['kick:7']).toEqual(e);
    expect(side(ins)['kick:6']).toBeUndefined();
    expect(order(ins)).toContain('kick:7');
    const del = deleteRow(s, 0, 'kick', 2);
    expect(side(del)['kick:5']).toEqual(e);
    expect(order(del)).toContain('kick:5');
  });

  it('move and copy carry the entries', () => {
    const s = fresh();
    const e = side(s)['kick:6'];
    const mv = moveBlock(s, 0, 'kick', 6, 1, 7);
    expect(side(mv)['kick:7']).toEqual(e);
    expect(side(mv)['kick:6']).toBeUndefined();
    expect(mv.patterns[0]!.channels.find((c) => c.id === 'kick')!.rows[6]!.note).toBe(0);
    const cp = moveBlock(s, 0, 'kick', 6, 1, 7, true);
    expect(side(cp)['kick:7']).toEqual(e);
    expect(side(cp)['kick:6']).toEqual(e);
    expect(cellKey('kick', 7)).toBe('kick:7');
  });
});
