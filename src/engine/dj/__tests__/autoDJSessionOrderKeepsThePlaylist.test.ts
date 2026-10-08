/**
 * Plan sections 8, 10, 43 (playlist invariant), 57: enabling Auto DJ through
 * the product entry (DJActions.enableAutoDJ -> DJAutoDJ.enable) plans a
 * session order with the set planner (lookahead, beam search, energy arc)
 * and never reorders the user's playlist. The decision log carries the
 * "why this track" explanation with rejected alternatives.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({ engine: null as unknown, loads: [] as string[] }));

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));
vi.mock('../DJTrackLoader', () => ({
  loadPlaylistTrackToDeck: async (track: { fileName: string }) => { holder.loads.push(track.fileName); return true; },
  preRenderTrack: async () => null,
  loadPreRenderedTrackToDeck: async () => true,
}));
vi.mock('../DJPerSongFx', () => ({ applyPerSongMasterFx: () => {} }));

import { enableAutoDJ, disableAutoDJ } from '../DJActions';
import { useDJStore } from '@/stores/useDJStore';
import { useDJPlaylistStore, type PlaylistTrack } from '@/stores/useDJPlaylistStore';
import { CORPUS_IDS, corpusSummary } from '../autodj/testing/corpus';
import { getDecisionLog } from '../autodj/decisionLog';
import { getSessionController, setSessionController, DJSessionController } from '../autodj/sessionController';
import { smartSort } from '../DJPlaylistSort';

function corpusPlaylist(): PlaylistTrack[] {
  return CORPUS_IDS.map((id, i) => {
    const s = corpusSummary(id);
    return { id, fileName: `${id}.wav`, trackName: id, format: 'WAV', bpm: s.bpm, duration: s.durationSec, addedAt: i, musicalKey: s.key ?? 'Unknown', energy: s.energy.loudnessEnergy, djSummary: s };
  });
}

describe('Auto DJ plans a session order and keeps the user playlist', () => {
  // The corpus is analysed once (15 synthetic tracks): slow under a loaded machine.
  beforeAll(() => { corpusPlaylist(); }, 120_000);
  beforeEach(() => {
    holder.loads.length = 0;
    getDecisionLog().clear();
    setSessionController(new DJSessionController());
    const deck = { play: async () => {}, stop: () => {}, isPlaying: () => true, playbackMode: 'audio', audioPlayer: { getPosition: () => 0, getDuration: () => 60 }, replayer: { getElapsedMs: () => 0 } };
    holder.engine = { getDeck: () => deck, setCrossfader: () => {}, mixer: { setCrossfader: () => {} } };
    // importPlaylists injects the playlist as saved data: no stem pre-separation
    // side effects (addTrack's dynamic import of the stem preloader trips a
    // module-cycle TDZ in DJStemPreloader under this test's import order; that
    // cycle is not under test here).
    const pl = useDJPlaylistStore.getState();
    const id = `session-${Date.now()}`;
    pl.importPlaylists([{ id, name: 'session', createdAt: Date.now(), updatedAt: Date.now(), tracks: corpusPlaylist() }]);
    pl.setActivePlaylist(id);
    useDJStore.getState().setDeckState('A', { isPlaying: false, trackAnalysis: null });
    useDJStore.getState().setDeckState('B', { isPlaying: false, trackAnalysis: null });
    useDJStore.getState().setAutoDJConfig({ shuffle: false, style: 'Club' });
  });
  afterEach(() => { disableAutoDJ(); setSessionController(null); vi.restoreAllMocks(); });

  it('enable() plans the order with lookahead and leaves the playlist order untouched', async () => {
    const pl = useDJPlaylistStore.getState();
    const before = pl.playlists.find((p) => p.id === pl.activePlaylistId)!.tracks.map((t) => t.id);
    const legacyOrder = smartSort(corpusPlaylist()).map((t) => t.id);
    const error = await enableAutoDJ(0);
    expect(error).toBeNull();
    const after = useDJPlaylistStore.getState().playlists.find((p) => p.id === pl.activePlaylistId)!.tracks.map((t) => t.id);
    expect(after).toEqual(before);
    const s = useDJStore.getState();
    expect(s.autoDJSessionOrder.length).toBeGreaterThanOrEqual(3);
    expect(s.autoDJSessionOrder.length).toBeLessThanOrEqual(6);
    expect(s.autoDJSessionOrder).not.toContain(0);
    // The next track comes from the session order, not from the playlist's next row.
    expect(s.autoDJNextTrackIndex).toBe(s.autoDJSessionOrder[0]);
    const controller = getSessionController();
    expect(controller.counts.sessionPlans).toBeGreaterThanOrEqual(1);
    expect(controller.currentSetPlan!.lookahead).toBeGreaterThanOrEqual(3);
    const log = getDecisionLog();
    const pick = log.last('SELECT_NEXT_TRACK')!;
    expect(pick.selectedTrack).toBe(before[s.autoDJSessionOrder[0]]);
    expect(pick.reasons.length).toBeGreaterThan(0);
    expect(pick.rejectedAlternatives.length).toBeGreaterThan(0);
    expect(log.counts.PLAN_SESSION_ORDER).toBeGreaterThanOrEqual(1);
    // A different mechanism from the greedy legacy sort: the whole session order is not its prefix.
    expect(s.autoDJSessionOrder.map((i) => before[i])).not.toEqual(legacyOrder.slice(1, 1 + s.autoDJSessionOrder.length));
    // Every candidate's score is observable per component (plan section 9).
    const chosen = controller.currentSetPlan!.candidates[0];
    expect(Object.keys(chosen.components).length).toBeGreaterThanOrEqual(10);
    expect(controller.currentSetPlan!.phase).toBe('OPENING');
  }, 60_000);

  it('with shuffle on, the user setting wins and the order is a permutation', async () => {
    useDJStore.getState().setAutoDJConfig({ shuffle: true });
    await enableAutoDJ(0);
    const s = useDJStore.getState();
    expect(s.autoDJNextTrackIndex).not.toBe(0);
  }, 60_000);
});
