/**
 * Anders 0land (.hot): the parser shows the song as played (4 voices from the track lists, with transpose) as a step grid; the exporter writes edited note and
 * instrument bytes back. Fixture: public/data/songs/anders-oland/primemover 07.hot.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseAnders0landFile } from '../Anders0landParser';
import { exportAnders0land } from '@/lib/export/Anders0landExporter';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/anders-oland/primemover 07.hot');

function load() {
  const b = readFileSync(FIXTURE);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return { ab, raw: new Uint8Array(ab) };
}
const reparse = async (d: Uint8Array) => parseAnders0landFile(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) as ArrayBuffer, 'primemover 07.hot');

describe('Anders 0land parser and exporter', () => {
  it('shows real streams and exports unedited byte for byte', async () => {
    const { ab, raw } = load();
    const song = await parseAnders0landFile(ab, 'primemover 07.hot');
    expect(song.uadePatternLayout!.numPatterns).toBeGreaterThan(1);
    expect(song.patterns.some((p) => p.channels[0].rows.some((c) => c.note > 0))).toBe(true);
    const out = await exportAnders0land(song);
    expect(Buffer.from(out.data).equals(Buffer.from(raw))).toBe(true);
  });

  function firstNote(song: Awaited<ReturnType<typeof parseAnders0landFile>>, wantInst: boolean) {
    for (let p = 0; p < song.patterns.length; p++) {
      const rows = song.patterns[p].channels[0].rows;
      for (let r = 0; r < rows.length; r++) if (rows[r].note >= 13 && rows[r].note < 90 && rows[r].period !== undefined && (!wantInst || rows[r].instrument > 0)) return { p, r };
    }
    throw new Error('no note');
  }

  it('a note edit changes only that event byte and re-imports as typed', async () => {
    const { ab, raw } = load();
    const song = await parseAnders0landFile(ab, 'primemover 07.hot');
    const { p, r } = firstNote(song, false);
    setGridBaseline(baselineOf(song.patterns));
    const cell = song.patterns[p].channels[0].rows[r];
    const was = cell.note;
    cell.note = was + 1;
    const out = await exportAnders0land(song);
    setGridBaseline(null);
    const diff: number[] = [];
    for (let i = 0; i < raw.length; i++) if (raw[i] !== out.data[i]) diff.push(i);
    expect(diff).toEqual([getCellFileOffset(song.uadePatternLayout!, p, r, 0)]);
    expect((await reparse(out.data)).patterns[p].channels[0].rows[r].note).toBe(was + 1);
  });

  it('an instrument edit changes only the instrument byte', async () => {
    const { ab, raw } = load();
    const song = await parseAnders0landFile(ab, 'primemover 07.hot');
    const { p, r } = firstNote(song, true);
    setGridBaseline(baselineOf(song.patterns));
    const cell = song.patterns[p].channels[0].rows[r];
    const next = cell.instrument === 5 ? 6 : 5;
    cell.instrument = next;
    const out = await exportAnders0land(song);
    setGridBaseline(null);
    const diff: number[] = [];
    for (let i = 0; i < raw.length; i++) if (raw[i] !== out.data[i]) diff.push(i);
    expect(diff.length).toBe(1);
    expect((await reparse(out.data)).patterns[p].channels[0].rows[r].instrument).toBe(next);
  });

  it('shows 4 voices and edits a transposed position into the right byte', async () => {
    const { ab, raw } = load();
    const song = await parseAnders0landFile(ab, 'primemover 07.hot');
    const L = song.uadePatternLayout!;
    expect(song.numChannels).toBe(4);
    let at: { p: number; r: number; c: number } | null = null;
    song.patterns.forEach((pat, p) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
      if (!at && cell.note >= 13 && cell.note < 80 && L.noteOffset!(p, r, c)) at = { p, r, c };
    })));
    if (!at) throw new Error('no transposed note');
    const { p, r, c } = at as { p: number; r: number; c: number };
    setGridBaseline(baselineOf(song.patterns));
    const cell = song.patterns[p].channels[c].rows[r];
    const typed = cell.note + 1;
    cell.note = typed;
    const out = await exportAnders0land(song);
    setGridBaseline(null);
    const diff: number[] = [];
    for (let i = 0; i < raw.length; i++) if (raw[i] !== out.data[i]) diff.push(i);
    expect(diff).toEqual([getCellFileOffset(L, p, r, c)]);
    expect(out.warnings).toEqual([]);
    expect((await reparse(out.data)).patterns[p].channels[c].rows[r].note).toBe(typed);
  });

  it('a note typed on a rest is reported, never dropped silently', async () => {
    const { ab } = load();
    const song = await parseAnders0landFile(ab, 'primemover 07.hot');
    const rows = song.patterns[0].channels[0].rows;
    const rest = rows.findIndex((x) => x.period === undefined);
    setGridBaseline(baselineOf(song.patterns));
    rows[rest].note = 40;
    const out = await exportAnders0land(song);
    setGridBaseline(null);
    expect(out.warnings.length).toBe(1);
  });
});
