/**
 * A module whose speed puts the 24-tick beat at 3, 5 or 6 rows while its
 * patterns are 48 or 64 rows long is not left with bars that do not divide
 * its patterns and a 0.3 phrase confidence (todos JA-BEAT5). The beat is the
 * level its patterns hold whole (patternBeatLevel), and the drums choose
 * between the two such levels either side of the convention; the bars then
 * fall on the pattern starts and the phrase grid reads them.
 *
 * Real modules from public/data/songs/amigaklang (before the fix: rows per
 * beat 5, 6, 6, 3, 3 with an assumed meter, phrase confidence 0.30 each).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { timeOrderPositions } from '../trackerMixAnalysis';
import { moduleBeatGrid } from '../moduleBeatGrid';
import { PHRASE_BOUNDARY_SUPPORT } from '../structure';

async function load(name: string): Promise<TrackerSong> {
  const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
  return parseModuleToSong(new File([readFileSync(resolve(process.cwd(), 'public/data/songs/amigaklang', name))], name));
}

const CASES = [
  // file, speed, rows per beat, beats per bar, BPM, phrase confidence
  { file: 'Virgill&Maze-national waffle day.mod', speed: 5, rowsPerBeat: 6, beatsPerBar: 4, bpm: 100, phrase: 0.73 },
  { file: 'Virgill-mothership.mod', speed: 4, rowsPerBeat: 8, beatsPerBar: 4, bpm: 93.75, phrase: 0.75 },
  { file: "nah-kolor 'on fire'.mod", speed: 4, rowsPerBeat: 8, beatsPerBar: 4, bpm: 93.75, phrase: 0.75 },
  // amigahub swings 8 / 4 ticks a row (mean 6): 4 rows a beat are 24 ticks, 125 BPM. It read 93.75
  // while the walk counted the swing as speed 8; its beats were 0.48 s apart all along (DECK-BPM-MODULE).
  { file: 'Virgill-amigahub.mod', speed: 6, rowsPerBeat: 4, beatsPerBar: 4, bpm: 125, phrase: 1 },
  { file: 'Virgill-redrum redrum.mod', speed: 8, rowsPerBeat: 4, beatsPerBar: 4, bpm: 93.75, phrase: 0.91 },
];

describe('a module whose 24-tick beat misses its pattern lengths', () => {
  for (const c of CASES) {
    it(`${c.file}: speed ${c.speed} gets ${c.rowsPerBeat} rows a beat, whole bars per pattern and phrase confidence ${c.phrase}`, async () => {
      const song = await load(c.file);
      const walk = timeOrderPositions(song);
      const end = walk.positions[walk.positions.length - 1].end;
      const grid = moduleBeatGrid(song, end)!;
      expect(grid).not.toBeNull();
      expect(grid.rowsPerBeat).toBe(c.rowsPerBeat);
      expect(grid.beatsPerBar).toBe(c.beatsPerBar);
      expect(grid.bpm).toBe(c.bpm);
      // The BPM is the beats' own spacing (a swing counted as one tempo, not its longer row).
      const gaps = grid.beats.slice(1).map((b, i) => b - grid.beats[i]).sort((a, b) => a - b);
      expect(60 / gaps[gaps.length >> 1]).toBeCloseTo(c.bpm, 1);
      // The bars divide the patterns: most played positions are a whole number of bars.
      const rowsPerBar = grid.rowsPerBeat * grid.beatsPerBar;
      const whole = walk.positions.filter((p) => p.rows % rowsPerBar === 0).length / walk.positions.length;
      expect(whole).toBeGreaterThanOrEqual(PHRASE_BOUNDARY_SUPPORT);
      expect(grid.phrase!.confidence).toBeCloseTo(c.phrase, 2);
      expect(grid.phrase!.confidence).toBeGreaterThanOrEqual(0.5);
    });
  }
});
