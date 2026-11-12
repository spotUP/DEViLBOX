/**
 * Sawteeth test song (all implemented effects, all instrument types): the checked-in file is what the generator builds,
 * and parse -> export -> parse keeps every cell and every instrument field.
 * Unverified by ear: nothing here plays audio.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSawteethFile } from '../../import/formats/SawteethParser';
import { exportSawteeth } from '../SawteethExporter';
import { ST_FX_BASE } from '../../import/formats/commandStreamEffectGlyphs';
import { buildSawteethEffectTestSong, SAWTEETH_IMPLEMENTED_EFFECTS } from '../../import/formats/SawteethTestSong';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const DIR = 'public/data/songs/sawteeth/';
const original = new Uint8Array(readFileSync(`${DIR}okolaNUKE.st`));
const testFile = new Uint8Array(readFileSync(`${DIR}TEST-all-effects-okolaNUKE.st`));

async function roundTrip(song: TrackerSong): Promise<TrackerSong> {
  const { data } = await exportSawteeth(song);
  const out = parseSawteethFile(new Uint8Array(await data.arrayBuffer()), 'rt.st');
  if (!out) throw new Error('exported file did not parse');
  return out;
}

function expectSameSong(a: TrackerSong, b: TrackerSong): void {
  expect(b.numChannels).toBe(a.numChannels);
  expect(b.patterns.length).toBe(a.patterns.length);
  expect(b.initialSpeed).toBe(a.initialSpeed);
  expect(b.initialBPM).toBeCloseTo(a.initialBPM, 6);
  let cells = 0;
  a.patterns.forEach((p, pi) => {
    expect(b.patterns[pi].length).toBe(p.length);
    p.channels.forEach((c, ci) => {
      c.rows.forEach((cell, ri) => {
        const o = b.patterns[pi].channels[ci].rows[ri];
        const got = [o.note, o.instrument, o.effTyp, o.eff];
        const want = [cell.note, cell.instrument, cell.effTyp, cell.eff];
        if (got.join() !== want.join()) expect({ pi, ci, ri, got }).toEqual({ pi, ci, ri, got: want });
        cells++;
      });
    });
  });
  expect(cells).toBeGreaterThan(0);
  const ia = a.instruments[0].sawteeth!;
  const ib = b.instruments[0].sawteeth!;
  expect(ib.instruments).toEqual(ia.instruments);
  expect(ib.instrumentNames).toEqual(ia.instrumentNames);
  expect(ib.author).toBe(ia.author);
  expect(ib.title).toBe(ia.title);
  expect(b.instruments.map((i) => i.name)).toEqual(a.instruments.map((i) => i.name));
}

describe('Sawteeth test song', () => {
  const song = parseSawteethFile(testFile, 'TEST-all-effects-okolaNUKE.st');
  if (!song) throw new Error('test song did not parse');

  it('the checked-in file equals what the generator builds from the untouched original', async () => {
    const { data } = await exportSawteeth(buildSawteethEffectTestSong(original));
    expect(new Uint8Array(await data.arrayBuffer())).toEqual(testFile);
  });

  it('every effect nibble the replayer implements occurs', () => {
    const cells = song.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows));
    const used = new Set(cells.filter((c) => c.effTyp >= ST_FX_BASE && c.effTyp <= ST_FX_BASE + 15).map((c) => c.effTyp - ST_FX_BASE));
    for (const e of SAWTEETH_IMPLEMENTED_EFFECTS) expect(used.has(e.nibble), `effect ${e.nibble.toString(16)} ${e.meaning}`).toBe(true);
  });

  it('every waveform 0..7, filter mode 0..6 and clip mode 0..2 occurs in an instrument that a note plays', () => {
    const cfg = song.instruments[0].sawteeth!.instruments;
    const played = new Set(song.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows)).filter((c) => c.note > 0).map((c) => c.instrument));
    const playedCfg = cfg.filter((_, i) => played.has(i + 1));
    const waves = new Set(playedCfg.flatMap((i) => i.steps.map((s) => s.wForm)));
    expect([...waves].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect([...new Set(playedCfg.map((i) => i.filterMode))].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect([...new Set(playedCfg.map((i) => i.clipMode))].sort()).toEqual([0, 1, 2]);
  });

  it('round trip: every cell (note, instrument, effect, parameter) and every instrument field equal', async () => {
    expectSameSong(song, await roundTrip(song));
  });

  it('round trip of the untouched original also keeps cells and instruments', async () => {
    const o = parseSawteethFile(original, 'okolaNUKE.st')!;
    expectSameSong(o, await roundTrip(o));
  });
});
