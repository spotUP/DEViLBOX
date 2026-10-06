/**
 * Klystrack's channel meters missed notes: they flashed on a level jump, and a
 * synth voice with an attack ramp rises less than the jump threshold between
 * two reports. The player now counts every note trigger per channel and the
 * meters flash on each rise of the count. Real worklet and WASM, real song.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import { ChannelMeterFeed } from '../tone/channelMeterFeed';
import { klysTransform } from '../klystrack/KlysEngine';

describe('Klystrack channel meters', { timeout: 60_000 }, () => {
  it('flash on more notes than the level-jump rule saw', async () => {
    const { proc, send, posted } = await startWorklet('klystrack', 'Klystrack', klysTransform);
    await send({ type: 'loadSong', buffer: songBuffer('public/data/songs/klystrack/Ocean Loader III.kt') });
    await send({ type: 'play' });
    const counted: number[] = []; const byLevel: number[] = [];
    const sinkOf = (hits: number[]) => ({ updateRealtimeChannelLevels() {}, triggerChannelMeter(i: number) { hits[i] = (hits[i] ?? 0) + 1; } });
    const countedFeed = new ChannelMeterFeed(); const levelFeed = new ChannelMeterFeed();
    let reports = 0;
    for (let q = 0; q < (48000 * 15) / 128; q++) {
      proc.process([], stereoOutputs(1));
      while (posted.length) {
        const m = posted.shift() as { type?: string; levels?: Float32Array; noteStarts?: number[] };
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
