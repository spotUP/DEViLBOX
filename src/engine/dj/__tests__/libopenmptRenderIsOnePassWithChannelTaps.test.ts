/**
 * A libopenmpt deck render is one pass: every channel's scope and stem come from the
 * mixer's per-channel taps, not from a solo instance per channel.
 *
 * Bug (SID-FOLLOWUP-2 d, since fd5da5d3c): the render worker created one libopenmpt
 * instance per shown channel (up to 16), each re-rendering the whole module with every
 * other channel muted - 17 renders for a 16-channel module. libopenmpt is now built from
 * source (third-party/libopenmpt-render: 0.8.4 = the tracker's shipped version, rendered
 * sample-exact) with taps: each pattern channel's share of the mix from the same pass.
 *
 * Drives the real render worker in-process (public/chiptune3/libopenmpt.render.js).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installInProcessDJRenderWorker } from '@/test/audio/inProcessDJRenderWorker';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch } from '@/test/audio/realWebAudio';
import { decodeStemsFlac } from '../channelStemCodec';
import type { ChannelScopeTrack } from '../channelScopeTrack';

interface Rendered { left: Float32Array; channelScopes?: ChannelScopeTrack }

function render(file: string, seconds: number): Promise<Rendered> {
  const b = readFileSync(join(process.cwd(), 'public/data/songs/formats', file));
  const w = new Worker(new URL('@/workers/dj-render.worker.ts', import.meta.url));
  return new Promise((resolve, reject) => {
    w.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'renderComplete') resolve(e.data);
      if (e.data.type === 'renderError') reject(new Error(e.data.error));
    };
    w.postMessage({ type: 'render', id: file, fileBuffer: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), filename: file, subsong: 0, maxSeconds: seconds, stems: true });
  });
}

describe('a libopenmpt render is one pass with channel taps', () => {
  let restore: () => void = () => {};
  beforeAll(async () => {
    installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch();
    await (await import('@/lib/export/audioEncoders')).encodeFlac([new Float32Array(16)], 44100);
    restore = installInProcessDJRenderWorker();
  });
  afterAll(() => restore());

  it('a 16-channel S3M: one pass with 16 taps, 16 scopes and stems, the stems summing to the mix', async () => {
    const log = vi.spyOn(console, 'log');
    const r = await render('nightmare on acid.s3m', 20);
    const pass = log.mock.calls.map((c) => String(c[0])).find((m) => m.includes('[DJRenderWorker/libopenmpt]'));
    log.mockRestore();
    expect(pass, 'the render ran the tapped pass').toContain('one pass with 16 channel taps');
    expect(r.channelScopes?.channels.length).toBe(16);
    const stems = await decodeStemsFlac(r.channelScopes?.flacStems ?? []);
    const gains = r.channelScopes?.stemGains ?? [];
    expect(stems.length).toBe(16);
    let err = 0, sig = 0;
    for (let i = 0; i < r.left.length; i++) {
      let sum = 0;
      stems.forEach((st, k) => { sum += st ? (st[0][i] ?? 0) * gains[k][0] : 0; });
      err += (sum - r.left[i]) ** 2;
      sig += r.left[i] ** 2;
    }
    // int16 stems and WAV: the sum meets the mix at the 16-bit floor, far below any channel.
    expect(10 * Math.log10(err / sig)).toBeLessThan(-60);
  }, 300_000);
});
