/**
 * FuturePlayer's channel meters flashed on a level jump, which its envelopes
 * fake all the time (about 7 flashes per real note on the drum tune) and which
 * a note retriggered at an unchanged volume does not cause at all. The shared
 * software Paula now counts every channel's DMA start (the chip's own note
 * trigger) and the meters flash on each rise of the count: one flash per note.
 * Real worklet and WASM, real song.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import { ChannelMeterFeed } from '../tone/channelMeterFeed';

describe('FuturePlayer channel meters', { timeout: 60_000 }, () => {
  it('flash once per note start, not on every envelope wobble', async () => {
    const { proc, send, posted } = await startWorklet('futureplayer', 'FuturePlayer');
    await send({ type: 'loadTune', buffer: songBuffer('public/data/songs/future-player/imploder drums.fp') });
    await send({ type: 'play' });
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
    // The drum tune plays two voices: a few dozen notes in 15 s, one flash each.
    expect(counted[0]).toBeGreaterThan(0);
    expect(counted[1]).toBeGreaterThan(0);
    expect(sum(counted)).toBeLessThan(80);
    expect(sum(byLevel)).toBeGreaterThan(sum(counted) * 3);
  });
});
