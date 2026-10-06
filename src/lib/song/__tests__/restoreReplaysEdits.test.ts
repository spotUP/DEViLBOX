/**
 * After an autosave restore the engine plays the user's edits (2026-10-06).
 *
 * The restore decodes the stored module bytes again, and those are the
 * originals: a UADE chip-RAM song played without the edits that the grid showed.
 * The edited cells (those that differ from the decoded baseline) now go through
 * the live edit path an interactive edit uses (sendCellEditsToEngine ->
 * writeCellToChipRam) when the engine has loaded the module.
 *
 * One reachability test: real restore (applySavedProject), real engine start
 * (startNativeEngines), a real corpus song (SidMon 1, a chip-RAM
 * byte carrier); the sentinel is the chip-RAM writer.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerCell } from '@/types/tracker';

const writes = vi.hoisted(() => [] as { pattern: number; row: number; channel: number; note: number | undefined }[]);
vi.mock('@/engine/uade/writeCellToChipRam', () => ({
  writeCellToChipRam: async (_s: unknown, pattern: number, row: number, channel: number, cell: TrackerCell) => {
    writes.push({ pattern, row, channel, note: cell.note });
  },
}));
const engine = vi.hoisted(() => ({
  ready: async () => {}, loadTune: async () => {}, play: () => {},
}));
vi.mock('@/engine/uade/UADEEngine', () => ({
  UADEEngine: { hasInstance: () => true, getInstance: () => engine },
}));
vi.mock('@/engine/uade/UADEChipEditor', () => ({ UADEChipEditor: class {} }));
vi.mock('@/engine/uade/UADEChipRAMPatternReader', () => ({ populatePatternsFromChipRAM: async () => ({}) }));
vi.mock('@/engine/ToneEngine', () => {
  const t = {
    releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}),
    invalidateInstrument: vi.fn(), setBPM: vi.fn(), getInstrument: vi.fn(),
  };
  return { getToneEngine: () => t };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));

const NAME = 'anarchy.sid1';
const FILE = join(__dirname, '../../../../public/data/songs/formats', NAME);
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');

async function savedProject(editNote: number) {
  const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
  const { baselineOf } = await import('@/lib/song/gridBaseline');
  const { makeEmptyTestSnapshot } = await import('@hooks/useProjectPersistence');
  const raw = readFileSync(FILE);
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const song = await parseModuleToSong(new File([ab], NAME), 0);
  const patterns = structuredClone(song.patterns);
  const baseline = baselineOf(patterns);
  patterns[0].channels[0].rows[2] = { ...patterns[0].channels[0].rows[2], note: editNote };
  const project = makeEmptyTestSnapshot() as unknown as Record<string, unknown>;
  Object.assign(project, {
    patterns, instruments: song.instruments, patternOrder: song.songPositions, bpm: song.initialBPM,
    nativeEngineData: { uadeEditableFileData: b64(new Uint8Array(ab)) },
    nativeEngineMeta: { uadeEditableFileName: NAME },
    gridBaseline: baseline,
  });
  delete project.nativeCompanionFiles;
  return { project, orig: song.patterns[0].channels[0].rows[2] };
}

async function restoreAndStart(project: unknown) {
  const { applySavedProject } = await import('@hooks/useProjectPersistence');
  const { useFormatStore } = await import('@stores/useFormatStore');
  const { useTrackerStore } = await import('@stores/useTrackerStore');
  const { startNativeEngines, clearRunningEngineKeys } = await import('@/engine/replayer/NativeEngineRouting');
  clearRunningEngineKeys();
  expect(await applySavedProject(project as never, { fromRecovery: true })).toBe(true);
  const f = useFormatStore.getState();
  const song = {
    format: 'MOD', instruments: [], patterns: useTrackerStore.getState().patterns,
    uadeEditableFileData: f.uadeEditableFileData, uadePatternLayout: f.uadePatternLayout,
  };
  await startNativeEngines(song as never, {} as never, false, true, new Set());
  await new Promise((r) => setTimeout(r, 700)); // UADE reads chip RAM 500 ms after the load
  return song;
}

describe('restoring an autosave on an engine-played song', () => {
  it('sends the edited cell through the chip-RAM writer once the engine has loaded, and nothing else', { timeout: 60000 }, async () => {
    writes.length = 0;
    const { project, orig } = await savedProject(49);
    expect(orig.note).not.toBe(49);
    await restoreAndStart(project);
    expect(writes).toEqual([{ pattern: 0, row: 2, channel: 0, note: 49 }]);
  });

  it('sends nothing for a restore with no edited cell', { timeout: 60000 }, async () => {
    writes.length = 0;
    const { project, orig } = await savedProject(0);
    // note 0 may equal the original: force "no edit" by restoring the original cell
    (project.patterns as { channels: { rows: unknown[] }[] }[])[0].channels[0].rows[2] = orig;
    await restoreAndStart(project);
    expect(writes).toEqual([]);
  });
});

describe('takeRestoredEdits', () => {
  it('returns the cells that differ from the baseline once, and nothing when no restore is pending', async () => {
    const g = await import('@/lib/song/gridBaseline');
    const cell = (note: number) => ({ note, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }) as unknown as TrackerCell;
    const patterns = [{ channels: [{ rows: [cell(1), cell(2)] }] }] as never;
    g.setGridBaseline([[g.hashCell(cell(1)), g.hashCell(cell(9))]]);
    expect(g.takeRestoredEdits(patterns)).toEqual([]);
    g.setRestoredEditsPending(true);
    const edits = g.takeRestoredEdits(patterns);
    expect(edits.map((e) => [e.pattern, e.row, e.channel])).toEqual([[0, 1, 0]]);
    expect(g.takeRestoredEdits(patterns)).toEqual([]);
    g.setRestoredEditsPending(true);
    g.setGridBaseline(null); // the next song entering through applySong clears the flag
    expect(g.takeRestoredEdits(patterns)).toEqual([]);
  });
});
