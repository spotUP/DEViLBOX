/**
 * A SID compiled by GoatTracker 2 opens as the GoatTracker song it was built
 * from (S1, owner 2026-10-08: known players only). The answer key is the same
 * song twice: the editor file in the jukebox ($3jammar-akhbar.sng) and the HVSC
 * release (MUSICIANS/S/Shogoon/Jammar_akhbar.sid, copied to fixtures/).
 *
 * The packer keeps what plays and drops the rest, so the decoded song is
 * compared as it plays: every pattern's notes and commands, the orderlists, and
 * every instrument and table-pointer command by the table program it runs. What
 * the compiled file does not hold is named here, not hidden: instrument numbers
 * (renumbered by hard-restart type), table row numbers (compacted), names (empty),
 * and instrument numbers repeated on consecutive notes.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

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
import { parseGoatTrackerSng, type GTSongData, GT_WTBL, GT_PTBL, GT_FTBL, GT_STBL } from '@/lib/import/formats/GoatTrackerSid';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SID = 'src/lib/song/__tests__/fixtures/Jammar_akhbar.sid';
const SNG = 'public/data/songs/goat-tracker-ultra/$3jammar-akhbar.sng';
const bytes = (p: string): Uint8Array => new Uint8Array(readFileSync(resolve(ROOT, p)));
const fileOf = (p: string): File => new File([bytes(p) as unknown as BlobPart], basename(p));

/** A table program as it runs from `ptr`: its rows in order, jumps as an index into that order. */
function program(song: GTSongData, t: number, ptr: number, depth = 0): unknown[] {
  const { left, right } = song.tables[t];
  const seen = new Map<number, number>();
  const out: unknown[] = [];
  let p = ptr;
  while (p > 0 && p <= left.length && !seen.has(p)) {
    seen.set(p, out.length);
    const l = left[p - 1], r = right[p - 1];
    if (l === 0xff) {                                   // jump (0 = stop)
      out.push(r ? ['jump', seen.get(r) ?? program(song, t, r, depth + 1)] : ['stop']);
      if (r && seen.has(r)) break;
      p = r;
      continue;
    }
    // Filter "set parameters" rows: the player reads only the passband bits (gplay.c: & 0x70).
    const fl = t === GT_FTBL && l > 0x80 ? l & 0xf0 : l;
    out.push(t === GT_WTBL && depth < 2 ? waveRow(song, l, r, depth) : [fl, r]);
    p++;
  }
  return out;
}

/** A wavetable command that points into another table, compared by what it points at. */
function waveRow(song: GTSongData, l: number, r: number, depth: number): unknown {
  if (l < 0xf0) return [l, r];
  const cmd = l - 0xf0;
  if (cmd >= 1 && cmd <= 4) return [l, speedEntry(song, r)];
  if (cmd === 9) return [l, program(song, GT_PTBL, r, depth + 1)];
  if (cmd === 10) return [l, program(song, GT_FTBL, r, depth + 1)];
  return [l, r];
}

function speedEntry(song: GTSongData, i: number): [number, number] {
  return i ? [song.tables[GT_STBL].left[i - 1], song.tables[GT_STBL].right[i - 1]] : [0, 0];
}

/** A pattern command with its table pointer replaced by what it points at. */
function command(song: GTSongData, cmd: number, data: number): unknown {
  if ((cmd >= 1 && cmd <= 4) || cmd === 0x0e) return [cmd, speedEntry(song, data)];
  if (cmd === 8) return [cmd, program(song, GT_WTBL, data)];
  if (cmd === 9) return [cmd, program(song, GT_PTBL, data)];
  if (cmd === 10) return [cmd, program(song, GT_FTBL, data)];
  return [cmd, data];
}

function instrument(song: GTSongData, n: number): unknown {
  const i = song.instruments[n];
  return {
    ad: i.ad, sr: i.sr, gatetimer: i.gatetimer, firstwave: i.firstwave, vibdelay: i.vibdelay,
    wave: program(song, GT_WTBL, i.ptr[GT_WTBL]),
    pulse: program(song, GT_PTBL, i.ptr[GT_PTBL]),
    filter: program(song, GT_FTBL, i.ptr[GT_FTBL]),
    vibrato: i.vibdelay ? speedEntry(song, i.ptr[GT_STBL]) : null,
  };
}

describe('a GoatTracker 2 SID opens as its GoatTracker song', { timeout: 30000 }, () => {
  it('the open path names it by its player; a SID of another player stays a SID', async () => {
    const { classifySong } = await import('@/lib/song/openSong');
    expect(await classifySong(fileOf(SID))).toBe('goatTracker');
    // CheeseCutter 2.x by SIDId: not a known GoatTracker build, the visualizer keeps it.
    expect(await classifySong(fileOf('public/data/songs/sid/abaddon-starfish-test.sid'))).toBe('module');
  });

  it('dropping the HVSC .sid lands in the GoatTracker editor with the .sng\'s song', async () => {
    const { openUserSong } = await import('@/lib/song/openUserSong');
    const errs: string[] = [];
    useFormatStore.getState().applyEditorMode({} as never);
    await openUserSong(fileOf(SID), 'drop', undefined, (m) => errs.push(m));
    expect(errs).toEqual([]);
    expect(useFormatStore.getState().editorMode).toBe('goattracker');

    // The engine got a GoatTracker song decoded from the SID, not the SID.
    const data = useFormatStore.getState().goatTrackerData;
    expect(data && String.fromCharCode(...data.subarray(0, 4))).toBe('GTS5');
    const got = parseGoatTrackerSng(data as Uint8Array) as GTSongData;
    const want = parseGoatTrackerSng(bytes(SNG)) as GTSongData;

    // Patterns: each decoded pattern is one of the .sng's, note for note and
    // command for command (table pointers compared by what they point at).
    const rowsKey = (s: GTSongData, rows: number[][]): string =>
      JSON.stringify(rows.map((r) => [r[0], command(s, r[2], r[3])]));
    const wantKeys = want.patterns.map((p) => rowsKey(want, p));
    const map = got.patterns.map((p) => wantKeys.indexOf(rowsKey(got, p)));
    expect(map.filter((m) => m < 0)).toEqual([]);
    // The HVSC build is one revision on: pattern 18 also exists as a copy,
    // pattern 26, used once on voice 3 - so it carries 79 patterns to the .sng's 78.
    expect(got.patterns.length).toBe(79);
    expect(new Set(map).size).toBe(78);

    // Orderlists: the same, pattern for pattern, both subtunes, all three voices.
    const orders = got.orderlists.map((s) => s.map((ol) => ol.map((v, i) => (i < ol.length - 2 && v < 0xd0 ? map[v] : v))));
    expect(orders).toEqual(want.orderlists);

    // Instruments: every note plays the same instrument (ad, sr, gate timer and
    // hard-restart type, first wave, vibrato, and the wave / pulse / filter
    // programs it starts), under the packer's numbering.
    const pairs = new Map<number, number>();
    got.patterns.forEach((rows, k) => {
      const wrows = want.patterns[map[k]];
      let gi = 0, wi = 0;
      rows.forEach((r, i) => {
        if (r[1]) gi = r[1];
        if (wrows[i][1]) wi = wrows[i][1];
        if (r[0] >= 0x60 && r[0] <= 0xbc && gi && wi) {
          expect(pairs.get(wi) ?? gi).toBe(gi);
          pairs.set(wi, gi);
        }
      });
    });
    expect(pairs.size).toBe(got.instruments.length - 1);
    for (const [w, g] of pairs) expect(instrument(got, g)).toEqual(instrument(want, w));

    // What the SID does not hold: names.
    expect(got.instruments.slice(1).every((i) => i.name === '')).toBe(true);
    expect(got.name).toBe('Jammar akhbar');
  });
});
