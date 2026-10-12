/**
 * JUGGLE-FOLLOWUPS (c), live 2026-10-12 (37-minute HippoPlayer module set): the playlist rows kept
 * duration 0 after their tracks were pre-rendered and analysed, and the set plan counted every 0 as
 * 240 s - the arc's phases were stretched over a set far longer than the one playing. A row's length
 * comes from the track's one analysis summary (playlistMetaFromSummary), the song's real length
 * (trackLengthSec: the render, or the module's order walk past a capped preview render).
 *
 * Real modules (public/data/songs/formats/shortsong1.mod and "a sleep so deep.mod", parsed by the app's
 * one parse path). Entry: getAutoDJ()'s own anticipate() - the path every pre-rendered next track takes.
 * Numbers: the row reads the render's length, and the session's planned set counts it instead of 240 s;
 * the analyser's 90 s preview of a longer module writes the module's walk length.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/engine/dj/DJEngine', () => ({ getDJEngine: () => { throw new Error('no engine'); }, getDJEngineIfActive: () => null }));
vi.mock('../DJPerSongFx', () => ({ applyPerSongMasterFx: () => {} }));

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useDJPlaylistStore, type PlaylistTrack } from '@/stores/useDJPlaylistStore';
import { getAutoDJ } from '../DJAutoDJ';
import { corpusPipelineAnalysis } from '../autodj/testing/corpus';
import { renderSyntheticTrack } from '../autodj/testing/synthTrack';
import { computeExtendedAnalysis } from '../autodj/activityTimelines';
import { DJSessionController, setSessionController } from '../autodj/sessionController';
import { playlistMetaFromSummary, summaryFromPipeline } from '../autodj/trackAnalysis';
import { timeOrderPositions } from '../autodj/trackerMixAnalysis';
import type { AutoDJInternals } from './juggleTransitionHarness';

async function parse(file: string) {
  const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
  return parseModuleToSong(new File([readFileSync(resolve(process.cwd(), 'public/data/songs/formats', file))], file));
}

/** A render that sounds like a groove of `seconds`, at 125 BPM. */
function render(seconds: number) {
  const bars = Math.round(seconds / (4 * 60 / 125));
  const track = renderSyntheticTrack({ name: 'module render', bpm: 125, root: 57, mode: 'minor', sections: [{ bars, kick: true, bass: true, hats: true, pad: true }] });
  const analysis = corpusPipelineAnalysis(track);
  return { track, analysis: { ...analysis, extended: computeExtendedAnalysis(track.pcm, track.sampleRate, { beats: track.beats }) } };
}

afterEach(() => { setSessionController(null); });

describe('JUGGLE-FOLLOWUPS (c): module rows carry their real length', () => {
  it('a pre-rendered module writes its length to its row, and the set plan counts it instead of 240 s', async () => {
    const song = await parse('shortsong1.mod');
    const { track, analysis } = render(76.8);
    const pl = useDJPlaylistStore.getState();
    const id = `hippo-${Date.now()}`;
    const tracks: PlaylistTrack[] = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, fileName: `m${i}.mod`, trackName: `m${i}`, format: 'MOD', bpm: 0, duration: 0, addedAt: i }));
    pl.importPlaylists([{ id, name: 'hippo modules', createdAt: Date.now(), updatedAt: Date.now(), tracks }]);
    pl.setActivePlaylist(id);
    const controller = new DJSessionController();
    setSessionController(controller);
    controller.startSession(tracks.map((t, index) => ({ index, id: t.id, name: t.trackName, artist: null, track: t })), 0);
    const planned = () => (controller as unknown as { plannedDurationSec(): number }).plannedDurationSec();
    expect(planned()).toBe(2400);

    (getAutoDJ() as unknown as AutoDJInternals).anticipate(tracks[1], 1, { duration: track.durationSec, analysis, song } as never);

    const row = useDJPlaylistStore.getState().playlists.find((p) => p.id === id)!.tracks[1];
    expect(row.duration).toBeCloseTo(track.durationSec, 3);
    expect(planned()).toBeCloseTo(9 * 240 + track.durationSec, 3);
  }, 60_000);

  it('the analyser\'s 90 s preview of a longer module writes the module\'s own length', async () => {
    const song = await parse('a sleep so deep.mod');
    const walk = timeOrderPositions(song);
    const walkEnd = walk.positions[walk.positions.length - 1].end;
    expect(walkEnd).toBeGreaterThan(120);
    const { analysis } = render(90);
    const summary = summaryFromPipeline({ duration: 90, analysis }, 'sleep', song, 90)!;
    expect(playlistMetaFromSummary(summary).duration).toBeCloseTo(walkEnd, 3);
    // A render that was not capped is the length.
    expect(playlistMetaFromSummary(summaryFromPipeline({ duration: 90, analysis }, 'sleep', song)!).duration).toBe(90);
  }, 60_000);
});
