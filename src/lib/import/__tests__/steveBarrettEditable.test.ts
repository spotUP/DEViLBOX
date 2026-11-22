/**
 * Steve Barrett (street_fighter.sb) is editable: the grid is read from song 1's voices, every list and played pattern's
 * carrier rows encode back to its file bytes, an unedited export is byte-identical, and an edited note cell changes
 * exactly the note byte that played it, through the export router the live edit uses.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSteveBarrettFile, identifySteveBarrett } from '@/lib/import/formats/SteveBarrettParser';
import { exportSteveBarrett } from '@/lib/export/SteveBarrettExporter';
import { exportNativeSong } from '@/lib/export/nativeExportRouter';
import { encodeRobHubbardPattern } from '@/engine/uade/encoders/RobHubbardEncoder';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

const NAME = 'street_fighter.sb';
const raw = readFileSync(`public/data/songs/formats/${NAME}`);
const bytes = new Uint8Array(raw);
const load = () => parseSteveBarrettFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, NAME);
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);

describe('Steve Barrett grid and export', () => {
  it('recognises the Street Fighter driver', () => {
    expect(identifySteveBarrett(bytes)?.name).toBe('Street Fighter');
  });

  it('every list and pattern encodes back to its file bytes and ends on $FF or $FE', () => {
    const layout = load().uadeVariableLayout!;
    expect(layout.formatId).toBe('steveBarrett');
    expect(layout.numFilePatterns).toBeGreaterThan(0);
    layout.blockRows!.forEach((rows, i) => {
      const addr = layout.filePatternAddrs[i];
      const size = layout.filePatternSizes[i];
      expect(Array.from(encodeRobHubbardPattern(rows))).toEqual(Array.from(bytes.subarray(addr, addr + size)));
      expect(bytes[addr + size - 1]).toBeGreaterThanOrEqual(0xfe);
    });
  });

  it('note cells name note bytes', () => {
    const song = load();
    const nb = song.uadeVariableLayout!.noteBytes!;
    expect(nb.length).toBeGreaterThan(20);
    for (const n of nb) {
      expect(song.patterns[n.pattern].channels[n.channel].rows[n.row].note).toBe(n.note);
      expect(bytes[n.offset]).toBeLessThan(0x7a);
    }
  });

  it('an unedited song exports byte-identical', async () => {
    const song = load();
    setGridBaseline(baselineOf(song.patterns));
    const r = await exportSteveBarrett(song);
    expect(diffAt(r.data, bytes)).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('an edited note changes only its note byte, through the export router, and reloads', async () => {
    const song = load();
    setGridBaseline(baselineOf(song.patterns));
    const nbs = song.uadeVariableLayout!.noteBytes!;
    // A byte played once, one semitone up still inside the grid.
    const x = nbs.find((y) => y.note < 96 && bytes[y.offset] < 0x79 && nbs.filter((z) => z.offset === y.offset).length === 1)!;
    expect(x).toBeDefined();
    song.patterns[x.pattern].channels[x.channel].rows[x.row].note = x.note + 1;
    const out = await exportNativeSong(song, {});
    expect(out).not.toBeNull();
    const data = out!.data instanceof Blob ? new Uint8Array(await out!.data.arrayBuffer()) : new Uint8Array(out!.data as unknown as Uint8Array);
    expect(diffAt(data, bytes)).toEqual([x.offset]);
    expect(data[x.offset]).toBe(bytes[x.offset] + 1);
    const re = parseSteveBarrettFile(data.slice().buffer as ArrayBuffer, NAME);
    expect(re.patterns[x.pattern].channels[x.channel].rows[x.row].note).toBe(x.note + 1);
  });
});
