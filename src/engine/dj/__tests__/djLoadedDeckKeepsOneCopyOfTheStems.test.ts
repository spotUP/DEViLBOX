/**
 * A rendered deck holds its channel stems once: as the float channels of the
 * buffer it plays (DeckChannelMute). The int16 copy the render produced is
 * released when the deck has decoded it - the audio cache entry is the
 * persistent copy - so a loaded 4.6-min MOD does not carry ~194 MB of int16
 * stems beside its ~486 MB buffer. A double of the deck shares the buffer.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({ setInstrumentOutputOverride: () => {}, preloadInstruments: async () => {}, ensureWASMSynthsReady: async () => {}, rerouteNativeEngine: () => {} }),
}));

import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch, audioLoadsSettled } from '@/test/audio/realWebAudio';

const RATE = 44100;
const FRAMES = RATE;

/** A 16-bit stereo PCM WAV, laid out like DJPipeline's encodePCMToWAV. */
function wav16(samples: Int16Array): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.byteLength);
  const v = new DataView(buf);
  const tag = (o: number, s: string) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  tag(0, 'RIFF'); v.setUint32(4, 36 + samples.byteLength, true); tag(8, 'WAVE');
  tag(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  tag(36, 'data'); v.setUint32(40, samples.byteLength, true);
  new Int16Array(buf, 44).set(samples);
  return buf;
}

describe('a loaded rendered deck keeps one copy of its channel stems', () => {
  it('the int16 stems are released once the deck buffer carries them; a double shares that buffer', async () => {
    installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch();
    const Tone = await import('tone');
    const ctx = new OfflineAudioContext(2, 4800, 48000);
    Tone.setContext(ctx as never);
    const { attachChannelScopes, channelScopesFor } = await import('../channelScopeTrack');
    const { encodeStemFlac } = await import('../channelStemCodec');
    const { DeckEngine } = await import('../DeckEngine');

    const stem = (k: number) => Int16Array.from({ length: FRAMES * 2 }, (_, i) => Math.round(4000 * Math.sin((i >> 1) * (k + 1) / 50)));
    const stems = [stem(0), stem(1)];
    const mix = stems[0].map((v, i) => v + stems[1][i]);
    const wav = wav16(mix);
    const flacStems = [await encodeStemFlac(stems[0], RATE, 2), await encodeStemFlac(stems[1], RATE, 2)]; // stereo (render version 4)
    attachChannelScopes(wav, { sampleRate: RATE / 4, channels: [new Int8Array(10), new Int8Array(10)], scales: [1, 1], flacStems });

    const out = new Tone.Gain(1);
    out.connect(Tone.getDestination().input as never);
    const deckA = new DeckEngine({ id: 'A', outputNode: out });
    const deckB = new DeckEngine({ id: 'B', outputNode: out });
    await audioLoadsSettled(400, 20000);
    await deckA.loadAudioFile(wav, 'two-channel.mod');

    expect(deckA.channelStemCount, 'the deck buffer carries the stems').toBe(2);
    expect(deckA.audioPlayer.getAudioBuffer()?.numberOfChannels).toBe(4); // the mix + one channel per stem
    expect(deckA.channelScopes?.flacStems, 'the deck still holds the encoded stems').toBeUndefined();
    expect(channelScopesFor(wav)?.flacStems, 'the WAV\'s track still holds the encoded stems').toBeUndefined();

    const buffer = deckA.audioPlayer.getAudioBuffer()!;
    await deckB.loadDecodedAudio(buffer, null, undefined, deckA.channelScopes, deckA.loadedWav);
    expect(deckB.audioPlayer.getAudioBuffer(), 'the double shares the buffer').toBe(buffer);
    expect(deckB.channelStemCount).toBe(2);
  }, 120_000);
});
