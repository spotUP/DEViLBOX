/**
 * KLYS-CONFORM (owner 2026-10-15, Ocean Loader III.kt in real Chrome): "position and pattern are not reported", the
 * matrix sat frozen while the song played.
 *
 * The display parser read the song header with the wrong field widths (time_signature and sequence_step as 8 bits,
 * song_rate as 16, flags as 16; MusSong has 16/16/8/32), so songLength read 0. The song's order list then had one
 * entry, and useTrackerStore.setCurrentPosition rejected every song row the engine reported: the tracker position
 * stayed 0, the matrix highlight and the pattern view stayed on position 0 while the rows ran.
 *
 * Oracle: the real Klystrack worklet's own header read (its songLoaded message) on the real song.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer } from './workletHarness';
import { klysTransform } from '@/engine/klystrack/KlysEngine';
import { parseKlystrack } from '@/lib/import/formats/KlysParser';
import { useTrackerStore } from '@stores/useTrackerStore';

const SONG = 'public/data/songs/klystrack/Ocean Loader III.kt';

interface Loaded { type?: string; channels?: number; songLength?: number; numPatterns?: number; songSpeed?: number; songSpeed2?: number; songRate?: number; loopPoint?: number; masterVolume?: number; flags?: number }

describe('klystrack song header', () => {
  it('Ocean Loader III.kt: the parser reads the header the engine reads, so the order list holds every song row the engine reports', { timeout: 120000 }, async () => {
    const w = await startWorklet('klystrack', 'Klystrack', klysTransform);
    await w.send({ type: 'loadSong', buffer: songBuffer(SONG) });
    const engine = (w.posted as unknown as Loaded[]).find((m) => m.type === 'songLoaded')!;
    expect(engine, 'the worklet loaded the song').toBeTruthy();

    const song = parseKlystrack(songBuffer(SONG));
    const n = song.klysNative!;
    expect({
      channels: n.channels, songLength: n.songLength, numPatterns: song.patterns.length, songSpeed: n.songSpeed,
      songSpeed2: n.songSpeed2, songRate: n.songRate, loopPoint: n.loopPoint, masterVolume: n.masterVolume, flags: n.flags,
    }).toEqual({
      channels: engine.channels, songLength: engine.songLength, numPatterns: engine.numPatterns, songSpeed: engine.songSpeed,
      songSpeed2: engine.songSpeed2, songRate: engine.songRate, loopPoint: engine.loopPoint, masterVolume: engine.masterVolume,
      flags: engine.flags,
    });
    expect(song.songPositions.length, 'one order entry per song row').toBe(engine.songLength);
    // The tracker's tick rate is BPM * 2 / 5: the song's BPM ticks at its song_rate.
    expect(song.initialBPM).toBe(Math.round(engine.songRate! * 2.5));

    // A song row the engine reports mid-song becomes the tracker position.
    useTrackerStore.getState().loadPatterns(song.patterns);
    useTrackerStore.getState().setPatternOrder(song.songPositions);
    const mid = Math.floor(engine.songLength! / 2);
    useTrackerStore.getState().setCurrentPosition(mid, true);
    expect(useTrackerStore.getState().currentPositionIndex).toBe(mid);
  });
});
