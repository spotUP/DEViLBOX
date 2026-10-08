/**
 * A GoatTracker song packed for 2x speed or 25 Hz plays at its own tick rate
 * in the GoatTracker editor's engine (S1c). A .sng does not store the speed
 * multiplier (it is a pack option of GoatTracker's exporter), so a SID built
 * with it carries the multiplier into the song the open path hands the engine
 * (GTUltra's settings block), and the engine reads it back on load.
 *
 * Fixtures: GoatTracker 2.77 example tempo2test.sng and 2xtest.sng packed by gt2reloc 2.77
 * with -S2 (2x, hard restart 0A05), -S0 (25 Hz), -S1 (1x), author info on.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWebBundle, type WebBundle } from '@/test/wasm/webBundle';

vi.mock('@/engine/ToneEngine', () => {
  const engine = {
    releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}),
    invalidateInstrument: vi.fn(), setBPM: vi.fn(),
  };
  return { getToneEngine: () => engine };
});
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })), markKnownSource: vi.fn(), isKnownSource: () => true }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

import { useFormatStore } from '@/stores/useFormatStore';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const FIX = 'src/lib/song/__tests__/fixtures/';
const fileOf = (p: string): File => new File([readFileSync(resolve(ROOT, p)) as unknown as BlobPart], basename(p));

interface GTModule {
  cwrap: (name: string, ret: string | null, args: string[]) => (...a: number[]) => number;
  _malloc: (n: number) => number;
  _free: (p: number) => void;
}
let b: WebBundle<GTModule>;
let api: Record<string, (...a: number[]) => number>;

beforeAll(async () => {
  const dir = join(ROOT, 'public/gtultra');
  b = await loadWebBundle<GTModule>(join(dir, 'GTUltra.js'), join(dir, 'GTUltra.wasm'), 'createGTUltra');
  const w = (n: string, args: string[]) => b.module.cwrap(n, 'number', args);
  api = {
    init: w('gt_init', ['number', 'number']), load: w('gt_load_sng', ['number', 'number']),
    play: w('gt_play', ['number', 'number', 'number']), stop: w('gt_stop', []),
    multiplier: w('gt_debug_multiplier', []), framerate: w('gt_debug_framerate', []),
    adparam: w('gt_debug_adparam', []), tempo: w('gt_debug_tempo_ch0', []),
  };
  api.init(44100, 0);
}, 60_000);

/** Open the file the way a drop does and hand the engine what the open path produced; read its tick rate. */
async function openAndPlay(file: File): Promise<{ multiplier: number; framerate: number; adparam: number }> {
  const { openUserSong } = await import('@/lib/song/openUserSong');
  const errs: string[] = [];
  useFormatStore.getState().applyEditorMode({} as never);
  await openUserSong(file, 'drop', undefined, (m) => errs.push(m));
  expect(errs).toEqual([]);
  expect(useFormatStore.getState().editorMode).toBe('goattracker');
  return enginePlays(useFormatStore.getState().goatTrackerData as Uint8Array);
}

function enginePlays(data: Uint8Array): { multiplier: number; framerate: number; adparam: number } {
  const ptr = b.module._malloc(data.length);
  b.heap().set(data, ptr);
  const ok = api.load(ptr, data.length);
  b.module._free(ptr);
  expect(ok).toBe(1);
  api.stop();
  api.play(0, 0, 0);
  return { multiplier: api.multiplier(), framerate: api.framerate(), adparam: api.adparam() };
}

describe('GoatTracker speed multiplier reaches the engine', { timeout: 30000 }, () => {
  it('a SID packed for 2x plays at 100 ticks per second with its hard restart', async () => {
    expect(await openAndPlay(fileOf(FIX + 'gt2_2xtest_x2.sid'))).toEqual({ multiplier: 2, framerate: 100, adparam: 0x0a05 });
  });

  it('a SID packed for 25 Hz plays at 25 ticks per second, not 50', async () => {
    expect((await openAndPlay(fileOf(FIX + 'gt2_tempo2test_25hz.sid'))).framerate).toBe(25);
  });

  it('a 1x SID, and a .sng after a 2x song, play at 50 (nothing carried over)', async () => {
    expect((await openAndPlay(fileOf(FIX + 'gt2_tempo2test_x1.sid'))).framerate).toBe(50);
    await openAndPlay(fileOf(FIX + 'gt2_2xtest_x2.sid'));
    const sng = new Uint8Array(readFileSync(resolve(ROOT, 'public/data/songs/goat-tracker-ultra/$3jammar-akhbar.sng')));
    expect(enginePlays(sng)).toMatchObject({ multiplier: 1, framerate: 50 });
  });
});
