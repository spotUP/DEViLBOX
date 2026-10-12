/**
 * A module that swings (speed alternating every row, F0B / F05) and repeats
 * sections with pattern loops (E60 / E62) gets its tempo from the module,
 * not the audio detector (owner 2026-10-12, DECK-BPM-MODULE: Mortimer Twang
 * 'suggestive vibes' showed 184.57 BPM, the owner taps ~94).
 *
 * Before: the order walk ignored E6x, so it ended at 143.24 s while the song
 * plays 179.08 s; the module grid rejected every render and the deck fell
 * back to the audio detector. And the walk counted the swing as two tempos,
 * speed 11 the longer, so the module tempo itself read 136.36 BPM.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { timeOrderPositions } from '../trackerMixAnalysis';
import { moduleBeatGrid } from '../moduleBeatGrid';
import { detectBPM } from '../../DJBeatDetector';

async function load(): Promise<TrackerSong> {
  const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
  const name = 'mortimer-twang-suggestive-vibes.mod';
  return parseModuleToSong(new File([readFileSync(resolve(process.cwd(), 'src/__tests__/fixtures', name))], name));
}

describe('a swung module with pattern loops', () => {
  it('walks its E6x loops: every loop pass is played, the song lasts 179.08 s', async () => {
    const walk = timeOrderPositions(await load());
    const end = walk.positions[walk.positions.length - 1].end;
    expect(end).toBeCloseTo(179.08, 2);
    // Order position 1 holds a 32-row loop played twice more (E60 at row 0, E62 at row 31).
    expect(walk.positions.filter((p) => p.index === 1).map((p) => p.rows)).toEqual([32, 32, 64]);
  });

  it('reads the swing as one tempo of 8 ticks a row: 93.75 BPM at 4 rows a beat', async () => {
    const song = await load();
    expect(detectBPM(song).bpm).toBe(93.75);
    const walk = timeOrderPositions(song);
    const grid = moduleBeatGrid(song, walk.positions[walk.positions.length - 1].end)!;
    expect(grid).not.toBeNull();
    expect(grid.bpm).toBe(93.75);
    expect(grid.rowsPerBeat).toBe(4);
    // A beat is a swing pair twice over, 0.64 s (one row of the intro holds speed 5: E C4 instead of F0B).
    const gaps = grid.beats.slice(1).map((b, i) => b - grid.beats[i]);
    expect(gaps.filter((g) => Math.abs(g - 0.64) < 1e-6).length / gaps.length).toBeGreaterThan(0.99);
  });
});
