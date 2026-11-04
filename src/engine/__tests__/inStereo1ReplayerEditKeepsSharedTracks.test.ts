/**
 * IS1-OWN-REPLAYER-EDIT: editing one position of fantasi8.is on the InStereo replayer (the own WASM engine, chosen with the
 * format engine setting) leaves the other positions sharing that track unchanged.
 *
 * The track-index route used to poke the shared 16-line track in the replayer's pool, so every position sharing it changed
 * while playing, while the exporter copies on write. InStereo1Replayer is now a liveSwap engine: a store cell edit hands the
 * running replayer the exporter's module (sentinel: InStereo1Engine.swapModule ran once, no setTrackCell), which is the module
 * the next play loads.
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

describe('InStereo! 1.0 edit on the own replayer', () => {
  it('editing one position of fantasi8.is on the InStereo replayer leaves the other positions sharing that track unchanged', async () => {
    const raw = readFileSync(PATH);
    const { useSettingsStore } = await import('@/stores/useSettingsStore');
    useSettingsStore.getState().setFormatEngine('inStereo1', 'native');
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const song = await parseModuleToSong(new File([new Uint8Array(raw)], 'fantasi8.is'));
    const { liveEditRoute, playingDescriptor } = await import('@engine/replayer/liveCellEdits');
    expect(liveEditRoute(song)).toEqual({ route: 'engine-swap', engine: 'InStereo1Replayer' });

    const { setGridBaseline, baselineOf } = await import('@/lib/song/gridBaseline');
    setGridBaseline(baselineOf(song.patterns));
    const { editedModuleForPlay } = await import('@engine/replayer/editedModuleForPlay');
    (await import('@/stores/useFormatStore')).useFormatStore.getState().applyEditorMode(song);
    useTrackerStore.setState({ patterns: song.patterns, currentPatternIndex: 0 });
    live.song = new Proxy(song, { get: (t, k, r) => (k === 'patterns' ? useTrackerStore.getState().patterns : Reflect.get(t, k, r)) });
    const desc = playingDescriptor(song)!;

    const { InStereo1Engine } = await import('@/engine/instereo1/InStereo1Engine');
    const swapped: ArrayBuffer[] = [];
    const poked: unknown[][] = [];
    vi.spyOn(InStereo1Engine, 'hasInstance').mockReturnValue(true);
    vi.spyOn(InStereo1Engine, 'getInstance').mockReturnValue({
      swapModule: (m: ArrayBuffer) => { swapped.push(m); },
      setTrackCell: (...a: unknown[]) => { poked.push(a); },
    } as never);

    // An edit position whose cell is equal in another position of the same channel (a shared track line).
    const cellKey = (c: { note: number; instrument: number; effTyp: number; eff: number }) => `${c.note}/${c.instrument}/${c.effTyp}/${c.eff}`;
    const chRows = (p: number) => song.patterns[p].channels[0].rows;
    let p = -1; let r = -1;
    outer: for (let a = 0; a < song.patterns.length; a++) {
      for (let i = 0; i < chRows(a).length; i++) {
        if (!(chRows(a)[i].note > 0 && chRows(a)[i].note < 90)) continue;
        const key = chRows(a).map(cellKey).join('|');
        if (song.patterns.some((_, b) => b !== a && chRows(b).map(cellKey).join('|') === key)) { p = a; r = i; break outer; }
      }
    }
    expect(p).toBeGreaterThanOrEqual(0);
    const before = song.patterns.map((pat) => pat.channels.map((ch) => ch.rows.map(cellKey)));
    const oldNote = chRows(p)[r].note;
    useTrackerStore.setState({ currentPatternIndex: p });
    useTrackerStore.getState().setCell(0, r, { note: oldNote + 1 }, p);
    await vi.waitFor(() => expect(swapped.length).toBe(1), { timeout: 60_000 });
    vi.restoreAllMocks();
    expect(poked).toEqual([]);
    expect(swapped[0].byteLength).toBe(raw.length + 64 + 256);

    // The module the replayer is handed is the exporter's copy-on-write module and the next play loads the same bytes.
    const played = Buffer.from(new Uint8Array((await editedModuleForPlay(live.song as typeof song, desc))!));
    expect(played.equals(Buffer.from(new Uint8Array(swapped[0])))).toBe(true);
    const again = await parseModuleToSong(new File([new Uint8Array(played)], 'fantasi8.is'));
    expect(again.patterns[p].channels[0].rows[r].note).toBe(oldNote + 1);
    // Only that cell changed: every other position, including those sharing the run, is as it was.
    again.patterns.forEach((pat, pi) => pat.channels.forEach((ch, ci) => ch.rows.forEach((c, ri) => {
      if (pi === p && ci === 0 && ri === r) return;
      expect(cellKey(c)).toBe(before[pi][ci][ri]);
    })));
  }, 300_000);
});
