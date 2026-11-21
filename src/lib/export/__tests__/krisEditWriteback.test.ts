/**
 * KRIS (ChipTracker) export writes the loaded module back byte for byte, and an edited cell changes only
 * its own 4 bytes and reloads as that edit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseKRISFile } from '@/lib/import/formats/KRISParser';
import { exportKRIS } from '../KRISExporter';
import { encodeStoredCell } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = 'public/data/songs/chiptracker/chuck rock - chuckrock.mod';

function load(bytes: Uint8Array) {
  return parseKRISFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 'chuckrock.kris');
}

async function save(song: Awaited<ReturnType<typeof load>>): Promise<Uint8Array> {
  return new Uint8Array(await (await exportKRIS(song)).data.arrayBuffer());
}

describe('KRIS export keeps the module', () => {
  it('unedited export is byte-identical', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const out = await save(await load(raw));
    expect(out.length).toBe(raw.length);
    expect(out.every((b, i) => b === raw[i])).toBe(true);
  });

  it('one edited cell changes only its 4 bytes and reloads as the edit', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = await load(raw);
    const cell = song.patterns[0].channels[0].rows[1];
    const row1Off = song.uadePatternLayout!.getCellFileOffset!(0, 1, 0);
    cell.note = cell.note === 60 ? 61 : 60;
    cell.instrument = 3;
    cell.effTyp = 0;
    cell.eff = 0;
    const out = await save(song);
    expect(out.length).toBe(raw.length);
    const diffs = [...out.keys()].filter((i) => out[i] !== raw[i]);
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs.every((i) => i >= row1Off && i < row1Off + 4)).toBe(true);
    const back = (await load(out)).patterns[0].channels[0].rows[1];
    expect([back.note, back.instrument]).toEqual([cell.note, 3]);
  });

  it('an edit on a track with transpose != 12 encodes the same bytes live and in the export, and reads back as the edit', async () => {
    // The fixture's orders all carry transpose 12, so give order 0 / channel 0 transpose 7 (table entry byte 1 at 958).
    const raw = new Uint8Array(readFileSync(FIXTURE));
    raw[958 + 1] = 7;
    const song = await load(raw);
    const layout = song.uadePatternLayout!;
    expect(layout.noteOffset!(0, 0, 0)).toBe(7);
    const [o, row, ch] = [0, 0, 0];
    const cell = song.patterns[o].channels[ch].rows[row];
    cell.note = 60;
    const live = encodeStoredCell(layout, o, row, ch, cell)!;
    expect(live).not.toBeNull();
    const out = await save(song);
    const off = layout.getCellFileOffset!(o, row, ch);
    expect([...out.subarray(off, off + 4)].map((b, i) => (i === 2 ? b & 0x0F : b))).toEqual([...live].map((b, i) => (i === 2 ? b & 0x0F : b)));
    expect((await load(out)).patterns[o].channels[ch].rows[row].note).toBe(cell.note);
  });

  it('a rebuilt module (no loaded bytes) reloads every note of the first pattern as the grid showed it', async () => {
    const song = await load(new Uint8Array(readFileSync(FIXTURE)));
    const edited = song.patterns[0].channels[0].rows[1];
    edited.note = 60;
    song.uadeEditableFileData = undefined; // new-song path: rebuild instead of patching the source
    const back = await load(await save(song));
    const notes = (s: typeof song) => s.patterns[0].channels.map((c) => c.rows.map((r) => r.note));
    const want = notes(song);
    expect(want.flat().filter((n) => n > 0).length).toBeGreaterThan(0);
    expect(back.patterns[0].channels[0].rows[1].note).toBe(60);
    expect(notes(back)).toEqual(want);
  });
});
