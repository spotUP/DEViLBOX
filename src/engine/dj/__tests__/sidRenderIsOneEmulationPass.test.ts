/**
 * A SID render is one emulation pass, stems and player clock included.
 *
 * Bug (owner 2026-10-12): every SID render was slow and a 3SID one
 * (Arcade_Memories_3SID) never finished - "Task timeout after 180 s", the deck
 * stuck on one scope. Each voice's stem was a full solo re-render of the tune
 * (emu_enable_voice on one voice, all others muted), so a render cost
 * 1 + voices emulations: 4 for a 1-chip SID, 9 for a 3SID once every chip's
 * voices got a stem (SID-DECK-AUDIT 1). Node, 180 s renders: Commando 46 s,
 * Arcade_Memories_3SID 174 s (57e7803be, 3 stems: 50 s / 118 s).
 *
 * WebSID now writes each voice's share of the output beside the mix in the
 * same pass (third-party/websid emu_enable_stems): the stems sum to the mix,
 * and stems cost a fraction of a pass, not a pass each.
 *
 * Drives the real render worker in-process (real WebSID WASM, real FLAC stems).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installInProcessDJRenderWorker } from '@/test/audio/inProcessDJRenderWorker';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch } from '@/test/audio/realWebAudio';
import { decodeStemsFlac } from '../channelStemCodec';
import type { ChannelScopeTrack } from '../channelScopeTrack';

interface Rendered { left: Float32Array; right: Float32Array; channelScopes?: ChannelScopeTrack; playerCallHz?: number; ms: number }

function render(file: string, seconds: number, stems: boolean): Promise<Rendered> {
  const b = readFileSync(join(process.cwd(), 'src/lib/sid/__tests__/fixtures', file));
  const w = new Worker(new URL('@/workers/dj-render.worker.ts', import.meta.url));
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    w.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'renderComplete') resolve({ ...e.data, ms: Date.now() - t0 });
      if (e.data.type === 'renderError') reject(new Error(e.data.error));
    };
    w.postMessage({ type: 'render', id: `${file}-${stems}`, fileBuffer: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), filename: file, subsong: 0, maxSeconds: seconds, stems });
  });
}

describe('a SID render is one emulation pass', () => {
  let restore: () => void = () => {};
  beforeAll(async () => {
    installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch();
    // The worker encodes the stems as FLAC; load the encoder while process.versions is real.
    await (await import('@/lib/export/audioEncoders')).encodeFlac([new Float32Array(16)], 44100);
    restore = installInProcessDJRenderWorker();
  });
  afterAll(() => restore());

  it('a 2SID (Sparkster - Lakeside) has a stem per voice from the mix pass: the 6 stems sum to the mix', async () => {
    const r = await render('Sparkster-Lakeside_2SID.sid', 20, true);
    const stems = await decodeStemsFlac(r.channelScopes?.flacStems ?? []);
    expect(stems.length).toBe(6);
    let err = 0, sig = 0;
    for (let i = 0; i < r.left.length; i++) {
      let sum = 0;
      for (const st of stems) sum += st ? st[0][i] ?? 0 : 0;
      err += (sum - r.left[i]) ** 2;
      sig += r.left[i] ** 2;
    }
    // Solo re-renders missed the mix by 20-35 dB (each solo run is its own emulation).
    expect(10 * Math.log10(err / sig)).toBeLessThan(-40);
  }, 300_000);

  it('a 3SID (Arcade_Memories) renders its 8 stems at a fraction of a pass each, not a pass each', async () => {
    await render('Commando.sid', 2, false); // warm the WebSID module
    const plain = await render('Arcade_Memories_3SID.sid', 30, false);
    const withStems = await render('Arcade_Memories_3SID.sid', 30, true);
    expect(withStems.channelScopes?.flacStems?.length).toBe(8);
    // Eight solo re-renders took ~9x the plain render; one pass with stems (their FLAC encode included) stays well under half of that.
    expect(withStems.ms, `stems ${withStems.ms} ms vs plain ${plain.ms} ms`).toBeLessThan(plain.ms * 4);
  }, 600_000);

  it('the render reports the player call rate: a VBI tune runs at the PAL frame rate', async () => {
    const r = await render('Commando.sid', 30, false);
    expect(r.playerCallHz).toBeCloseTo(985249 / 19656, 4);
  }, 300_000);
});
