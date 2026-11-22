/**
 * Sean Connolly v2 (surf ninjas) is editable: pattern blocks encode back to their bytes, an unedited
 * export is byte-identical, an edited note cell changes only the note byte of the event that played it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSeanConnollyFile } from '@/lib/import/formats/SeanConnollyParser';
import { seanConnollyV2Tables } from '@/lib/import/formats/SeanConnollyGrid';
import { exportSeanConnolly } from '@/lib/export/SeanConnollyExporter';
import { exportNativeSong } from '@/lib/export/nativeExportRouter';
import { encodeRobHubbardPattern } from '@/engine/uade/encoders/RobHubbardEncoder';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

const NAME = 'surf ninjas.scn';
const raw = readFileSync(`public/data/songs/sean-connolly/${NAME}`);
const bytes = new Uint8Array(raw);
const load = () => parseSeanConnollyFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, NAME);
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);

describe('Sean Connolly grid and export', () => {
  it('finds the tables', () => {
    expect(seanConnollyV2Tables(bytes)).not.toBeNull();
  });

  it('every pattern block encodes back to its file bytes', () => {
    const layout = load().uadeVariableLayout!;
    expect(layout.formatId).toBe('seanConnolly');
    expect(layout.numFilePatterns).toBeGreaterThan(0);
    layout.blockRows!.forEach((rows, i) => {
      const addr = layout.filePatternAddrs[i];
      expect(Array.from(encodeRobHubbardPattern(rows))).toEqual(Array.from(bytes.subarray(addr, addr + layout.filePatternSizes[i])));
    });
  });

  it('note cells name note bytes', () => {
    const song = load();
    const nb = song.uadeVariableLayout!.noteBytes!;
    expect(nb.length).toBeGreaterThan(1);
    for (const n of nb) expect(song.patterns[n.pattern].channels[n.channel].rows[n.row].note).toBe(n.note);
  });

  it('an unedited song exports byte-identical', async () => {
    const song = load();
    setGridBaseline(baselineOf(song.patterns));
    const r = await exportSeanConnolly(song);
    expect(diffAt(r.data, bytes)).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('an edited note changes only its note byte, through the export router, and reloads', async () => {
    const song = load();
    setGridBaseline(baselineOf(song.patterns));
    const x = song.uadeVariableLayout!.noteBytes!.find((y) => bytes[y.offset] < 0x5e)!;
    song.patterns[x.pattern].channels[x.channel].rows[x.row].note = x.note + 1;
    const out = await exportNativeSong(song, {});
    expect(out).not.toBeNull();
    const data = out!.data instanceof Blob ? new Uint8Array(await out!.data.arrayBuffer()) : new Uint8Array(out!.data as unknown as Uint8Array);
    expect(diffAt(data, bytes)).toEqual([x.offset]);
    expect(data[x.offset]).toBe(bytes[x.offset] + 1);
    const re = parseSeanConnollyFile(data.slice().buffer as ArrayBuffer, NAME);
    expect(re.patterns[x.pattern].channels[x.channel].rows[x.row].note).toBe(x.note + 1);
  });
});
