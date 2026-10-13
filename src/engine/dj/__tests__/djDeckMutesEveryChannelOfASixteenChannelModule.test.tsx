/**
 * A rendered DJ deck mutes every channel of a 16-channel module, not only the first 8.
 *
 * Owner decision 2026-10-13 (SID-FOLLOWUP-2 a): every channel up to 16 gets a mute stem,
 * stored mono. A deck plays the mix and the stems from one AudioBuffer (sample-locked
 * through seek, scratch and pitch) and an AudioBuffer holds 32 channels: stereo stems
 * capped the deck at 8 (2 + 2 x 8 = 18; 16 would be 34), so channels 9-16 of a
 * 16-channel module had a scope but no mute. Now each stem is one channel and its pan
 * (channelScopeTrack monoStem): 2 + 16 = 18 channels.
 *
 * Drives the real path: DJPipeline.loadOrEnqueue -> the real render worker in-process
 * (libopenmpt, nightmare on acid.s3m: 16 channels) -> DeckEngine.loadAudioFile -> the
 * deck's CH buttons (DeckChannelToggles, one per channel the song has) -> DeckChannelMute
 * -> the deck output, rendered offline.
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

const SONG = 'nightmare on acid.s3m';
const SR = 48000;
const AT_SEC = 10;
const WINDOW_SEC = 1;

afterEach(cleanup);

function rms(x: Float32Array, from = 0, to = x.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
}
const db = (v: number): number => 20 * Math.log10(Math.max(v, 1e-12));

describe('a rendered DJ deck mutes every channel of a 16-channel module', () => {
  it('16 mono stems behind the mix; muting all 16 silences the deck; muting a channel past the 8th removes exactly it', async () => {
    installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch();
    const Tone = await import('tone');
    Tone.setContext(new OfflineAudioContext(2, SR, SR) as never);
    await (await import('@/lib/export/audioEncoders')).encodeFlac([new Float32Array(16)], 44100);
    const restoreWorkers = installInProcessDJRenderWorker();
    const { getDJPipeline } = await import('../DJPipeline');
    const bytes = readFileSync(join(process.cwd(), 'public/data/songs/formats', SONG));
    const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    await getDJPipeline().loadOrEnqueue(source, SONG, undefined, 'high', undefined, 14);
    restoreWorkers();

    const { DeckEngine } = await import('../DeckEngine');
    const { DeckChannelToggles } = await import('@/components/dj/DeckChannelToggles');
    const { useDJStore } = await import('@/stores/useDJStore');
    const { getCachedAudio } = await import('../DJAudioCache');
    const entry0 = await getCachedAudio(source, { allowPreview: true });
    const scales = entry0!.channelScopes!.scales;
    expect(scales.length).toBe(16);
    expect(entry0!.channelScopes!.stemGains?.length).toBe(16);
    // The loudest channel past the old 8-stem cap.
    let ch = 8;
    for (let k = 9; k < 16; k++) if (scales[k] > scales[ch]) ch = k;
    expect(scales[ch]).toBeGreaterThan(0.01);

    async function deckOutput(clickChannels: number[]): Promise<{ out: Float32Array; deck: InstanceType<typeof DeckEngine>; bufferChannels: number }> {
      const ctx = new OfflineAudioContext(2, Math.round(SR * WINDOW_SEC), SR);
      Tone.setContext(ctx as never);
      const out = new Tone.Gain(1);
      out.connect(Tone.getDestination().input as never);
      const deck = new DeckEngine({ id: 'A', outputNode: out });
      deck.setFilterPosition(0);
      for (const band of ['low', 'mid', 'high'] as const) deck.setEQ(band, 0, 0);
      await audioLoadsSettled(400, 20000);
      const entry = await getCachedAudio(source, { allowPreview: true });
      await deck.loadAudioFile(entry!.audioData, SONG);
      useDJStore.getState().setChannelMode('A', 'mute');
      useDJStore.getState().setAllDeckChannels('A', true);
      const { getByTitle, unmount } = render(<DeckChannelToggles deckId="A" />);
      for (const c of clickChannels) fireEvent.click(getByTitle(`Channel ${c + 1} (Shift+click to solo)`));
      unmount();
      const bufferChannels = deck.audioPlayer.getAudioBuffer()?.numberOfChannels ?? 0;
      deck.audioPlayer.seek(AT_SEC);
      await deck.play();
      const rendered = await ctx.startRendering();
      const left = rendered.getChannelData(0).slice();
      deck.dispose();
      return { out: left, deck, bufferChannels };
    }

    const from = Math.round(SR * 0.3);
    const all16 = Array.from({ length: 16 }, (_, k) => k);
    const full = await deckOutput([]);
    const none = await deckOutput(all16);
    expect(none.deck.channelStemCount).toBe(16);
    expect(none.bufferChannels, 'the mix + one channel per stem').toBe(18);
    const fullDb = db(rms(full.out, from));
    expect(fullDb, 'the unmuted deck plays').toBeGreaterThan(-40);
    expect(db(rms(none.out, from)) - fullDb, 'all 16 muted').toBeLessThan(-49);

    // Channel `ch` muted = the unmuted output minus that channel alone (it soloed = the other 15 muted).
    const muted = await deckOutput([ch]);
    const solo = await deckOutput(all16.filter((k) => k !== ch));
    const diff = muted.out.map((v, i) => v - (full.out[i] - solo.out[i]));
    expect(db(rms(solo.out, from)), `channel ${ch + 1} sounds in the window`).toBeGreaterThan(fullDb - 40);
    expect(db(rms(diff, from)) - fullDb, `channel ${ch + 1} muted = mix minus it`).toBeLessThan(-49);
  }, 600_000);
});
