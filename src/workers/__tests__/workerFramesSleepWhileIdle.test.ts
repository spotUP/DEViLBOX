/**
 * APP-IDLE-CPU item 3: offscreen workers request no frames while nothing changes,
 * and one message wakes them with exactly one queued frame.
 */
import { describe, it, expect } from 'vitest';
import { createWorkerFrameLoop } from '../workerFrameLoop';

describe('createWorkerFrameLoop', () => {
  it('sleeps once step returns false and wakes once per wake burst', () => {
    const frames: FrameRequestCallback[] = [];
    let busyFrames = 2;
    let steps = 0;
    const loop = createWorkerFrameLoop(() => { steps++; return busyFrames-- > 0; }, (cb) => frames.push(cb));
    loop.wake(); loop.wake(); loop.wake();
    expect(frames.length).toBe(1);
    while (frames.length) frames.shift()!(0);
    expect(steps).toBe(3);
    expect(loop.isArmed()).toBe(false);
    expect(frames.length).toBe(0);
    loop.wake();
    expect(frames.length).toBe(1);
    expect(loop.isArmed()).toBe(true);
  });
});
