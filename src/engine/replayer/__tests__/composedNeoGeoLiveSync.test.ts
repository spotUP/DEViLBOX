/**
 * NG-3 live edit sync, on the real composed fixture (no mocks). A cell edited while the song
 * plays must reach the sequencer as exactly the value a fresh derive of the edited song holds.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decompressProject } from '@/lib/projectCompression';
import type { TrackerSong } from '../../TrackerReplayer';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { TrackerCell, Pattern } from '@/types/tracker';
import { composedNeoGeoModuleSong, deriveComposedNeoGeo } from '../composedNeoGeo';
import { trackerArpStopAt } from '@/lib/export/FurnaceModuleExporter';
import {
  derivedCellSeqWrites, derivedPlayState, isStructuralNoop, neoGeoInstrumentIds, planStructuralEdit,
} from '../composedNeoGeoLiveSync';

interface Dbx { bpm: number; speed?: number; patterns: Pattern[]; patternOrder: number[]; instruments: InstrumentConfig[] }

function trialSong(): TrackerSong {
  const buf = readFileSync(resolve(__dirname, '../../../lib/export/__tests__/fixtures/neo_geo_composer_trial.dbx'));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const d = JSON.parse(decompressProject(ab)) as Dbx;
  return {
    name: 'trial', format: 'XM', patterns: structuredClone(d.patterns), instruments: d.instruments, songPositions: d.patternOrder,
    songLength: d.patternOrder.length, restartPosition: 0, numChannels: 8, initialSpeed: d.speed ?? 6, initialBPM: d.bpm,
  } as TrackerSong;
}

const CHANNELS = 14;
type Fx = [number, number];

/** Edits spread over the rows and channels of pattern 0; every effect column gets used somewhere. */
function editSong(song: TrackerSong, insId: number): { patIdx: number; edited: Array<[number, number]> } {
  const patIdx = song.songPositions[0];
  const pat = song.patterns[patIdx];
  const edited: Array<[number, number]> = [];
  const fxSets: Fx[][] = [
    [[0x01, 0x10]],
    [[0x01, 0x10], [0x02, 0x20]],
    [[0x01, 0x10], [0x02, 0x20], [0x03, 0x30]],
    [[0x0c, 0x20]],
    [[0x0c, 0x20]],
    [[0x01, 0x11], [0x02, 0x22], [0x03, 0x33], [0x04, 0x44], [0x0a, 0x05], [0x0f, 0x04], [0x09, 0x03], [0x01, 0x55]],
  ];
  const nCh = Math.min(CHANNELS, pat.channels.length);
  for (let ch = 0; ch < nCh; ch++) {
    const rows = pat.channels[ch].rows;
    fxSets.forEach((fx, k) => {
      const row = 1 + k * 3;
      if (row >= rows.length) return;
      const cell: TrackerCell = { ...rows[row] };
      cell.note = k === 4 ? 97 : 25 + ch + k;
      cell.instrument = k === 4 ? 0 : insId;
      cell.volume = k === 3 ? 0 : k === 4 ? 0x30 : 0x10 + k;
      cell.effTyp = 0; cell.eff = 0; cell.effTyp2 = 0; cell.eff2 = 0;
      fx.forEach(([t, v], i) => {
        const keys = [['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4'], ['effTyp5', 'eff5'], ['effTyp6', 'eff6'], ['effTyp7', 'eff7'], ['effTyp8', 'eff8']][i];
        (cell as unknown as Record<string, number>)[keys[0]] = t;
        (cell as unknown as Record<string, number>)[keys[1]] = v;
      });
      rows[row] = cell;
      edited.push([ch, row]);
    });
  }
  return { patIdx, edited };
}

describe('NG-3 (a): live cell edit equals a fresh derive', () => {
  it('hands the sequencer the same cell for every edited cell and effect column', async () => {
    const song = trialSong();
    const insId = song.instruments[0].id;
    const { patIdx, edited } = editSong(song, insId);
    expect(edited.length).toBeGreaterThan(20);
    const fresh = await deriveComposedNeoGeo(song);
    const sub = fresh.native.subsongs[0];
    const pat = song.patterns[patIdx];
    let compared = 0;
    let maxCols = 0;
    for (let ch = 0; ch < Math.min(CHANNELS, pat.channels.length); ch++) {
      const chan = pat.channels[ch];
      for (let row = 0; row < chan.rows.length; row++) {
        const sync = derivedCellSeqWrites(chan.rows[row], chan.channelMeta, fresh.instrumentIds, ch, patIdx, row,
          trackerArpStopAt(song.patterns, song.songPositions, patIdx, ch, row));
        expect(sync.problems).toEqual([]);
        const nRow = sub.channels[ch].patterns.get(patIdx)?.rows[row];
        const want = new Map<number, number>();
        want.set(0, !nRow || nRow.note < 0 ? -1 : nRow.note >= 253 ? nRow.note : nRow.note + 60);
        want.set(1, nRow?.ins ?? -1);
        want.set(2, nRow?.vol ?? -1);
        for (let k = 0; k < 8; k++) {
          want.set(3 + 2 * k, nRow?.effects[k]?.cmd ?? -1);
          want.set(4 + 2 * k, nRow?.effects[k]?.val ?? -1);
        }
        expect(sync.writes).toHaveLength(19);
        for (const w of sync.writes) {
          expect([ch, patIdx, row, w.col, w.val], `ch ${ch} row ${row} col ${w.col}`).toEqual([w.ch, w.pat, w.row, w.col, want.get(w.col)]);
        }
        expect(sync.effectCols).toBeLessThanOrEqual(sub.channels[ch].effectCols);
        maxCols = Math.max(maxCols, sync.effectCols);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(100);
    expect(maxCols).toBe(8);
  });

  it('puts Cxx in the volume column only when it is empty, and writes note off as 253', async () => {
    const song = trialSong();
    const ids = (await deriveComposedNeoGeo(song)).instrumentIds;
    const meta = song.patterns[0].channels[0].channelMeta;
    const base = { ...song.patterns[0].channels[0].rows[0], note: 0, instrument: 0, volume: 0, effTyp: 0x0c, eff: 0x20, effTyp2: 0, eff2: 0 } as TrackerCell;
    const col = (c: TrackerCell, n: number) => derivedCellSeqWrites(c, meta, ids, 0, 0, 0).writes.find((w) => w.col === n)?.val;
    expect(col(base, 2)).toBeGreaterThanOrEqual(0);
    expect(col(base, 3)).toBe(-1);
    expect(col({ ...base, volume: 0x30 }, 2)).toBe(col({ ...base, volume: 0x30, effTyp: 0, eff: 0 }, 2));
    expect(col({ ...base, note: 97, effTyp: 0, eff: 0 }, 0)).toBe(253);
  });
});

describe('NG-3 (b)(c)(d): structural routing', () => {
  const stateOf = (song: TrackerSong) => derivedPlayState(composedNeoGeoModuleSong(song), neoGeoInstrumentIds(song.instruments));

  it('derived instrument ids equal the ones deriveFurnaceNative returns', async () => {
    const song = trialSong();
    expect(neoGeoInstrumentIds(song.instruments)).toEqual((await deriveComposedNeoGeo(song)).instrumentIds);
  });

  it('(b) same-length order change rewrites the changed positions only', () => {
    const song = trialSong();
    const before = stateOf(song);
    const order = [...song.songPositions];
    order[0] = order[0] === 0 ? 1 : 0;
    const plan = planStructuralEdit(before, stateOf({ ...song, songPositions: order }));
    expect(plan.rederive).toBeNull();
    expect(plan.orderWrites).toEqual([{ pos: 0, pat: order[0] }]);
  });

  it('(b) order length change re-derives', () => {
    const song = trialSong();
    const plan = planStructuralEdit(stateOf(song), stateOf({ ...song, songPositions: [...song.songPositions, song.songPositions[0]] }));
    expect(plan.rederive).toMatch(/order/);
  });

  it('(c) pattern length change re-derives; an added unplaced pattern needs nothing', () => {
    const song = trialSong();
    const p0 = song.patterns[0];
    const longer = { ...p0, length: p0.length + 16, channels: p0.channels.map((c) => ({ ...c, rows: [...c.rows, ...c.rows.slice(0, 16)] })) };
    const resized = [longer, ...song.patterns.slice(1)];
    expect(planStructuralEdit(stateOf(song), stateOf({ ...song, patterns: resized })).rederive).toMatch(/length/);
    const added = [...song.patterns, structuredClone(p0)];
    expect(isStructuralNoop(planStructuralEdit(stateOf(song), stateOf({ ...song, patterns: added })))).toBe(true);
  });

  it('(d) a changed instrument config is a parameter change, an unchanged one is a no-op', () => {
    const song = trialSong();
    const before = stateOf(song);
    expect(isStructuralNoop(planStructuralEdit(before, stateOf(song)))).toBe(true);
    const ins = song.instruments.map((i, k) => (k === 0 ? { ...i, furnace: { ...i.furnace! } } : i));
    const plan = planStructuralEdit(before, stateOf({ ...song, instruments: ins }));
    expect(plan.rederive).toBeNull();
    expect(plan.changedInstrumentIds).toEqual([song.instruments[0].id]);
  });

  it('a changed instrument set re-derives', () => {
    const song = trialSong();
    const plan = planStructuralEdit(stateOf(song), stateOf({ ...song, instruments: song.instruments.slice(1) }));
    expect(plan.rederive).toMatch(/instrument set/);
  });
});
