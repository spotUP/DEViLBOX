/**
 * IS1-LIVE-EDIT: an InStereo! 1.0 grid edit changes the bytes the playing engine gets, and an unedited song is unchanged.
 *
 * Reachability: the edit is made through the pattern editor's own store action (useTrackerStore.setCell). fantasi8.is plays on
 * nuade (route 'engine-swap', engine Nuade): the edited module is swapped into the running player (sentinel:
 * NuadeEngine.swapModule ran once, with the module the exporter wrote), and the next play loads those same editedModuleForPlay
 * bytes, which carry the edit in the track line the exporter copied (copy on write: the shared runs of every other position
 * stay as they were).
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

const PATH = 'public/data/songs/formats/fantasi8.is';

describe('InStereo! 1.0 grid edit reaches the bytes the engine plays', () => {
  it('a store cell edit reaches the running replayer (sentinel) and the next-play module; unedited is byte-identical', async () => {
    const raw = readFileSync(PATH);
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const song = await parseModuleToSong(new File([new Uint8Array(raw)], 'fantasi8.is'));
    const { liveEditRoute, playingDescriptor } = await import('@engine/replayer/liveCellEdits');
    expect(liveEditRoute(song)).toEqual({ route: 'engine-swap', engine: 'Nuade' });

    const { setGridBaseline, baselineOf } = await import('@/lib/song/gridBaseline');
    setGridBaseline(baselineOf(song.patterns));
    const { editedModuleForPlay } = await import('@engine/replayer/editedModuleForPlay');
    const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
    (await import('@/stores/useFormatStore')).useFormatStore.getState().applyEditorMode(song);
    useTrackerStore.setState({ patterns: song.patterns, currentPatternIndex: 0 });
    live.song = new Proxy(song, { get: (t, k, r) => (k === 'patterns' ? useTrackerStore.getState().patterns : Reflect.get(t, k, r)) });
    const desc = playingDescriptor(song)!;

    // Unedited: the export is the file, and nothing is substituted for the loaded module.
    expect(Buffer.from((await exportNativeSong(song))!.data as Uint8Array).equals(raw)).toBe(true);
    expect(raw.length).toBe(45656);
    expect(await editedModuleForPlay(song, desc)).toBeNull();

    // Edit through the store; the running nuade player is handed the edited module.
    const { NuadeEngine } = await import('@/engine/nuade/NuadeEngine');
    const swapped: ArrayBuffer[] = [];
    vi.spyOn(NuadeEngine, 'hasInstance').mockReturnValue(true);
    vi.spyOn(NuadeEngine, 'getInstance').mockReturnValue({ swapModule: (m: ArrayBuffer) => { swapped.push(m); } } as never);
    const p = song.patterns.findIndex((pat) => pat.channels[0].rows.some((c) => c.note > 0 && c.note < 90));
    const r = song.patterns[p].channels[0].rows.findIndex((c) => c.note > 0 && c.note < 90);
    const old = song.patterns[p].channels[0].rows[r];
    const cell = { note: old.note + 1 };
    useTrackerStore.setState({ currentPatternIndex: p });
    useTrackerStore.getState().setCell(0, r, cell, p);
    await vi.waitFor(() => expect(swapped.length).toBe(1), { timeout: 60_000 });
    vi.restoreAllMocks();
    expect(swapped[0].byteLength).toBe(raw.length + 64 + 256);

    // Next play: the module the engine is loaded with is the exporter's copy-on-write module (+320 B) and carries the edit.
    const played = Buffer.from(new Uint8Array((await editedModuleForPlay(live.song as typeof song, desc))!));
    expect(played.length).toBe(raw.length + 64 + 256);
    expect(played.equals(Buffer.from(new Uint8Array(swapped[0])))).toBe(true);
    const again = await parseModuleToSong(new File([new Uint8Array(played)], 'fantasi8.is'));
    expect(again.patterns[p].channels[0].rows[r].note).toBe(old.note + 1);
    expect(again.patterns[p].channels[0].rows[r].instrument).toBe(old.instrument);
  }, 300_000);
});
