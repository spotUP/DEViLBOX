/**
 * Derive native Furnace data from a REAL user-made Neo Geo song (the composer trial,
 * fixtures/neo_geo_composer_trial.dbx) and compare every cell with the store cell.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decompressProject } from '@/lib/projectCompression';
import { deriveFurnaceNativeFromSong, type DerivedFurnaceNative } from '../deriveFurnaceNative';
import type { FurnaceModuleSong } from '../FurnaceModuleExporter';
import { FUR_SYSTEM_YM2610, FUR_NEO_GEO_CHANNELS } from '../FurnaceModuleExporter';
import { furnaceRowToTrackerCell } from '@/lib/import/furnaceEditorCells';
import { isIns2 } from '@/engine/furnace-dispatch/ins2Uploads';
import { EMPTY_CELL } from '@/types/tracker';
import type { FurnaceRow, TrackerCell } from '@/types/tracker';

interface Dbx {
  bpm: number;
  speed?: number;
  patterns: FurnaceModuleSong['patterns'];
  patternOrder: number[];
  instruments: FurnaceModuleSong['instruments'];
}

function loadDbx(): Dbx {
  const buf = readFileSync(resolve(__dirname, 'fixtures/neo_geo_composer_trial.dbx'));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  return JSON.parse(decompressProject(ab)) as Dbx;
}

function toSong(d: Dbx): FurnaceModuleSong {
  return {
    name: 'trial',
    patterns: d.patterns,
    instruments: d.instruments,
    songPositions: d.patternOrder,
    initialSpeed: d.speed ?? 6,
    initialBPM: d.bpm,
  };
}

const EMPTY_ROW: FurnaceRow = { note: -1, ins: -1, vol: -1, effects: [] };
const KEYS = ['effTyp', 'eff', 'effTyp2', 'eff2', 'effTyp3', 'eff3', 'effTyp4', 'eff4', 'effTyp5', 'eff5', 'effTyp6', 'eff6', 'effTyp7', 'eff7', 'effTyp8', 'eff8'];

/** What the store cell must read back as: tracker Cxx (set volume) moves to the volume column. */
function expectedCell(c: TrackerCell | undefined): Record<string, number> {
  const s = (c ?? EMPTY_CELL) as unknown as Record<string, number | undefined>;
  const out: Record<string, number> = { note: s.note ?? 0, instrument: s.instrument ?? 0, volume: s.volume ?? 0 };
  for (const k of KEYS) out[k] = s[k] ?? 0;
  for (const [t, p] of [['effTyp', 'eff'], ['effTyp2', 'eff2']] as const) {
    if (s[t] === 0x0c) {
      if (!out.volume) out.volume = 0x10 + Math.min(64, s[p] ?? 0);
      out[t] = 0;
      out[p] = 0;
    }
  }
  return out;
}

function actualCell(d: DerivedFurnaceNative, p: number, ch: number, r: number): Record<string, number> {
  const rows = d.native.subsongs[0].channels[ch].patterns.get(p)?.rows;
  const cell = furnaceRowToTrackerCell(rows?.[r] ?? EMPTY_ROW) as unknown as Record<string, number | undefined>;
  const out: Record<string, number> = { note: cell.note ?? 0, instrument: cell.instrument ?? 0, volume: cell.volume ?? 0 };
  for (const k of KEYS) out[k] = cell[k] ?? 0;
  // native index to store id
  if (out.instrument > 0) out.instrument = d.instrumentIds[out.instrument - 1];
  return out;
}

describe('deriveFurnaceNativeFromSong on the composer trial song', () => {
  it('arp stops on the next row without an arp command in Neo Geo export', async () => {
    const dbx = loadDbx();
    const d = await deriveFurnaceNativeFromSong(toSong(dbx));
    const sub = d.native.subsongs[0];
    // Positions 0-1 play pattern 5, whose channel index 4 carries tracker arps (037 / 047); position 2
    // plays pattern 0, whose channel 4 notes carry none.
    expect(dbx.patternOrder.slice(0, 3)).toEqual([5, 5, 0]);
    const ch = 4;
    expect(dbx.patterns[5].channels[ch].rows.some((c) => c.effTyp === 0 && c.eff !== 0)).toBe(true);
    // Furnace 00xy sticks until 0000: play the native rows of that channel along the order list up to the
    // first note row of position 2; the arp must be off there.
    const rowsOf = (p: number) => sub.channels[ch].patterns.get(p)?.rows ?? [];
    let arp = 0;
    let sawArp = false;
    for (const p of [5, 5]) {
      for (const row of rowsOf(p)) for (const e of row.effects) if (e.cmd === 0) { arp = e.val; sawArp ||= e.val !== 0; }
    }
    expect(sawArp).toBe(true);
    const rows = rowsOf(0);
    const firstNote = rows.findIndex((r) => r.note >= 0);
    expect(firstNote).toBeGreaterThanOrEqual(0);
    for (let r = 0; r <= firstNote; r++) for (const e of rows[r].effects) if (e.cmd === 0) arp = e.val;
    expect(arp).toBe(0);
  });

  it('every pattern, row and channel round-trips to the store cell', async () => {
    const dbx = loadDbx();
    const d = await deriveFurnaceNativeFromSong(toSong(dbx));
    const bad: string[] = [];
    let used = 0;
    dbx.patterns.forEach((pat, p) => {
      for (let ch = 0; ch < FUR_NEO_GEO_CHANNELS; ch++) {
        for (let r = 0; r < pat.length; r++) {
          const want = expectedCell(pat.channels[ch]?.rows[r]);
          const got = actualCell(d, p, ch, r);
          if (want.note || want.instrument || want.volume) used++;
          if (JSON.stringify(want) !== JSON.stringify(got)) bad.push(`p${p} ch${ch} r${r} want ${JSON.stringify(want)} got ${JSON.stringify(got)}`);
        }
      }
    });
    expect(used).toBeGreaterThan(100);
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('returns the sample of an ADPCM instrument for the sequencer, and none for a song without one', async () => {
    const dbx = loadDbx();
    expect((await deriveFurnaceNativeFromSong(toSong(dbx))).samples).toEqual([]);

    const kick = new Int16Array([0, 900, -900, 32767, -32768]);
    const base = dbx.instruments[0];
    const withKick = {
      ...base,
      id: 99,
      name: 'Kick',
      furnace: { ...base.furnace, divInsType: 37, macros: [], userSample: { name: 'kick', data: kick, rate: 18500 } },
    } as unknown as Dbx['instruments'][number];
    const d = await deriveFurnaceNativeFromSong(toSong({ ...dbx, instruments: [...dbx.instruments, withKick] }));
    expect(d.samples).toHaveLength(1);
    expect(Array.from(d.samples[0].data as Int16Array)).toEqual(Array.from(kick));
    expect(d.samples[0].rate).toBe(18500);
    expect(d.samples[0].samples).toBe(kick.length);
  });

  it('carries order list, pattern length, timing, channel count, chip and instruments', async () => {
    const dbx = loadDbx();
    const d = await deriveFurnaceNativeFromSong(toSong(dbx));
    const sub = d.native.subsongs[0];
    // chipIds hold the dispatch platform value (FILE_ID_TO_ENUM), not the file id 0xa5
    expect(FUR_SYSTEM_YM2610).toBe(0xa5);
    expect(d.native.chipIds).toEqual([57]); // YM2610_FULL
    expect(sub.channels).toHaveLength(14);
    expect(sub.patLen).toBe(dbx.patterns[0].length);
    expect(sub.ordersLen).toBe(dbx.patternOrder.length);
    for (let ch = 0; ch < 14; ch++) expect(sub.orders[ch]).toEqual(dbx.patternOrder);
    expect(sub.speed1).toBe(dbx.speed ?? 6);
    // parser: a one-entry speed pattern sets speed2 = speed1 (FurnaceSongParser.ts:2206)
    expect(sub.speed2).toBe(sub.speed1);
    expect(sub.hz).toBe(60);
    expect(sub.virtualTempoN).toBe(Math.round(dbx.bpm));
    expect(sub.virtualTempoD).toBe(150);
    expect(d.instrumentIds).toEqual(dbx.instruments.map((i) => i.id));
    expect(d.ins2).toHaveLength(dbx.instruments.length);
    d.ins2.forEach((u, i) => {
      expect(u.slot).toBe(i);
      expect(isIns2(u.data)).toBe(true);
    });
  });

  it('keeps Cxx as a Furnace command on a furnace-notation channel', async () => {
    const dbx = loadDbx();
    const song = toSong(dbx);
    const p = dbx.patterns.findIndex((pat) => pat.channels.some((c) => c.rows.some((x) => x.effTyp === 0x0c)));
    const ch = dbx.patterns[p].channels.findIndex((c) => c.rows.some((x) => x.effTyp === 0x0c));
    const clone = structuredClone(dbx.patterns[p]);
    clone.channels[ch].channelMeta = { ...(clone.channels[ch].channelMeta ?? {}), effectNotation: 'furnace' } as typeof clone.channels[0]['channelMeta'];
    song.patterns = dbx.patterns.map((x, i) => (i === p ? clone : x));
    const d = await deriveFurnaceNativeFromSong(song);
    const r = clone.channels[ch].rows.findIndex((x) => x.effTyp === 0x0c);
    const row = d.native.subsongs[0].channels[ch].patterns.get(p)!.rows[r];
    expect(row.effects[0]).toEqual({ cmd: 0x0c, val: clone.channels[ch].rows[r].eff });
  });
});
