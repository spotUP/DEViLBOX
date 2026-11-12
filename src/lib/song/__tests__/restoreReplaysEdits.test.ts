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
import { describe, it, expect, vi, beforeAll } from 'vitest';
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
// The engine's onStarted hook awaits the edit replay and only then reads the patterns back, so a call
// here is the signal that the replay has finished (the replay's lazy imports take a variable time).
const patternReads = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/engine/uade/UADEChipRAMPatternReader', () => ({
  populatePatternsFromChipRAM: async () => { patternReads.count++; return {}; },
}));
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
  patternReads.count = 0;
  expect(await applySavedProject(project as never, { fromRecovery: true })).toBe(true);
  const f = useFormatStore.getState();
  const song = {
    format: 'MOD', instruments: [], patterns: useTrackerStore.getState().patterns,
    uadeEditableFileData: f.uadeEditableFileData, uadePatternLayout: f.uadePatternLayout,
  };
  await startNativeEngines(song as never, {} as never, false, true, new Set());
  // UADE reads chip RAM 500 ms after the load, after replaying the restored edits
  const deadline = Date.now() + 30_000;
  while (patternReads.count === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
  expect(patternReads.count).toBe(1);
  return song;
}

describe('restoring an autosave on an engine-played song', () => {
  // The first restore pulls the whole app graph through vite's on-demand transform: 30-55 s at the
  // test run's lowest CPU priority, more beside a second test file. Paid here, under its own limit,
  // so the 60 s of each test bound the restore and the engine start, not the cold transform (a test
  // that timed out left its restore running into the next test, which then saw a stray write; the edit replay's own lazy imports raced the old fixed 700 ms wait the same way; now the wait ends at the pattern read-back that follows the replay).
  beforeAll(async () => {
    await Promise.all([
      import('@/lib/import/parseModuleToSong'), import('@/lib/song/gridBaseline'), import('@hooks/useProjectPersistence'),
      import('@stores/useFormatStore'), import('@stores/useTrackerStore'), import('@/engine/replayer/NativeEngineRouting'),
      // The edit replay loads these lazily, 500 ms after the engine load; cold, that outlasts the wait below.
      import('@/engine/replayer/liveCellEdits'), import('@/engine/uade/writeCellToChipRam'),
    ]);
  }, 300_000);

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
