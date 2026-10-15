/**
 * KLYS-MATRIX-AND-EDITOR-BROKEN (owner 2026-10-15, Ocean Loader III.kt in real Chrome): the klystrack position matrix
 * showed nothing and the pattern editor ran far too fast.
 *
 * A klystrack sequence entry sits at a song ROW, and the engine's song position is that row (g_mus.song_position). The
 * matrix had one row per song row (songLength = 1600+), almost all empty slots, and rode the play head one step per
 * row. The pattern editor followed the transport row, which the replayer's TS scheduler wrote from the parser's stub
 * song at its estimated BPM, because KlysEngine never dispatched its own position (live: 10.5 rows/s from the engine,
 * the editor's row written at about 38 rows/s, and two writers alternating).
 *
 * Driven here with the real Klystrack worklet + WASM on the real song: its songData sequences feed the real
 * KlysPositionEditor (SongOrderMatrix captured), and its position reports go through KlysEngine.subscribeToCoordinator
 * into a real PlaybackCoordinator.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import type { KlysNativeData } from '@/types/tracker';
import type { FormatChannel } from '@/components/shared/format-editor-types';

const matrix = vi.hoisted(() => ({ props: null as null | { formatChannels: FormatChannel[]; currentRow?: number } }));
vi.mock('@/components/shared/SongOrderMatrix', () => ({
  SongOrderMatrix: (p: { formatChannels: FormatChannel[]; currentRow?: number }) => { matrix.props = p; return null; },
}));

import { KlysPositionEditor } from '@/components/klystrack/KlysPositionEditor';
import { KlysEngine, klysTransform } from '@/engine/klystrack/KlysEngine';
import { PlaybackCoordinator } from '@/engine/PlaybackCoordinator';
import { PositionCallbacks } from '@/engine/wasm/PositionCallbacks';

interface Posted { type?: string; songPosition?: number; patternPosition?: number; speed?: number; songLength?: number; channels?: number; sequences?: KlysNativeData['sequences']; songSpeed?: number; songSpeed2?: number; songRate?: number }

describe('klystrack follows its engine', () => {
  it('Ocean Loader III.kt: the matrix shows every sequence step and highlights the playing one; the pattern view gets one row per row the engine plays', { timeout: 120000 }, async () => {
    const w = await startWorklet('klystrack', 'Klystrack', klysTransform);
    await w.send({ type: 'loadSong', buffer: songBuffer('public/data/songs/klystrack/Ocean Loader III.kt') });
    const posted = w.posted as unknown as Posted[];
    const info = posted.find((m) => m.type === 'songLoaded')!;
    const data = posted.find((m) => m.type === 'songData')!;
    expect(info, 'the worklet loaded the song').toBeTruthy();
    expect(data?.sequences?.length).toBe(info.channels);

    const native = {
      channels: info.channels!, songLength: info.songLength!, loopPoint: 0, songSpeed: info.songSpeed!, songSpeed2: info.songSpeed2!,
      songRate: info.songRate!, masterVolume: 128, flags: 0, patterns: [], sequences: data.sequences!, instruments: [], instrumentsFrom: 'stub',
    } as KlysNativeData;

    // The engine plays; its position reports reach the coordinator through KlysEngine.subscribeToCoordinator.
    const coordinator = new PlaybackCoordinator();
    coordinator.stateRing.playing = true;
    const dispatched: Array<{ row: number; position: number }> = [];
    coordinator.onRowChange = (row, _pattern, position) => dispatched.push({ row, position });
    const engine = Object.create(KlysEngine.prototype) as KlysEngine;
    Object.assign(engine, { _positions: new PositionCallbacks() });
    const unsub = engine.subscribeToCoordinator(coordinator);

    await w.send({ type: 'play' });
    const reports: Posted[] = [];
    const out = stereoOutputs(1);
    for (let i = 0; i < 48000 * 6 / 128; i++) {
      w.proc.process([], out);
      for (const m of (w.posted as unknown as Posted[]).splice(0)) {
        if (m.type !== 'position') continue;
        reports.push(m);
        (engine as unknown as { _positions: PositionCallbacks })._positions.emit({ songPos: m.songPosition, row: m.patternPosition });
      }
    }
    unsub();

    // Pattern view: one coordinator row per row the engine played, the engine's own row and song row.
    const engineRows: Array<{ row: number; position: number }> = [];
    for (const r of reports) {
      const last = engineRows[engineRows.length - 1];
      if (!last || last.row !== r.patternPosition || last.position !== r.songPosition) engineRows.push({ row: r.patternPosition!, position: r.songPosition! });
    }
    expect(dispatched).toEqual(engineRows);
    const played = engineRows[engineRows.length - 1].position - engineRows[0].position;
    expect(played, 'six seconds of the song moved the play head through tens of rows').toBeGreaterThan(30);
    expect(dispatched.length, 'one row change per row played, never more').toBeLessThanOrEqual(played + 2);

    // Matrix: one row per sequence step, each showing an entry; the highlight is the step that holds the playing song row.
    const starts = [...new Set(native.sequences.flatMap((s) => s.entries.map((e) => e.position)))].sort((a, b) => a - b);
    expect(starts.length).toBeLessThan(native.songLength / 8);
    const render = (songRow: number) => {
      renderToStaticMarkup(<KlysPositionEditor nativeData={native} songRow={songRow} isPlaying />);
      return matrix.props!;
    };
    const p0 = render(0);
    expect(p0.formatChannels[0].rows.length, 'one matrix row per sequence step, not per song row').toBe(starts.length);
    for (let i = 0; i < starts.length; i++) {
      expect(p0.formatChannels.some((c) => (c.rows[i] as { pattern: number }).pattern >= 0), `step ${i} shows an entry`).toBe(true);
    }
    for (const { position } of engineRows) {
      const props = render(position);
      const step = props.currentRow!;
      expect(starts[step], `song row ${position}: highlighted step starts at or before it`).toBeLessThanOrEqual(position);
      if (step + 1 < starts.length) expect(starts[step + 1]).toBeGreaterThan(position);
      // The highlighted ch0 cell is the pattern ch0 is playing.
      const ch0 = native.sequences[0].entries.filter((e) => e.position <= position).pop()!;
      if (ch0.position === starts[step]) expect((props.formatChannels[0].rows[step] as { pattern: number }).pattern).toBe(ch0.pattern);
    }
    const highlighted = new Set(engineRows.map(({ position }) => render(position).currentRow));
    expect(highlighted.size, 'the highlight stepped once per sequence step crossed, not once per row').toBeLessThan(engineRows.length / 8);
  });
});
