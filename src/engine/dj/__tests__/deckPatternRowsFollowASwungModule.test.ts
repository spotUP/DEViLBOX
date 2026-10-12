/**
 * The DJ deck's pattern view scrolls with the audio of a module that swings
 * (owner 2026-10-12, DECK-PATTERN-NO-SCROLL). The deck mapped audio time to
 * rows with its own walk: one row length per order position (the speed at
 * the pattern's end, 5 ticks here, while the rows alternate 11 / 5), no
 * pattern loops. Rows ran about 1.6x too fast and the view sat on row 63 for
 * the last ~4 s of every pattern. Now the rows come from the one order walk
 * (songRowTimeline), through DeckEngine.getPositionAtTime.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { DeckEngine } from '../DeckEngine';
import { songRowTimeline } from '../songRowTimeline';
import { timeOrderPositions } from '../autodj/trackerMixAnalysis';

async function load(): Promise<TrackerSong> {
  const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
  const name = 'mortimer-twang-suggestive-vibes.mod';
  return parseModuleToSong(new File([readFileSync(resolve(process.cwd(), 'src/__tests__/fixtures', name))], name));
}

function deckWith(song: TrackerSong): DeckEngine {
  return Object.assign(Object.create(DeckEngine.prototype), {
    replayer: { getSong: () => song },
    songTimeline: songRowTimeline(song),
  }) as DeckEngine;
}

describe('deck pattern rows of a swung module', () => {
  it('moves through the whole first pattern with the audio, never parked on its last row', async () => {
    const song = await load();
    const deck = deckWith(song);
    // First pattern: 10.12 s; the old index reached row 63 at 6.4 s and stayed there.
    expect(deck.getPositionAtTime(7500)!.pattPos).toBeLessThan(50);
    expect(deck.getPositionAtTime(10000)!.pattPos).toBeGreaterThanOrEqual(62);
    expect(deck.getPositionAtTime(10200)).toEqual({ songPos: 1, pattPos: 0 });
    // Each row is shown while it sounds: 1 ms into every row of the first pattern.
    const times = timeOrderPositions(song).rowTimes[0];
    expect(times).toHaveLength(64);
    times.forEach((t, row) => expect(deck.getPositionAtTime(t * 1000 + 1)).toEqual({ songPos: 0, pattPos: row }));
  });

  it('follows the pattern loop: the loop start comes round again on each pass', async () => {
    const song = await load();
    const deck = deckWith(song);
    // Order position 1 plays rows 0-31 three times (E60 / E62).
    const passes = timeOrderPositions(song).positions.filter((p) => p.index === 1);
    expect(passes).toHaveLength(3);
    for (const p of passes) {
      expect(deck.getPositionAtTime(p.start * 1000 + 1)).toEqual({ songPos: 1, pattPos: 0 });
      expect(deck.getPositionAtTime(p.start * 1000 + 4900)!.pattPos).toBeGreaterThanOrEqual(28);
    }
  });
});
