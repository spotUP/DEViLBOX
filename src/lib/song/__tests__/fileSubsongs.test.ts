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
import { installDwNodeFetch, installWasmNodeFetches } from '@/lib/import/__tests__/helpers/dwNodeFetch';
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
    expect(await unchangedAfterExport(bytes)).toBe(true);
    const changed = await changedBytesAfterOneEdit(bytes);
    expect(changed, 'one note edit patches the note of the tune shown').toBeGreaterThan(0);
    expect(changed).toBeLessThanOrEqual(2);
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

/** The tune's grid as the shown song holds it, by the notes it names. */
const shownNotes = (): string[] => noteCells(useTrackerStore.getState().patterns);

async function openAt(name: string, bytes: ArrayBuffer, subsong?: number): Promise<void> {
  const r = await openSong({ kind: 'bytes', name, bytes }, { origin: 'mcp', ...(subsong === undefined ? {} : { subsong }) });
  expect(r).toMatchObject({ ok: true });
}

/** Edit the first note of the shown grid one semitone and export: the bytes that changed. */
async function changedBytesAfterOneEdit(original: ArrayBuffer): Promise<number> {
  const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
  const tracker = useTrackerStore.getState();
  let at: { p: number; c: number; r: number; note: number } | null = null;
  tracker.patterns.some((pat, p) => pat.channels.some((ch, c) => ch.rows.some((row, r) => {
    if (row.note > 0 && row.note < 90) { at = { p, c, r, note: row.note }; return true; }
    return false;
  })));
  if (!at) throw new Error('the shown grid holds no note');
  const { p, c, r, note } = at as { p: number; c: number; r: number; note: number };
  tracker.setCurrentPattern(p);
  tracker.setCell(c, r, { note: note + 1 });
  const out = await exportNativeSong(null, {});
  expect(out, 'the native export took the song').toBeTruthy();
  const before = new Uint8Array(original);
  const after = out!.data;
  expect(after.length).toBe(before.length);
  return before.reduce((n, v, i) => n + (v === after[i] ? 0 : 1), 0);
}

async function unchangedAfterExport(original: ArrayBuffer): Promise<boolean> {
  const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
  const out = await exportNativeSong(null, {});
  return !!out && Buffer.compare(Buffer.from(out.data), Buffer.from(original)) === 0;
}

describe('Future Player hybris.fp: 6 subsongs', { timeout: 180_000 }, () => {
  const REL = 'public/data/songs/formats/hybris.fp';
  it('scans six, opens subsong 3 with the grid of its walk, and its export keeps the bytes and takes an edit', async () => {
    const bytes = bytesOf(REL);
    expect(await scanFileSubsongs('hybris.fp', bytes)).toEqual({ count: 6, first: 0 });
    await openAt('hybris.fp', bytes, 3);
    expect(useFormatStore.getState().fileSubsongs).toEqual({ count: 6, current: 3, fileName: 'hybris.fp' });
    const { buildFuturePlayerGrid } = await import('@/lib/import/formats/FuturePlayerParser');
    expect(shownNotes()).toEqual(noteCells(buildFuturePlayerGrid(new Uint8Array(bytes), undefined, 3).grid!.patterns));
    expect(await unchangedAfterExport(bytes)).toBe(true);
    const changed = await changedBytesAfterOneEdit(bytes);
    expect(changed, 'one note edit moves a byte or two of the tune, not a re-pack').toBeGreaterThan(0);
    expect(changed).toBeLessThanOrEqual(2);
  });
  it('opens on subsong 0 (three voices) by default and switches to the four-voice subsong 1', async () => {
    const bytes = bytesOf(REL);
    await openAt('hybris.fp', bytes);
    expect(useFormatStore.getState().fileSubsongs?.current).toBe(0);
    expect(voicesWithNotes(useTrackerStore.getState().patterns)).toEqual([0, 1, 2]);
    await switchSubsong(1);
    expect(useFormatStore.getState().fileSubsongs?.current).toBe(1);
    expect(voicesWithNotes(useTrackerStore.getState().patterns)).toEqual([0, 1, 2, 3]);
  });
});

describe('Ben Daglish motorhead: 3 subsongs', { timeout: 180_000 }, () => {
  const REL = 'public/data/songs/ben-daglish/motorhead-titleandingame.bd';
  let restore = () => {};
  beforeAll(() => { restore = installWasmNodeFetches([['bd', 'Bd']]); });
  afterAll(() => restore());

  it('scans three, opens subsong 2 with the grid of its walk, and its export keeps the bytes and takes an edit', async () => {
    const bytes = bytesOf(REL);
    expect(await scanFileSubsongs('motorhead.bd', bytes)).toEqual({ count: 3, first: 0 });
    await openAt('motorhead.bd', bytes, 2);
    expect(useFormatStore.getState().fileSubsongs).toEqual({ count: 3, current: 2, fileName: 'motorhead.bd' });
    const { walkBenDaglish } = await import('@/lib/import/formats/BenDaglishWasmExtractor');
    const { buildBDGridFromWalk } = await import('@/lib/import/formats/benDaglishGrid');
    expect(shownNotes()).toEqual(noteCells(buildBDGridFromWalk(await walkBenDaglish(bytes, 2)).patterns));
    expect(await unchangedAfterExport(bytes)).toBe(true);
    const changed = await changedBytesAfterOneEdit(bytes);
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThanOrEqual(2);
  });
  it('the subsong switch reopens on another tune', async () => {
    const bytes = bytesOf(REL);
    await openAt('motorhead.bd', bytes, 0);
    const first = shownNotes();
    await switchSubsong(1);
    expect(useFormatStore.getState().fileSubsongs?.current).toBe(1);
    expect(shownNotes()).not.toEqual(first);
  });
});

describe('Hippel TFMX: lethalxcess-intro.hip7 (2 subsongs) and warp (ingame 2).hip (2 subsongs)', { timeout: 180_000 }, () => {
  let restore = () => {};
  beforeAll(() => { restore = installWasmNodeFetches([['tfmx', 'TFMX']]); });
  afterAll(() => restore());

  it('lethalxcess-intro.hip7: scans two, opens subsong 1 as the steps the decoder walks for it, and the export keeps the bytes', async () => {
    const bytes = bytesOf('public/data/songs/hippel-7v/lethalxcess-intro.hip7');
    const name = 'lethalxcess-intro.hip7';
    expect(await scanFileSubsongs(name, bytes)).toEqual({ count: 2, first: 0 });
    await openAt(name, bytes, 1);
    expect(useFormatStore.getState().fileSubsongs).toEqual({ count: 2, current: 1, fileName: name });
    const { hippelTfmxModule } = await import('@/lib/import/formats/JochenHippel7VParser');
    const { hippelGrid } = await import('@/lib/import/formats/HippelTfmxWalk');
    const m = hippelTfmxModule(new Uint8Array(bytes))!;
    const shown = useTrackerStore.getState().patterns;
    expect(shown.map((p) => p.length)).toEqual(hippelGrid(m, 1).steps.map((st) => st.rows));
    expect(shown.length).not.toBe(hippelGrid(m, 0).steps.length);   // the other subsong has other steps
    expect(await unchangedAfterExport(bytes)).toBe(true);
    const changed = await changedBytesAfterOneEdit(bytes);
    expect(changed, 'one note edit patches the note of the tune shown').toBeGreaterThan(0);
    expect(changed).toBeLessThanOrEqual(2);
  });

  // A .hip is read by UADE first (its scan, its subsong count, which the dialog's picker shows), then parsed natively
  // with the number picked: the parse is what is held here, without the UADE scan a node test cannot run.
  it('warp (ingame 2).hip: parses subsong 1 as the steps the decoder walks for it, and defaults to the first that sounds', async () => {
    const bytes = bytesOf('public/data/songs/hippel/warp (ingame 2).hip');
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const { hippelTfmxModule } = await import('@/lib/import/formats/JochenHippel7VParser');
    const { hippelGrid } = await import('@/lib/import/formats/HippelTfmxWalk');
    const m = hippelTfmxModule(new Uint8Array(bytes))!;
    const file = new File([bytes], 'warp (ingame 2).hip');
    const one = await parseModuleToSong(file, 1);
    expect(one.fileSubsongs).toEqual({ count: 2, current: 1, fileName: 'warp (ingame 2).hip' });
    expect(one.patterns.map((p) => p.length)).toEqual(hippelGrid(m, 1).steps.map((st) => st.rows));
    const first = await parseModuleToSong(file);
    expect(first.fileSubsongs?.current).toBe(0);
    expect(first.patterns.length).toBe(hippelGrid(m, 0).steps.length);
  });

  it('a CoSo module with a second song opens on it (the second song of wings of death is steps 10 to 19 of its first)', async () => {
    const orig = new Uint8Array(bytesOf('public/data/songs/hippel-coso/wings of death (level 3).hipc'));
    const u32 = (o: number) => ((orig[o] << 24) | (orig[o + 1] << 16) | (orig[o + 2] << 8) | orig[o + 3]) >>> 0;
    const songsOff = u32(20);
    const patched = new Uint8Array(orig);
    const p0 = (orig[songsOff] << 8) | orig[songsOff + 1];
    const speed0 = (orig[songsOff + 4] << 8) | orig[songsOff + 5];
    const put = (o: number, v: number) => { patched[o] = v >> 8; patched[o + 1] = v & 0xff; };
    put(songsOff + 6, p0 + 10); put(songsOff + 8, p0 + 19); put(songsOff + 10, speed0);   // slot 1: steps 10..19, the old dummy slot
    const bytes = patched.buffer.slice(0) as ArrayBuffer;
    const name = 'wings.hipc';
    expect(await scanFileSubsongs(name, bytes)).toEqual({ count: 2, first: 0 });
    await openAt(name, bytes, 0);
    const whole = useTrackerStore.getState().patterns;
    await openAt(name, bytes, 1);
    expect(useFormatStore.getState().fileSubsongs).toEqual({ count: 2, current: 1, fileName: name });
    const part = useTrackerStore.getState().patterns;
    expect(part).toHaveLength(10);
    const notesOf = (pats: Pattern[]) => pats.map((pat) => pat.channels.map((ch) => ch.rows.map((r) => r.note)));
    expect(notesOf(part)).toEqual(notesOf(whole.slice(10, 20)));
    expect(await unchangedAfterExport(bytes)).toBe(true);
    const changed = await changedBytesAfterOneEdit(bytes);
    expect(changed, 'one note edit patches the note of the tune shown').toBeGreaterThan(0);
    expect(changed).toBeLessThanOrEqual(2);
  });
});

describe('Rob Hubbard budokan.rh: 6 songs, played by UADE', { timeout: 180_000 }, () => {
  const REL = 'public/data/songs/rob-hubbard/budokan.rh';

  it('scans six, opens song 3 with the grid of the player walk of it, and its export keeps the bytes and takes an edit', async () => {
    const bytes = bytesOf(REL);
    expect(await scanFileSubsongs('budokan.rh', bytes)).toEqual({ count: 6, first: 0 });
    await openAt('budokan.rh', bytes, 3);
    expect(useFormatStore.getState().fileSubsongs).toEqual({ count: 6, current: 3, fileName: 'budokan.rh' });
    const { buildRobHubbardGrid } = await import('@/lib/import/formats/RobHubbardParser');
    const oracle = noteCells(buildRobHubbardGrid(new Uint8Array(bytes), 3)!.patterns);
    expect(oracle.length).toBeGreaterThan(0);
    expect(shownNotes()).toEqual(oracle);
    expect(oracle).not.toEqual(noteCells(buildRobHubbardGrid(new Uint8Array(bytes), 0)!.patterns));
    expect(await unchangedAfterExport(bytes)).toBe(true);
    const changed = await changedBytesAfterOneEdit(bytes);
    expect(changed, 'one note edit patches the note of the song shown').toBeGreaterThan(0);
    expect(changed).toBeLessThanOrEqual(2);
  });

  it('UADE starts the song the grid shows (the player numbers its songs from 0, as its table does)', async () => {
    const { UADEEngine } = await import('@/engine/uade/UADEEngine');
    const bytes = bytesOf(REL);
    await openAt('budokan.rh', bytes, 4);
    const loadForPlayback = vi.fn(async () => {});
    await UADEEngine.prototype.loadTune.call({ loadForPlayback } as unknown as import('@/engine/uade/UADEEngine').UADEEngine, bytes);
    expect(loadForPlayback).toHaveBeenCalledWith(bytes, 'budokan.rh', 4, true, undefined);
  });
});

describe('a restore re-decodes the tune the saved grid shows', () => {
  it('hands the re-decode the saved fileSubsongs.current, not subsong 0', async () => {
    const { restoreFromStoredBytes } = await import('@/lib/song/restoreFromStoredBytes');
    const { hashCell } = await import('@/lib/song/gridBaseline');
    const cell = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
    const pattern = { id: 'p', name: 'p', length: 1, channels: [{ id: 'c', name: 'c', muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null, rows: [cell] }] } as unknown as Pattern;
    const saved = { patterns: [pattern], instruments: [], engine: { uadeEditableFileData: new ArrayBuffer(8), uadeEditableFileName: 'apb.dw', fileSubsongs: { count: 8, current: 5, fileName: 'apb.dw' } } } as never;
    const parse = vi.fn(async (..._args: unknown[]) => ({ patterns: [pattern], instruments: [] }) as never);
    await restoreFromStoredBytes(saved, [[hashCell(cell)]], parse);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse.mock.calls[0][1]).toBe(5);
  });
});
