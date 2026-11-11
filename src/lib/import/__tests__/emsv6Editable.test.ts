/**
 * EMS v6 (perception.ems) is editable: the grid is read from the sub-song's track lists and pattern command streams, an
 * unedited export is byte-identical, and an edited note cell changes the one note byte of the command that played it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseEMSv6File, isEMSv6Format } from '@/lib/import/formats/EMSv6Parser';
import { exportEmsV6 } from '@/lib/export/EmsV6Exporter';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

const NAME = 'perception.ems';
const raw = readFileSync(`public/data/songs/formats/${NAME}`);
const bytes = new Uint8Array(raw);
const load = () => parseEMSv6File(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, NAME);
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);

describe('EMS v6 grid and export', () => {
  it('is detected, and the old EMS 1.24 header is not', () => {
    expect(isEMSv6Format(bytes)).toBe(true);
    expect(isEMSv6Format(new Uint8Array(bytes.length))).toBe(false);
  });

  it('reads cells from the command stream: the first note of voice 1 is the 0x32 at 0x242, speed 3 long, on row 2', () => {
    const song = load();
    const first = song.uadeVariableLayout!.noteBytes!.find((n) => n.channel === 0)!;
    expect(first).toMatchObject({ pattern: 0, row: 2, offset: 0x242, note: 15 });
    expect(bytes[0x242]).toBe(0x32);
    const rows = song.patterns[0].channels[0].rows;
    expect(rows[2].note).toBe(15);
    expect(rows[5].note).toBe(13);
    expect(bytes[0x242 + 3]).toBe(0x30);
    // The rows between two notes are empty: a note lasts as many rows as its speed.
    expect([rows[3].note, rows[4].note]).toEqual([0, 0]);
    // Every note cell names the file byte that played it, inside the pattern section.
    for (const n of song.uadeVariableLayout!.noteBytes!) {
      expect(n.offset).toBeGreaterThanOrEqual(0x232);
      expect(n.offset).toBeLessThan(0x1ae + 0x70a);
      expect(song.patterns[n.pattern].channels[n.channel].rows[n.row].note).toBe(n.note);
    }
  });

  it('an unedited song exports byte-identical', async () => {
    const song = load();
    setGridBaseline(baselineOf(song.patterns));
    const r = await exportEmsV6(song);
    expect(r.warnings).toEqual([]);
    expect(r.data.length).toBe(bytes.length);
    expect(diffAt(r.data, bytes)).toEqual([]);
  });

  it('an edited note cell changes its note byte and nothing else, and reloads in the same cell', async () => {
    const song = load();
    setGridBaseline(baselineOf(song.patterns));
    song.patterns[0].channels[0].rows[2].note = 17;
    const r = await exportEmsV6(song);
    expect(r.warnings).toEqual([]);
    expect(diffAt(r.data, bytes)).toEqual([0x242]);
    expect(r.data[0x242]).toBe(0x34);
    const back = parseEMSv6File(r.data.buffer.slice(0) as ArrayBuffer, NAME);
    expect(back.patterns[0].channels[0].rows[2].note).toBe(17);
  });

  it('refuses a note on a row no command played and a removed note, and keeps the module', async () => {
    const song = load();
    setGridBaseline(baselineOf(song.patterns));
    song.patterns[0].channels[0].rows[3].note = 20;
    song.patterns[0].channels[0].rows[5].note = 0;
    const r = await exportEmsV6(song);
    expect(r.warnings.length).toBe(2);
    expect(diffAt(r.data, bytes)).toEqual([]);
  });
});
