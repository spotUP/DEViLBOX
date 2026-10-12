/**
 * Auto DJ's chord deferral and Smart Cuts read the outgoing deck's song
 * through DeckEngine.getLoadedSong(), which answered null unless the deck was
 * in tracker mode. Every deck plays audio (the song only drives the pattern
 * view), so both features were dead (found reading the code 2026-10-08).
 *
 * Drives the real load path (DJEngine.loadAudioToDeck -> DeckEngine.loadSong,
 * prototype methods on stand-in objects, since a real DeckEngine needs an
 * AudioContext) and then Auto DJ's real shouldDeferForPatternData.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const holder = vi.hoisted(() => ({ engine: null as unknown }));

vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({
    setInstrumentOutputOverride: () => {},
    preloadInstruments: async () => {},
    ensureWASMSynthsReady: async () => {},
    rerouteNativeEngine: () => {},
  }),
}));
vi.mock('@/utils/audio-context', async (orig) => ({ ...(await orig<object>()), getNativeAudioNode: () => null }));
// Auto DJ reaches the engine through getDJEngine(); the real DJEngine class is
// loaded separately below, only for its loadAudioToDeck.
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));

import { DeckEngine } from '../DeckEngine';
import { getAutoDJ } from '../DJAutoDJ';
import type { DJEngine as DJEngineClass } from '../DJEngine';
import { useDJStore } from '@/stores/useDJStore';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { ChannelData, Pattern, TrackerCell } from '@/types/tracker';

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
const C = [13, 17, 20];
const G = [20, 24, 27];

/** A pattern whose chord changes from C to G on row 4. */
function chordSong(): TrackerSong {
  const channels: ChannelData[] = [0, 1, 2].map((i) => {
    const rows = Array.from({ length: 8 }, emptyCell);
    rows[0] = { ...emptyCell(), note: C[i], instrument: 1 };
    rows[4] = { ...emptyCell(), note: G[i], instrument: 1 };
    return { id: `c${i}`, name: `c${i}`, rows, muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: 1, color: null };
  });
  const pattern: Pattern = { id: 'p0', name: 'chords', length: 8, channels };
  return { name: 'chords', songLength: 1, songPositions: [0], patterns: [pattern], instruments: [] } as unknown as TrackerSong;
}

/** A deck whose song methods are the real DeckEngine ones. */
function fakeDeck() {
  const deck = Object.assign(Object.create(DeckEngine.prototype), {
    // a real deck has its id: loads write deck state (channel scopes) under it
    id: 'A',
    keyLock: { setActive: () => {}, setPitchSemiTones: () => {}, latencySec: () => 0 }, // the stretcher insert a real deck always owns
    _loadedSong: null,
    _playbackMode: 'audio',
    audioPlayer: { stop: () => {} },
    replayer: {
      loadSong: () => {}, getSong: () => null, setStereoSeparation: () => {},
      setStereoSeparationMode: () => {}, setModplugSeparation: () => {}, getSeparationInput: () => null,
    },
    deckGain: {},
    currentSongInstrumentIds: [],
    routedNativeEngines: new Set(),
    unregisterOutputOverrides: () => {},
    restoreNativeRouting: () => {},
    _buildTimeIndex: () => [0, 1],
    loadAudioFile: async () => ({ duration: 60, sampleRate: 44100, numberOfChannels: 2, waveformPeaks: new Float32Array(4) }),
  });
  return deck as DeckEngine;
}

async function fakeEngine(deckA: DeckEngine) {
  const { DJEngine } = await vi.importActual<typeof import('../DJEngine')>('../DJEngine');
  return Object.assign(Object.create(DJEngine.prototype), {
    getDeck: () => deckA,
    remapInstrumentIds: () => {},
    tryAutoLoadStems: async () => {},
    recorder: null,
    _pendingTrackSource: null,
  }) as DJEngineClass;
}

describe('Auto DJ chord deferral sees the song of an audio-mode deck', () => {
  beforeEach(() => {
    useDJStore.getState().setDeckState('A', { songPos: 0, pattPos: 0 });
  });

  it('defers the fade while the outgoing module has a chord change inside the next half bar', async () => {
    const deck = fakeDeck();
    holder.engine = await fakeEngine(deck);
    const song = chordSong();
    await (holder.engine as DJEngineClass).loadAudioToDeck('A', new ArrayBuffer(8), 'chords.wav', 'chords', 125, song);

    expect(deck.getLoadedSong()).toBe(song);
    const defer = (getAutoDJ() as unknown as { shouldDeferForPatternData(sec: number): boolean }).shouldDeferForPatternData(10);
    expect(defer).toBe(true);
  });

  it('a track loaded without a song does not keep the previous track song', async () => {
    const deck = fakeDeck();
    holder.engine = await fakeEngine(deck);
    await (holder.engine as DJEngineClass).loadAudioToDeck('A', new ArrayBuffer(8), 'chords.wav', 'chords', 125, chordSong());
    await (holder.engine as DJEngineClass).loadAudioToDeck('A', new ArrayBuffer(8), 'plain.mp3', 'plain', 125);

    expect(deck.getLoadedSong()).toBeNull();
    const defer = (getAutoDJ() as unknown as { shouldDeferForPatternData(sec: number): boolean }).shouldDeferForPatternData(10);
    expect(defer).toBe(false);
  });
});
