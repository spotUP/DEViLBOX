/**
 * A SID compiled by GoatTracker 1.53 opens as the GoatTracker 1 song it was
 * built from, in the GoatTracker editor (S1b, owner 2026-10-08: known players
 * only). The engine loads the GTS! file (gsong.c "Goattracker 1.xx import"), so
 * the decoder only has to return what GoatTracker 1 saved.
 *
 * Answer key: nintendo.sng (GoatTracker 1.53 example song, GPL) packed with the
 * 1.53 packer logic (goattrk.c relocator + packpattern, ported for the key:
 * 2x speed, 1-frame hard restart, ADSR 0A05) -> gt1_nintendo_x2.sid. The decoded
 * song must equal the source song as the packer keeps it: orderlists, every
 * pattern row, every instrument and the filter table. Real HVSC tunes
 * (Rupert, Ne7) cover the packer's real output; their data tiles to the last
 * byte of the file, which the decoder requires. What the packer drops is named
 * in canonical() below: instrument names, pulse limit low nibbles, repeated
 * instrument numbers, tempo 2 (plays as 3).
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
const bytes = (p: string): Uint8Array => new Uint8Array(readFileSync(resolve(ROOT, p)));
const fileOf = (p: string): File => new File([bytes(p) as unknown as BlobPart], basename(p));

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
    adparam: w('gt_debug_adparam', []),
  };
  api.init(44100, 0);
}, 60_000);

/** What GoatTracker 1 (goattrk.c) saves: the song as the editor holds it. */
interface Gt1Song {
  orderlists: number[][][];
  instruments: Array<{ ad: number; sr: number; pulse: number; pulseadd: number; low: number; high: number; filter: number; wave: number[] }>;
  patterns: Array<Array<[number, number, number, number]>>;
  filters: number[];
}

function parseGts1(b8: Uint8Array): Gt1Song {
  expect(String.fromCharCode(...b8.subarray(0, 4))).toBe('GTS!');
  let p = 100;
  const songs = b8[p++];
  const orderlists: number[][][] = [];
  for (let s = 0; s < songs; s++) {
    const chans: number[][] = [];
    for (let c = 0; c < 3; c++) {
      const n = b8[p++] + 1;
      chans.push(Array.from(b8.subarray(p, p + n)));
      p += n;
    }
    orderlists.push(chans);
  }
  const instruments: Gt1Song['instruments'] = [];
  for (let i = 1; i < 32; i++) {
    const [ad, sr, pulse, pulseadd, low, high, filter, wl] = b8.subarray(p, p + 8);
    p += 8 + 16;
    instruments.push({ ad, sr, pulse, pulseadd, low, high, filter, wave: Array.from(b8.subarray(p, p + wl)) });
    p += wl;
  }
  const patterns: Gt1Song['patterns'] = [];
  const n = b8[p++];
  for (let i = 0; i < n; i++) {
    const len = b8[p++];
    const rows: Array<[number, number, number, number]> = [];
    for (let r = 0; r < len / 3; r++) {
      if (b8[p + r * 3] === 0xff) break;
      const cmd = b8[p + r * 3 + 1];
      rows.push([b8[p + r * 3], cmd >> 3, cmd & 7, b8[p + r * 3 + 2]]);
    }
    p += len;
    patterns.push(rows);
  }
  return { orderlists, instruments, patterns, filters: Array.from(b8.subarray(p, p + 256)) };
}

/** The source song reduced to what the 1.53 packer keeps (goattrk.c relocator / packpattern). */
function canonical(s: Gt1Song): Gt1Song {
  const orderlists = s.orderlists.filter((o) => o.every((ol) => ol.length >= 3));
  let highestPattern = 0;
  for (const o of orderlists) for (const ol of o) for (const v of ol) { if (v >= 0xd0) break; highestPattern = Math.max(highestPattern, v); }
  let highestInstr = 0, filters = 0;
  const patterns = s.patterns.slice(0, highestPattern + 1).map((rows) => {
    let carried = 0;
    return rows.map(([note, ins, cmd, data]): [number, number, number, number] => {
      const shown = ins && ins !== carried ? ins : 0;
      if (ins) carried = ins;
      highestInstr = Math.max(highestInstr, carried);
      if (cmd === 5) filters = Math.max(filters, data);
      let d = data;
      if (cmd === 7 && d < 0xef && (d & 0x7f) === 2) d += 1;   // tempo 2 and 3 are packed to the same byte
      if (cmd === 0 && d === 0x80) d = 0;                       // arpeggio bit 7 is the packer's marker
      return [note, shown, cmd, d];
    });
  });
  for (const i of s.instruments) filters = Math.max(filters, i.filter);
  for (let c = 0; c < 64; c++) filters = Math.max(filters, s.filters[c * 4 + 3]);
  const used = Math.max(highestInstr, 1);
  const instruments = s.instruments.map((i, k) => {
    if (k >= used) return { ad: 0, sr: 0, pulse: 0, pulseadd: 0, low: 0, high: 0, filter: 0, wave: [0, 0, 0xff, 0] };
    const end = i.wave.findIndex((v, j) => j % 2 === 0 && v === 0xff);
    return { ...i, pulseadd: i.pulseadd & 0xfe, low: i.low & 0xf0, high: i.high & 0xf0, wave: i.wave.slice(0, end + 2) };
  });
  const keep = (filters + 1) * 4;
  return { orderlists, instruments, patterns, filters: s.filters.map((v, j) => (j < keep ? v : 0)) };
}

/** What the file's open path hands the engine for `name`. */
async function openAs(name: string): Promise<Uint8Array> {
  const { openUserSong } = await import('@/lib/song/openUserSong');
  const errs: string[] = [];
  useFormatStore.getState().applyEditorMode({} as never);
  await openUserSong(fileOf(FIX + name), 'drop', undefined, (m) => errs.push(m));
  expect(errs).toEqual([]);
  expect(useFormatStore.getState().editorMode).toBe('goattracker');
  return useFormatStore.getState().goatTrackerData as Uint8Array;
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

describe('a GoatTracker 1 SID opens as its GoatTracker song', { timeout: 30000 }, () => {
  it('the open path names it by its player; another GoatTracker 1 revision and other players stay SIDs', async () => {
    const { classifySong } = await import('@/lib/song/openSong');
    expect(await classifySong(fileOf(FIX + 'gt1_Rupert_Coelophysics.sid'))).toBe('goatTracker');
    // SIDId says GoatTracker_V1.x, but its player is not the 1.53 image: no layout to read, the visualizer keeps it.
    expect(await classifySong(fileOf(FIX + 'gt1_other_revision_Ames.sid'))).toBe('module');
    expect(await classifySong(fileOf('public/data/songs/sid/abaddon-starfish-test.sid'))).toBe('module');
  });

  it('dropping the SID lands in the GoatTracker editor with the song the packer was given', async () => {
    const data = await openAs('gt1_nintendo_x2.sid');
    const got = parseGts1(data);
    const want = canonical(parseGts1(bytes(FIX + 'gt1_nintendo_source.sng')));
    expect(got.orderlists).toEqual(want.orderlists);
    expect(got.patterns).toEqual(want.patterns);
    expect(got.instruments).toEqual(want.instruments);
    expect(got.filters).toEqual(want.filters);
    // Names are not stored by the packer: empty, never invented. The song text is the PSID header's.
    const text = (o: number): string => String.fromCharCode(...data.subarray(o, o + 32)).replace(/\0+$/, '');
    expect(text(36)).toBe(String.fromCharCode(...bytes(FIX + 'gt1_nintendo_x2.sid').subarray(0x36, 0x36 + 32)).replace(/\0+$/, ''));
    let p = 100 + 1;
    for (const o of got.orderlists) for (const ol of o) p += 1 + ol.length;
    for (let i = 0; i < 31; i++) { expect(Array.from(data.subarray(p + 8, p + 24))).toEqual(new Array(16).fill(0)); p += 24 + data[p + 7]; }
  });

  it('the engine plays it at the packed speed with the packed hard restart; a 1x SID after it plays at 50', async () => {
    // 2x: 100 ticks per second, hard restart ADSR 0A05, one frame (trailer block 0x9c = 1)
    const x2 = await openAs('gt1_nintendo_x2.sid');
    expect(x2[x2.length - 2]).toBe(0x9c);
    expect(x2[x2.length - 1]).toBe(1);
    expect(enginePlays(x2)).toEqual({ multiplier: 2, framerate: 100, adparam: 0x0a05 });
    // Real HVSC tune (Rupert, 1x, hard restart 0F00): nothing carried over from the 2x song.
    const rupert = await openAs('gt1_Rupert_Coelophysics.sid');
    expect(String.fromCharCode(...rupert.subarray(0, 4))).toBe('GTS!');
    expect(parseGts1(rupert).patterns.length).toBe(13);
    expect(enginePlays(rupert)).toMatchObject({ multiplier: 1, framerate: 50 });
    const ne7 = await openAs('gt1_Ne7_Attitude_15_intro.sid');
    expect(parseGts1(ne7).patterns.length).toBe(7);
    expect(enginePlays(ne7)).toMatchObject({ multiplier: 1, framerate: 50, adparam: 0x0f00 });
  });
});
