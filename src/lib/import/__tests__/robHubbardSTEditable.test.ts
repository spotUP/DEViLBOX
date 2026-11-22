/**
 * Rob Hubbard ST (battleships.rho) is editable: the grid is read from sub-song 0's track lists and block command streams
 * (grammar from the module's own command reader), every block's carrier rows encode back to its file bytes, an unedited
 * export is byte-identical, and an edited note cell changes exactly the note byte that played it, through the same
 * export router the live chip-RAM edit uses.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseRobHubbardSTFile, findRobHubbardSTSongTable } from '@/lib/import/formats/RobHubbardSTParser';
import { exportRobHubbardST } from '@/lib/export/RobHubbardSTExporter';
import { exportNativeSong } from '@/lib/export/nativeExportRouter';
import { encodeRobHubbardPattern } from '@/engine/uade/encoders/RobHubbardEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

const NAME = 'battleships.rho';
const raw = readFileSync(`public/data/songs/rob-hubbard-st/${NAME}`);
const bytes = new Uint8Array(raw);
const load = () => parseRobHubbardSTFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, NAME);
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);

describe('Rob Hubbard ST grid and export', () => {
  it('finds the song table the player leas (0x922) and reads the first track list block', () => {
    expect(findRobHubbardSTSongTable(bytes)).toBe(0x922);
    const layout = load().uadeVariableLayout!;
    expect(layout.formatId).toBe('robHubbardST');
    // Voice 1 of sub-song 0: track list at T+0x18, first entry 0x178 -> block at 0xa9a.
    expect(layout.filePatternAddrs).toContain(0x922 + 0x178);
  });

  it('every block encodes back to its file bytes, and ends on $87 or $8E', () => {
    const layout = load().uadeVariableLayout!;
    expect(layout.numFilePatterns).toBeGreaterThan(0);
    layout.blockRows!.forEach((rows, i) => {
      const addr = layout.filePatternAddrs[i];
      const size = layout.filePatternSizes[i];
      expect(Array.from(encodeRobHubbardPattern(rows))).toEqual(Array.from(bytes.subarray(addr, addr + size)));
      expect([0x87, 0x8e]).toContain(bytes[addr + size - 1]);
    });
  });

  it('note cells name note bytes, and the grid shows them', () => {
    const song = load();
    const nb = song.uadeVariableLayout!.noteBytes!;
    expect(nb.length).toBeGreaterThan(20);
    for (const n of nb) {
      expect(bytes[n.offset]).toBeLessThan(0x80);
      expect(song.patterns[n.pattern].channels[n.channel].rows[n.row].note).toBe(n.note);
    }
  });

  it('grid notes are the period the replayer reads from its table (measured: table 0x6c8, 3421 -> 855 at index 24), not a base constant', () => {
    const word = (o: number) => (bytes[o] << 8) | bytes[o + 1];
    expect(word(0x6c8)).toBe(3421);
    expect(word(0x6c8 + 24 * 2)).toBe(855);
    const nb = load().uadeVariableLayout!.noteBytes!;
    for (const n of nb) expect(n.note).toBe(periodToGridNote(word(0x6c8 + bytes[n.offset] * 2)));
    const hist: Record<number, number> = {};
    for (const n of nb) hist[Math.floor((n.note - 1) / 12)] = (hist[Math.floor((n.note - 1) / 12)] ?? 0) + 1;
    // Index 24 (period 855) is C-1 = note 13; most real notes (bytes 19..59) sit in C-0..C-3, none above B-3.
    expect(Math.max(...nb.map((n) => n.note))).toBeLessThanOrEqual(48);
  });

  it('an unedited song exports byte-identical', async () => {
    const song = load();
    setGridBaseline(baselineOf(song.patterns));
    const r = await exportRobHubbardST(song);
    expect(r.data.length).toBe(2762);
    expect(diffAt(r.data, bytes)).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('an edited note changes only its note byte, through the export router the live edit uses, and reloads', async () => {
    const song = load();
    setGridBaseline(baselineOf(song.patterns));
    const n = song.uadeVariableLayout!.noteBytes!.find((x) => song.uadeVariableLayout!.noteBytes!.filter((y) => y.offset === x.offset).length === 1)!;
    song.patterns[n.pattern].channels[n.channel].rows[n.row].note = n.note + (n.note < 0 ? 3 : 2);
    const out = await exportNativeSong(song, {});
    expect(out).not.toBeNull();
    const data = out!.data instanceof Blob ? new Uint8Array(await out!.data.arrayBuffer()) : new Uint8Array(out!.data as unknown as Uint8Array);
    expect(diffAt(data, bytes)).toEqual([n.offset]);
    expect(data[n.offset]).toBe(bytes[n.offset] + 2);
    const re = parseRobHubbardSTFile(data.slice().buffer as ArrayBuffer, NAME);
    expect(re.patterns[n.pattern].channels[n.channel].rows[n.row].note).toBe(n.note + (n.note < 0 ? 3 : 2));
  });
});
