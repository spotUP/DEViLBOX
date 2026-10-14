/**
 * public/worklets/row-clip.js: a clip comes out one render quantum at a time, its last 5 ms fade to silence, and a clip
 * that replaces a sounding one lets it fade out over 5 ms first.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadSharedWorkletScripts } from './workletHarness';

interface Quantum { n: number; stereo: Float32Array; voices: Float32Array[]; pans: Float32Array | null }
interface Helper { active: boolean; play(c: unknown): void; drop(): void; pull(n: number): Quantum | null }

const RATE = 48000;
const FADE = 240;
let Helper!: new (port: { postMessage(m: unknown): void }, rate: number) => Helper;

beforeAll(() => {
  loadSharedWorkletScripts();
  Helper = (globalThis as unknown as { DevilboxRowClip: typeof Helper }).DevilboxRowClip;
});

/** A clip of constant 1.0 on every channel. */
const ones = (frames: number, voices = 2) => ({
  frames, fadeFrames: Math.min(frames, FADE),
  stereo: new Float32Array(frames * 2).fill(1),
  voices: Array.from({ length: voices }, () => new Float32Array(frames).fill(1)),
  panSteps: [{ at: 0, pans: new Float32Array([-1, 1]) }],
});

/** Everything pulled until the helper is idle: left channel and voice 0, plus the quantum sizes. */
function drain(h: Helper) {
  const left: number[] = [], voice0: number[] = [], sizes: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const q = h.pull(128);
    if (!q) break;
    sizes.push(q.n);
    for (let k = 0; k < q.n; k++) { left.push(q.stereo[k * 2]!); voice0.push(q.voices[0]![k]!); }
  }
  return { left, voice0, sizes };
}

describe('DevilboxRowClip', () => {
  it('hands a 1000-frame clip out as 8 quanta and fades exactly its last 240 frames', () => {
    const posted: { type: string }[] = [];
    const h = new Helper({ postMessage: (m) => posted.push(m as { type: string }) }, RATE);
    h.play(ones(1000));
    const { left, voice0, sizes } = drain(h);
    expect(sizes).toHaveLength(8);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(left.slice(0, 1000 - FADE).every((v) => v === 1)).toBe(true);
    expect(left[1000 - FADE + 1]).toBeLessThan(1);
    expect(left[999]).toBeCloseTo(1 / FADE, 6);
    expect(voice0[999]).toBeCloseTo(1 / FADE, 6);
    expect(h.active).toBe(false);
    expect(posted.map((m) => m.type)).toEqual(['rowClipStarted', 'rowClipDone']);
  });

  it('passes the pans of the clip with every quantum', () => {
    const h = new Helper({ postMessage() {} }, RATE);
    h.play(ones(300));
    expect(Array.from(h.pull(128)!.pans!)).toEqual([-1, 1]);
  });

  it('fades the sounding clip over 240 frames when a new one replaces it, then starts the new one', () => {
    const posted: { type: string; frames?: number }[] = [];
    const h = new Helper({ postMessage: (m) => posted.push(m as { type: string }) }, RATE);
    h.play(ones(5000));
    h.pull(128); h.pull(128);                       // 256 frames played
    h.play(ones(500));
    const { left, sizes } = drain(h);
    // the old one: 256 played + 240 faded, then the new one (500, with its own 240 fade) follows without a gap
    expect(left.length).toBe(240 + 500);
    expect(left[0]).toBeCloseTo(1, 6);
    expect(left[239]).toBeCloseTo(1 / FADE, 6);
    expect(left[240]).toBe(1);                      // the new clip starts at full level
    expect(left[739]).toBeCloseTo(1 / FADE, 6);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(740);
    expect(posted.map((m) => m.type)).toEqual(['rowClipStarted', 'rowClipStarted', 'rowClipDone']);
  });

  it('lets a clip already in its own end fade finish rather than cutting it again', () => {
    const h = new Helper({ postMessage() {} }, RATE);
    h.play(ones(1000));
    for (let i = 0; i < 7; i++) h.pull(128);        // 896 played, 104 left, inside the 240 fade
    h.play(ones(200));
    const { left } = drain(h);
    expect(left.length).toBe(104 + 200);
    expect(left[103]).toBeCloseTo(1 / FADE, 6);
  });

  it('drops a sounding clip at once', () => {
    const h = new Helper({ postMessage() {} }, RATE);
    h.play(ones(1000));
    h.pull(128);
    h.drop();
    expect(h.active).toBe(false);
    expect(h.pull(128)).toBeNull();
  });
});
