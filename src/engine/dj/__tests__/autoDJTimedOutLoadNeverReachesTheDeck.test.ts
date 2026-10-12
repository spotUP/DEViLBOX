/**
 * Owner 2026-10-12, enabling Auto DJ: "DeckAudioPlayer.play() called before
 * buffer loaded" -> "[AutoDJ] Failed to start playback", Auto DJ left on with
 * nothing playing. The first track's load hit DJTrackLoader's 30 s timeout;
 * Auto DJ loaded the next track and played it, but the timed-out load was
 * never cancelled: it reached the deck later, its new load released the
 * buffer, and play() found none.
 *
 * Drives the product path: DJActions.enableAutoDJ -> DJAutoDJ.enable ->
 * DJTrackLoader.loadPlaylistTrackToDeck (real, with its real timeout) -> the
 * engine's loadAudioToDeck. The engine is a model of the deck's load contract
 * (a load in flight has no playable buffer; play() throws then, as
 * DeckAudioPlayer does). Sentinel: the loads that reached the deck.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { setTimeout as realSleep } from 'node:timers/promises';

type Deferred = { promise: Promise<void>; resolve: () => void };
const deferred = (): Deferred => { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; };

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  slowLookup: null as null | { promise: Promise<void>; resolve: () => void },
  onSecondTrackLoad: null as null | (() => void),
}));

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));
vi.mock('../DJAudioCache', async (orig) => ({
  ...(await orig<typeof import('../DJAudioCache')>()),
  getCachedAudioByFilename: async (fileName: string) => {
    if (fileName === 'slow.mod' && holder.slowLookup) await holder.slowLookup.promise;
    return { audioData: new ArrayBuffer(64), filename: fileName, bpm: 125, duration: 60, waveformPeaks: [], sourceData: undefined };
  },
}));
vi.mock('../DJPerSongFx', () => ({ applyPerSongMasterFx: () => {} }));

import { enableAutoDJ, disableAutoDJ } from '../DJActions';
import { useDJStore } from '@/stores/useDJStore';
import { useDJPlaylistStore, type PlaylistTrack } from '@/stores/useDJPlaylistStore';

function track(id: string, fileName: string, i: number): PlaylistTrack {
  return { id, fileName, trackName: id, format: 'MOD', bpm: 125, duration: 60, addedAt: i, musicalKey: 'Unknown', energy: 0.5 } as PlaylistTrack;
}

/** The deck's load contract: a load in flight leaves no playable buffer until it lands. */
function deckModel() {
  const reached: string[] = [];
  let inFlight = 0;
  let playing = false;
  const deck = {
    play: async () => {
      if (inFlight > 0) throw new Error('DeckAudioPlayer.play() called before buffer loaded');
      playing = true;
    },
    stop: () => { playing = false; }, isPlaying: () => playing, playbackMode: 'audio',
    audioPlayer: { getPosition: () => 0, getDuration: () => 60 }, replayer: { getElapsedMs: () => 0 },
    loadSong: async () => {}, clearLoadedSong: () => {},
  };
  const engine = {
    getDeck: () => deck, setCrossfader: () => {}, mixer: { setCrossfader: () => {} },
    loadAudioToDeck: async (_id: string, _buf: ArrayBuffer, fileName: string) => {
      reached.push(fileName);
      inFlight++;
      if (fileName === 'next.mod') holder.onSecondTrackLoad?.();
      await new Promise((r) => setTimeout(r, 5)); // the decode
      inFlight--;
      return { duration: 60, sampleRate: 44100, numberOfChannels: 2, waveformPeaks: new Float32Array(0) };
    },
  };
  return { engine, reached, isPlaying: () => playing };
}

describe('a playlist load that timed out never reaches the deck', () => {
  afterEach(() => { disableAutoDJ(); vi.useRealTimers(); holder.slowLookup = null; holder.onSecondTrackLoad = null; });

  it('Auto DJ enable: the first track times out, the next one loads and plays, the late first load is cancelled', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const model = deckModel();
    holder.engine = model.engine;
    holder.slowLookup = deferred();
    // The timed-out lookup finishes just as the next track's load begins: the moment the owner hit.
    holder.onSecondTrackLoad = () => holder.slowLookup?.resolve();

    const pl = useDJPlaylistStore.getState();
    const id = `timeout-${Date.now()}`;
    pl.importPlaylists([{ id, name: 'timeout', createdAt: Date.now(), updatedAt: Date.now(), tracks: [track('slow', 'slow.mod', 0), track('next', 'next.mod', 1)] }]);
    pl.setActivePlaylist(id);
    useDJStore.getState().setDeckState('A', { isPlaying: false, trackAnalysis: null });
    useDJStore.getState().setDeckState('B', { isPlaying: false, trackAnalysis: null });
    useDJStore.getState().setAutoDJConfig({ shuffle: false, style: 'Club' });

    let settled = false;
    const enabling = enableAutoDJ(0).finally(() => { settled = true; });
    // Time runs in 100 ms steps until enable settles; each step also yields real time to module
    // loads and I/O, which fake timers do not advance.
    for (let i = 0; !settled && i < 3000; i++) {
      await vi.advanceTimersByTimeAsync(100);
      await realSleep(10);
    }
    const error = await enabling;
    await vi.advanceTimersByTimeAsync(1000);
    await realSleep(50);

    expect(error, 'enable reported a failure').toBeNull();
    expect(model.isPlaying(), 'the deck plays the next track').toBe(true);
    expect(model.reached, 'loads that reached the deck').toEqual(['next.mod']);
  }, 60_000);
});
