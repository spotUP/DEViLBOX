/**
 * A deck never plays the playlist analyser's 90 s preview render as the
 * track (owner 2026-10-12, DECK-BPM-MODULE). The analyser renders a preview
 * (PREVIEW_RENDER_CAP_SEC) and the pipeline cached it under the song's source
 * hash like any render; the next deck load of that song was a full cache hit
 * and played the preview: 'suggestive vibes' (179 s) stopped at 90.0005 s,
 * and its module tempo was rejected because the walk did not match the
 * render, so the deck showed the audio detector's 184.57 BPM.
 *
 * Drives DJPipeline.loadOrEnqueue (real queue, real IndexedDB cache) with a
 * stand-in render worker that renders the 180 s song up to its cap.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => null,
  getDJEngineIfActive: () => null,
}));

import { cacheAudio, getCachedAudio, PREVIEW_RENDER_CAP_SEC } from '../DJAudioCache';

const SONG_SEC = 180;
const SR = 1000;
const renders: Array<number | undefined> = [];

/** Render worker: the song is 180 s, a capped render stops at its cap. Analysis worker: fails (not under test). */
class StandInWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  private readonly url: string;
  constructor(url: URL | string) { this.url = String(url); }
  postMessage(msg: { type: string; id?: string; maxSeconds?: number }) {
    if (msg.type === 'analyze') {
      setTimeout(() => this.onmessage?.({ data: { type: 'analysisError', id: msg.id, error: 'not under test' } }), 1);
      return;
    }
    if (msg.type !== 'render' || !this.url.includes('dj-render')) return;
    renders.push(msg.maxSeconds);
    const duration = Math.min(SONG_SEC, msg.maxSeconds ?? SONG_SEC);
    const frames = duration * SR;
    setTimeout(() => this.onmessage?.({ data: {
      type: 'renderComplete', id: msg.id, left: new Float32Array(frames), right: new Float32Array(frames), sampleRate: SR, duration,
    } }), 1);
  }
  terminate() {}
}

/** Make the stored entries old-shape: written before renderCapSec was recorded. */
async function forgetRenderCaps(): Promise<void> {
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open('DEViLBOX_AudioCache', 2);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  await new Promise<void>((res, rej) => {
    const tx = db.transaction('audioCache', 'readwrite');
    const store = tx.objectStore('audioCache');
    const all = store.getAll();
    all.onsuccess = () => { for (const e of all.result) { delete e.renderCapSec; store.put(e); } };
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
  db.close();
}

describe('the playlist preview render never reaches a deck', () => {
  it('a deck load after the analyser previewed the song renders and plays the whole song', async () => {
    vi.stubGlobal('Worker', StandInWorker);
    const { getDJPipeline } = await import('../DJPipeline');
    const source = new Uint8Array(600).fill(5).buffer;

    // The playlist analyser: a capped preview, cached.
    const preview = await getDJPipeline().loadOrEnqueue(source, 'song.mod', undefined, 'low', undefined, PREVIEW_RENDER_CAP_SEC);
    expect(preview.duration).toBe(PREVIEW_RENDER_CAP_SEC);
    expect((await getCachedAudio(source, { allowPreview: true }))!.renderCapSec).toBe(PREVIEW_RENDER_CAP_SEC);
    // A deck reading the cache finds no audio to play, only the source to render.
    const asDeck = (await getCachedAudio(source))!;
    expect(asDeck.audioData.byteLength).toBe(0);
    expect(asDeck.sourceData!.byteLength).toBe(600);

    // The deck load: a whole-song render, not the preview.
    const full = await getDJPipeline().loadOrEnqueue(source, 'song.mod', undefined, 'high');
    expect(renders).toEqual([PREVIEW_RENDER_CAP_SEC, undefined]);
    expect(full.duration).toBe(SONG_SEC);
    const entry = (await getCachedAudio(source))!;
    expect(entry.duration).toBe(SONG_SEC);
    expect(entry.renderCapSec).toBeNull();
    expect(entry.audioData.byteLength).toBeGreaterThan(0);

    vi.unstubAllGlobals();
  }, 120_000); // the pipeline's import graph alone takes ~20 s on a loaded machine

  it('an entry cached before render caps were recorded is a preview when it ends at the cap', async () => {
    const preview = new Uint8Array(700).fill(6).buffer;
    const whole = new Uint8Array(700).fill(8).buffer;
    const wav = new Uint8Array(2048).fill(1).buffer;
    // 90.0005 s: what the capped render wrote (969 chunks of 4096 frames at 44.1 kHz), as found live.
    await cacheAudio(preview, 'suggestive vibes.mod', wav, 90.00054421768708, new Float32Array([0.2]), 44100, 2);
    await cacheAudio(whole, 'whole.mod', wav.slice(0), 143.2, new Float32Array([0.2]), 44100, 2);
    await forgetRenderCaps();
    expect((await getCachedAudio(preview))!.audioData.byteLength).toBe(0);
    expect((await getCachedAudio(preview, { allowPreview: true }))!.audioData.byteLength).toBe(2048);
    expect((await getCachedAudio(whole))!.audioData.byteLength).toBe(2048);
  });
});
