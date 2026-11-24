import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseFurnaceSong } from '../../../import/formats/FurnaceSongParser';
import { furnaceToGoatTracker, pulseRows } from '../goatSong';

/** Pulse width per tick as GT2's player.s plays a pulse program: $8X set row (one tick), 01-7F step row (left ticks of signed right). */
function play(rows: Array<[number, number]>, ticks: number): number[] {
  const out: number[] = [];
  let pw = 0;
  for (const [l, r] of rows) {
    if (l >= 0x80) { pw = ((l & 15) << 8) | r; out.push(pw); } else for (let k = 0; k < l; k++) { pw = (pw + ((r << 24) >> 24)) & 4095; out.push(pw); }
  }
  return out.slice(0, ticks);
}

describe('GT pulse program', () => {
  it('plays an exact duty sweep with no error and a triangle LFO within the tolerance, in few rows', () => {
    const sweep = Array.from({ length: 200 }, (_, t) => (100 + t * 12) & 4095);
    const s = pulseRows(sweep, -1);
    expect(play(s.rows, 200)).toEqual(sweep);
    expect(s.rows.length).toBeLessThan(5);
    // Furnace LFO triangle 1000..2048 at speed 27: rounded steps of 55/56 that turn every 18 ticks.
    const tri = Array.from({ length: 240 }, (_, t) => Math.round(1000 + 1048 * (1 - Math.abs(((t + 1) * 27 / 1024 * 2) % 2 - 1))));
    const p = pulseRows(tri, -1, 8);
    const got = play(p.rows, 240);
    expect(got.length).toBe(240);
    got.forEach((v, t) => expect(Math.abs(v - tri[t])).toBeLessThanOrEqual(8));
    expect(p.rows.length).toBeLessThan(40);
  });

  it('starts the loop tick with a set row', () => {
    const vals = [10, 20, 30, 40, 50];
    const p = pulseRows(vals, 2);
    expect(p.rows[p.loopRow][0]).toBeGreaterThanOrEqual(0x80);
    expect(play(p.rows, 5)).toEqual(vals);
  });

  it('exports Hellcharger (LFO duty macros) within the 255-row pulse table', async () => {
    const b = readFileSync(path.resolve(__dirname, '../../../../../public/data/songs/furnace/c64/Hellcharger.fur'));
    const m = await parseFurnaceSong(b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer);
    const g = furnaceToGoatTracker(m, 0);
    expect(g.song.tables[1].left.length).toBeLessThanOrEqual(255);
  });
});
