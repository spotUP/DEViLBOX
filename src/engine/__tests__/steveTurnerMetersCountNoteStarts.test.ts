/**
 * SteveTurner's channel meters missed notes: they flashed on a level jump, so a
 * note retriggered at an unchanged volume, or one with an attack ramp, did not
 * flash. The replayer now counts every trigger_note per song voice
 * channel and the meters flash on each rise of the count. Real worklet and
 * WASM, real song.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import { ChannelMeterFeed } from '../tone/channelMeterFeed';

describe('SteveTurner channel meters', { timeout: 60_000 }, () => {
  it('flash on more notes than the level-jump rule saw', async () => {
    const { proc, send, posted } = await startWorklet('steveturner', 'SteveTurner');
    await send({ type: 'loadModule', moduleData: songBuffer('public/data/songs/steve-turner/paradroid90.jpo') });
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
        const peaks = m.levels!;
        countedFeed.feedCounted(sinkOf(counted), peaks, m.noteStarts!);
        levelFeed.feed(sinkOf(byLevel), peaks);
      }
    }
    const sum = (a: number[]) => a.reduce((x, y) => x + (y ?? 0), 0);
    expect(reports).toBeGreaterThan(100);
    expect(sum(counted)).toBeGreaterThan(sum(byLevel));
  });
});
