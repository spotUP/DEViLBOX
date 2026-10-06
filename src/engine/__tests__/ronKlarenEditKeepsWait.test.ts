/**
 * A grid edit on a Ron Klaren song played by UADE keeps each row's duration.
 *
 * A Ron Klaren note command is [note, wait]; the wait byte is the row's
 * duration and the grid derives its rows from it, with no field to show it.
 * The chip-RAM encoder wrote wait = 1 for every edited cell, so a single edit,
 * and a bulk edit over a whole pattern, changed the song's timing on UADE while
 * the native replayer (rk_set_cell) kept it. The encoder now writes over the
 * stored bytes and keeps the wait.
 *
 * Drives the live-edit dispatcher (the bulk-edit path of the store) into a
 * fake UADE chip RAM holding the real module, and reads the bytes back.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = 0x1000;
let ram = new Uint8Array(0);

vi.mock('@/engine/uade/UADEEngine', () => ({
  UADEEngine: {
    hasInstance: () => true,
    getInstance: () => ({
      readMemory: async (addr: number, len: number) => ram.slice(addr, addr + len),
      writeMemory: async (addr: number, data: Uint8Array) => { ram.set(data, addr); },
    }),
  },
}));
vi.mock('@/engine/ronklaren/RonKlarenEngine', () => ({
  RonKlarenEngine: { hasInstance: () => false, getInstance: () => null },
}));

describe('Ron Klaren UADE edit', () => {
  it('keeps the wait byte of every edited note command', async () => {
    const { parseRonKlarenFile } = await import('@lib/import/formats/RonKlarenParser');
    const { getCellFileOffset } = await import('@engine/uade/UADEPatternEncoder');
    const { sendCellEditsToEngine, changedCells } = await import('@engine/replayer/liveCellEdits');

    const file = new Uint8Array(readFileSync(resolve(__dirname, '../../../public/data/songs/ron-klaren/astra 2.rk')));
    const song = parseRonKlarenFile(file, 'astra 2.rk')!;
    // UADE plays it: the song carries no Ron Klaren replayer data.
    song.ronKlarenFileData = undefined;
    const layout = song.uadePatternLayout!;

    ram = new Uint8Array(BASE + file.length);
    new DataView(ram.buffer).setUint32(0x100, BASE);
    ram.set(file, BASE);

    // A bulk edit: every note in a pattern up a semitone.
    const isNote = (n: number) => n > 0 && n < 90;
    const p = song.patterns.findIndex((pat, pi) => pat.channels.some((ch, c) => ch.rows.some((cell, r) => {
      const off = getCellFileOffset(layout, pi, r, c);
      return isNote(cell.note) && off >= 0 && file[off + 1] > 1;
    })));
    expect(p).toBeGreaterThanOrEqual(0);
    const before = song.patterns[p];
    const after = structuredClone(before);
    const touched: number[] = [];
    after.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
      if (!isNote(cell.note)) return;
      const off = getCellFileOffset(layout, p, r, c);
      if (off < 0) return;
      cell.note += 1;
      touched.push(off);
    }));
    expect(touched.some((off) => file[off + 1] !== 1), 'a command whose wait is not 1').toBe(true);

    await sendCellEditsToEngine(song, changedCells(p, after, before));

    for (const off of touched) {
      expect(ram[BASE + off + 1], `wait byte at file offset ${off}`).toBe(file[off + 1]);
      expect(ram[BASE + off]).not.toBe(file[off]);
    }
  });
});
