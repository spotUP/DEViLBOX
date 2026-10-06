/**
 * ArtOfNoise's channel meters missed notes: they flashed on a level jump, so a
 * note retriggered at an unchanged volume, or one with an attack ramp, did not
 * flash. The player now counts every voice start (use_old_instrument) per
 * channel and the meters flash on each rise of the count. Real worklet and
 * WASM, real song.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import { ChannelMeterFeed } from '../tone/channelMeterFeed';

describe('ArtOfNoise channel meters', { timeout: 60_000 }, () => {
  it('flash on more notes than the level-jump rule saw', async () => {
    const { proc, send, posted } = await startWorklet('artofnoise', 'ArtOfNoise');
    await send({ type: 'loadModule', moduleData: songBuffer('public/data/songs/art-of-noise/inside.blipp.aon') });
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
        // The engine folds L/R pairs into one peak per channel
        const peaks: number[] = [];
        for (let ch = 0; ch < m.levels!.length / 2; ch++) peaks.push(Math.max(m.levels![ch * 2], m.levels![ch * 2 + 1]));
        countedFeed.feedCounted(sinkOf(counted), peaks, m.noteStarts!);
        levelFeed.feed(sinkOf(byLevel), peaks);
      }
    }
    const sum = (a: number[]) => a.reduce((x, y) => x + (y ?? 0), 0);
    expect(reports).toBeGreaterThan(100);
    expect(sum(counted)).toBeGreaterThan(sum(byLevel));
  });
});
