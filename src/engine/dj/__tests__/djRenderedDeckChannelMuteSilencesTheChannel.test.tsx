/**
 * Reachability (SCOPE-MUTE): "muting channels does nothing in dj view" (owner,
 * 2026-10-11 and 2026-10-12). A DJ deck plays the WAV the render worker
 * pre-rendered; the deck's CH mute only reached the JS replayer, which makes
 * no sound in the DJ view.
 *
 * Drives the real path: DJPipeline.loadOrEnqueue -> the real render worker
 * (run in-process) rendering a ProTracker module through the real UADE WASM,
 * mix and per-channel stems -> DeckEngine.loadAudioFile -> the deck's CH
 * buttons (DeckChannelToggles) clicked -> useDJStore channelMask -> the
 * deck's DeckChannelMute -> the deck output, rendered offline. Sentinel: the
 * mute node took the mask with stems behind the mix.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, cleanup, fireEvent } from '@testing-library/react';

vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({ setInstrumentOutputOverride: () => {}, preloadInstruments: async () => {}, ensureWASMSynthsReady: async () => {}, rerouteNativeEngine: () => {} }),
}));

import { installInProcessDJRenderWorker } from '@/test/audio/inProcessDJRenderWorker';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch, audioLoadsSettled } from '@/test/audio/realWebAudio';

const SONG = 'a sleep so deep.mod';
const SR = 48000;
const AT_SEC = 8;       // a stretch where all four Paula channels play
const WINDOW_SEC = 1;

afterEach(cleanup);

function rms(x: Float32Array, from = 0, to = x.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
}
const db = (v: number): number => 20 * Math.log10(Math.max(v, 1e-12));

describe('a rendered DJ deck mutes the channels its CH buttons mute', () => {
  it('muting every channel silences the deck; muting CH1 removes exactly CH1', async () => {
    installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch();
    const Tone = await import('tone');
    Tone.setContext(new OfflineAudioContext(2, SR, SR) as never);

    // The render worker encodes the stems as FLAC; load the encoder while process.versions is real
    // (the in-process worker stubs it for the Emscripten glue, which the FLAC loader would trip on).
    await (await import('@/lib/export/audioEncoders')).encodeFlac([new Float32Array(16)], 44100);
    const restoreWorkers = installInProcessDJRenderWorker();
    const { getDJPipeline } = await import('../DJPipeline');
    const bytes = readFileSync(join(process.cwd(), 'public/data/songs/formats', SONG));
    const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const result = await getDJPipeline().loadOrEnqueue(source, SONG, undefined, 'high', undefined, 12);
    restoreWorkers();

    const { DeckEngine } = await import('../DeckEngine');
    const { DeckChannelToggles } = await import('@/components/dj/DeckChannelToggles');
    const { useDJStore } = await import('@/stores/useDJStore');
    const { getCachedAudio } = await import('../DJAudioCache');
    expect(result.wavData.byteLength).toBeGreaterThan(0);
    // The cache holds the stems as lossless FLAC (channelStemCodec.ts), not raw int16 (4x the WAV).
    // The render is a 12 s preview (test time); a deck load in the app never gets a preview (isPreviewRender), so this one asks for it.
    const cachedEntry = await getCachedAudio(source, { allowPreview: true });
    const flacBytes = (cachedEntry!.channelScopes?.flacStems ?? []).reduce((n, f) => n + f.byteLength, 0);
    expect(cachedEntry!.channelScopes?.stems, 'raw int16 stems in the cache').toBeUndefined();
    expect(flacBytes, 'FLAC stems cached').toBeGreaterThan(0);
    expect(flacBytes, `stems ${flacBytes} B vs WAV ${result.wavData.byteLength} B`).toBeLessThan(2 * result.wavData.byteLength);

    /** The deck output (left) over the window, with the given CH buttons clicked after the load. */
    async function deckOutput(clickChannels: number[]): Promise<{ out: Float32Array; deck: InstanceType<typeof DeckEngine> }> {
      const ctx = new OfflineAudioContext(2, Math.round(SR * WINDOW_SEC), SR);
      Tone.setContext(ctx as never);
      const out = new Tone.Gain(1);
      out.connect(Tone.getDestination().input as never);
      const deck = new DeckEngine({ id: 'A', outputNode: out });
      deck.setFilterPosition(0);
      for (const band of ['low', 'mid', 'high'] as const) deck.setEQ(band, 0, 0);
      await audioLoadsSettled(400, 20000);
      // Every load reads the cache entry afresh, as the app's loads do: a loaded deck releases its int16 stems.
      const entry = await getCachedAudio(source, { allowPreview: true });
      await deck.loadAudioFile(entry!.audioData, SONG);
      useDJStore.getState().setChannelMode('A', 'mute');
      const { getByTitle, unmount } = render(<DeckChannelToggles deckId="A" />);
      for (const ch of clickChannels) fireEvent.click(getByTitle(`Channel ${ch + 1} (Shift+click to solo)`));
      unmount();
      deck.audioPlayer.seek(AT_SEC);
      await deck.play();
      const rendered = await ctx.startRendering();
      const left = rendered.getChannelData(0).slice();
      deck.dispose();
      return { out: left, deck };
    }

    const from = Math.round(SR * 0.3); // past the start lookahead and de-click fade
    const full = await deckOutput([]);
    const all = await deckOutput([0, 1, 2, 3]);
    const ch1 = await deckOutput([0]);

    // Sentinel: the rendered deck carried four stems and the mute node took the clicks.
    expect(all.deck.channelStemCount).toBe(4);
    expect(all.deck.channelMute.stemMaskWrites).toBeGreaterThan(0);

    const fullDb = db(rms(full.out, from));
    const allDb = db(rms(all.out, from));
    expect(fullDb, 'the unmuted deck plays').toBeGreaterThan(-40);
    expect(allDb - fullDb, `all channels muted: ${allDb.toFixed(1)} dB vs ${fullDb.toFixed(1)} dB`).toBeLessThan(-49);

    // CH1 muted = the unmuted output minus CH1 alone (CH1 soloed = everything else muted).
    const solo1 = await deckOutput([1, 2, 3]);
    const expected = full.out.map((v, i) => v - solo1.out[i]);
    const diff = ch1.out.map((v, i) => v - expected[i]);
    expect(db(rms(ch1.out, from)), 'muting CH1 changes the output').not.toBeCloseTo(fullDb, 1);
    expect(db(rms(diff, from)) - fullDb, 'CH1 muted = mix minus CH1').toBeLessThan(-49);
  }, 600_000);
});
