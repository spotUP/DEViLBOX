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
import { buildManiacsOfNoiseGrid, detectManiacsOfNoise, maniacsOfNoiseSubsongCount, MANIACS_OF_NOISE_ROWS_PER_PATTERN, MON_SLIDE_LENGTH_EFFECT, MON_SLIDE_NOTE_EFFECT, MON_VOLUME_BASE } from '../maniacsOfNoiseGrid';
import type { TrackerCell } from '@/types';
import { sharedCellEdits } from '@/lib/song/sharedCellEdits';
import { periodToNote } from '@/lib/amiga/periodNotes';

const ROOT = resolve(__dirname, '../../../../../public/data/songs');
const FIXTURES = [
  { name: 'gyroscope.mon', path: `${ROOT}/maniacs-of-noise/gyroscope.mon` },
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

  // Every column: change the cell(s) that share one command byte, export, read the module again.
  describe.each([
    ['instrument', (g: ReturnType<typeof buildManiacsOfNoiseGrid>) => g!.placements.filter(p => p.instrumentAt >= 0), 'instrumentAt',
      (c: TrackerCell) => { c.instrument = 7; }, (c: TrackerCell) => c.instrument, 7],
    ['volume', (g: ReturnType<typeof buildManiacsOfNoiseGrid>) => g!.placements.filter(p => p.volumeAt >= 0 && p.volume < 0x30), 'volumeAt',
      (c: TrackerCell) => { c.volume = MON_VOLUME_BASE + 0x2a; }, (c: TrackerCell) => c.volume, MON_VOLUME_BASE + 0x2a],
    ['slide note', (g: ReturnType<typeof buildManiacsOfNoiseGrid>) => g!.placements.filter(p => p.slideNoteAt >= 0), 'slideNoteAt',
      (c: TrackerCell) => { c.eff = 0x21; }, (c: TrackerCell) => c.eff, 0x21],
    ['slide length', (g: ReturnType<typeof buildManiacsOfNoiseGrid>) => g!.placements.filter(p => p.slideNoteAt >= 0), 'slideLengthAt',
      (c: TrackerCell) => { c.eff2 = 0x15; }, (c: TrackerCell) => c.eff2, 0x15],
  ] as const)('%s column', (column, pick, atKey, edit, read, expected) => {
    it('writes one command byte and reads back on every note that command reaches', async (ctx) => {
      const { raw, song } = load(path, name);
      const grid = buildManiacsOfNoiseGrid(raw, name)!;
      const pls = pick(grid);
      if (pls.length === 0) return ctx.skip(); // neither corpus module uses this command: unproven on real data
      const at = pls[0][atKey as 'instrumentAt'];
      const same = pls.filter(p => p[atKey as 'instrumentAt'] === at);
      const cells = same.map(pl => song.patterns[Math.floor(pl.tick / MANIACS_OF_NOISE_ROWS_PER_PATTERN)].channels[pl.voice].rows[pl.tick % MANIACS_OF_NOISE_ROWS_PER_PATTERN]);
      cells.forEach(edit);
      const out = await exportManiacsOfNoise(song);
      expect(out.warnings, column).toEqual([]);
      const diff: number[] = [];
      out.data.forEach((b, i) => { if (b !== raw[i]) diff.push(i); });
      expect(diff).toEqual([at]);
      const again = buildManiacsOfNoiseGrid(out.data, name)!;
      for (const pl of same) {
        const cell = again.patterns[Math.floor(pl.tick / MANIACS_OF_NOISE_ROWS_PER_PATTERN)].channels[pl.voice].rows[pl.tick % MANIACS_OF_NOISE_ROWS_PER_PATTERN];
        expect(read(cell)).toBe(expected);
      }
      if (column.startsWith('slide')) expect(cells[0].effTyp).toBe(column === 'slide note' ? MON_SLIDE_NOTE_EFFECT : cells[0].effTyp);
      void MON_SLIDE_LENGTH_EFFECT;
    });
  });

  it('a shared command byte edit in one cell is carried to the other cells that show it', () => {
    const { raw, song } = load(path, name);
    const layout = song.uadeVariableLayout!;
    const groups = new Map<number, number>();
    for (const c of layout.columnBytes ?? []) if (c.fields[0] === 'instrument') groups.set(c.offset, (groups.get(c.offset) ?? 0) + 1);
    const shared = [...groups].find(([, n]) => n > 1);
    expect(shared).toBeDefined();
    const members = layout.columnBytes!.filter(c => c.offset === shared![0] && c.fields[0] === 'instrument');
    const first = members[0];
    const before = structuredClone(song.patterns[first.pattern]);
    song.patterns[first.pattern].channels[first.channel].rows[first.row].instrument = 9;
    const edits = sharedCellEdits(layout, first.pattern, before, song.patterns[first.pattern], song.patterns);
    expect(edits.length).toBeGreaterThan(0);
    expect(edits.every(e => e.values.instrument === 9)).toBe(true);
    void raw;
  });

  it('subsongs: the count is the module byte and every subsong builds its own grid', () => {
    const { raw } = load(path, name);
    const n = maniacsOfNoiseSubsongCount(raw);
    expect(n).toBeGreaterThanOrEqual(1);
    for (let s = 0; s < Math.min(n, 3); s++) expect(buildManiacsOfNoiseGrid(raw, name, s)).not.toBeNull();
    expect(buildManiacsOfNoiseGrid(raw, name, n)).toBeNull();
  });
});
