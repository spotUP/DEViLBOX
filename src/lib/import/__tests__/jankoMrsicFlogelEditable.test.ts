/**
 * Janko Mrsic-Flogel (spacestation.jmf) is editable: the grid is read from sub-song 0's three voice streams, every stream's
 * carrier rows encode back to its file bytes, an unedited export is byte-identical, and an edited note cell changes exactly
 * the note byte that played it, through the export router the live edit uses.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseJankoMrsicFlogelFile, analyseJankoMrsicFlogel, jankoGridNote } from '@/lib/import/formats/JankoMrsicFlogelParser';
import { exportJankoMrsicFlogel } from '@/lib/export/JankoMrsicFlogelExporter';
import { exportNativeSong } from '@/lib/export/nativeExportRouter';
import { encodeRobHubbardPattern } from '@/engine/uade/encoders/RobHubbardEncoder';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

const NAME = 'spacestation.jmf';
const raw = readFileSync(`public/data/songs/formats/${NAME}`);
const bytes = new Uint8Array(raw);
const load = () => parseJankoMrsicFlogelFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, NAME);
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);

describe('Janko Mrsic-Flogel grid and export', () => {
  it('recognises the driver, the period table and both sub-songs', () => {
    const m = analyseJankoMrsicFlogel(bytes);
    expect(m).not.toBeNull();
    expect(m!.streams.length).toBe(2);
    expect(m!.periodCount).toBeGreaterThan(12);
  });

  it('every stream encodes back to its file bytes and ends on $FF', () => {
    const layout = load().uadeVariableLayout!;
    expect(layout.formatId).toBe('jankoMrsicFlogel');
    expect(layout.numFilePatterns).toBeGreaterThan(0);
    layout.blockRows!.forEach((rows, i) => {
      const addr = layout.filePatternAddrs[i];
      const size = layout.filePatternSizes[i];
      expect(Array.from(encodeRobHubbardPattern(rows))).toEqual(Array.from(bytes.subarray(addr, addr + size)));
      expect(bytes[addr + size - 1]).toBe(0xff);
    });
  });

  it('note cells name note bytes whose table period is the grid note', () => {
    const song = load();
    const m = analyseJankoMrsicFlogel(bytes)!;
    const nb = song.uadeVariableLayout!.noteBytes!;
    expect(nb.length).toBeGreaterThan(20);
    for (const n of nb) {
      expect(song.patterns[n.pattern].channels[n.channel].rows[n.row].note).toBe(n.note);
      expect(n.note).toBe(jankoGridNote(bytes.subarray(0x20), m, bytes[n.offset] + m.noteOffset));
    }
  });

  it('an unedited song exports byte-identical', async () => {
    const song = load();
    setGridBaseline(baselineOf(song.patterns));
    const r = await exportJankoMrsicFlogel(song);
    expect(diffAt(r.data, bytes)).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('an edited note changes only its note byte, through the export router, and reloads', async () => {
    const song = load();
    const m = analyseJankoMrsicFlogel(bytes)!;
    setGridBaseline(baselineOf(song.patterns));
    const nbs = song.uadeVariableLayout!.noteBytes!;
    // A byte played once, whose table neighbour plays a different grid note.
    const pick = nbs.map((x) => ({ x, to: jankoGridNote(bytes.subarray(0x20), m, bytes[x.offset] + m.noteOffset + 1) }))
      .find(({ x, to }) => to !== x.note && bytes[x.offset] + m.noteOffset + 1 < m.periodCount && nbs.filter((y) => y.offset === x.offset).length === 1)!;
    song.patterns[pick.x.pattern].channels[pick.x.channel].rows[pick.x.row].note = pick.to;
    const out = await exportNativeSong(song, {});
    expect(out).not.toBeNull();
    const data = out!.data instanceof Blob ? new Uint8Array(await out!.data.arrayBuffer()) : new Uint8Array(out!.data as unknown as Uint8Array);
    expect(diffAt(data, bytes)).toEqual([pick.x.offset]);
    const re = parseJankoMrsicFlogelFile(data.slice().buffer as ArrayBuffer, NAME);
    expect(re.patterns[pick.x.pattern].channels[pick.x.channel].rows[pick.x.row].note).toBe(pick.to);
  });
});
