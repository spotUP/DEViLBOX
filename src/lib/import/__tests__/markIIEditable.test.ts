/**
 * Mark II (astarrsonix.mk2) is editable: the grid is a step reading of the row table, the row table and every played
 * sequence encode back to their file bytes, an unedited export is byte-identical, and an edited note cell changes
 * exactly the note byte that played it, through the export router the live edit uses.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseMarkIIFile, identifyMarkII, markIIPeriodCount } from '@/lib/import/formats/MarkIIParser';
import { exportMarkII } from '@/lib/export/MarkIIExporter';
import { exportNativeSong } from '@/lib/export/nativeExportRouter';
import { encodeRobHubbardPattern } from '@/engine/uade/encoders/RobHubbardEncoder';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

const NAME = 'astarrsonix.mk2';
const raw = readFileSync(`public/data/songs/mark-ii/${NAME}`);
const bytes = new Uint8Array(raw);
const load = () => parseMarkIIFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, NAME);
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);

describe('Mark II grid and export', () => {
  it('recognises the player version', () => {
    const v = identifyMarkII(bytes);
    expect(v).not.toBeNull();
    expect(v!.holdsNote).toBe(true);
  });

  it('the row table and every played sequence encode back to their file bytes', () => {
    const layout = load().uadeVariableLayout!;
    expect(layout.formatId).toBe('markII');
    expect(layout.numFilePatterns).toBe(200);
    layout.blockRows!.forEach((rows, i) => {
      const addr = layout.filePatternAddrs[i];
      const size = layout.filePatternSizes[i];
      expect(Array.from(encodeRobHubbardPattern(rows))).toEqual(Array.from(bytes.subarray(addr, addr + size)));
    });
  });

  it('note cells name note bytes', () => {
    const song = load();
    const nb = song.uadeVariableLayout!.noteBytes!;
    expect(nb.length).toBeGreaterThan(100);
    for (const n of nb) {
      expect(song.patterns[n.pattern].channels[n.channel].rows[n.row].note).toBe(n.note);
      expect(bytes[n.offset]).toBeLessThan(0x80);
    }
  });

  it('an unedited song exports byte-identical', async () => {
    const song = load();
    setGridBaseline(baselineOf(song.patterns));
    const r = await exportMarkII(song);
    expect(diffAt(r.data, bytes)).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('an edited note changes only its note byte, through the export router, and reloads', async () => {
    const song = load();
    setGridBaseline(baselineOf(song.patterns));
    const periods = markIIPeriodCount(bytes, identifyMarkII(bytes)!);
    const nbs = song.uadeVariableLayout!.noteBytes!;
    // A byte played once, one semitone up still a plain note the period table holds.
    const x = nbs.find((y) => y.note + 1 <= periods && bytes[y.offset] + 1 < 0x80 && bytes[y.offset] + 1 !== 0x32
      && nbs.filter((z) => z.offset === y.offset).length === 1)!;
    expect(x).toBeDefined();
    song.patterns[x.pattern].channels[x.channel].rows[x.row].note = x.note + 1;
    const out = await exportNativeSong(song, {});
    expect(out).not.toBeNull();
    const data = out!.data instanceof Blob ? new Uint8Array(await out!.data.arrayBuffer()) : new Uint8Array(out!.data as unknown as Uint8Array);
    expect(diffAt(data, bytes)).toEqual([x.offset]);
    expect(data[x.offset]).toBe(bytes[x.offset] + 1);
    const re = parseMarkIIFile(data.slice().buffer as ArrayBuffer, NAME);
    expect(re.patterns[x.pattern].channels[x.channel].rows[x.row].note).toBe(x.note + 1);
  });
});
