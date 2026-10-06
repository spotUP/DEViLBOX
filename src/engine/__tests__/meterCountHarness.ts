/**
 * Shared body of the "<engine>MetersCountNoteStarts" tests: run a started
 * worklet for a few seconds, feed every 'chLevels' report to a counted feed and
 * to a level-jump feed, and return how many meter flashes each produced.
 */
import { expect } from 'vitest';
import { stereoOutputs, type WorkletMsg, type WorkletProc } from './workletHarness';
import { ChannelMeterFeed } from '../tone/channelMeterFeed';

export function meterFlashCounts(proc: WorkletProc, posted: WorkletMsg[], seconds: number): { counted: number; byLevel: number; reports: number } {
  const counted: number[] = []; const byLevel: number[] = [];
  const sinkOf = (hits: number[]) => ({ updateRealtimeChannelLevels() {}, triggerChannelMeter(i: number) { hits[i] = (hits[i] ?? 0) + 1; } });
  const countedFeed = new ChannelMeterFeed(); const levelFeed = new ChannelMeterFeed();
  let reports = 0;
  for (let q = 0; q < (48000 * seconds) / 128; q++) {
    proc.process([], stereoOutputs(1));
    while (posted.length) {
      const m = posted.shift() as { type?: string; levels?: ArrayLike<number>; noteStarts?: number[] };
      if (m.type !== 'chLevels') continue;
      reports++;
      expect(m.noteStarts, 'the worklet reports note starts').toBeTruthy();
      countedFeed.feedCounted(sinkOf(counted), m.levels!, m.noteStarts!);
      levelFeed.feed(sinkOf(byLevel), m.levels!);
    }
  }
  const sum = (a: number[]) => a.reduce((x, y) => x + (y ?? 0), 0);
  return { counted: sum(counted), byLevel: sum(byLevel), reports };
}
