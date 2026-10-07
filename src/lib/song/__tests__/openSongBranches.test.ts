/**
 * The branch bodies behind openSong (U4.1): SunVox, V2M, AdPlug, GoatTracker,
 * MIDI and the .dbx project each open through openSong, by their real file,
 * and the branch RAN (sentinel on the songBranches function, counted) and
 * handed its song to applySong once. One reachability test per branch; what a
 * branch does with its format is tested where that format lives.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('@/engine/ToneEngine', () => {
  const engine = {
    releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}),
    invalidateInstrument: vi.fn(), setBPM: vi.fn(), ensureInstrumentReady: vi.fn(),
  };
  return { getToneEngine: () => engine };
});
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })), markKnownSource: vi.fn(), isKnownSource: () => true }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));
vi.mock('@/lib/song/songBranches', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/song/songBranches')>();
  return {
    ...real,
    loadSongFile: vi.fn(real.loadSongFile),
    loadV2MFile: vi.fn(real.loadV2MFile),
    loadAdPlugFile: vi.fn(real.loadAdPlugFile),
  };
});
// The AdPlug WASM does not load in node: the extractor is the one replaced piece, it returns the song it is told to.
const adplug = vi.hoisted(() => ({ song: null as unknown }));
vi.mock('@/lib/import/formats/AdPlugWasmExtractor', () => ({ extractAdPlugPatterns: vi.fn(async () => adplug.song) }));
vi.mock('@/lib/song/applySong', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/song/applySong')>();
  return { ...real, applySong: vi.fn(real.applySong) };
});

import { openSong } from '@/lib/song/openSong';
import * as branches from '@/lib/song/songBranches';
import { applySong } from '@/lib/song/applySong';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { compressProject } from '@/lib/projectCompression';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const bytesOf = (rel: string): ArrayBuffer => {
  const b = readFileSync(resolve(ROOT, rel));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

const open = (name: string, bytes: ArrayBuffer) => openSong({ kind: 'bytes', name, bytes }, { origin: 'mcp' });

describe('every branch behind openSong is reached through it', { timeout: 120000 }, () => {
  beforeEach(() => {
    vi.mocked(branches.loadSongFile).mockClear();
    vi.mocked(branches.loadV2MFile).mockClear();
    vi.mocked(branches.loadAdPlugFile).mockClear();
    vi.mocked(applySong).mockClear();
  });

  it.each([
    ['MIDI', 'public/data/songs/midi/drum_song.mid', 'project', 'loadSongFile'],
    ['SunVox', 'public/data/songs/sunvox/last blow.sunvox', 'sunvox', 'loadSongFile'],
    ['V2M', 'test-data/test.v2m', 'v2m', 'loadV2MFile'],
  ] as const)('%s opens through openSong and its branch applies the song once', async (_label, rel, kind, branch) => {
    const r = await open(basename(rel), bytesOf(rel));
    expect(r).toMatchObject({ ok: true, kind });
    expect(vi.mocked(branches[branch])).toHaveBeenCalledTimes(1);
    expect(vi.mocked(applySong)).toHaveBeenCalledTimes(1);
    expect(useTrackerStore.getState().patterns.length).toBeGreaterThan(0);
  });

  it('GoatTracker opens through the one apply step: unloaded first, generation bumped, GTUltra store filled from the applied song', async () => {
    const rel = 'public/data/songs/goat-tracker-ultra/$3jammar-akhbar.sng';
    const { useSongLoadStore } = await import('@/stores/useSongLoadStore');
    const { useGTUltraStore } = await import('@/stores/useGTUltraStore');
    const { useFormatStore } = await import('@/stores/useFormatStore');
    useGTUltraStore.getState().setPendingSongData(null);
    const before = useSongLoadStore.getState().generation;
    let generationAtApply = -1;
    let appliedBytes = 0;
    const real = (await vi.importActual<typeof import('@/lib/song/applySong')>('@/lib/song/applySong')).applySong;
    vi.mocked(applySong).mockImplementationOnce(async (song, source) => {
      generationAtApply = useSongLoadStore.getState().generation;
      appliedBytes = song.engine.goatTrackerData?.byteLength ?? 0;
      await real(song, source);
    });

    const r = await open(basename(rel), bytesOf(rel));

    expect(r).toMatchObject({ ok: true, kind: 'goatTracker', editorMode: 'goattracker' });
    expect(vi.mocked(branches.loadSongFile)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(applySong)).toHaveBeenCalledTimes(1);
    expect(generationAtApply).toBeGreaterThan(before);
    expect(appliedBytes).toBe(bytesOf(rel).byteLength);
    expect(useFormatStore.getState().goatTrackerData?.byteLength).toBe(appliedBytes);
    expect(useGTUltraStore.getState().pendingSongData?.byteLength).toBe(appliedBytes);
    expect(useGTUltraStore.getState().songName).toBe('$3jammar-akhbar');
  });

  it('AdPlug opens through openSong, extracts, and applies the song once', async () => {
    // a song to hand back: any parsed one, with the OPL fields an extraction carries
    expect((await open('drum_song.mid', bytesOf('public/data/songs/midi/drum_song.mid'))).ok).toBe(true);
    adplug.song = {
      name: 'adagio', format: 'AdPlug', patterns: structuredClone(useTrackerStore.getState().patterns), instruments: structuredClone(useInstrumentStore.getState().instruments),
      songPositions: [0], initialBPM: 125, initialSpeed: 6, adplugFileData: new ArrayBuffer(4), adplugFileName: 'ADAGIO.DFM',
    };
    vi.mocked(branches.loadSongFile).mockClear();
    vi.mocked(applySong).mockClear();

    const rel = 'adplug-wasm/adplug-adplug-2.4/test/testmus/ADAGIO.DFM';
    const r = await open(basename(rel), bytesOf(rel));

    expect(r, JSON.stringify(r)).toMatchObject({ ok: true, kind: 'adplug' });
    expect(vi.mocked(branches.loadAdPlugFile)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(branches.loadSongFile)).not.toHaveBeenCalled();
    expect(vi.mocked(applySong)).toHaveBeenCalledTimes(1);
  });

  it('a .dbx project opens through openSong and applies as a project', async () => {
    const mod = 'public/data/songs/formats/a sleep so deep.mod';
    expect((await open('a sleep so deep.mod', bytesOf(mod))).ok).toBe(true);
    const patterns = useTrackerStore.getState().patterns;
    const instruments = useInstrumentStore.getState().instruments;
    const project = { metadata: { name: 'branch project' }, bpm: 125, speed: 6, patterns, instruments, patternOrder: patterns.map((_p, i) => i) };
    const dbx = compressProject(JSON.stringify(project));
    vi.mocked(branches.loadSongFile).mockClear();
    vi.mocked(applySong).mockClear();

    const r = await open('branch.dbx', dbx);

    expect(r).toMatchObject({ ok: true, kind: 'project' });
    expect(r.ok && r.message).toContain('branch project');
    expect(vi.mocked(branches.loadSongFile)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(applySong)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(applySong).mock.calls[0][1]).toBe('project');
  });

  describe('TD-3 pattern files', () => {
    const rel = 'public/data/songs/behringer-td-3/Acid Pattern 8.seq';
    const openTD3 = (replacePatterns: boolean) =>
      openSong({ kind: 'bytes', name: basename(rel), bytes: bytesOf(rel) }, { origin: 'mcp', td3: { replacePatterns } });

    it('replace mode opens through the one apply step: unloaded first, the song lands, stores hold only the TD-3 song', async () => {
      const { useSongLoadStore } = await import('@/stores/useSongLoadStore');
      const { useProjectStore } = await import('@/stores/useProjectStore');
      expect((await open('drum_song.mid', bytesOf('public/data/songs/midi/drum_song.mid'))).ok).toBe(true);
      vi.mocked(applySong).mockClear();
      const before = useSongLoadStore.getState().generation;
      let generationAtApply = -1;
      const real = (await vi.importActual<typeof import('@/lib/song/applySong')>('@/lib/song/applySong')).applySong;
      vi.mocked(applySong).mockImplementationOnce(async (song, source) => {
        generationAtApply = useSongLoadStore.getState().generation;
        await real(song, source);
      });

      const r = await openTD3(true);

      expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
      expect(vi.mocked(applySong)).toHaveBeenCalledTimes(1);
      expect(generationAtApply).toBeGreaterThan(before);
      const instruments = useInstrumentStore.getState().instruments;
      expect(instruments.map((i) => i.synthType)).toEqual(['TB303']);
      const patterns = useTrackerStore.getState().patterns;
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.every((p) => p.channels[0].instrumentId === instruments[0].id)).toBe(true);
      expect(useProjectStore.getState().metadata.author).toBe('TD-3 Import');
    });

    it('append mode stays an edit: no apply step, the loaded song keeps its instruments and gains the patterns', async () => {
      expect((await open('drum_song.mid', bytesOf('public/data/songs/midi/drum_song.mid'))).ok).toBe(true);
      const patternsBefore = useTrackerStore.getState().patterns.length;
      const instrumentsBefore = useInstrumentStore.getState().instruments.length;
      vi.mocked(applySong).mockClear();

      const r = await openTD3(false);

      expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
      expect(vi.mocked(applySong)).not.toHaveBeenCalled();
      expect(useTrackerStore.getState().patterns.length).toBeGreaterThan(patternsBefore);
      expect(useInstrumentStore.getState().instruments.length).toBe(instrumentsBefore + 1);
    });
  });
});
