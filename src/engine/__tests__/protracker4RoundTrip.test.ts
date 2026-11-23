/**
 * ProTracker 4.1: the grid is the file's, an unedited song exports byte for byte, and one edited cell changes only that
 * cell's 4 bytes. Fixtures are libpt4's own feature-test modules (zlib licence): one with PT4X samples 32+, one with a
 * dynamic-loop envelope.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { isProTracker4Format, parseProTracker4File, scanProTracker4 } from '@lib/import/formats/ProTracker4Parser';
import { exportProTracker4 } from '@lib/export/ProTracker4Exporter';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';

const load = (name: string): ArrayBuffer => {
  const f = readFileSync(resolve(process.cwd(), 'public/data/songs/formats', name));
  return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
};

describe.each(['libpt4-pt4x_40.mod', 'libpt4-dyn_loop.mod'])('ProTracker 4: %s', (name) => {
  it('loads its real grid, exports byte-exact, and an edit changes one cell', async () => {
    const bytes = load(name);
    expect(isProTracker4Format(bytes)).toBe(true);
    const song = await parseProTracker4File(bytes, name);
    expect(song.protracker4FileData?.byteLength).toBe(bytes.byteLength);
    expect(song.libopenmptFileData).toBeUndefined();
    expect(song.instruments.length).toBe(scanProTracker4(bytes)!.samples.length);

    const notes: Array<{ p: number; ch: number; row: number }> = [];
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, row) => { if (cell.note > 0 && cell.note < 97) notes.push({ p, ch, row }); })));
    expect(notes.length, 'the grid has notes').toBeGreaterThan(0);

    setGridBaseline(baselineOf(song.patterns));
    const original = new Uint8Array(bytes);
    expect(Buffer.from(exportProTracker4(song).data).equals(Buffer.from(original)), 'unedited export is the file').toBe(true);

    const at = notes[0];
    const cell = song.patterns[at.p].channels[at.ch].rows[at.row];
    song.patterns[at.p].channels[at.ch].rows[at.row] = { ...cell, note: cell.note + 2, period: undefined };
    const edited = exportProTracker4(song).data;
    expect(edited.length).toBe(original.length);
    const changed: number[] = [];
    edited.forEach((v, i) => { if (v !== original[i]) changed.push(i); });
    const cellOffset = 1084 + (at.p * 64 + at.row) * song.numChannels * 4 + at.ch * 4;
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every((i) => i >= cellOffset && i < cellOffset + 4), `only the cell at ${cellOffset} changed, got ${changed}`).toBe(true);

    // The edited file is still a PT4 module and reads back with the new note.
    const again = await parseProTracker4File(edited.buffer.slice(edited.byteOffset, edited.byteOffset + edited.byteLength) as ArrayBuffer, name);
    expect(again.patterns[at.p].channels[at.ch].rows[at.row].note).toBe(cell.note + 2);
    setGridBaseline(null);
  });
});

// The 32-channel showcase (git-ignored under test-data/): an edit on a channel past 15 reaches the exported bytes and the re-parse.
const showcase = resolve(process.cwd(), 'test-data/pt4/hyperbased-pt4-showcase.mod');
describe.skipIf(!existsSync(showcase))('ProTracker 4: 32-channel showcase', () => {
  it('a note edited on a high channel exports into that cell only and re-parses', async () => {
    const f = readFileSync(showcase);
    const bytes = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
    const song = await parseProTracker4File(bytes, 'hyperbased-pt4-showcase.mod');
    expect(song.numChannels).toBeGreaterThan(16);
    let at: { p: number; ch: number; row: number } | null = null;
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, row) => { if (!at && ch >= 16 && cell.note > 0 && cell.note < 95) at = { p, ch, row }; })));
    expect(at, 'a note on a channel past 15').not.toBeNull();
    const { p, ch, row } = at!;
    setGridBaseline(baselineOf(song.patterns));
    const original = new Uint8Array(bytes);
    expect(Buffer.from(exportProTracker4(song).data).equals(Buffer.from(original)), 'unedited export is the file').toBe(true);
    const cell = song.patterns[p].channels[ch].rows[row];
    song.patterns[p].channels[ch].rows[row] = { ...cell, note: cell.note + 2, period: undefined };
    const edited = exportProTracker4(song).data;
    const changed: number[] = [];
    edited.forEach((v, i) => { if (v !== original[i]) changed.push(i); });
    const off = 1084 + (p * 64 + row) * song.numChannels * 4 + ch * 4;
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every((i) => i >= off && i < off + 4), `only the cell at ${off} changed, got ${changed}`).toBe(true);
    const again = await parseProTracker4File(edited.buffer.slice(edited.byteOffset, edited.byteOffset + edited.byteLength) as ArrayBuffer, 'x.mod');
    expect(again.patterns[p].channels[ch].rows[row].note).toBe(cell.note + 2);
    setGridBaseline(null);
  });
});
