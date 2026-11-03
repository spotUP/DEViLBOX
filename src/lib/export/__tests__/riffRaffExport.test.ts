/**
 * Riff Raff phase B reachability: real .riff corpus files go through the import entry point (parseModuleToSong), the
 * grid is edited, and the native export router (exportNativeSong) writes the module back with the edit patched in
 * place. Sentinel: applyRiffRaffGridEdits must have run for every export.
 *
 * Expected bytes come from the format: a pattern note byte (below 0x80) is a period table index, so a note edit changes
 * that one byte; the file length never changes (a longer pattern would move every table behind it).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { buildRiffRaffGrid, type RiffRaffGrid } from '@lib/import/formats/riffRaffGrid';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/riffRaffEdits', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@lib/import/formats/riffRaffEdits')>();
  return { ...orig, applyRiffRaffGridEdits: (...a: Parameters<typeof orig.applyRiffRaffGridEdits>) => { sentinel.calls++; return orig.applyRiffRaffGridEdits(...a); } };
});

const FILES = [
  { path: 'public/data/songs/formats/riffraff_smallest.riff', name: 'riffraff_smallest.riff' },
  { path: 'public/data/songs/riff-raff/bombfusion.riff', name: 'bombfusion.riff' },
];

async function load(file: { path: string; name: string }, bytes?: Uint8Array): Promise<{ raw: Uint8Array; song: TrackerSong }> {
  const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
  const raw = new Uint8Array(readFileSync(join(process.cwd(), file.path)));
  const song = await parseModuleToSong(new File([new Uint8Array(bytes ?? raw)], file.name));
  return { raw, song };
}

async function exportOf(song: TrackerSong) {
  const { exportNativeSong } = await import('@lib/export/nativeExportRouter');
  const res = await exportNativeSong(song);
  if (!res) throw new Error('no native export');
  return res;
}

const diffCount = (a: Uint8Array, b: Uint8Array): number => a.reduce((n, x, i) => n + (x !== b[i] ? 1 : 0), 0);

/** The first voice and row that has a source of the given kind. */
function first(g: RiffRaffGrid, key: 'noteAt' | 'instrumentAt'): { voice: number; row: number } | null {
  for (let voice = 0; voice < 4; voice++) {
    const row = g.sources[voice].findIndex((s) => !!s && s[key] >= 0);
    if (row >= 0) return { voice, row };
  }
  return null;
}

describe.each(FILES)('Riff Raff native export: $name', (file) => {
  it('exports byte-exact unedited, writes a note edit in place, re-imports it with nothing else moved', async () => {
    const before = sentinel.calls;
    const { raw, song } = await load(file);
    expect(song.uadeVariableLayout?.formatId).toBe('riffRaff');
    const same = await exportOf(song);
    expect(sentinel.calls).toBeGreaterThan(before);
    expect(same.warnings).toEqual([]);
    expect(Array.from(same.data)).toEqual(Array.from(raw));

    const grid = buildRiffRaffGrid(raw) as RiffRaffGrid;
    const at = first(grid, 'noteAt')!;
    const { voice, row } = at;
    const src = grid.sources[voice][row]!;
    const cell = song.patterns[Math.floor(row / 64)].channels[voice].rows[row % 64];
    const newNote = grid.noteForByte(raw[src.noteAt] + 1, src.transpose);
    expect(newNote).not.toBe(cell.note);
    cell.note = newNote;
    const edited = await exportOf(song);
    expect(edited.warnings).toEqual([]);
    expect(edited.data.length).toBe(raw.length);
    expect(diffCount(raw, edited.data)).toBe(1);
    const newByte = edited.data[src.noteAt];
    expect(grid.noteForByte(newByte, src.transpose)).toBe(newNote);

    // the one byte plays wherever its pattern plays; every other row is unchanged
    const again = await load(file, edited.data);
    grid.patterns.forEach((p, pi) => p.channels.forEach((ch, c) => ch.rows.forEach((was, r) => {
      const now = again.song.patterns[pi].channels[c].rows[r];
      const s = grid.sources[c][pi * 64 + r];
      const expected = s && s.noteAt === src.noteAt ? grid.noteForByte(newByte, s.transpose) : was.note;
      expect([now.note, now.instrument]).toEqual([expected, was.instrument]);
    })));
  }, 240000);

  it('writes an instrument edit into the Set Sample byte that chose it', async () => {
    const { raw, song } = await load(file);
    const grid = buildRiffRaffGrid(raw) as RiffRaffGrid;
    const at = first(grid, 'instrumentAt');
    if (!at) return; // no Set Sample byte in this song
    const { voice, row } = at;
    const src = grid.sources[voice][row]!;
    const cell = song.patterns[Math.floor(row / 64)].channels[voice].rows[row % 64];
    const target = cell.instrument === 1 ? 2 : 1;
    cell.instrument = target;
    const res = await exportOf(song);
    expect(res.warnings).toEqual([]);
    expect(diffCount(raw, res.data)).toBe(1);
    expect(res.data[src.instrumentAt]).toBe(target - 1);
    const again = await load(file, res.data);
    grid.patterns.forEach((p, pi) => p.channels.forEach((ch, c) => ch.rows.forEach((was, r) => {
      const now = again.song.patterns[pi].channels[c].rows[r];
      const s = grid.sources[c][pi * 64 + r];
      expect([now.note, now.instrument]).toEqual([was.note, s && s.instrumentAt === src.instrumentAt ? target : was.instrument]);
    })));
  }, 240000);

  it('refuses a note on an empty row, a removed note and a volume edit, writing nothing', async () => {
    const { raw, song } = await load(file);
    const rows = song.patterns[0].channels[0].rows;
    const empty = rows.findIndex((c) => c.note === 0);
    expect(empty).toBeGreaterThanOrEqual(0);
    rows[empty].note = 40;
    const played = rows.findIndex((c) => c.note > 0 && c.note < 97);
    expect(played).toBeGreaterThanOrEqual(0);
    rows[played].note = 0;
    song.patterns[0].channels[1].rows[0].volume = 30;
    const res = await exportOf(song);
    expect(res.warnings.length).toBeGreaterThanOrEqual(3);
    expect(res.warnings.join('\n')).toMatch(/not written/);
    expect(Array.from(res.data)).toEqual(Array.from(raw));
  }, 240000);
});
