/**
 * Quartet PSG (.sqt): the grid is read from the module's voice streams (quartetPsgGrid.ts), not a blank placeholder.
 * Unedited export is byte-identical; one edited note rewrites exactly the frequency long it is played from.
 * Fixtures: real modules. Sounding octave and playhead timing are unverified by ear.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseQuartetFile } from '../QuartetParser';
import { exportQuartet } from '@/lib/export/QuartetExporter';
import { encodeVariableBlock } from '@/engine/uade/UADEPatternEncoder';
import { buildQuartetGrid, quartetSongBases, QUARTET_ROWS_PER_PATTERN } from '../quartetPsgGrid';

const FIXTURES = [
  'public/data/songs/quartet-psg/horror zombies from crypt.sqt',
  'public/data/songs/formats/warlock_the_avenger.sqt',
];

async function load(rel: string) {
  const b = readFileSync(join(process.cwd(), rel));
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return { raw: new Uint8Array(ab), song: await parseQuartetFile(ab, rel.split('/').pop()!) };
}

describe('quartet grid shows real notes and exports byte-exact', () => {
  it.each(FIXTURES)('%s: grid has notes on three voices, streams re-encode byte-exact, export is unchanged', async (rel) => {
    const { raw, song } = await load(rel);
    const l = song.uadeVariableLayout!;
    expect(l).toBeTruthy();
    expect(l.formatId).toBe('quartet');
    l.filePatternAddrs.forEach((addr, fp) => {
      const re = encodeVariableBlock(l, fp, l.blockRows![fp], fp);
      expect(Array.from(re)).toEqual(Array.from(raw.subarray(addr, addr + l.filePatternSizes[fp])));
    });
    const notes = song.patterns.flatMap(p => p.channels.map(c => c.rows.filter(r => (r.note ?? 0) > 0).length));
    expect(notes.reduce((a, b) => a + b, 0)).toBeGreaterThan(50);
    const out = await exportQuartet(song);
    expect(out.warnings).toEqual([]);
    expect(Array.from(out.data)).toEqual(Array.from(raw));
  });

  it('finds both song-selection shapes (pair and table)', async () => {
    expect(quartetSongBases((await load(FIXTURES[0])).raw)).toEqual([0xa66, 0x3206]);
    expect(quartetSongBases((await load(FIXTURES[1])).raw).length).toBeGreaterThan(0);
  });

  it('horror zombies voice 1 rests 1040 sub-ticks (rows 0..79), then plays its first note record (0xb42) on row 80', async () => {
    const { raw } = await load(FIXTURES[0]);
    const g = buildQuartetGrid(raw, 'x', 0)!;
    expect(g.step).toBe(13);
    const first = g.placements.find(p => p.voice === 0)!;
    expect(first.offset).toBe(0xb42);
    expect(first.row).toBe(80);
    const cell = g.patterns[Math.floor(first.row / QUARTET_ROWS_PER_PATTERN)].channels[0].rows[first.row % QUARTET_ROWS_PER_PATTERN];
    expect(cell.note).toBe(first.note);
    expect(cell.note).toBeGreaterThan(0);
  });

  it.each(FIXTURES)('%s: one changed note rewrites only its frequency long and re-imports to the edited note', async (rel) => {
    const { raw, song } = await load(rel);
    const g = buildQuartetGrid(raw, 'x', 0)!;
    const count = new Map<number, number>();
    g.placements.forEach(x => count.set(x.offset, (count.get(x.offset) ?? 0) + 1));
    const n = g.placements.find(x => count.get(x.offset) === 1 && !x.slide && x.note > 12 && x.note < 90)!;
    expect(n).toBeTruthy();
    const pat = Math.floor(n.row / QUARTET_ROWS_PER_PATTERN), row = n.row % QUARTET_ROWS_PER_PATTERN;
    song.patterns[pat].channels[n.voice].rows[row].note = n.note + 2;
    const out = await exportQuartet(song);
    expect(out.warnings).toEqual([]);
    const diff: number[] = [];
    out.data.forEach((v, i) => { if (v !== raw[i]) diff.push(i); });
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.every(i => i >= n.offset + 4 && i < n.offset + 8)).toBe(true);
    const ab = out.data.buffer.slice(out.data.byteOffset, out.data.byteOffset + out.data.byteLength) as ArrayBuffer;
    const again = await parseQuartetFile(ab, rel.split('/').pop()!);
    expect(again.patterns[pat].channels[n.voice].rows[row].note).toBe(n.note + 2);
  });
});

describe('quartet V record is the instrument', () => {
  it('horror zombies has three instruments over its two songs, named from their definitions; warlock one', async () => {
    const h = await load(FIXTURES[0]);
    // the noise setup (V number 2) is only played by the second song
    expect(h.song.instruments.map(i => i.id)).toEqual([1, 2]);
    expect(h.song.instruments.map(i => i.name)).toEqual(['Tone, Pitch Sweep, Volume Sequence 8', 'Tone, Vibrato, Volume Sequence 0']);
    const g1 = buildQuartetGrid(h.raw, 'x', 1)!;
    expect(g1.instruments.map(i => i.number)).toContain(2);
    expect(g1.instruments.find(i => i.number === 2)!.name).toBe('Noise, Volume Sequence 8');
    const all = new Set([...buildQuartetGrid(h.raw, 'x', 0)!.instruments, ...g1.instruments].map(i => i.number));
    expect(all.size).toBeGreaterThanOrEqual(3);
    const w = await load(FIXTURES[1]);
    expect(w.song.instruments.length).toBe(1);
    expect(w.song.instruments[0].name).toBe('Tone, Pitch Sweep, Volume Sequence 7');
  });

  it('notes carry the V number + 1 as instrument', async () => {
    const { raw } = await load(FIXTURES[0]);
    const g = buildQuartetGrid(raw, 'x', 0)!;
    expect(new Set(g.placements.map(p => p.instrument))).toEqual(new Set([1, 2]));
    for (const p of g.placements) {
      if (p.vOffset !== null) expect(((raw[p.vOffset + 10] << 8) | raw[p.vOffset + 11]) / 4 + 1).toBe(p.instrument);
    }
  });

  it('an instrument change on every note under one V record rewrites only that record low word and re-imports', async () => {
    const { raw, song } = await load(FIXTURES[0]);
    const g = buildQuartetGrid(raw, 'x', 0)!;
    const target = g.placements.find(p => p.vOffset !== null && p.instrument === 1)!;
    const same = g.placements.filter(p => p.vOffset === target.vOffset);
    for (const p of same) {
      song.patterns[Math.floor(p.row / QUARTET_ROWS_PER_PATTERN)].channels[p.voice].rows[p.row % QUARTET_ROWS_PER_PATTERN].instrument = 3;
    }
    const out = await exportQuartet(song);
    expect(out.warnings).toEqual([]);
    const diff: number[] = [];
    out.data.forEach((v, i) => { if (v !== raw[i]) diff.push(i); });
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.every(i => i >= target.vOffset! + 10 && i < target.vOffset! + 12)).toBe(true);
    expect((out.data[target.vOffset! + 10] << 8) | out.data[target.vOffset! + 11]).toBe(8);
    const ab = out.data.buffer.slice(out.data.byteOffset, out.data.byteOffset + out.data.byteLength) as ArrayBuffer;
    const again = await parseQuartetFile(ab, 'horror zombies from crypt.sqt');
    const c = again.patterns[Math.floor(target.row / QUARTET_ROWS_PER_PATTERN)].channels[target.voice].rows[target.row % QUARTET_ROWS_PER_PATTERN];
    expect(c.instrument).toBe(3);
  });

  it('disagreeing instruments under one V record are refused with a warning', async () => {
    const { raw, song } = await load(FIXTURES[0]);
    const g = buildQuartetGrid(raw, 'x', 0)!;
    const target = g.placements.find(p => p.vOffset !== null && g.placements.filter(q => q.vOffset === p.vOffset).length > 1)!;
    song.patterns[Math.floor(target.row / QUARTET_ROWS_PER_PATTERN)].channels[target.voice].rows[target.row % QUARTET_ROWS_PER_PATTERN].instrument = target.instrument === 3 ? 2 : 3;
    const out = await exportQuartet(song);
    expect(out.warnings.length).toBeGreaterThan(0);
    expect(Array.from(out.data)).toEqual(Array.from(raw));
  });
});

describe('quartet .sqt through the app import entry point', () => {
  it.each(FIXTURES)('%s: parseModuleToSong gives the Quartet PSG grid, not the UADE scan', async (rel) => {
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const b = readFileSync(join(process.cwd(), rel));
    const name = rel.split('/').pop()!;
    const direct = await parseQuartetFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, name);
    const song = await parseModuleToSong(new File([new Uint8Array(b)], name));
    const count = (s: typeof song) => s.patterns.reduce((a, p) => a + p.channels.reduce((x, c) => x + c.rows.filter(r => (r.note ?? 0) > 0).length, 0), 0);
    expect(song.name).toContain('[Quartet PSG]');
    expect(count(song)).toBeGreaterThan(50);
    expect(count(song)).toBe(count(direct));
    expect(song.uadeEditableFileData).toBeTruthy();
    expect(song.uadeEditableFileName).toBeTruthy();
  });
});
