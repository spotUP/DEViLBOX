/**
 * A double of the playing track (plan 2026-10-11-dj-juggling, JUGX-P4.2):
 * `loadDoubleToDeck` puts the source deck's already decoded buffer on the
 * target deck - no second decode, no render - through the real DJEngine,
 * DeckEngine and DeckAudioPlayer load paths, and copies the source's
 * analysis: the target deck carries the very same analysis object, grid, key
 * and tempo. Tone's player and buffer are stand-ins (no audio context).
 */
import { describe, it, expect, vi } from 'vitest';

const holder = vi.hoisted(() => ({ engine: null as unknown, decodes: 0, stems: [] as Array<ArrayBuffer | null> }));

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));
vi.mock('@/lib/audio/UnifiedAudioDecoder', () => ({
  decodeAudio: async () => {
    holder.decodes++;
    return { audioBuffer: { duration: 103.4, sampleRate: 44100, numberOfChannels: 2, length: 4_559_940 }, usedWasm: false, format: 'wav' };
  },
}));
vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  class ToneAudioBuffer {
    private b: unknown;
    loaded = true;
    constructor(b: unknown) { this.b = b; }
    get(): unknown { return this.b; }
    dispose(): void { this.loaded = false; }
  }
  class Player {
    state = 'stopped';
    buffer: ToneAudioBuffer | { loaded: boolean } = { loaded: false };
    loopEnd = 0;
    connect(): this { return this; }
    seek(): this { return this; }
    stop(): this { return this; }
  }
  return { ...actual, Player, ToneAudioBuffer, now: () => 0, getContext: () => ({ rawContext: {} }) };
});

import { useDJStore } from '@/stores/useDJStore';
import { corpusAnalysis, corpusTrack } from '../autodj/testing/corpus';
import { loadDoubleToDeck } from '../DJTrackLoader';
import { DeckAudioPlayer } from '../DeckAudioPlayer';

async function realDeck(id: 'A' | 'B') {
  const { DeckEngine } = await vi.importActual<typeof import('../DeckEngine')>('../DeckEngine');
  const audioPlayer = new DeckAudioPlayer({} as never);
  return Object.assign(Object.create(DeckEngine.prototype), {
    id, audioPlayer, replayer: { stop: () => {} }, stemPlayer: { stop: () => {}, disable: () => {} }, _stemMode: false,
    patternScratchActive: false, patternScratchDir: 1, _primeScratchBuffer: async () => {},
    loadSong: async () => {}, clearLoadedSong: () => {},
  }) as InstanceType<typeof DeckEngine>;
}

describe('a double reuses the decoded buffer and the analysis', () => {
  it('no decode for the double; the target plays the same buffer and carries the source analysis object', async () => {
    const { DJEngine } = await vi.importActual<typeof import('../DJEngine')>('../DJEngine');
    const decks = { A: await realDeck('A'), B: await realDeck('B') };
    holder.engine = Object.assign(Object.create(DJEngine.prototype), {
      getDeck: (id: 'A' | 'B') => decks[id], recorder: null, _pendingTrackSource: null,
      tryAutoLoadStems: async (_id: string, _deck: unknown, bytes: ArrayBuffer | null) => { holder.stems.push(bytes); },
    });

    // The source deck: a file load, decoded once, then its analysis applied.
    const bytes = new ArrayBuffer(64);
    const peaks = new Float32Array([0.1, 0.5, 0.9]);
    await decks.A.audioPlayer.loadAudioFile(bytes, 'drops.wav', peaks);
    expect(holder.decodes).toBe(1);
    const analysis = corpusAnalysis('drops');
    const t = corpusTrack('drops');
    const s = useDJStore.getState();
    s.setDeckState('A', {
      fileName: 'drops.wav', trackName: 'drops', detectedBPM: 130, effectiveBPM: 130, durationMs: 103_400, analysisState: 'ready',
      trackAnalysis: analysis, beatGrid: { beats: t.beats, downbeats: t.downbeats, bpm: 130, timeSignature: 4 },
      musicalKey: 'A minor', keyConfidence: 0.85, rmsDb: -14, peakDb: -1, energy: 0.8,
    });
    s.setDeckState('B', { fileName: 'other.wav', trackName: 'other', trackAnalysis: null, beatGrid: null, musicalKey: 'C major' });

    expect(await loadDoubleToDeck('A', 'B')).toBe(true);

    // No second decode; the target's player holds the source's decoded buffer, its peaks and file bytes.
    expect(holder.decodes).toBe(1);
    expect(decks.B.audioPlayer.getAudioBuffer()).toBe(decks.A.audioPlayer.getAudioBuffer());
    expect(decks.B.audioPlayer.getWaveformPeaks()).toBe(peaks);
    expect(decks.B.audioPlayer.getOriginalFileBytes()).toBe(decks.A.audioPlayer.getOriginalFileBytes());
    expect(decks.B.playbackMode).toBe('audio');
    // Cached stems are looked up with the source's file bytes (same track).
    expect(holder.stems.at(-1)).toBe(decks.A.audioPlayer.getOriginalFileBytes());

    // The analysis is the source's: the same object, the same grid, key and tempo.
    const b = useDJStore.getState().decks.B;
    expect(b.trackAnalysis).toBe(useDJStore.getState().decks.A.trackAnalysis);
    expect(b.fileName).toBe('drops.wav');
    expect(b.beatGrid).toEqual(useDJStore.getState().decks.A.beatGrid);
    expect(b.musicalKey).toBe('A minor');
    expect(b.detectedBPM).toBe(130);
    expect(b.durationMs).toBeCloseTo(103_400, 0);
    expect(b.analysisState).toBe('ready');
  });

  it('a source deck with nothing decoded: no double', async () => {
    const decks = { A: await realDeck('A'), B: await realDeck('B') };
    const { DJEngine } = await vi.importActual<typeof import('../DJEngine')>('../DJEngine');
    holder.engine = Object.assign(Object.create(DJEngine.prototype), { getDeck: (id: 'A' | 'B') => decks[id], recorder: null, _pendingTrackSource: null, tryAutoLoadStems: async () => {} });
    useDJStore.getState().setDeckState('A', { fileName: 'drops.wav' });
    expect(await loadDoubleToDeck('A', 'B')).toBe(false);
  });
});
