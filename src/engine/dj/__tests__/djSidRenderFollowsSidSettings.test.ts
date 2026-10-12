/**
 * A DJ deck render of a SID follows SID Settings: the chip model and the clock
 * the user forces reach the render, and the audio cache keeps one render per
 * forced model / clock.
 *
 * Bug (SID-FOLLOWUP-2 f, owner 2026-10-13): the cache was keyed by the file
 * alone and the render worker always played the header's model, so a deck
 * kept playing the header's 6581 after the user forced an 8580 (and the first
 * render after a change was cached under the file, serving every later load).
 * Same for the clock (SID-FOLLOWUP-2 c): WebSID's emu_set_ntsc re-timed the
 * SID and VIC only, and the track start that follows every load put the
 * header's clock back.
 *
 * Drives the real path: DJPipeline.loadOrEnqueue -> the real render worker
 * in-process (real WebSID WASM) -> the IndexedDB audio cache.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installInProcessDJRenderWorker } from '@/test/audio/inProcessDJRenderWorker';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch } from '@/test/audio/realWebAudio';
import { useSettingsStore } from '@/stores/useSettingsStore';

interface Rendered { left: Float32Array; playerCallHz?: number }

const commando = (): ArrayBuffer => {
  const b = readFileSync(join(process.cwd(), 'src/lib/sid/__tests__/fixtures/Commando.sid'));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

function render(sid: Record<string, string>): Promise<Rendered> {
  const w = new Worker(new URL('@/workers/dj-render.worker.ts', import.meta.url));
  return new Promise((resolve, reject) => {
    w.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'renderComplete') resolve(e.data);
      if (e.data.type === 'renderError') reject(new Error(e.data.error));
    };
    w.postMessage({ type: 'render', id: `c-${JSON.stringify(sid)}`, fileBuffer: commando(), filename: 'Commando.sid', subsong: 0, maxSeconds: 8, stems: false, sid });
  });
}

/** Level of a - b relative to a, dB. */
function diffDb(a: Float32Array, b: Float32Array): number {
  let e = 0, s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { e += (a[i] - b[i]) ** 2; s += a[i] ** 2; }
  return 10 * Math.log10(e / s);
}

describe('a DJ render of a SID follows SID Settings', () => {
  let restore: () => void = () => {};
  beforeAll(async () => {
    installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch();
    // The worker encodes the stems as FLAC; load the encoder while process.versions is real.
    await (await import('@/lib/export/audioEncoders')).encodeFlac([new Float32Array(16)], 44100);
    restore = installInProcessDJRenderWorker();
  });
  afterAll(() => restore());
  afterEach(() => useSettingsStore.setState({ sidChipModel: 'auto', sidClockSpeed: 'auto' }));

  it('the render worker plays a forced 8580 and a forced NTSC (Commando: a 6581 PAL tune)', async () => {
    const header = await render({});
    const as8580 = await render({ chipModel: '8580' });
    const ntsc = await render({ clock: 'NTSC' });
    // Another chip is another sound; the header's own model forced is the header's sound.
    expect(diffDb(header.left, as8580.left)).toBeGreaterThan(-20);
    expect(diffDb(header.left, (await render({ chipModel: '6581' })).left)).toBe(-Infinity);
    // The player runs once per frame: 50.125 Hz on PAL, 59.83 Hz on NTSC (1022727 / 17095 cycles).
    expect(header.playerCallHz).toBeCloseTo(985249 / 19656, 3);
    expect(ntsc.playerCallHz).toBeCloseTo(1022727 / 17095, 3);
  }, 300_000);

  it('the deck render cache keeps one render per forced model: a change renders again, going back is a cache hit', async () => {
    const { getDJPipeline } = await import('../DJPipeline');
    const { getCachedAudio } = await import('../DJAudioCache');
    const pipeline = getDJPipeline();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renders = vi.spyOn(pipeline as any, 'doRender');
    // No analysis worker in-process: the render and its cache entry are what this test reads.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(pipeline as any, 'doAnalysis').mockResolvedValue(null);
    const bytes = commando();

    const auto = await pipeline.loadOrEnqueue(bytes, 'Commando.sid', undefined, 'high', undefined, 8);
    expect(renders).toHaveBeenCalledTimes(1);

    useSettingsStore.getState().setSidChipModel('8580');
    expect(await getCachedAudio(bytes, { allowPreview: true })).toBeNull();
    const forced = await pipeline.loadOrEnqueue(bytes, 'Commando.sid', undefined, 'high', undefined, 8);
    expect(renders).toHaveBeenCalledTimes(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((renders.mock.calls[1][0] as any).sid).toEqual({ chipModel: '8580' });
    expect(forced.wavData.byteLength).toBe(auto.wavData.byteLength);
    expect(new Uint8Array(forced.wavData)).not.toEqual(new Uint8Array(auto.wavData));

    useSettingsStore.getState().setSidChipModel('auto');
    const again = await getCachedAudio(bytes, { allowPreview: true });
    expect(new Uint8Array(again!.audioData)).toEqual(new Uint8Array(auto.wavData));
    vi.restoreAllMocks();
  }, 300_000);
});
