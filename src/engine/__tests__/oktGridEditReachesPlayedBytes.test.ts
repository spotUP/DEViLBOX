/**
 * OKT-LIVE-EDIT: an Oktalyzer grid edit changes the bytes the playing engine gets, and an unedited song is unchanged.
 *
 * Reachability: the edit is made through the pattern editor's own store action (useTrackerStore.setCell). Oktalyzer plays on
 * its own WASM replayer (route 'grid-cell'): the running replayer gets the cell (sentinel: OktalyzerEngine.setCell ran once),
 * and the next play loads editedModuleForPlay's bytes, which carry the cell in the PBOD chunk.
 */
import { describe, it, expect, vi } from 'vitest';
import '@/stores/useTrackerStore';
import { readFileSync } from 'node:fs';
import { useTrackerStore } from '@/stores/useTrackerStore';

const live: { song: unknown } = { song: null };
vi.mock('../ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => undefined });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })) }));
vi.mock('@engine/TrackerReplayer', async (orig) => {
  const replayer: object = new Proxy({}, { get: (_t, k) => (k === 'getSong' ? () => live.song : () => undefined) });
  return { ...(await orig<object>()), getTrackerReplayer: () => replayer, peekTrackerReplayer: () => replayer };
});

const PATH = 'public/data/songs/formats/45.okta';

describe('Oktalyzer grid edit reaches the bytes the engine plays', () => {
  it('a store cell edit reaches the running replayer (sentinel) and the next-play module; unedited is byte-identical', async () => {
    const raw = readFileSync(PATH);
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const song = await parseModuleToSong(new File([new Uint8Array(raw)], '45.okta'));
    const { liveEditRoute } = await import('@engine/replayer/liveCellEdits');
    expect(liveEditRoute(song)).toEqual({ route: 'grid-cell', engine: 'OktalyzerReplayer' });

    const { setGridBaseline, baselineOf } = await import('@/lib/song/gridBaseline');
    setGridBaseline(baselineOf(song.patterns));
    const { playingDescriptor } = await import('@engine/replayer/liveCellEdits');
    const { editedModuleForPlay } = await import('@engine/replayer/editedModuleForPlay');
    const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
    // The stores hold the song as the loader leaves them (the next-play export reads the format store).
    (await import('@/stores/useFormatStore')).useFormatStore.getState().applyEditorMode(song);
    useTrackerStore.setState({ patterns: song.patterns, currentPatternIndex: 0 });
    live.song = new Proxy(song, { get: (t, k, r) => (k === 'patterns' ? useTrackerStore.getState().patterns : Reflect.get(t, k, r)) });
    const desc = playingDescriptor(song)!;

    // Unedited: the export is the file, and nothing is substituted for the loaded module.
    expect(Buffer.from((await exportNativeSong(song))!.data as Uint8Array).equals(raw)).toBe(true);
    expect(await editedModuleForPlay(song, desc)).toBeNull();

    // Edit through the store; the running replayer receives it.
    const { OktalyzerEngine } = await import('@/engine/oktalyzer/OktalyzerEngine');
    const post = vi.fn();
    vi.spyOn(OktalyzerEngine, 'hasInstance').mockReturnValue(true);
    vi.spyOn(OktalyzerEngine, 'getInstance').mockReturnValue({ setCell: OktalyzerEngine.prototype.setCell, workletNode: { port: { postMessage: post } } } as never);
    const old = song.patterns[0].channels[1].rows[3];
    const cell = { note: old.note === 40 ? 41 : 40, instrument: old.instrument === 5 ? 6 : 5 };
    useTrackerStore.getState().setCell(1, 3, cell, 0);
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'setCell', row: 3, channel: 1 }));
    vi.restoreAllMocks();

    // Next play: the module the engine is loaded with differs from the loaded one in exactly this cell's 4 bytes.
    const played = Buffer.from(new Uint8Array((await editedModuleForPlay(live.song as typeof song, desc))!));
    expect(played.length).toBe(raw.length);
    const off = song.uadePatternLayout!.getCellFileOffset!(0, 3, 1);
    const diff = [...played.keys()].filter((i) => played[i] !== raw[i]);
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.every((i) => i >= off && i < off + 4)).toBe(true);
    const again = await parseModuleToSong(new File([new Uint8Array(played)], '45.okta'));
    expect(again.patterns[0].channels[1].rows[3]).toMatchObject(cell);
  }, 120_000);
});
