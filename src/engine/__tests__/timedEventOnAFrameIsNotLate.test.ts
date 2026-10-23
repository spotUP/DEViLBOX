// @vitest-environment node
/**
 * A note scheduled ahead starts on its own frame, not one frame later. The
 * worklets render up to the next queued event, then drain the events due at
 * `start + done / rate`. That sum rounds a hair below an event time that falls
 * exactly on a frame, so the event stayed queued and a one-frame segment
 * rendered before it applied: every timed note on a frame boundary was one
 * frame late. Measured with the real shared queue the worklets import.
 */
import { describe, it, expect } from 'vitest';

type Queue = {
  push(msg: { time: number }, now: number): boolean;
  nextOffset(now: number, frames: number, rate: number): number;
  drain(now: number, apply: (msg: { time: number }) => void): void;
};

const RATE = 48000;
const BLOCK = 128;

/** The worklets' segmented render: the frame index at which each event applies. */
function appliedFrames(queue: Queue, blocks: number, blockStart: number): number[] {
  const at: number[] = [];
  for (let b = 0; b < blocks; b++) {
    const start = blockStart + (b * BLOCK) / RATE;
    let done = 0;
    while (done < BLOCK) {
      const now = start + done / RATE;
      queue.drain(now, () => at.push(b * BLOCK + done));
      const off = queue.nextOffset(now, BLOCK - done, RATE);
      done += off > 0 ? off : BLOCK - done;
    }
  }
  return at;
}

describe('timed event on a frame', () => {
  it('applies at its own frame, for every frame of a block', async () => {
    const path: string = '../../../public/shared/timedEventQueue.js';
    const { TimedEventQueue } = (await import(/* @vite-ignore */ path)) as { TimedEventQueue: new () => Queue };
    const blockStart = 1024 / RATE;
    const late: number[] = [];
    for (let frame = 1; frame < 3 * BLOCK; frame++) {
      const queue = new TimedEventQueue();
      queue.push({ time: blockStart + 0.05 + frame / RATE }, blockStart);
      const [at] = appliedFrames(queue, 30, blockStart);
      if (at !== frame + 0.05 * RATE) late.push(frame);
    }
    expect(late).toEqual([]);
  });
});
