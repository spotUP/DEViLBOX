/**
 * MED-LIVE-EDIT: an OctaMED grid edit changes the bytes the playing engine loads, and an unedited song is unchanged.
 *
 * Reachability: the edit is made through the pattern editor's own store action (useTrackerStore.setCell). MMD3 plays on
 * libopenmpt (route 'med-module': the module is patched and handed to the engine); MMDC plays on nuade (route 'engine-swap').
 * The sentinel is applyMedModuleEdits running once for the MMD3 edit.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
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
const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../libopenmpt/medModuleEdits', async (orig) => {
  const real = await orig<typeof import('../libopenmpt/medModuleEdits')>();
  return { ...real, applyMedModuleEdits: (...a: Parameters<typeof real.applyMedModuleEdits>) => { sentinel.calls++; return real.applyMedModuleEdits(...a); } };
});

const SONGS = 'public/data/songs/formats/';
async function load(name: string) {
  const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
  const raw = readFileSync(SONGS + name);
  return { raw, song: await parseModuleToSong(new File([new Uint8Array(raw)], name)) };
}
/** The replayer's song: its patterns are the store's, as in the app. */
function liveOf(song: object) {
  return new Proxy(song, { get: (t, k, r) => (k === 'patterns' ? useTrackerStore.getState().patterns : Reflect.get(t, k, r)) });
}
function pickCell(song: { patterns: { channels: { rows: { note: number; instrument: number }[] }[] }[] }) {
  const row = song.patterns[0].channels[1].rows[3];
  return { note: row.note === 40 ? 41 : 40, instrument: row.instrument === 5 ? 6 : 5 };
}
afterEach(() => { sentinel.calls = 0; });

describe('OctaMED grid edit reaches the bytes the engine plays', () => {
  it('MMD3: a store cell edit patches the libopenmpt module (sentinel ran), the edit reads back, unedited is byte-identical', async () => {
    const { raw, song } = await load('bounty hunter - outro (remixed).mmd3');
    const { patchMedModule } = await import('@/lib/export/MEDExporter');
    expect(Buffer.from(patchMedModule(song)!).equals(raw)).toBe(true);

    const { liveEditRoute } = await import('@engine/replayer/liveCellEdits');
    expect(liveEditRoute(song).route).toBe('med-module');
    useTrackerStore.setState({ patterns: song.patterns, currentPatternIndex: 0 });
    live.song = liveOf(song);
    const before = Buffer.from(song.libopenmptFileData!);
    const cell = pickCell(song);
    useTrackerStore.getState().setCell(1, 3, cell, 0);
    await vi.waitFor(() => expect(sentinel.calls).toBe(1));

    const played = Buffer.from(song.libopenmptFileData!);
    expect(played.equals(before)).toBe(false);
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const again = await parseModuleToSong(new File([new Uint8Array(played)], 'bounty hunter - outro (remixed).mmd3'));
    expect(again.patterns[0].channels[1].rows[3]).toMatchObject(cell);
  }, 120_000);

  it('MMDC: plays on nuade (engine-swap); an edit repacks and reads back, unedited is byte-identical', async () => {
    const name = 'captain planet and the planeteers - title.mmdc';
    const { raw, song } = await load(name);
    const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
    const { setGridBaseline, baselineOf } = await import('@/lib/song/gridBaseline');
    setGridBaseline(baselineOf(song.patterns));
    expect(Buffer.from((await exportNativeSong(song))!.data as Uint8Array).equals(raw)).toBe(true);

    const { liveEditRoute } = await import('@engine/replayer/liveCellEdits');
    expect(song.nuadeFileData?.byteLength).toBeGreaterThan(0);
    expect(liveEditRoute(song).route).toBe('engine-swap');

    const cell = pickCell(song);
    Object.assign(song.patterns[0].channels[1].rows[3], cell);
    const edited = Buffer.from((await exportNativeSong(song))!.data as Uint8Array);
    expect(edited.equals(raw)).toBe(false);
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const again = await parseModuleToSong(new File([new Uint8Array(edited)], name));
    expect(again.patterns[0].channels[1].rows[3]).toMatchObject(cell);
  }, 120_000);
});
