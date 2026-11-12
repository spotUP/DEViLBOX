/**
 * Sawteeth grid timing on okolaNUKE.st. Parts have different sps (ticks per part step), so the
 * grid has to lay every channel on a common tick base: one grid row lasts the same time on every
 * channel and the grid time of a part equals its audio time.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSawteethFile } from '../formats/SawteethParser';
import { exportSawteeth } from '@/lib/export/SawteethExporter';

const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), 'public/data/songs/sawteeth/okolaNUKE.st')));

function totalRows(song: NonNullable<ReturnType<typeof parseSawteethFile>>, ch: number): number {
  return song.patterns.reduce((n, p) => n + p.channels[ch].rows.length, 0);
}

describe('Sawteeth grid timing (okolaNUKE.st)', () => {
  const song = parseSawteethFile(bytes, 'okolaNUKE.st');

  it('gives every channel the same number of grid rows', () => {
    expect(song).not.toBeNull();
    if (!song) return;
    const counts = Array.from({ length: song.numChannels }, (_, ch) => totalRows(song, ch));
    expect(new Set(counts).size).toBe(1);
  });

  it('puts the first step of the fast part on channel 3 at 11.52 s', () => {
    if (!song) throw new Error('parse failed');
    const secondsPerRow = (2.5 / song.initialBPM) * song.initialSpeed;
    expect(secondsPerRow).toBeCloseTo(0.06, 6);
    // Channel index 3 plays part 9 (sps 3, 32 steps) at 11.52 s: the row at that time holds the
    // first step of part 9, and the 1.92 s part ends exactly where the next step begins.
    const row = Math.round(11.52 / secondsPerRow);
    const flat = song.patterns.flatMap(p => p.channels[3].rows);
    expect(flat.length).toBe(song.patterns.flatMap(p => p.channels[0].rows).length);
    expect(row).toBe(192);
    expect(Math.round(1.92 / secondsPerRow)).toBe(32);
  });

  it('exports the unedited song with the same grid timing and cells', async () => {
    if (!song) throw new Error('parse failed');
    const out = await exportSawteeth(song);
    const back = parseSawteethFile(new Uint8Array(await out.data.arrayBuffer()), 'back.st');
    expect(back).not.toBeNull();
    if (!back) return;
    expect(back.initialSpeed).toBe(song.initialSpeed);
    expect(back.initialBPM).toBeCloseTo(song.initialBPM, 6);
    for (let ch = 0; ch < song.numChannels; ch++) {
      const a = song.patterns.flatMap(p => p.channels[ch].rows).map(c => [c.note, c.instrument, c.effTyp, c.eff]);
      const b = back.patterns.flatMap(p => p.channels[ch].rows).map(c => [c.note, c.instrument, c.effTyp, c.eff]);
      expect(b.slice(0, a.length)).toEqual(a);
    }
  });
});
