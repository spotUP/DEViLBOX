/**
 * Reachability: the DJ deck channel scopes (DeckScopes CH1..CH4) were flat
 * for every module while ALL moved (owner report 2026-10-11). A deck plays the
 * WAV the DJ render worker pre-rendered, and the scope path read the JS
 * replayer's channel analysers, which nothing feeds in audio mode.
 *
 * Drives the real path: DJPipeline.loadOrEnqueue -> the real render worker
 * (dj-render.worker.ts, run in-process) rendering a ProTracker module through
 * the real UADE WASM -> the WAV and its scope track -> DeckEngine.loadAudioFile
 * -> DeckEngine.getChannelWaveforms at the heard position, the getter the
 * deck scopes poll (useDeckVisualizationData). Before the fix that getter
 * returned no channels at all; the sentinel is per-channel signal arriving.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({ setInstrumentOutputOverride: () => {}, preloadInstruments: async () => {}, ensureWASMSynthsReady: async () => {}, rerouteNativeEngine: () => {} }),
}));

import { installInProcessDJRenderWorker } from '@/test/audio/inProcessDJRenderWorker';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch, audioLoadsSettled } from '@/test/audio/realWebAudio';

const SONG = 'a sleep so deep.mod';

describe('DJ deck channel scopes show a native engine\'s channels', () => {
  it('a module rendered through UADE reaches the deck scope getter with signal on its channels', async () => {
    installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch();
    const Tone = await import('tone');
    const SR = 48000;
    const ctx = new OfflineAudioContext(2, SR, SR);
    Tone.setContext(ctx as never);

    // The render worker encodes the stems as FLAC; load the encoder while process.versions is real
    // (the in-process worker stubs it for the Emscripten glue, which the FLAC loader would trip on).
    await (await import('@/lib/export/audioEncoders')).encodeFlac([new Float32Array(16)], 44100);
    const restoreWorkers = installInProcessDJRenderWorker();
    const { getDJPipeline } = await import('../DJPipeline');
    const bytes = readFileSync(join(process.cwd(), 'public/data/songs/formats', SONG));
    const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const result = await getDJPipeline().loadOrEnqueue(source, SONG, undefined, 'high', undefined, 30);
    restoreWorkers();

    const { DeckEngine } = await import('../DeckEngine');
    const out = new Tone.Gain(1);
    out.connect(Tone.getDestination().input as never);
    const deck = new DeckEngine({ id: 'A', outputNode: out });
    await audioLoadsSettled(400, 20000);
    await deck.loadAudioFile(result.wavData, SONG);

    // Read the scopes across the render, at the heard position the deck reports.
    const peaks = [0, 0, 0, 0];
    let reads = 0;
    for (let t = 0.5; t < 29.5; t += 0.25) {
      vi.spyOn(deck, 'getHeardPosition').mockReturnValue(t);
      const w = deck.getChannelWaveforms(4);
      if (w.length > 0) reads++;
      w.forEach((ch, i) => { peaks[i] = Math.max(peaks[i], ch.reduce((m, v) => Math.max(m, Math.abs(v)), 0)); });
    }
    expect(reads, 'the deck scope getter returned no channels').toBeGreaterThan(0);
    for (let ch = 0; ch < 4; ch++) expect(peaks[ch], `CH${ch + 1} ${JSON.stringify(peaks)}`).toBeGreaterThan(0.01);
  }, 600_000);
});
