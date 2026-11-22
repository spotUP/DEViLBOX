/**
 * Mike Davies (strider.md) is editable: each track is a file block whose carrier rows encode back to its bytes, an
 * unedited export is byte-identical, and an edited note cell changes only the note word of the event that played it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseMikeDaviesFile, mikeDaviesTables } from '@/lib/import/formats/MikeDaviesParser';
import { exportMikeDavies } from '@/lib/export/MikeDaviesExporter';
import { exportNativeSong } from '@/lib/export/nativeExportRouter';
import { encodeRobHubbardPattern } from '@/engine/uade/encoders/RobHubbardEncoder';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

const NAME = 'strider.md';
const raw = readFileSync(`public/data/songs/mike-davies/${NAME}`);
const bytes = new Uint8Array(raw);
const load = () => parseMikeDaviesFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, NAME);
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);

describe('Mike Davies grid and export', () => {
  it('finds the tables', () => {
    expect(mikeDaviesTables(bytes)?.periods).toBe(0x598);
  });

  it('every track block encodes back to its file bytes', () => {
    const layout = load().uadeVariableLayout!;
    expect(layout.formatId).toBe('mikeDavies');
    expect(layout.numFilePatterns).toBeGreaterThan(3);
    layout.blockRows!.forEach((rows, i) => {
      const addr = layout.filePatternAddrs[i];
      expect(Array.from(encodeRobHubbardPattern(rows))).toEqual(Array.from(bytes.subarray(addr, addr + layout.filePatternSizes[i])));
    });
  });

  it('note cells name note words', () => {
    const song = load();
    const nb = song.uadeVariableLayout!.noteBytes!;
    expect(nb.length).toBeGreaterThan(50);
    for (const n of nb) expect(song.patterns[n.pattern].channels[n.channel].rows[n.row].note).toBe(n.note);
  });

  it('an unedited song exports byte-identical', async () => {
    const song = load();
    setGridBaseline(baselineOf(song.patterns));
    const r = await exportMikeDavies(song);
    expect(diffAt(r.data, bytes)).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('an edited note changes only its note word, through the export router, and reloads', async () => {
    const song = load();
    setGridBaseline(baselineOf(song.patterns));
    const x = song.uadeVariableLayout!.noteBytes!.find((y) => y.note + 1 <= 72 && bytes[x_off(y)] === 0 && bytes[x_off(y) + 1] < 0x7e)!;
    song.patterns[x.pattern].channels[x.channel].rows[x.row].note = x.note + 1;
    const out = await exportNativeSong(song, {});
    expect(out).not.toBeNull();
    const data = out!.data instanceof Blob ? new Uint8Array(await out!.data.arrayBuffer()) : new Uint8Array(out!.data as unknown as Uint8Array);
    expect(data[x.offset + 1]).toBe(bytes[x.offset + 1] + 1);
    expect(diffAt(data, bytes)).toEqual([x.offset + 1]);
    const re = parseMikeDaviesFile(data.slice().buffer as ArrayBuffer, NAME);
    expect(re.patterns[x.pattern].channels[x.channel].rows[x.row].note).toBe(x.note + 1);
  });
});

function x_off(n: { offset: number }): number { return n.offset; }
