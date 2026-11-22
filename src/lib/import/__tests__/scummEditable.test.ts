/**
 * SCUMM (zaktitle.scumm) is editable: the grid is a tick reading of the four event lists, each list encodes back to its
 * file bytes, an unedited export is byte-identical, and an edited note cell changes exactly the period word of the
 * event that played it, through the export router the live edit uses.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSCUMMFile, scummEventLists } from '@/lib/import/formats/SCUMMParser';
import { exportSCUMM } from '@/lib/export/SCUMMExporter';
import { exportNativeSong } from '@/lib/export/nativeExportRouter';
import { encodeRobHubbardPattern } from '@/engine/uade/encoders/RobHubbardEncoder';
import { noteToPeriod } from '@/lib/amiga/periodNotes';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

const NAME = 'zaktitle.scumm';
const raw = readFileSync(`public/data/songs/formats/${NAME}`);
const bytes = new Uint8Array(raw);
const load = () => parseSCUMMFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, NAME);
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);

describe('SCUMM grid and export', () => {
  it('recognises the player version', () => {
    expect(scummEventLists(bytes)?.version).toBe('Quad');
  });

  it('every event list encodes back to its file bytes', () => {
    const layout = load().uadeVariableLayout!;
    expect(layout.formatId).toBe('scumm');
    expect(layout.numFilePatterns).toBe(4);
    layout.blockRows!.forEach((rows, i) => {
      const addr = layout.filePatternAddrs[i];
      expect(Array.from(encodeRobHubbardPattern(rows))).toEqual(Array.from(bytes.subarray(addr, addr + layout.filePatternSizes[i])));
    });
  });

  it('note cells name period words', () => {
    const song = load();
    const nb = song.uadeVariableLayout!.noteBytes!;
    expect(nb.length).toBeGreaterThan(100);
    for (const n of nb) expect(song.patterns[n.pattern].channels[n.channel].rows[n.row].note).toBe(n.note);
  });

  it('an unedited song exports byte-identical', async () => {
    const song = load();
    setGridBaseline(baselineOf(song.patterns));
    const r = await exportSCUMM(song);
    expect(diffAt(r.data, bytes)).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('an edited note changes only its period word, through the export router, and reloads', async () => {
    const song = load();
    setGridBaseline(baselineOf(song.patterns));
    const x = song.uadeVariableLayout!.noteBytes!.find((y) => y.note + 1 <= 72)!;
    song.patterns[x.pattern].channels[x.channel].rows[x.row].note = x.note + 1;
    const out = await exportNativeSong(song, {});
    expect(out).not.toBeNull();
    const data = out!.data instanceof Blob ? new Uint8Array(await out!.data.arrayBuffer()) : new Uint8Array(out!.data as unknown as Uint8Array);
    const p = noteToPeriod(x.note + 1);
    expect(data[x.offset] * 256 + data[x.offset + 1]).toBe(p);
    expect(diffAt(data, bytes).every((o) => o === x.offset || o === x.offset + 1)).toBe(true);
    const re = parseSCUMMFile(data.slice().buffer as ArrayBuffer, NAME);
    expect(re.patterns[x.pattern].channels[x.channel].rows[x.row].note).toBe(x.note + 1);
  });
});
