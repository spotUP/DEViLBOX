/**
 * KEYLOCK-DEFAULT-ON (owner 2026-10-12: "key lock is so good now it should be on by default").
 *
 * The store owns the setting (default on) and the engine follows it: a fresh deck, with no button
 * pressed, routes through the stretcher after an audio load and after a tracker -> audio hot swap.
 * The scenario selector goes through DJActions.setDeckKeyLock so the engine follows a preset too.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({ setInstrumentOutputOverride: () => {}, preloadInstruments: async () => {}, ensureWASMSynthsReady: async () => {}, rerouteNativeEngine: () => {} }),
}));

import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch, audioLoadsSettled } from '@/test/audio/realWebAudio';

const RATE = 44100;

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

interface Inner { keyLock: { isActive: boolean }; _playbackMode: string }
const stretcherActive = (d: unknown): boolean => (d as Inner).keyLock.isActive;

describe('Key Lock is on by default', () => {
  it('a fresh deck, no button pressed, stretches after an audio load and after a module hot swap', async () => {
    installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch();
    const Tone = await import('tone');
    Tone.setContext(new OfflineAudioContext(2, 4800, 48000) as never);
    const { useDJStore } = await import('@/stores/useDJStore');
    const { DeckEngine } = await import('../DeckEngine');

    expect(useDJStore.getState().decks.A.keyLockEnabled, 'the store default').toBe(true);

    const out = new Tone.Gain(1);
    out.connect(Tone.getDestination().input as never);
    const deck = new DeckEngine({ id: 'A', outputNode: out });
    await audioLoadsSettled(400, 20000);
    expect(deck.getKeyLock(), 'the engine starts from the store').toBe(true);
    expect(stretcherActive(deck), 'fresh deck').toBe(true);

    const wav = wav16(Int16Array.from({ length: RATE * 2 }, (_, i) => Math.round(3000 * Math.sin(i / 20))));
    await deck.loadAudioFile(wav, 'tune.wav');
    expect(stretcherActive(deck), 'after an audio load').toBe(true);

    // A deck that was on the tracker path, key-locked, then hot-swapped to its rendered audio.
    (deck as unknown as Inner)._playbackMode = 'tracker';
    (deck as unknown as { keyLock: { setActive(a: boolean): void } }).keyLock.setActive(false);
    await deck.hotSwapToAudio(wav, 'module.wav');
    expect(stretcherActive(deck), 'after a tracker -> audio hot swap').toBe(true);
  }, 120_000);

  it('the scenario selector routes through DJActions so the engine follows the preset', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/dj/DJScenarioSelector.tsx', 'utf8');
    expect(src).toMatch(/setDeckKeyLock\('A', scenario\.keyLockDefault\)/);
    expect(src).not.toMatch(/store\.setDeckKeyLock/);
  });
});
