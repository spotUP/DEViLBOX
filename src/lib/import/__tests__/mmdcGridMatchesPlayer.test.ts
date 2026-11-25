/**
 * MMDC (packed OctaMED): the grid is a direct decode of the song's own cells, and it says what the player plays.
 *
 * The grid comes from the block bytes (mmdcCodec.ts run-length stream -> MMD0 cells -> MEDParser). The oracle is
 * the original MMDC player (Wanted Team MMDC_v3) running in UADE: its AUDxPER writes per voice (gridVsPaulaCore
 * note-on rules), compared channel N to voice N.
 *
 * The grid shows the note the player sounds: typed note + playtransp + the instrument's transpose (strans, the last
 * byte of the song's 8-byte sample record), and a plain sample at grid 49 or above folds down to the 37..48 octave
 * (MEDParser heardNote, OpenMPT Load_med.cpp NoteMap fold). The comparison is the grid note itself.
 *
 * Measured 2026-11-25 over the 14 corpus files (tools/uade-audit/gridVsPaula.ts): with typed note + strans and no
 * fold, captain planet 1 ch1 scored 0.63 and captain planet 3 ch1 0.88 (note 56 on instrument 5 plays 12 lower).
 * Captain Planet 6 and Knightmare ingame 4 are left out: UADE writes no periods for 6, and 4 holds 2 notes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { openUade } from '@/engine/__tests__/gridOracle';
import { paulaNotes, score, lcs, type LogModule } from '../../../../tools/uade-audit/gridVsPaulaCore';
import { parseMMDCFile } from '../formats/MMDCParser';
import { unpackMmdc } from '../formats/mmdcCodec';

const FILES = [
  'public/data/songs/formats/captain planet and the planeteers - title.mmdc',
  'public/data/songs/OctaMED MMDC/Ratt/captain planet and the planeteers - 1.mmdc',
  'public/data/songs/OctaMED MMDC/Ratt/captain planet and the planeteers - 3.mmdc',
  'public/data/songs/OctaMED MMDC/Ratt/captain planet and the planeteers - 5.mmdc',
  'public/data/songs/OctaMED MMDC/Richard Joseph/knightmare - title.mmdc',
  'public/data/songs/OctaMED MMDC/Richard Joseph/knightmare - death.mmdc',
  'public/data/songs/OctaMED MMDC/Richard Joseph/knightmare - ingame 2.mmdc',
].filter((p) => existsSync(join(process.cwd(), p))); // only the formats/ song is in git; the rest are local corpus

let mod: LogModule;
beforeAll(async () => { mod = (await openUade()) as unknown as LogModule; });
afterAll(() => { try { mod._uade_wasm_cleanup(); } catch { /* a refused load leaves the core in a state cleanup traps on */ } });

/** The pitch each channel plays in song order: the grid note. */
function gridPitches(bytes: Uint8Array, name: string): number[][] {
  const song = parseMMDCFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, name);
  const out: number[][] = song.patterns[0].channels.map(() => []);
  for (const p of song.songPositions) {
    song.patterns[p].channels.forEach((c, ch) => c.rows.forEach((r) => {
      if (r.note > 0 && r.note < 97) out[ch].push(r.note);
    }));
  }
  return out;
}

describe('MMDC grid plays what the MMDC player plays', () => {
  it.each(FILES)('%s: every channel is its voice, same pitch', async (path) => {
    const bytes = new Uint8Array(readFileSync(join(process.cwd(), path)));
    const name = basename(path);
    const grid = gridPitches(bytes, name);
    const paula = await paulaNotes(mod, bytes, name, dirname(join(process.cwd(), path)), 60);
    const report: string[] = [];
    let checked = 0;
    for (let ch = 0; ch < 4; ch++) {
      if (grid[ch].length < 8) continue;
      // The strict reading (LCH, LCL, LEN, PER bursts) counts only when it caught at least half the grid's notes.
      const strict = paula.strict[ch].length * 2 >= grid[ch].length ? score(grid[ch], paula.strict[ch]) : 0;
      const s = Math.max(score(grid[ch], paula.loose[ch]), strict);
      // Absolute pitch: the grid note is the note Paula plays (periodNotes 428 = C-2), first 24 notes in order.
      const abs = Math.max(lcs(grid[ch].slice(0, 24), paula.loose[ch].slice(0, 30)), lcs(grid[ch].slice(0, 24), paula.strict[ch].slice(0, 30)));
      report.push(`ch${ch}:${s.toFixed(2)} abs ${abs}/${Math.min(24, grid[ch].length)}`);
      checked++;
      expect(s, report.join(' ')).toBeGreaterThanOrEqual(0.9);
      expect(abs, report.join(' ')).toBeGreaterThanOrEqual(Math.min(24, grid[ch].length) - 4);
    }
    expect(checked).toBeGreaterThan(0);
  }, 300_000);
});

const CP1 = 'public/data/songs/OctaMED MMDC/Ratt/captain planet and the planeteers - 1.mmdc';

describe.skipIf(!existsSync(join(process.cwd(), CP1)))('MMDC grid folds notes above the third octave, and the edit path keeps the stored byte', () => {
  it('captain planet 1: stored notes past the fold show 12 lower; re-encoding keeps the bytes', () => {
    const path = CP1;
    const bytes = new Uint8Array(readFileSync(join(process.cwd(), path)));
    const song = parseMMDCFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, basename(path));
    const image = unpackMmdc(bytes);
    const layout = song.uadePatternLayout!;
    const songOff = ((image[8] << 24) | (image[9] << 16) | (image[10] << 8) | image[11]) >>> 0;
    const playTransp = (image[songOff + 504 + 262] << 24) >> 24;
    let folded = 0;
    song.patterns.forEach((pat, p) => pat.channels.forEach((chan, ch) => chan.rows.forEach((cell, row) => {
      const off = layout.getCellFileOffset!(p, row, ch);
      const stored = image.subarray(off, off + 3);
      expect(Array.from(layout.encodeCell(cell, stored))).toEqual(Array.from(stored));
      const rawNote = stored[0] & 0x3F;
      if (!rawNote || !cell.instrument) return;
      const typed = rawNote + 12 + playTransp + ((image[songOff + (cell.instrument - 1) * 8 + 7] << 24) >> 24);
      if (typed >= 49) {
        expect(cell.note).toBe(typed - 12 * Math.floor((typed - 37) / 12));
        expect(cell.note).toBeGreaterThanOrEqual(37);
        expect(cell.note).toBeLessThan(49);
        folded++;
      }
    })));
    expect(folded).toBeGreaterThan(0);
  });
});
