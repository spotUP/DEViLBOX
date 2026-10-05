/**
 * A MOD exports at the pitch it was loaded and edited at.
 *
 * Found 2026-09-29: the app's MOD import named period 428 note 25
 * (ProTracker) while the MOD writer read notes in FT2 naming (49 = 428) and
 * ignored the cell's period, so a dropped-in MOD exported two octaves low and
 * its lowest notes vanished; samples were written by list position, so a song
 * with an empty slot shifted every later sample; and an edited note kept its
 * old period, so the edit exported (and played) as the note it replaced.
 * One naming now (src/lib/amiga/periodNotes.ts), slots by id, and a stored
 * period counts only while it names the cell's note.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseMODFile, parseMOD } from '@lib/import/formats/MODParser';
import { exportSongToMOD } from '../modExport';

const MICRO15 = resolve(__dirname, '../../../__tests__/fixtures/micro15-goto80.mod');
const bytesOf = (path: string) => { const b = readFileSync(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const u8 = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

// The first case loads the parser and exporter modules; under a busy
// machine that alone outlasts vitest's 5 s default (pre-push, 2026-10-05).
describe('MOD export periods', { timeout: 30_000 }, () => {
  it('every cell exports at its source period, and samples keep their slots', async () => {
    const src = bytesOf(MICRO15);
    const song = await parseMODFile(src, 'micro15.mod');
    const out = await u8((await exportSongToMOD(song)).blob);
    const a = await parseMOD(src), b = await parseMOD(out.buffer.slice(0) as ArrayBuffer);
    let cells = 0;
    a.patterns.forEach((pat, p) => pat.forEach((row, r) => row.forEach((cell, c) => {
      if (!cell.period) return;
      cells++;
      expect(b.patterns[p][r][c].period, `p${p} r${r} c${c}`).toBe(cell.period);
      expect(b.patterns[p][r][c].instrument).toBe(cell.instrument);
    })));
    expect(cells).toBeGreaterThan(500);
    // Slot 16 (after empty 14 and 15) is still slot 16: same length, same loop.
    expect(b.header.samples[15].length).toBe(a.header.samples[15].length);
    expect(b.header.samples[15].loopStart).toBe(a.header.samples[15].loopStart);
  });

  it('an edited note exports as the new note, not the period it replaced', async () => {
    const song = await parseMODFile(bytesOf(MICRO15), 'micro15.mod');
    const pat = song.patterns[song.songPositions[0]];
    const row = pat.channels[0].rows.findIndex((c) => c.note > 0);
    const cell = pat.channels[0].rows[row];
    expect(cell.period).toBeGreaterThan(0);          // imported with its period
    cell.note = 37;                                  // typed over with C-3 - period left as it was
    const out = await u8((await exportSongToMOD(song)).blob);
    const b = await parseMOD(out.buffer.slice(0) as ArrayBuffer);
    expect(b.patterns[song.songPositions[0]][row][0].period).toBe(214);
  });
});

describe('one MOD writer (exportAsMOD is exportSongToMOD)', () => {
  it('keeps the song order, the effects and empty cells empty', async () => {
    const { exportAsMOD } = await import('../MODExporter');
    const song = await parseMODFile(bytesOf(MICRO15), 'micro15.mod');
    const res = await exportAsMOD(song.patterns, song.instruments, { moduleName: 'micro15', songPositions: song.songPositions });
    const out = await u8(res.data);
    const a = await parseMOD(bytesOf(MICRO15)), b = await parseMOD(out.buffer.slice(0) as ArrayBuffer);
    // The old writer wrote 0, 1, 2 ... here, read effects from a legacy field (all lost)
    // and put C00 into every cell without an effect.
    expect(b.header.patternOrderTable.slice(0, b.header.songLength)).toEqual(a.header.patternOrderTable.slice(0, a.header.songLength));
    a.patterns.forEach((pat, p) => pat.forEach((row, r) => row.forEach((cell, c) => {
      expect([b.patterns[p][r][c].effect, b.patterns[p][r][c].effectParam], `p${p} r${r} c${c}`).toEqual([cell.effect, cell.effectParam]);
    })));
  });
});
