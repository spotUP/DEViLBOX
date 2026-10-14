/**
 * The row-preview host, through the client over an in-process transport: a second request cancels the first, a prepared
 * row is answered without the player, changed bytes reopen, and an engine without an adapter is an error.
 */
import { describe, it, expect } from 'vitest';
import { createRowPreviewHost } from '../rowPreviewHost';
import { createRowPreviewClient, transportOverHost } from '../rowPreviewClient';
import { ROW_PREVIEW_ADAPTERS } from '../adapters';
import { ROW_PREVIEW_ENGINE_KEYS } from '../supportedEngines';
import { CHUNK_ENDED, type PlayerPosition, type RowChunk } from '../rowClip';
import type { RowRenderAdapter } from '../rowPreviewStream';
import type { RowPreviewRequest } from '../rowPreviewProtocol';

function player(rowFrames = 1000, songFrames = 100000) {
  const calls = { open: 0, render: 0, restart: 0 };
  let at = 0;
  const adapter: RowRenderAdapter = {
    sampleRate: 48000,
    open() { calls.open++; at = 0; },
    restart() { calls.restart++; at = 0; },
    advanceSilent(f) { at = f; return f; },
    renderChunk(frames): RowChunk {
      calls.render++;
      const n = Math.min(frames, songFrames - at);
      const stereo = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { stereo[i * 2] = at + i; stereo[i * 2 + 1] = at + i; }
      at += n;
      return { frames: n, stereo, voices: [new Float32Array(n)], pans: new Float32Array([0]), flags: at >= songFrames ? CHUNK_ENDED : 0 };
    },
    positionAt(f): PlayerPosition { const r = Math.floor(f / rowFrames); return { order: 0, pattern: 0, row: r, tick: 0, speed: 1 }; },
  };
  return { adapter, calls };
}

const req = (row: number, over: Partial<RowPreviewRequest> = {}): RowPreviewRequest => ({
  engineKey: 'Fake', data: new Uint8Array([1, 2, 3]), args: ['x'], sampleRate: 48000,
  target: { kind: 'orderRow', order: 0, row }, mask: 0xffffffff, ...over,
});

function rig(opts: { rowFrames?: number } = {}) {
  const p = player(opts.rowFrames);
  const host = createRowPreviewHost({ Fake: async () => p.adapter }, { yieldNow: async () => {}, now: (() => { let t = 0; return () => (t += 30); })(), sliceMs: 20 });
  return { ...p, host, client: createRowPreviewClient(transportOverHost(host)) };
}

describe('row preview host', () => {
  it('a second request cancels the first, which resolves cancelled; the second gets its clip', async () => {
    const { client } = rig();
    const first = client.request(req(80));       // a long forward search
    const second = client.request(req(3));
    expect((await first).kind).toBe('cancelled');
    const r = await second;
    expect(r.kind).toBe('clip');
    if (r.kind === 'clip') expect(r.clip.stereo[0]).toBe(3000);
  });

  it('a prepared row is answered without calling the player again', async () => {
    const { client, calls } = rig();
    const prepared = await client.prepare(req(5));
    expect(prepared.kind).toBe('clip');
    const rendered = calls.render;
    const r = await client.request(req(5));
    expect(r.kind).toBe('clip');
    expect(calls.render).toBe(rendered);
    expect(calls.restart).toBe(0);
  });

  it('skips a prefetch while a real request is pending', async () => {
    const { client } = rig();
    const real = client.request(req(10));
    const pre = client.prepare(req(11));
    expect(await pre).toEqual({ kind: 'skipped' });
    expect((await real).kind).toBe('clip');
  });

  it('reopens the player when the module bytes change and not when they are the same', async () => {
    const { client, calls } = rig();
    await client.request(req(2));
    await client.request(req(3, { data: new Uint8Array([1, 2, 3]) }));
    expect(calls.open).toBe(1);
    await client.request(req(3, { data: new Uint8Array([9, 9, 9]) }));
    expect(calls.open).toBe(2);
  });

  it('answers an error for an engine with no adapter', async () => {
    const { client } = rig();
    await expect(client.request(req(1, { engineKey: 'Nope' }))).rejects.toThrow(/no adapter for engine Nope/);
  });

  it('keeps the adapter registry and the supported-engine list one list', () => {
    expect(new Set(Object.keys(ROW_PREVIEW_ADAPTERS))).toEqual(new Set(ROW_PREVIEW_ENGINE_KEYS));
  });
});
