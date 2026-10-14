/**
 * RowPreviewStream over a scripted player: a deterministic counter whose every sample says which frame it belongs to,
 * so a clip is checked by value, and whose adapter calls are counted, so the cheapest source is checked by count.
 */
import { describe, it, expect } from 'vitest';
import { RowPreviewStream, type RowRenderAdapter } from '../rowPreviewStream';
import { CHUNK_ENDED, CHUNK_LOOPED, rowClipFadeFrames, rowClipMaxFrames, type PlayerPosition, type RowChunk } from '../rowClip';

const RATE = 48000;

interface Script { rowFrames: number; tickFrames: number; rowsPerOrder: number; songFrames: number; loopAt?: number }

/** Frame f is in order floor(f / (R*rows)), row floor(f / R) % rows, tick within the row. Samples encode the frame. */
function fakePlayer(s: Script) {
  const calls = { open: 0, restart: 0, advanceSilent: [] as number[], render: 0, positionAt: 0, masks: [] as number[] };
  let at = 0;
  const posAt = (f: number): PlayerPosition => {
    const row = Math.floor(f / s.rowFrames);
    return { order: Math.floor(row / s.rowsPerOrder), pattern: 0, row: row % s.rowsPerOrder, tick: Math.floor((f % s.rowFrames) / s.tickFrames), speed: s.rowFrames / s.tickFrames };
  };
  const adapter: RowRenderAdapter = {
    sampleRate: RATE,
    open() { calls.open++; at = 0; },
    restart() { calls.restart++; at = 0; },
    advanceSilent(frame) { calls.advanceSilent.push(frame); at = Math.min(frame, s.songFrames); return at; },
    renderChunk(frames, mask): RowChunk {
      calls.render++; calls.masks.push(mask);
      const n = Math.max(0, Math.min(frames, s.songFrames - at));
      const stereo = new Float32Array(n * 2), v0 = new Float32Array(n), v1 = new Float32Array(n);
      for (let i = 0; i < n; i++) { stereo[i * 2] = at + i; stereo[i * 2 + 1] = -(at + i); v0[i] = (at + i) * 2; v1[i] = mask & 1 ? 1 : 0; }
      const first = at;
      at += n;
      let flags = at >= s.songFrames ? CHUNK_ENDED : 0;
      if (s.loopAt !== undefined && first <= s.loopAt && s.loopAt < at) flags |= CHUNK_LOOPED;
      return { frames: n, stereo, voices: [v0, v1], pans: new Float32Array([-1, 1]), flags };
    },
    positionAt(frame) { calls.positionAt++; return frame < s.songFrames ? posAt(frame) : null; },
  };
  return { adapter, calls };
}

const bytes = new Uint8Array([1, 2, 3]);
const SCRIPT: Script = { rowFrames: 1000, tickFrames: 250, rowsPerOrder: 8, songFrames: 8 * 1000 * 3 };
const ALL = 0xffffffff;

async function open(s: Script = SCRIPT) {
  const p = fakePlayer(s);
  const stream = new RowPreviewStream(p.adapter);
  stream.ensureOpen(bytes, ['a']);
  return { ...p, stream };
}
const clipOf = (r: Awaited<ReturnType<RowPreviewStream['request']>>) => {
  if (r.kind !== 'clip') throw new Error(`expected a clip, got ${r.kind}`);
  return r.clip;
};

describe('RowPreviewStream', () => {
  it('renders a row ahead of the cursor by rendering forward, with no restart', async () => {
    const { stream, calls } = await open();
    const clip = clipOf(await stream.request({ kind: 'orderRow', order: 0, row: 5 }, ALL));
    expect(clip.startFrame).toBe(5000);
    expect(clip.frames).toBe(1000);
    expect(clip.stereo[0]).toBe(5000);
    expect(clip.stereo[clip.frames * 2 - 2]).toBe(5999);
    expect(clip.voices![0]![999]).toBe(5999 * 2);
    expect(calls.restart).toBe(0);
    expect(calls.advanceSilent).toEqual([]);
  });

  it('serves the next row from the tail: no restart, and about one row of rendering', async () => {
    const { stream, calls } = await open();
    await stream.request({ kind: 'orderRow', order: 0, row: 5 }, ALL);
    const before = calls.render;
    const next = clipOf(await stream.request({ kind: 'orderRow', order: 0, row: 6 }, ALL));
    expect(next.startFrame).toBe(6000);
    expect(next.stereo[0]).toBe(6000);
    expect(calls.restart).toBe(0);
    expect(calls.render - before).toBeLessThanOrEqual(Math.ceil(1000 / 128) + 1);
  });

  it('serves a repeated press of the same row without rendering again', async () => {
    const { stream, calls } = await open();
    const a = clipOf(await stream.request({ kind: 'orderRow', order: 0, row: 2 }, ALL));
    const n = calls.render;
    const b = clipOf(await stream.request({ kind: 'orderRow', order: 0, row: 2 }, ALL));
    expect(b).toBe(a);
    expect(calls.render).toBe(n);
  });

  it('restarts and advances silently to the exact frame the timeline knows when the row is behind the cursor', async () => {
    const { stream, calls } = await open();
    await stream.request({ kind: 'orderRow', order: 0, row: 7 }, ALL);
    const clip = clipOf(await stream.request({ kind: 'orderRow', order: 0, row: 3 }, ALL));
    expect(calls.restart).toBe(1);
    expect(calls.advanceSilent).toEqual([3000]);
    expect(clip.startFrame).toBe(3000);
    expect(clip.stereo[0]).toBe(3000);
    expect(clip.frames).toBe(1000);
  });

  it('restarts when the mute mask changed, so the clip is rendered with the new mask', async () => {
    const { stream, calls } = await open();
    await stream.request({ kind: 'orderRow', order: 0, row: 2 }, ALL);
    const clip = clipOf(await stream.request({ kind: 'orderRow', order: 0, row: 2 }, 0xfffffffe));
    expect(calls.restart).toBe(1);
    expect(calls.masks[calls.masks.length - 1]).toBe(0xfffffffe);
    expect(clip.voices![1]![0]).toBe(0);
  });

  it('answers a row the song never reaches with missed', async () => {
    const { stream } = await open({ ...SCRIPT, songFrames: 3000 });
    const r = await stream.request({ kind: 'orderRow', order: 2, row: 1 }, ALL);
    expect(r).toEqual({ kind: 'missed', reason: 'ended' });
    const looped = await open({ ...SCRIPT, loopAt: 4500 });
    expect(await looped.stream.request({ kind: 'orderRow', order: 1, row: 7 }, ALL)).toEqual({ kind: 'missed', reason: 'looped' });
  });

  it('renders a ticks target that spans rows as one clip', async () => {
    const { stream } = await open();
    // speed = rowFrames / tickFrames = 4 ticks per row; ticks 8..16 are rows 2 and 3 of order 0.
    const clip = clipOf(await stream.request({ kind: 'ticks', from: 8, to: 16 }, ALL));
    expect(clip.startFrame).toBe(2000);
    expect(clip.frames).toBe(2000);
  });

  it('fades the last round(0.005 * rate) frames and cuts a row at ten seconds', async () => {
    const { stream } = await open();
    const clip = clipOf(await stream.request({ kind: 'orderRow', order: 0, row: 1 }, ALL));
    expect(clip.fadeFrames).toBe(rowClipFadeFrames(RATE));
    expect(clip.fadeFrames).toBe(240);
    const long = await open({ rowFrames: RATE * 15, tickFrames: RATE * 15, rowsPerOrder: 2, songFrames: RATE * 60 });
    const cut = clipOf(await long.stream.request({ kind: 'orderRow', order: 0, row: 1 }, ALL));
    expect(cut.frames).toBe(rowClipMaxFrames(RATE));
    expect(cut.frames).toBe(480000);
  });

  it('gives each voice its own buffer and the pans in force from the chunk start', async () => {
    const { stream } = await open();
    const clip = clipOf(await stream.request({ kind: 'orderRow', order: 0, row: 1 }, ALL));
    expect(clip.voices).toHaveLength(2);
    expect(clip.panSteps[0]!.at).toBe(0);
    expect(Array.from(clip.panSteps[0]!.pans)).toEqual([-1, 1]);
  });

  it('reopens and drops the timeline only when the module bytes or arguments changed', async () => {
    const { stream, calls } = await open();
    await stream.request({ kind: 'orderRow', order: 0, row: 4 }, ALL);
    expect(stream.ensureOpen(bytes.slice(), ['a'])).toBe(false);
    expect(calls.open).toBe(1);
    expect(stream.ensureOpen(new Uint8Array([1, 2, 4]), ['a'])).toBe(true);
    expect(stream.ensureOpen(new Uint8Array([1, 2, 4]), ['b'])).toBe(true);
    expect(calls.open).toBe(3);
    const r = clipOf(await stream.request({ kind: 'orderRow', order: 0, row: 1 }, ALL));
    expect(r.startFrame).toBe(1000);
    // a Map of companion files compares by content
    expect(stream.ensureOpen(new Uint8Array([1, 2, 4]), ['b'])).toBe(false);
    const m1 = new Map([['x', new Uint8Array([1]).buffer]]);
    expect(stream.ensureOpen(bytes, [m1])).toBe(true);
    expect(stream.ensureOpen(bytes, [new Map([['x', new Uint8Array([1]).buffer]])])).toBe(false);
  });

  it('returns cancelled when a newer request replaces a search, and the stream stays usable', async () => {
    const p = fakePlayer({ ...SCRIPT, songFrames: RATE * 600, rowsPerOrder: 64, rowFrames: 4800, tickFrames: 4800 });
    let t = 0;
    const stream = new RowPreviewStream(p.adapter, { now: () => (t += 30), sliceMs: 20, yieldNow: async () => {} });
    stream.ensureOpen(bytes, []);
    const signal = { cancelled: false };
    const pending = stream.request({ kind: 'orderRow', order: 1, row: 5 }, ALL, signal);
    signal.cancelled = true;
    expect(await pending).toEqual({ kind: 'cancelled' });
    const clip = clipOf(await stream.request({ kind: 'orderRow', order: 0, row: 3 }, ALL));
    expect(clip.stereo[0]).toBe(3 * 4800);
  });
});
