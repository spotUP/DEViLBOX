/**
 * IFF SMUS: a note or instrument edit on an existing cell is written into the loaded module's TRAK bytes, the export
 * re-imports to the edited grid, and an unedited export is the source byte for byte. Real song, no fakes.
 * Revert-check: take the iffSmusEdits branch out of exportIffSmus and the unedited test fails (the from-scratch rebuild
 * re-quantises the stream) and so do the edit tests.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { parseIffSmusFile } from '@lib/import/formats/IffSmusParser';
import { exportIffSmus } from '../IffSmusExporter';

const FILE = join(process.cwd(), 'public/data/songs/iff-smus/Petri Alanko/Alanko1/Alanko1.smus');
const load = (): Promise<TrackerSong> => {
  const b = readFileSync(FILE);
  return parseIffSmusFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer, 'Alanko1.smus');
};
const bytesOf = async (song: TrackerSong) => new Uint8Array(await (await exportIffSmus(song)).data.arrayBuffer());
const firstNote = (song: TrackerSong) => {
  for (let p = 0; p < song.patterns.length; p++) for (let c = 0; c < song.numChannels; c++) {
    const rows = song.patterns[p].channels[c].rows;
    for (let r = 0; r < rows.length; r++) if (rows[r].note > 0 && rows[r].note < 90 && rows[r].instrument > 0) return { p, c, r };
  }
  throw new Error('no note');
};

describe('IFF SMUS edit write-back', () => {
  it('exports an unedited song as the source bytes', async () => {
    const song = await load();
    expect(await bytesOf(song)).toEqual(new Uint8Array(readFileSync(FILE)));
  });

  it('writes a note edit as one byte and re-imports it', async () => {
    const song = await load();
    const { p, c, r } = firstNote(song);
    const was = song.patterns[p].channels[c].rows[r].note;
    song.patterns[p].channels[c].rows[r].note = was + 2;
    const out = await bytesOf(song);
    const src = new Uint8Array(readFileSync(FILE));
    const diff = [...out.keys()].filter((i) => out[i] !== src[i]);
    expect(out.length).toBe(src.length);
    expect(diff.length).toBe(1);
    expect(out[diff[0]] - src[diff[0]]).toBe(2);
    const again = await parseIffSmusFile(out.buffer.slice(0) as ArrayBuffer, 'Alanko1.smus');
    expect(again.patterns[p].channels[c].rows[r].note).toBe(was + 2);
  });

  it('refuses a note added on an empty row and keeps the source', async () => {
    const song = await load();
    const { p, c, r } = firstNote(song);
    const rows = song.patterns[p].channels[c].rows;
    const gap = rows.findIndex((cell, i) => i > r && cell.note === 0);
    rows[gap].note = 40;
    const res = await exportIffSmus(song);
    expect(res.warnings.some((w) => w.includes('note added'))).toBe(true);
    expect(new Uint8Array(await res.data.arrayBuffer())).toEqual(new Uint8Array(readFileSync(FILE)));
  });

  it('writes an instrument edit that covers every note its event governs', async () => {
    const song = await load();
    const used = new Set<number>();
    for (const pat of song.patterns) for (const ch of pat.channels) for (const cell of ch.rows) if (cell.instrument > 0) used.add(cell.instrument);
    const [a, b] = [...used];
    for (const pat of song.patterns) for (const cell of pat.channels[0].rows) if (cell.instrument === a) cell.instrument = b;
    const res = await exportIffSmus(song);
    const out = new Uint8Array(await res.data.arrayBuffer());
    const src = new Uint8Array(readFileSync(FILE));
    expect(res.warnings.filter((w) => w.includes('instrument'))).toEqual([]);
    expect(out.length).toBe(src.length);
    const diff = [...out.keys()].filter((i) => out[i] !== src[i]);
    expect(diff.length).toBeGreaterThan(0);
    const again = await parseIffSmusFile(out.buffer.slice(0) as ArrayBuffer, 'Alanko1.smus');
    expect(again.patterns.some((pat) => pat.channels[0].rows.some((cell) => cell.instrument === a))).toBe(false);
    expect(again.patterns.some((pat) => pat.channels[0].rows.some((cell) => cell.instrument === b))).toBe(true);
  });

  it('refuses an instrument edit on one note of a shared instrument event', async () => {
    const src = new Uint8Array(readFileSync(FILE));
    const first = await load();
    const used = new Set<number>();
    for (const pat of first.patterns) for (const ch of pat.channels) for (const cell of ch.rows) if (cell.instrument > 0) used.add(cell.instrument);
    const [a, b] = [...used];
    // Voice 0 notes in order: some instrument event governs several, so changing one of them is refused.
    let refused = 0;
    for (let k = 0; k < 6; k++) {
      const song = await load();
      const notes = song.patterns.flatMap((pat) => pat.channels[0].rows.filter((x) => x.note > 0 && x.instrument > 0));
      const cell = notes[k];
      cell.instrument = cell.instrument === a ? b : a;
      const res = await exportIffSmus(song);
      if (res.warnings.some((w) => w.includes('different instruments'))) {
        refused++;
        expect(new Uint8Array(await res.data.arrayBuffer())).toEqual(src);
      }
    }
    expect(refused).toBeGreaterThan(0);
  });

  it('refuses an edit on a note the import clamped and keeps the source', async () => {
    // Real file; no real song has an out-of-range note, so push the first note event of the first TRAK to MIDI 5 (grid note 1).
    const t = new Uint8Array(readFileSync(FILE));
    const u32 = (o: number) => ((t[o] << 24) | (t[o + 1] << 16) | (t[o + 2] << 8) | t[o + 3]) >>> 0;
    let at = -1;
    for (let pos = 12; at < 0 && pos + 8 <= t.length; pos += 8 + u32(pos + 4) + (u32(pos + 4) & 1)) {
      if (String.fromCharCode(t[pos], t[pos + 1], t[pos + 2], t[pos + 3]) !== 'TRAK') continue;
      for (let i = pos + 8; i < pos + 8 + u32(pos + 4); i += 2) if (t[i] >= 12 && t[i] < 107) { at = i; break; }
    }
    t[at] = 5;
    const song = await parseIffSmusFile(t.buffer.slice(0) as ArrayBuffer, 'Alanko1.smus');
    const cell = song.patterns.flatMap((pt) => pt.channels.flatMap((ch) => ch.rows)).find((x) => x.note === 1);
    expect(cell).toBeDefined();
    cell!.note = 4;
    const res = await exportIffSmus(song);
    expect(res.warnings.some((w) => w.includes('outside the 1-96'))).toBe(true);
    expect(new Uint8Array(await res.data.arrayBuffer())).toEqual(t);
  });

  it('removes a note as a rest and puts it back on a rest, same length, source bytes restored', async () => {
    const song = await load();
    const { p, c, r } = firstNote(song);
    const note = song.patterns[p].channels[c].rows[r].note;
    song.patterns[p].channels[c].rows[r].note = 0;
    const cut = await bytesOf(song);
    const src = new Uint8Array(readFileSync(FILE));
    expect(cut.length).toBe(src.length);
    expect([...cut.keys()].filter((i) => cut[i] !== src[i]).length).toBeGreaterThan(0);
    const again = await parseIffSmusFile(cut.buffer.slice(0) as ArrayBuffer, 'Alanko1.smus');
    expect(again.patterns[p].channels[c].rows[r].note).toBe(0);
    again.patterns[p].channels[c].rows[r].note = note;
    expect(await bytesOf(again)).toEqual(src);
  });
});
