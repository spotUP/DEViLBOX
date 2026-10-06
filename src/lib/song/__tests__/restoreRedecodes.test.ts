/**
 * Restoring an autosave decodes the stored module again (2026-10-06).
 *
 * Seen twice in one day: a crash-recovery restore brought back the grid and
 * engine fields of the decoder of the day it was saved - an MMD3 song with
 * uadeEditableFileData UADE cannot play, Sound Master cells with a retired
 * effect id showing as '?00'. The restore now runs the parse a fresh load runs
 * on the stored bytes, and keeps only what the user did.
 *
 * One reachability test through applySavedProject (the restore entry); the
 * keep-as-saved cases are decided in the pure function.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/engine/ToneEngine', () => {
  const engine = {
    releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}),
    invalidateInstrument: vi.fn(), setBPM: vi.fn(),
  };
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
const parseCalls = vi.hoisted(() => ({ n: 0, lastName: '' }));
vi.mock('@/lib/import/parseModuleToSong', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/import/parseModuleToSong')>();
  return {
    ...real,
    parseModuleToSong: (async (file: File, ...rest: unknown[]) => {
      parseCalls.n++;
      parseCalls.lastName = file.name;
      return (real.parseModuleToSong as (...a: unknown[]) => Promise<unknown>)(file, ...rest);
    }) as typeof real.parseModuleToSong,
  };
});

const NAME = 'bounty hunter - outro (remixed).mmd3';
const SONGS = join(__dirname, '../../../../public/data/songs/formats');

function b64(buf: ArrayBuffer | Uint8Array): string {
  return Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString('base64');
}

/** A project as the stale build saved it: the real song's bytes under the UADE field, one cell edited. */
async function staleProject() {
  const { parseMEDFile } = await import('@/lib/import/formats/MEDParser');
  const { baselineOf } = await import('@/lib/song/gridBaseline');
  const { makeEmptyTestSnapshot } = await import('@hooks/useProjectPersistence');
  const raw = readFileSync(join(SONGS, NAME));
  const bytes = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const song = parseMEDFile(bytes, NAME);

  const patterns = structuredClone(song.patterns);
  const baseline = baselineOf(patterns);
  const edited = { ...patterns[0].channels[0].rows[3], note: 49 };
  patterns[0].channels[0].rows[3] = edited;
  // A cell the stale decoder got wrong and the user never touched: the baseline holds the stale hash.
  const staleCell = { ...patterns[0].channels[1].rows[5], effTyp: 0x2a, eff: 0x77 };
  patterns[0].channels[1].rows[5] = staleCell;
  const { hashCell } = await import('@/lib/song/gridBaseline');
  const ch1 = patterns[0].channels.slice(0, 1).reduce((n, c) => n + c.rows.length, 0);
  baseline[0][ch1 + 5] = hashCell(staleCell);

  const project = makeEmptyTestSnapshot() as unknown as Record<string, unknown>;
  Object.assign(project, {
    patterns,
    instruments: song.instruments,
    patternOrder: song.songPositions,
    bpm: song.initialBPM,
    nativeEngineData: { uadeEditableFileData: b64(bytes) },
    nativeEngineMeta: { uadeEditableFileName: NAME },
    gridBaseline: baseline,
    mixer: { channels: [{ volume: 0.37 }] },
  });
  delete project.nativeCompanionFiles;
  return { project, edited, staleCell, fresh: song };
}

describe('restoring an autosave', () => {
  beforeEach(() => { parseCalls.n = 0; });

  it('decodes the stored module again: stale engine field gone, edited cell and mixer kept, stale cell replaced', async () => {
    const { project, edited, staleCell, fresh } = await staleProject();
    const { applySavedProject } = await import('@hooks/useProjectPersistence');
    const { useFormatStore } = await import('@stores/useFormatStore');
    const { useTrackerStore } = await import('@stores/useTrackerStore');
    const { useMixerStore } = await import('@stores/useMixerStore');

    expect(await applySavedProject(project as never, { fromRecovery: true })).toBe(true);

    expect(parseCalls.n).toBe(1);
    expect(parseCalls.lastName).toBe(NAME);
    const f = useFormatStore.getState();
    // The decoder of today routes MMD3 to libopenmpt: the UADE bytes of the stale save are gone.
    expect(f.uadeEditableFileData).toBeNull();
    expect(f.libopenmptFileData?.byteLength).toBeGreaterThan(0);

    const rows = useTrackerStore.getState().patterns[0].channels;
    expect(rows[0].rows[3].note).toBe(edited.note);
    expect(rows[1].rows[5]).toEqual(fresh.patterns[0].channels[1].rows[5]);
    expect(rows[1].rows[5]).not.toEqual(staleCell);
    expect(useMixerStore.getState().channels[0]?.volume).toBeCloseTo(0.37);
  }, 60000);

  it('keeps a song without stored module bytes as saved (its edits live in the patterns)', async () => {
    const { restoreFromStoredBytes } = await import('@/lib/song/restoreFromStoredBytes');
    const song = { patterns: [], engine: {} } as never;
    const out = await restoreFromStoredBytes(song, [[1]]);
    expect(out.redecoded).toBe(false);
    expect(out.song).toBe(song);
    expect(parseCalls.n).toBe(0);
  });

  it('keeps a song saved without a baseline: its edits cannot be told from the old decoder', async () => {
    const { project } = await staleProject();
    delete project.gridBaseline;
    const { applySavedProject } = await import('@hooks/useProjectPersistence');
    const { useFormatStore } = await import('@stores/useFormatStore');
    expect(await applySavedProject(project as never, { fromRecovery: true })).toBe(true);
    expect(parseCalls.n).toBe(0);
    expect(useFormatStore.getState().uadeEditableFileData?.byteLength).toBeGreaterThan(0);
  }, 60000);
});
