/**
 * Maniacs of Noise (.mon): the grid is read from the module's sequences and patterns (maniacsOfNoiseGrid.ts).
 * Real songs: gyroscope.mon, unreal flying.mon.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseManiacsOfNoiseFile } from '../ManiacsOfNoiseParser';
import { exportManiacsOfNoise } from '@/lib/export/ManiacsOfNoiseExporter';
import { encodeVariableBlock } from '@/engine/uade/UADEPatternEncoder';
import { buildManiacsOfNoiseGrid, detectManiacsOfNoise, MANIACS_OF_NOISE_ROWS_PER_PATTERN } from '../maniacsOfNoiseGrid';
import { periodToNote } from '@/lib/amiga/periodNotes';

const ROOT = resolve(__dirname, '../../../../../public/data/songs');
const FIXTURES = [
  { name: 'gyroscope.mon', path: `${ROOT}/formats/gyroscope.mon` },
  { name: 'unreal flying.mon', path: `${ROOT}/maniacs-of-noise/unreal flying.mon` },
];

function load(path: string, name: string) {
  const b = readFileSync(path);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return { raw: new Uint8Array(ab), song: parseManiacsOfNoiseFile(ab, name) };
}

describe.each(FIXTURES)('Maniacs of Noise grid: $name', ({ name, path }) => {
  it('detects the module and rejects junk', () => {
    const { raw } = load(path, name);
    expect(detectManiacsOfNoise(raw)).not.toBeNull();
    expect(detectManiacsOfNoise(new Uint8Array(4096))).toBeNull();
  });

  it('shows real notes on the tick grid', () => {
    const { raw } = load(path, name);
    const grid = buildManiacsOfNoiseGrid(raw, name)!;
    expect(grid.placements.length).toBeGreaterThan(20);
    expect(grid.patterns.length).toBe(Math.ceil(grid.ticks / MANIACS_OF_NOISE_ROWS_PER_PATTERN));
    for (const pl of grid.placements) {
      expect(pl.note).toBeGreaterThanOrEqual(1);
      expect(pl.note).toBeLessThanOrEqual(96);
    }
    const notes = grid.patterns.reduce((n, p) => n + p.channels.reduce((m, c) => m + c.rows.filter(r => r.note > 0).length, 0), 0);
    expect(notes).toBe(grid.placements.length);
  });

  it('re-encodes every block byte-exact and exports the module unchanged', async () => {
    const { raw, song } = load(path, name);
    const l = song.uadeVariableLayout!;
    expect(l.formatId).toBe('maniacsOfNoise');
    expect(song.uadePlayerTickGrid).toBe(true);
    l.filePatternAddrs.forEach((addr, fp) => {
      const re = encodeVariableBlock(l, fp, l.blockRows![fp], fp);
      expect(Array.from(re)).toEqual(Array.from(raw.subarray(addr, addr + l.filePatternSizes[fp])));
    });
    const out = await exportManiacsOfNoise(song);
    expect(out.warnings).toEqual([]);
    expect(Array.from(out.data)).toEqual(Array.from(raw));
  });

  it('one changed note changes only its stored byte, and the new byte reads as that pitch', async () => {
    const { raw, song } = load(path, name);
    const grid = buildManiacsOfNoiseGrid(raw, name)!;
    const nb = song.uadeVariableLayout!.noteBytes!;
    let hit = 0;
    // A repeated pattern plays one stored byte from many cells; the editor moves them together (propagateSharedCells).
    const groups = new Map<number, typeof nb>();
    for (const n of nb) groups.set(n.offset, [...(groups.get(n.offset) ?? []), n]);
    for (const [offset, cells] of groups) {
      if (cells.some(c => c.note !== cells[0].note)) continue;
      const want = cells[0].note + 1;
      const refs = cells.map(c => song.patterns[c.pattern].channels[c.channel].rows[c.row]);
      refs.forEach(r => { r.note = want; });
      const out = await exportManiacsOfNoise(song);
      refs.forEach(r => { r.note = cells[0].note; });
      if (out.warnings.length) continue;
      const diff: number[] = [];
      out.data.forEach((b, i) => { if (b !== raw[i]) diff.push(i); });
      expect(diff).toEqual([offset]);
      // Independent pitch check from the period table: byte + transpose, scaled by the tuning.
      const pl = grid.placements.find(p => p.offset === offset)!;
      const m = grid.module;
      const at = m.base + m.layout.periodTable + ((out.data[offset] + pl.transpose) & 0xff) * 2;
      expect(periodToNote((((raw[at] << 8) | raw[at + 1]) * pl.tuning) >> 10)).toBe(want);
      hit++;
      break;
    }
    expect(hit).toBe(1);
  });

  it('an edit on a cell with no note is refused with a warning', async () => {
    const { raw, song } = load(path, name);
    const nb = song.uadeVariableLayout!.noteBytes!;
    const used = new Set(nb.map(x => `${x.pattern}:${x.channel}:${x.row}`));
    let row = 0;
    while (used.has(`0:0:${row}`)) row++;
    song.patterns[0].channels[0].rows[row].note = 30;
    const out = await exportManiacsOfNoise(song);
    expect(out.warnings.length).toBe(1);
    expect(Array.from(out.data)).toEqual(Array.from(raw));
  });
});
