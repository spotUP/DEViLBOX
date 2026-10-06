/**
 * PumaTracker's channel meters missed notes: they flashed on a level jump, so a
 * note retriggered at an unchanged volume moved nothing. The shared software
 * Paula now counts every channel's DMA start (the chip's own note trigger) and
 * the meters flash on each rise of the count. Real worklet and WASM, real song.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import { ChannelMeterFeed } from '../tone/channelMeterFeed';

describe('PumaTracker channel meters', { timeout: 60_000 }, () => {
  it('flash on more notes than the level-jump rule saw', async () => {
    const { proc, send, posted } = await startWorklet('pumatracker', 'PumaTracker', undefined, 'Pumatracker');
    await send({ type: 'loadModule', moduleData: songBuffer('public/data/songs/pumatracker/liquid kids - lv1a.puma') });
    const counted: number[] = []; const byLevel: number[] = [];
    const sinkOf = (hits: number[]) => ({ updateRealtimeChannelLevels() {}, triggerChannelMeter(i: number) { hits[i] = (hits[i] ?? 0) + 1; } });
    const countedFeed = new ChannelMeterFeed(); const levelFeed = new ChannelMeterFeed();
    let reports = 0;
    for (let q = 0; q < (48000 * 15) / 128; q++) {
      proc.process([], stereoOutputs(1));
      while (posted.length) {
        const m = posted.shift() as { type?: string; levels?: number[]; noteStarts?: number[] };
        if (m.type !== 'chLevels') continue;
        reports++;
        expect(m.noteStarts, 'the worklet reports note starts').toBeTruthy();
        countedFeed.feedCounted(sinkOf(counted), m.levels!, m.noteStarts!);
        levelFeed.feed(sinkOf(byLevel), m.levels!);
      }
    }
    const sum = (a: number[]) => a.reduce((x, y) => x + (y ?? 0), 0);
    expect(reports).toBeGreaterThan(100);
    expect(sum(counted)).toBeGreaterThan(sum(byLevel));
  });
});
