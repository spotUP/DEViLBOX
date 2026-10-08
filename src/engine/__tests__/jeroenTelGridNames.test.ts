/**
 * Jeroen Tel: the grid names the note the player plays. The parser read the note byte as ProTracker's index (1 = C-1) +
 * 12, one semitone under the period the player writes (stormlord title.jt, voice 2: grid 25, 24, 32, 31 against Paula
 * periods 404, 428, 269, 285 = notes 26, 25, 33, 32). A key on a grid note plays the period of that note, so the grid
 * and the keyboard disagreed with the song by a semitone.
 *
 * Measured: UADE's Paula writes (the song's own note starts, per voice) against the native grid's notes, in song order.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openUade, PaulaSession, PaulaNoteOns } from './gridOracle';
import { parseJeroenTelFile } from '@/lib/import/formats/JeroenTelParser';
import { periodToNote } from '@/lib/amiga/periodNotes';

const FILE = 'jeroen-tel/stormlord title.jt';

describe('Jeroen Tel stormlord title.jt: the grid notes are the notes the player plays', () => {
  it('voices 2 and 3: the first notes of the grid are the Paula periods\' notes, in order', async () => {
    const bytes = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs', FILE)));
    const song = await parseJeroenTelFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 'stormlord title.jt');
    const uade = await openUade();
    const session = new PaulaSession(uade, bytes, 'stormlord title.jt');
    const rule = new PaulaNoteOns('armed');
    const heard: Record<number, number[]> = { 2: [], 3: [] };
    const feed = (ws: Array<{ voice: number; reg: number; value: number }>) => {
      for (const w of ws) {
        if (w.voice !== 2 && w.voice !== 3) continue;
        const p = rule.push(w as never);
        // the player writes each period twice (the note start and the vibrato's first step): a note is a run
        if (p && p >= 100) { const n = periodToNote(p); const h = heard[w.voice]; if (h[h.length - 1] !== n) h.push(n); }
      }
    };
    feed(session.drain());
    for (let c = 1; c <= 3000; c++) { const ws = session.step(); if (!ws) break; feed(ws); }
    session.close();
    for (const v of [2, 3]) {
      const grid: number[] = [];
      for (const pi of song.songPositions) for (const r of song.patterns[pi].channels[v].rows) if (r.note > 0 && r.note < 97 && grid[grid.length - 1] !== r.note) grid.push(r.note);
      // the first Paula note is the player's own start-up write (period 856), so compare from the song's first note
      const start = heard[v].indexOf(grid[0]);
      expect(start, `voice ${v}: the grid's first note ${grid[0]} is among the notes the player plays (${heard[v].slice(0, 6).join(',')})`).toBeGreaterThanOrEqual(0);
      const n = Math.min(24, heard[v].length - start);
      expect(n, `voice ${v}: notes to compare`).toBeGreaterThanOrEqual(6);
      expect(heard[v].slice(start, start + n), `voice ${v}: notes the player plays`).toEqual(grid.slice(0, n));
    }
  }, 120_000);
});
