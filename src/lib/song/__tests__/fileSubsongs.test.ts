/**
 * Subsongs of command-stream files (lib/import/fileSubsongs), through the real open path.
 *
 * One reachability test per feature: a file with several tunes opens through openSong on the tune
 * asked for (and on the first that sounds when none is), the picker's scan reports the count, and
 * the song's subsong switch reopens it on another tune. What a tune's grid IS lives with its
 * format: here the grid is held to the replayer's walk of that tune, the oracle the parser draws it from.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
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

import { openSong, prepareSong } from '@/lib/song/openSong';
import { needsImportChoice } from '@/lib/song/importChoice';
import { switchSubsong } from '@/lib/tracker/subsongSwitch';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { chooseFileSubsong, scanFileSubsongs, type FileSubsongFormat } from '@/lib/import/fileSubsongs';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import { walkDavidWhittaker } from '@/lib/import/formats/DavidWhittakerWasmExtractor';
import { buildDWGridFromWalk, fitEffectColumns } from '@/lib/import/formats/davidWhittakerGrid';
import { DW_FX } from '@/lib/import/formats/davidWhittakerEffectGlyphs';
import type { Pattern } from '@/types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const bytesOf = (rel: string): ArrayBuffer => {
  const b = readFileSync(resolve(ROOT, rel));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

/** The notes of a pattern set as `channel:row:note` strings: what the grid says is played where. */
const noteCells = (patterns: Pattern[]): string[] =>
  patterns.flatMap((p, pi) => p.channels.flatMap((ch, c) => ch.rows.flatMap((r, i) => (r.note > 0 ? [`${pi}:${c}:${i}:${r.note}`] : []))));
const voicesWithNotes = (patterns: Pattern[]): number[] =>
  [...new Set(noteCells(patterns).map((s) => Number(s.split(':')[1])))].sort();

describe('the default tune is the first one that sounds', () => {
  const fake = (silent: number[]): FileSubsongFormat => ({
    key: 'fake', fileDataField: 'x', count: async () => 5, audible: async (_b, i) => !silent.includes(i),
  });
  const none = new ArrayBuffer(0);

  it('skips silent tunes, honours a request, and falls back to the first when all are silent', async () => {
    expect(await chooseFileSubsong(fake([0, 1]), none, 'a.x')).toMatchObject({ count: 5, current: 2 });
    expect(await chooseFileSubsong(fake([0, 1]), none, 'a.x', 1)).toMatchObject({ current: 1 });
    expect(await chooseFileSubsong(fake([0, 1]), none, 'a.x', 9)).toMatchObject({ current: 2 });
    expect(await chooseFileSubsong(fake([0, 1, 2, 3, 4]), none, 'a.x')).toMatchObject({ current: 0 });
  });
});

describe('a tick that ends one pass and starts the next fits the effect columns', () => {
  it('drops the vibrato the same tick sets again, and still refuses what cannot fit', () => {
    const vib = (a: number, b: number): [number, number][] => [[DW_FX.vibratoSpeed, a], [DW_FX.vibratoDepth, b]];
    // vibrato, loop, envelope, vibrato again: the first vibrato was in force for no time
    const wrap = fitEffectColumns([...vib(1, 2), [DW_FX.loop, 1], [DW_FX.envelope, 8], ...vib(1, 2)]);
    expect(wrap.overflow).toBe(false);
    expect(wrap.shown).toHaveLength(4);
    // six different commands do not fit: nothing is dropped to make them
    expect(fitEffectColumns([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1]]).overflow).toBe(true);
  });
});

describe('David Whittaker apb.dw: 8 subsongs', { timeout: 120_000 }, () => {
  const REL = 'public/data/songs/formats/apb.dw';
  let restore = () => {};
  beforeAll(() => { restore = installDwNodeFetch(); });
  afterAll(() => restore());

  it('the picker scan reports the count and the first tune that sounds, and a file with tunes needs the dialog', async () => {
    expect(await scanFileSubsongs('apb.dw', bytesOf(REL))).toEqual({ count: 8, first: 0 });
    const prepared = await prepareSong({ kind: 'bytes', name: 'apb.dw', bytes: bytesOf(REL) });
    expect(prepared.fileSubsongs).toEqual({ count: 8, first: 0 });
    expect(needsImportChoice(prepared)).toBe(true);
    expect(needsImportChoice({ ...prepared, fileSubsongs: undefined })).toBe(false);
  });

  it('opens through openSong on the tune asked for, with the grid of the replayer walk of that tune', async () => {
    const bytes = bytesOf(REL);
    const r = await openSong({ kind: 'bytes', name: 'apb.dw', bytes }, { origin: 'mcp', subsong: 1 });
    expect(r).toMatchObject({ ok: true });
    expect(useFormatStore.getState().fileSubsongs).toEqual({ count: 8, current: 1, fileName: 'apb.dw' });
    const shown = useTrackerStore.getState().patterns;
    const oracle = buildDWGridFromWalk(await walkDavidWhittaker(bytes, 60_000, 1)).patterns;
    expect(noteCells(shown)).toEqual(noteCells(oracle));
    expect(voicesWithNotes(shown)).toEqual([0, 1, 2, 3]);
  });

  it('opens on the first tune that sounds when none is asked for, and the subsong switch reopens on another', async () => {
    const bytes = bytesOf(REL);
    const r = await openSong({ kind: 'bytes', name: basename(REL), bytes }, { origin: 'mcp' });
    expect(r).toMatchObject({ ok: true });
    expect(useFormatStore.getState().fileSubsongs).toMatchObject({ count: 8, current: 0 });
    expect(voicesWithNotes(useTrackerStore.getState().patterns)).toEqual([0, 1]);

    await switchSubsong(1);
    expect(useFormatStore.getState().fileSubsongs).toMatchObject({ count: 8, current: 1 });
    expect(voicesWithNotes(useTrackerStore.getState().patterns)).toEqual([0, 1, 2, 3]);
    const oracle = buildDWGridFromWalk(await walkDavidWhittaker(bytes, 60_000, 1)).patterns;
    expect(noteCells(useTrackerStore.getState().patterns)).toEqual(noteCells(oracle));
  });
});
