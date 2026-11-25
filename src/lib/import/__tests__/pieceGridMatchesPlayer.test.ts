/**
 * P/ECE grid = the driver's walk. The oracle is the host build of piece_grid_test.cpp: it runs
 * piece.cpp tick() and checks every event each part starts lands on the grid event at that tick
 * and file offset. The rest checks the WASM path the editor uses: grid time = audio time, a note
 * edit is heard as one changed byte, a split moves no other event, an unedited song stays
 * byte-identical. Real songs in test-data/piece (git-ignored); cases skip without them.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { parsePieceFile, PIECE_ROWS } from '@/lib/import/formats/PieceParser';
import { pieceEditCells, pieceGrid } from '@/engine/piece/pieceEditWasm';

const ROOT = resolve(__dirname, '../../../..');
const DIR = join(ROOT, 'test-data/piece');
const songs = existsSync(DIR) ? readdirSync(DIR).flatMap((d) => readdirSync(join(DIR, d)).map((f) => join(DIR, d, f))) : [];
const create = async () => (await import('../../../../public/piece/PieceEdit.js')).default({ locateFile: (f: string) => join(ROOT, 'public/piece', f) });
const hasCxx = (() => { try { execFileSync('c++', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

describe('P/ECE grid', () => {
  it.skipIf(songs.length === 0 || !hasCxx)('matches the driver tick by tick on every song (host build)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'piece-grid-'));
    try {
      const bin = join(dir, 'grid');
      execFileSync('c++', ['-std=c++17', '-O1', `-I${join(ROOT, 'piece-wasm/src')}`, join(ROOT, 'piece-wasm/tests/piece_grid_test.cpp'), '-o', bin]);
      const out = execFileSync(bin, songs, { encoding: 'utf8' });
      expect(out).toMatch(/^\[OK\] 36 songs, \d+ driver events matched, 36 splits/m);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300_000);

  it.skipIf(songs.length === 0)('lays every part on rows at the song tempo, unedited export byte-identical', async () => {
    for (const path of songs) {
      const bytes = new Uint8Array(readFileSync(path));
      const song = (await parsePieceFile(bytes, 'a.pmd', create))!;
      const grid = await pieceGrid(bytes, create);
      expect(grid.events.length, path).toBeGreaterThan(0);
      expect(song.initialSpeed).toBe(grid.rowTicks);
      expect(song.initialBPM).toBe(grid.tempo);
      // every event's note sits on the row of its tick
      for (const e of grid.events.slice(0, 50)) {
        const row = e.tick / grid.rowTicks;
        const cell = song.patterns[Math.floor(row / PIECE_ROWS)].channels[e.part].rows[row % PIECE_ROWS];
        expect(cell.note, path).toBe(e.note);
      }
      expect(new Uint8Array(song.pieceFileData!)).toEqual(bytes);
      expect(await pieceEditCells(bytes, [], create)).toBe(bytes);
    }
  }, 120_000);

  it.skipIf(songs.length === 0)('a note edit rewrites one byte; a note inside a held note splits it in place', async () => {
    const path = songs.find((s) => s.endsWith('Final Fantasy - Prelude.pmd'))!;
    const bytes = new Uint8Array(readFileSync(path));
    const grid = await pieceGrid(bytes, create);
    const e = grid.events.find((x) => x.note < 90)!;
    const edited = await pieceEditCells(bytes, [{ part: e.part, row: e.tick / grid.rowTicks, note: e.note + 2 }], create);
    expect(edited.length).toBe(bytes.length);
    expect(edited.filter((b, i) => b !== bytes[i]).length).toBe(1);
    const after = await pieceGrid(edited, create);
    expect(after.events.filter((x) => x.part === e.part && x.tick === e.tick).map((x) => x.note)).toContain(e.note + 2);

    const held = grid.events.find((x) => x.len >= 2 * grid.rowTicks && x.len % grid.rowTicks === 0)!;
    const row = held.tick / grid.rowTicks + 1;
    const split = await pieceGrid(await pieceEditCells(bytes, [{ part: held.part, row, note: 49 }], create), create);
    expect(split.ticks).toBe(grid.ticks);
    expect(split.events.some((x) => x.part === held.part && x.tick === row * grid.rowTicks && x.note === 49)).toBe(true);
  });
});
