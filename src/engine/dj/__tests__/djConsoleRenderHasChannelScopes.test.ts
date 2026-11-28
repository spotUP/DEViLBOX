/**
 * DJR-console: a console song (NSF/NSFE, GBS, SPC, VGM/VGZ, GYM) on a DJ deck renders through game-music-emu
 * (Gme.wasm, the engine the tracker view plays these with) and the deck gets one scope and one stem per voice.
 *
 * Before: the render worker threw "Console formats not yet supported in DJ renderer" for every console file.
 * Two paths are covered: NSFE (multi-channel emulator, one pass with per-voice taps) and SPC (single-mix emulator,
 * one lock-step solo instance per voice).
 *
 * Drives the real path: DJPipeline.loadOrEnqueue -> the real render worker in-process (real Gme.wasm) ->
 * DeckEngine.loadAudioFile -> the deck's channelScopeCount and DeckEngine.getChannelWaveforms.
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

const SECONDS = 12;
const CASES = [
  { path: 'public/data/songs/nsfe/1943.nsfe', name: '1943.nsfe', kind: 'voice taps' },
  { path: 'public/data/songs/spc/01 - main theme.spc', name: '01 - main theme.spc', kind: 'solo instances' },
];

describe('a console song on a DJ deck has one scope and one stem per voice', () => {
  let restoreWorkers: () => void = () => {};
  beforeAll(async () => {
    installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch();
    const Tone = await import('tone');
    Tone.setContext(new OfflineAudioContext(2, 48000, 48000) as never);
    await (await import('@/lib/export/audioEncoders')).encodeFlac([new Float32Array(16)], 44100);
    restoreWorkers = installInProcessDJRenderWorker();
  });
  afterAll(() => restoreWorkers());

  for (const c of CASES) {
    it(`${c.name}: rendered on game-music-emu with ${c.kind}, the deck scopes and stems carry signal`, async () => {
      const log = vi.spyOn(console, 'log');
      const Tone = await import('tone');
      const { getDJPipeline } = await import('../DJPipeline');
      const bytes = readFileSync(join(process.cwd(), c.path));
      const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const result = await getDJPipeline().loadOrEnqueue(source, c.name, undefined, 'high', undefined, SECONDS);
      const sentinel = log.mock.calls.map((m) => String(m[0])).find((m) => m.includes('[DJRenderWorker/gme]'));
      log.mockRestore();
      expect(sentinel, 'the worker rendered with game-music-emu').toContain(c.kind);

      const { DeckEngine } = await import('../DeckEngine');
      const { useDJStore } = await import('@/stores/useDJStore');
      const out = new Tone.Gain(1);
      out.connect(Tone.getDestination().input as never);
      const deck = new DeckEngine({ id: 'A', outputNode: out });
      await audioLoadsSettled(400, 20000);
      await deck.loadAudioFile(result.wavData, c.name);
      const scopeCount = useDJStore.getState().decks.A.channelScopeCount;
      expect(scopeCount).toBeGreaterThanOrEqual(2);
      expect(deck.channelStemCount).toBe(scopeCount);
      const peaks = new Array<number>(scopeCount).fill(0);
      for (let t = 0.5; t < SECONDS - 0.5; t += 0.25) {
        vi.spyOn(deck, 'getHeardPosition').mockReturnValue(t);
        deck.getChannelWaveforms().forEach((ch, i) => { peaks[i] = Math.max(peaks[i], ch.reduce((m, v) => Math.max(m, Math.abs(v)), 0)); });
      }
      deck.dispose();
      expect(peaks.filter((p) => p > 0.01).length, JSON.stringify(peaks)).toBeGreaterThanOrEqual(2);
    }, 300_000);
  }
});
