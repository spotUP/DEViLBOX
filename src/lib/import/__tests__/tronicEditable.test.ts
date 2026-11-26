/**
 * Tronic (crystal.dp) is editable: the grid decodes the stored pattern rows at each song step, an unedited export is
 * byte-identical, and an edited note changes only the note byte of the stored row it plays from.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseTronicFile, isTronicFormat } from '@/lib/import/formats/TronicParser';
import { exportNativeSong } from '@/lib/export/nativeExportRouter';
import { exportTronic } from '@/lib/export/TronicExporter';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';
import { periodToNote } from '@/lib/amiga/periodNotes';

const load = (name: string) => {
  const raw = readFileSync(`public/data/songs/tronic/${name}`);
  return { bytes: new Uint8Array(raw), song: parseTronicFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, name) };
};
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);

describe('Tronic grid and export', () => {
  it('detects the corpus and rejects non-modules', () => {
    expect(isTronicFormat(load('crystal.dp').bytes)).toBe(true);
    expect(isTronicFormat(load('locomotion.dp').bytes)).toBe(true);
    expect(isTronicFormat(new Uint8Array(100))).toBe(false);
  });

  it('index 49 (period 428) is C-2 as periodNotes names it', () => {
    expect(periodToNote(428)).toBe(49 - 24);
  });

  it.each(['crystal.dp', 'locomotion.dp'])('%s: every stored note shows on the grid', async (name) => {
    const { song: p, bytes } = load(name);
    const song = await p;
    const layout = song.uadePatternLayout!;
    let notes = 0;
    song.patterns.forEach((pat, pi) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
      const at = getCellFileOffset(layout, pi, r, c);
      if (at < 0 || bytes[at] === 0) return;
      notes++;
      expect(cell.note, `${pi}/${r}/${c}`).not.toBe(0);
      expect(cell.instrument).toBe(bytes[at + 1]);
    })));
    expect(notes).toBeGreaterThan(50);
  });

  it('an unedited song exports byte-identical', async () => {
    const { song: p, bytes } = load('crystal.dp');
    const song = await p;
    setGridBaseline(baselineOf(song.patterns));
    const r = await exportTronic(song);
    expect(diffAt(r.data, bytes)).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('an edited note changes only its note byte, through the export router, and reloads', async () => {
    const { song: p, bytes } = load('crystal.dp');
    const song = await p;
    setGridBaseline(baselineOf(song.patterns));
    const layout = song.uadePatternLayout!;
    let hit: { pi: number; r: number; c: number; at: number; note: number } | undefined;
    song.patterns.forEach((pat, pi) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
      if (!hit && cell.note > 0 && cell.note < 40) hit = { pi, r, c, at: getCellFileOffset(layout, pi, r, c), note: cell.note };
    })));
    const x = hit!;
    song.patterns[x.pi].channels[x.c].rows[x.r].note = x.note + 1;
    const out = await exportNativeSong(song, {});
    expect(out).not.toBeNull();
    const data = out!.data instanceof Blob ? new Uint8Array(await out!.data.arrayBuffer()) : new Uint8Array(out!.data as unknown as Uint8Array);
    expect(diffAt(data, bytes)).toEqual([x.at]);
    expect(data[x.at]).toBe(bytes[x.at] + 1);
    const re = await parseTronicFile(data.slice().buffer as ArrayBuffer, 'crystal.dp');
    expect(re.patterns[x.pi].channels[x.c].rows[x.r].note).toBe(x.note + 1);
  });

  it('a note in the octave below C-0 edits through the step transpose', async () => {
    const { song: p, bytes } = load('crystal.dp');
    const song = await p;
    setGridBaseline(baselineOf(song.patterns));
    const layout = song.uadePatternLayout!;
    let hit: { pi: number; r: number; c: number; at: number; note: number } | undefined;
    song.patterns.forEach((pat, pi) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
      if (!hit && cell.note < -1) hit = { pi, r, c, at: getCellFileOffset(layout, pi, r, c), note: cell.note };
    })));
    const x = hit!;
    song.patterns[x.pi].channels[x.c].rows[x.r].note = x.note + 1;
    const r = await exportTronic(song);
    expect(diffAt(r.data, bytes)).toEqual([x.at]);
    expect(r.data[x.at]).toBe(bytes[x.at] + 1);
  });
});
