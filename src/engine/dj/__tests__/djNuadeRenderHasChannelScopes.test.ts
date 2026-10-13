/**
 * ND-1..ND-3: a nuade-played song on a DJ deck renders through nuade and the deck gets one scope and one stem per voice.
 *
 * Before: the render worker sent every Amiga file to UADE (one mix, no per-voice tap), whatever engine the song's format
 * was set to. Now DJPipeline asks the engine resolver once on the main thread (nuadePlayerFor), the worker renders the
 * stereo mix and every voice in one nuade pass, and the engine is part of the cache key, so a switch re-renders.
 *
 * Drives the real path: DJPipeline.loadOrEnqueue -> the real render worker in-process (real Nuade.wasm) ->
 * DeckEngine.loadAudioFile -> the deck's channelScopeCount and DeckEngine.getChannelWaveforms.
 * The engine choice is pinned here (the table's default is rollout data).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({ setInstrumentOutputOverride: () => {}, preloadInstruments: async () => {}, ensureWASMSynthsReady: async () => {}, rerouteNativeEngine: () => {} }),
}));

import { installInProcessDJRenderWorker } from '@/test/audio/inProcessDJRenderWorker';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch, audioLoadsSettled } from '@/test/audio/realWebAudio';
import { NuadeHeadless } from '@/engine/nuade/nuadeHeadless';
import { setNuadeProbe } from '@/engine/nuade/nuadeProbe';

const MMDC = 'public/data/songs/formats/captain planet and the planeteers - title.mmdc';
const NAME = 'captain planet and the planeteers - title.mmdc';
const SECONDS = 12;

describe('a nuade-played song on a DJ deck has one scope and one stem per voice', () => {
  let restoreWorkers: () => void = () => {};
  beforeAll(async () => {
    installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch();
    const Tone = await import('tone');
    Tone.setContext(new OfflineAudioContext(2, 48000, 48000) as never);
    await (await import('@/lib/export/audioEncoders')).encodeFlac([new Float32Array(16)], 44100);
    // nuade's own probe (the app loads Nuade.wasm on the main thread).
    const nu = await NuadeHeadless.create();
    setNuadeProbe(async (id, bytes, name) => nu.probeWith(id, bytes, name));
    restoreWorkers = installInProcessDJRenderWorker();
  });
  afterAll(() => restoreWorkers());

  it('the render ran on nuade, the deck shows 4 voice scopes carrying signal, 4 mono stems; switching the engine is a different cache entry', async () => {
    const { useSettingsStore } = await import('@/stores/useSettingsStore');
    useSettingsStore.getState().setFormatEngine('mmdc', 'nuade');
    const log = vi.spyOn(console, 'log');
    const Tone = await import('tone');
    const { getDJPipeline } = await import('../DJPipeline');
    const bytes = readFileSync(join(process.cwd(), MMDC));
    const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const result = await getDJPipeline().loadOrEnqueue(source, NAME, undefined, 'high', undefined, SECONDS);
    const sentinel = log.mock.calls.map((c) => String(c[0])).find((m) => m.includes('[DJRenderWorker/nuade]'));
    log.mockRestore();
    expect(sentinel, 'the worker rendered with nuade').toContain('mmdc, one pass with 4 voice taps');

    const { DeckEngine } = await import('../DeckEngine');
    const { useDJStore } = await import('@/stores/useDJStore');
    const out = new Tone.Gain(1);
    out.connect(Tone.getDestination().input as never);
    const deck = new DeckEngine({ id: 'A', outputNode: out });
    await audioLoadsSettled(400, 20000);
    await deck.loadAudioFile(result.wavData, NAME);
    expect(useDJStore.getState().decks.A.channelScopeCount).toBe(4);
    expect(deck.channelStemCount).toBe(4);
    const peaks = [0, 0, 0, 0];
    for (let t = 0.5; t < SECONDS - 0.5; t += 0.25) {
      vi.spyOn(deck, 'getHeardPosition').mockReturnValue(t);
      deck.getChannelWaveforms().forEach((ch, i) => { peaks[i] = Math.max(peaks[i], ch.reduce((m, v) => Math.max(m, Math.abs(v)), 0)); });
    }
    deck.dispose();
    expect(peaks.filter((p) => p > 0.01).length, JSON.stringify(peaks)).toBeGreaterThanOrEqual(2);

    // The render is cached under the nuade engine: the same file asked for under UADE is not that entry.
    const { getCachedAudio } = await import('../DJAudioCache');
    const { resolveRenderPlayer } = await import('../djRenderEngine');
    const { hashFile } = await import('../DJAudioCache');
    const hash = await hashFile(source);
    expect((await getCachedAudio(source, { allowPreview: true }))?.audioData.byteLength).toBeGreaterThan(0);
    useSettingsStore.getState().setFormatEngine('mmdc', 'uade');
    expect(await resolveRenderPlayer(hash, NAME, source)).toBeNull();
    expect((await getCachedAudio(source, { allowPreview: true }))?.audioData.byteLength ?? 0).toBe(0);
    useSettingsStore.getState().setFormatEngine('mmdc', 'nuade');
    expect(await resolveRenderPlayer(hash, NAME, source)).toBe('mmdc');
    expect((await getCachedAudio(source, { allowPreview: true }))?.audioData.byteLength).toBeGreaterThan(0);
  }, 300_000);
});
