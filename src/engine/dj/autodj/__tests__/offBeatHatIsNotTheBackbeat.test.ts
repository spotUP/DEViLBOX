/**
 * An off-beat sound is not the backbeat (todos MODULE-BPM-FOLLOWUP b). Mortimer
 * Twang 'suggestive vibes 5' (modland pub/modules/Protracker/Mortimer Twang)
 * read 187.5 BPM: at 2 rows a beat the sound on rows 2, 6, 14 (instrument 10,
 * the classifier calls it no snare) sits on beats 2 and 4 and scored a perfect
 * backbeat (1.0), beating the snare (instrument 11, sample spectrum: flatness
 * 0.83, centroid 2.1 kHz) on rows 4 and 12, the backbeat of 4 rows a beat
 * (0.75). The owner taps ~94: 4 rows a beat at the swing's mean speed 8 is
 * 93.75. A level whose backbeat is not a snare no longer overrules one whose
 * backbeat is.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { timeOrderPositions } from '../trackerMixAnalysis';
import { moduleBeatGrid, songRowsPerBeat } from '../moduleBeatGrid';
import { detectBPM } from '../../DJBeatDetector';

async function load(): Promise<TrackerSong> {
  const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
  const name = 'mortimer-twang-suggestive-vibes-5.mod';
  return parseModuleToSong(new File([readFileSync(resolve(process.cwd(), 'src/__tests__/fixtures', name))], name));
}

describe('an off-beat hat is not the backbeat', () => {
  it("'suggestive vibes 5' beats at 4 rows, 93.75 BPM, not 187.5 at 2 rows", async () => {
    const song = await load();
    const walk = timeOrderPositions(song);
    const level = songRowsPerBeat(song, walk);
    expect(level.rowsPerBeat).toBe(4);
    // The snare on rows 4 and 12 confirms it.
    expect(level.confidence).toBe(1);
    const grid = moduleBeatGrid(song, walk.positions[walk.positions.length - 1].end)!;
    expect(grid).not.toBeNull();
    expect(grid.bpm).toBe(93.75);
    expect(detectBPM(song).bpm).toBe(93.75);
  });
});
