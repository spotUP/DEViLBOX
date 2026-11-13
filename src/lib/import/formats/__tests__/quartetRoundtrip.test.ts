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
