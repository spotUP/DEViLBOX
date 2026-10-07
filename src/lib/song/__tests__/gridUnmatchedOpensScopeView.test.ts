/**
 * A song whose grid a native parser could not match to the replayer's walk
 * carries the typed field gridUnmatchedReason and opens in the scope view
 * (editor mode 'sc68') through the real apply path (applySong). Matched songs
 * keep the grid. One reachability test for the one decision; the parsers'
 * own matching is tested with them.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

const load = (name: string): ArrayBuffer =>
  new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes', name))).slice().buffer as ArrayBuffer;

async function apply(name: string) {
  const { parseSunTronicFile } = await import('@/lib/import/formats/SunTronicParser');
  const { applySong } = await import('../applySong');
  const { useFormatStore } = await import('@/stores/useFormatStore');
  const song = parseSunTronicFile(load(name), name);
  await applySong({
    instruments: song.instruments, patterns: song.patterns, order: song.songPositions,
    bpm: song.initialBPM, speed: song.initialSpeed,
    metadata: { name: song.name }, originalModuleData: null, engine: song,
  }, 'import');
  return { song, mode: useFormatStore.getState().editorMode };
}

describe('a song with an unmatched grid opens in the scope view', () => {
  it('smooth (voices on different row clocks): gridUnmatchedReason set, scope view after applySong', async () => {
    const { song, mode } = await apply('smooth');
    expect(song.gridUnmatchedReason).toMatch(/different row clocks/);
    expect(mode).toBe('sc68');
  }, 60_000);
  it('analgestic2 (grid matches the walk): no reason, grid kept', async () => {
    const { song, mode } = await apply('analgestic2.src');
    expect(song.gridUnmatchedReason).toBeUndefined();
    expect(mode).not.toBe('sc68');
  }, 60_000);
});
