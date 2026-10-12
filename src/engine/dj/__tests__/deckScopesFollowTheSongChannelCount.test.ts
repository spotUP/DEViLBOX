/**
 * A DJ deck shows one channel scope (and one pattern-view meter) per channel
 * the song has: a SID's 3 voices per chip, a module's channel count.
 *
 * Bug (owner 2026-10-12): every deck showed 4 scopes. DECK_SCOPE_CHANNELS = 4
 * capped the render's scope track, and WebSID traces 4 streams per chip (3
 * voices + the chip's digi output), so a 1-chip SID showed 4 scopes (the 4th
 * the digi stream), a 2SID the first chip's 3 voices + digi, and an 8-channel
 * module its first 4 channels.
 *
 * Drives the real path: DJPipeline.loadOrEnqueue -> the real render worker
 * in-process (real WebSID / libopenmpt WASM) -> DeckEngine.loadAudioFile ->
 * the deck store's channelScopeCount (what DeckScopes draws) and
 * DeckEngine.getChannelWaveforms (what the scopes and the meters poll).
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

async function deckChannels(path: string, name: string, seconds: number): Promise<{ count: number; peaks: number[] }> {
  const Tone = await import('tone');
  const { getDJPipeline } = await import('../DJPipeline');
  const bytes = readFileSync(join(process.cwd(), path));
  const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const result = await getDJPipeline().loadOrEnqueue(source, name, undefined, 'high', undefined, seconds);

  const { DeckEngine } = await import('../DeckEngine');
  const { useDJStore } = await import('@/stores/useDJStore');
  const out = new Tone.Gain(1);
  out.connect(Tone.getDestination().input as never);
  const deck = new DeckEngine({ id: 'A', outputNode: out });
  await audioLoadsSettled(400, 20000);
  await deck.loadAudioFile(result.wavData, name);

  const count = useDJStore.getState().decks.A.channelScopeCount;
  const peaks = new Array<number>(count).fill(0);
  for (let t = 0.5; t < seconds - 0.5; t += 0.25) {
    vi.spyOn(deck, 'getHeardPosition').mockReturnValue(t);
    deck.getChannelWaveforms().forEach((ch, i) => { peaks[i] = Math.max(peaks[i], ch.reduce((m, v) => Math.max(m, Math.abs(v)), 0)); });
  }
  deck.dispose();
  return { count, peaks };
}

describe('a DJ deck shows one scope per channel the song has', () => {
  // The worker module registers its onmessage once, so one in-process worker serves every load.
  let restoreWorkers: () => void = () => {};
  beforeAll(async () => {
    installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch();
    const Tone = await import('tone');
    Tone.setContext(new OfflineAudioContext(2, 48000, 48000) as never);
    // The render worker encodes the stems as FLAC; load the encoder while process.versions is real.
    await (await import('@/lib/export/audioEncoders')).encodeFlac([new Float32Array(16)], 44100);
    restoreWorkers = installInProcessDJRenderWorker();
  });
  afterAll(() => restoreWorkers());

  it('a 1-chip SID (Commando) has 3 scopes, a 2SID (Sparkster - Lakeside) 6, a 3SID (Devils ReSIDence) 9, and the second / third chip voices carry signal', async () => {
    const fx = 'src/lib/sid/__tests__/fixtures/';
    const one = await deckChannels(fx + 'Commando.sid', 'Commando.sid', 12);
    expect(one.count).toBe(3);

    const two = await deckChannels(fx + 'Sparkster-Lakeside_2SID.sid', 'Sparkster-Lakeside_2SID.sid', 12);
    expect(two.count).toBe(6);
    // The second chip's voices are the song's voices 4-6 (not the first chip's digi stream).
    expect(Math.max(...two.peaks.slice(3)), JSON.stringify(two.peaks)).toBeGreaterThan(0.01);

    const three = await deckChannels(fx + 'Devils_ReSIDence_3SID.sid', 'Devils_ReSIDence_3SID.sid', 12);
    expect(three.count).toBe(9);
    expect(Math.max(...three.peaks.slice(6)), JSON.stringify(three.peaks)).toBeGreaterThan(0.01);
  }, 600_000);

  it('an 8-channel module (andante.s3m) has 8 scopes, channels past the fourth carrying signal', async () => {
    const { count, peaks } = await deckChannels('public/data/songs/formats/andante.s3m', 'andante.s3m', 30);
    expect(count).toBe(8);
    expect(Math.max(...peaks.slice(4)), JSON.stringify(peaks)).toBeGreaterThan(0.01);
  }, 600_000);
});
