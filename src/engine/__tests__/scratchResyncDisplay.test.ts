/**
 * After a scratch the pattern scrolls again.
 *
 * Owner, 2026-09-30: after scratching the pattern with touchpad / scroll
 * wheel, playback went on but the pattern stopped scrolling. During a scratch
 * the replayer runs at tempo x0.001, so the rows it queues for the display
 * are timed minutes ahead; the display queue drains in order, so that first
 * far-future row blocked every new one. Leaving scratch resyncs the scheduler
 * to now - and now also drops the display rows timed on the old timeline.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DisplayStateRing } from '../PlaybackCoordinator';

describe('display rows across a timeline resync', () => {
  it('a far-future row blocks newer rows until the ring is cleared', () => {
    const ring = new DisplayStateRing();
    ring.playing = true;
    ring.queue(10, 5, 0, 0, 0, 0.1);        // shown before the scratch
    expect(ring.getStateAtTime(10.05)?.row).toBe(5);
    ring.queue(400, 6, 0, 0, 0, 100);       // queued at tempo x0.001
    ring.queue(11, 7, 0, 0, 0, 0.1);        // after the resync
    expect(ring.getStateAtTime(11.05)?.row).toBe(5);   // stuck: the bug
    ring.clear();                             // what the resync now does
    ring.queue(11.1, 8, 0, 0, 0, 0.1);
    expect(ring.getStateAtTime(11.15)?.row).toBe(8);   // scrolling again
  });

  it('resyncSchedulerToNow clears the display rows', () => {
    const src = readFileSync(join(process.cwd(), 'src/engine/TrackerReplayer.ts'), 'utf8');
    const i = src.indexOf('resyncSchedulerToNow(): void {');
    expect(src.slice(i, src.indexOf('\n  }', i))).toContain('this.coordinator.stateRing.clear();');
  });
});
