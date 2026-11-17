import { describe, it, expect } from 'vitest';
import { FurnaceChipType } from '../../../../engine/chips/FurnaceChipEngine';
import type { RegisterWrite } from '../../VGMExporter';
import { captureToFrames } from '../../zx/zxAyStream';

const RATE = 44100;
const tick = (hz: number, k: number, reg: number, data: number): RegisterWrite =>
  ({ timestamp: Math.round(k * RATE / hz), chipType: FurnaceChipType.AY, port: reg, data });

describe('captureToFrames on a 60 Hz song', () => {
  const N = 120;
  const writes: RegisterWrite[] = [];
  for (let k = 0; k < N; k++) writes.push(tick(60, k, 0, k & 0xFF), tick(60, k, 13, 8 + (k & 1)));
  const frames = captureToFrames(writes, RATE);

  it('leaves no empty frame between ticks', () => {
    expect(frames.every((f) => f.some((v) => v !== undefined))).toBe(true);
  });
  it('stays anchored to real time: 120 ticks at 60 Hz are 100 frames, no tempo drift', () => {
    expect(frames.length).toBe(100);
  });
  it('keeps one envelope retrigger per frame (more than 50 per second cannot fit)', () => {
    expect(frames.filter((f) => f[13] !== undefined).length).toBe(frames.length);
  });
});

describe('captureToFrames merging two ticks with retriggers', () => {
  const at = (frame: number, reg: number, data: number): RegisterWrite =>
    ({ timestamp: Math.round(frame * RATE / 50), chipType: FurnaceChipType.AY, port: reg, data });
  it('moves the bumped retrigger to the next frame when that tick has none', () => {
    const f = captureToFrames([at(0, 13, 8), at(0.4, 13, 9), at(1, 0, 1)], RATE);
    expect(f.map((x) => x[13])).toEqual([8, 9]);
  });
  it('drops it when the next tick retriggers itself', () => {
    const f = captureToFrames([at(0, 13, 8), at(0.4, 13, 9), at(1, 13, 10)], RATE);
    expect(f.map((x) => x[13])).toEqual([8, 10]);
  });
});

describe('captureToFrames on a 50 Hz song', () => {
  it('is one frame per tick', () => {
    const w = [0, 1, 2, 4].map((k) => tick(50, k, 0, k));
    expect(captureToFrames(w, RATE).map((f) => f[0])).toEqual([0, 1, 2, undefined, 4]);
  });
});
