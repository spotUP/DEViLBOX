/**
 * Auto DJ got "stuck mixing the same song on two decks" (owner live report
 * 2026-10-10). The queued track (quickening.mod, plain filename, not in the
 * audio cache) could not be pre-rendered: the loader returned null without
 * marking it bad, the session order still offered it, the skip guard rejected
 * it and the sequential fallback stepped from it onto the track that was
 * PLAYING - which loaded fine and was queued as next. The next transition
 * mixed the playing track into itself.
 *
 * Drives the Auto DJ's real preload loop, the real loader's pre-render and the
 * real session controller; only the audio cache and the decks are stubbed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({ engine: null as unknown, rendered: [] as string[] }));

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));
vi.mock('../DJAudioCache', async (orig) => {
  const actual = await orig<typeof import('../DJAudioCache')>();
  return {
    ...actual,
    // The module was added from disk and its source bytes never reached the cache;
    // the other tracks have their rendered audio cached.
    getCachedAudioByFilename: async (filename: string) => {
      holder.rendered.push(filename);
      if (filename === 'quickening.mod') return null;
      return { hash: filename, filename, audioData: new ArrayBuffer(64), duration: 180, waveformPeaks: [0, 0], sampleRate: 44100, numberOfChannels: 2, timestamp: 0, sizeBytes: 64, bpm: 126 };
    },
  };
});

import { useDJStore } from '@/stores/useDJStore';
import { useDJPlaylistStore, type PlaylistTrack } from '@/stores/useDJPlaylistStore';
import { getAutoDJ } from '../DJAutoDJ';
import { setSessionController, DJSessionController } from '../autodj/sessionController';

type Internals = {
  activeDeck: 'A' | 'B'; idleDeck: 'A' | 'B'; preloadedDeck: 'A' | 'B' | null;
  preRenderedTrack: { track: PlaylistTrack } | null; plan: unknown; preloading: boolean; incomingAnalysis: unknown;
  execution: unknown; transitionCancel: unknown;
  preloadNextTrack(): Promise<void>; stopPolling(): void;
};

const NAMES = ['quickening.mod', 'playing.wav', 'other.wav'];
function playlist(): PlaylistTrack[] {
  return NAMES.map((fileName, i) => ({ id: `t${i}`, fileName, trackName: fileName, format: fileName.endsWith('.mod') ? 'MOD' : 'WAV', bpm: 126, duration: 180, addedAt: i, musicalKey: 'A minor', energy: 0.7 }));
}

describe('Auto DJ never mixes the playing track into itself', () => {
  let playlistId = '';

  beforeEach(() => {
    holder.rendered.length = 0;
    holder.engine = { getDeck: () => ({ playbackMode: 'audio', isPlaying: () => true, audioPlayer: { getPosition: () => 30, getDuration: () => 180 } }), setCrossfader: () => {} };
    vi.stubGlobal('fetch', async () => ({ ok: true }));
    const pl = useDJPlaylistStore.getState();
    playlistId = `self-mix-${Date.now()}-${Math.random()}`;
    pl.importPlaylists([{ id: playlistId, name: 'self mix', createdAt: Date.now(), updatedAt: Date.now(), tracks: playlist() }]);
    pl.setActivePlaylist(playlistId);
    const s = useDJStore.getState();
    s.setAutoDJConfig({ shuffle: false, style: 'Club', transitionBars: 8 });
    s.setDeckState('A', { fileName: 'playing.wav', isPlaying: true, detectedBPM: 126, effectiveBPM: 126, durationMs: 180_000 });
    s.setAutoDJEnabled(true);
    s.setAutoDJStatus('playing');
    // Mid-set: other.wav has played, playing.wav is on air, the session order offers quickening.mod next.
    const controller = new DJSessionController();
    setSessionController(controller);
    controller.startSession(playlist().map((track, index) => ({ index, id: track.id, name: track.trackName, artist: null, track })), 2);
    controller.onTrackStarted(2, null, { bpm: 126, key: 'A minor', energy: 0.7 });
    controller.onTrackStarted(1, null, { bpm: 126, key: 'A minor', energy: 0.7 });
    expect(controller.nextIndex()).toBe(0);
    s.setAutoDJTrackIndices(1, 0);
    const dj = getAutoDJ() as unknown as Internals;
    dj.activeDeck = 'A'; dj.idleDeck = 'B'; dj.preloadedDeck = null; dj.preRenderedTrack = null; dj.plan = null;
    dj.preloading = false; dj.incomingAnalysis = null; dj.execution = null; dj.transitionCancel = null;
  });
  afterEach(() => {
    (getAutoDJ() as unknown as Internals).stopPolling();
    useDJStore.getState().setAutoDJEnabled(false);
    setSessionController(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('a queued track that fails to load is marked bad and the next track queued is never the one playing', async () => {
    const dj = getAutoDJ() as unknown as Internals;
    await dj.preloadNextTrack();

    const s = useDJStore.getState();
    expect(s.autoDJCurrentTrackIndex).toBe(1);
    expect(s.autoDJNextTrackIndex).not.toBe(1);
    expect(s.autoDJNextTrackIndex).toBe(2);
    expect(dj.preRenderedTrack?.track.fileName).toBe('other.wav');
    expect(holder.rendered).not.toContain('playing.wav');
    const failed = useDJPlaylistStore.getState().playlists.find((p) => p.id === playlistId)!.tracks[0];
    expect(failed.isBad).toBe(true);
  });
});
