/**
 * A restored session can carry an order entry that names no pattern: a subsong
 * switch once wrote a tune index (5) as the order of a 4-pattern song
 * (mighty bombjack.mc), session recovery restored it, and the transport froze.
 * applySong is the one place every load path enters; it keeps only order
 * entries that name a pattern of the song.
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

const name = 'analgestic2.src';
const load = (): ArrayBuffer =>
  new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes', name))).slice().buffer as ArrayBuffer;

describe('a restored order names only real patterns', () => {
  it('drops entries past the pattern list and keeps the rest in order', async () => {
    const { parseSunTronicFile } = await import('@/lib/import/formats/SunTronicParser');
    const { applySong } = await import('../applySong');
    const { useTrackerStore } = await import('@/stores/useTrackerStore');
    const song = parseSunTronicFile(load(), name);
    const missing = song.patterns.length + 1;
    await applySong({
      instruments: song.instruments, patterns: song.patterns, order: [missing, ...song.songPositions, -1],
      bpm: song.initialBPM, speed: song.initialSpeed,
      metadata: { name: song.name }, originalModuleData: null, engine: song,
    }, 'recovery');
    expect(useTrackerStore.getState().patternOrder).toEqual(song.songPositions);
  }, 180_000);
});
