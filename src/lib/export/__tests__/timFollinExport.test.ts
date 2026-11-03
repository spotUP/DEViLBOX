/**
 * Tim Follin phase B reachability: the real .tf corpus file goes through the import entry point (parseModuleToSong),
 * the grid is edited, and the native export router (exportNativeSong) writes the module back with the edit patched in
 * place. Sentinel: applyTimFollinGridEdits must have run for every export.
 *
 * Expected bytes come from the format: a note byte (1..0x7F) indexes the period table through the voice's transpose,
 * so a note edit changes that one byte; the file length never changes (25010 B for follin_smallest.tf).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { buildTimFollinGrid, timFollinShownNote, type TfolGrid } from '@lib/import/formats/timFollinGrid';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/timFollinEdits', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@lib/import/formats/timFollinEdits')>();
  return { ...orig, applyTimFollinGridEdits: (...a: Parameters<typeof orig.applyTimFollinGridEdits>) => { sentinel.calls++; return orig.applyTimFollinGridEdits(...a); } };
});

const FILE = { path: 'public/data/songs/formats/follin_smallest.tf', name: 'follin_smallest.tf' };

async function load(bytes?: Uint8Array): Promise<{ raw: Uint8Array; song: TrackerSong }> {
  const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
  const raw = new Uint8Array(readFileSync(join(process.cwd(), FILE.path)));
  const song = await parseModuleToSong(new File([new Uint8Array(bytes ?? raw)], FILE.name));
  return { raw, song };
}

async function exportOf(song: TrackerSong) {
  const { exportNativeSong } = await import('@lib/export/nativeExportRouter');
  const res = await exportNativeSong(song);
  if (!res) throw new Error('no native export');
  return res;
}

const diffCount = (a: Uint8Array, b: Uint8Array): number => a.reduce((n, x, i) => n + (x !== b[i] ? 1 : 0), 0);

describe('Tim Follin native export: follin_smallest.tf', () => {
  it('exports byte-exact unedited, writes a note edit in place, re-imports it with nothing else moved', async () => {
    const before = sentinel.calls;
    const { raw, song } = await load();
    expect(song.uadeVariableLayout?.formatId).toBe('timFollin');
    const same = await exportOf(song);
    expect(sentinel.calls).toBeGreaterThan(before);
    expect(same.warnings).toEqual([]);
    expect(same.data.length).toBe(25010);
    expect(Array.from(same.data)).toEqual(Array.from(raw));

    const grid = buildTimFollinGrid(raw) as TfolGrid;
    // a note whose byte is read by exactly one row, so the edit moves one row
    const plays = new Map<number, number>();
    grid.rowSources.forEach((p) => p.forEach((v) => v.forEach((s) => { if (s) plays.set(s.offset, (plays.get(s.offset) ?? 0) + 1); })));
    let pick: { pi: number; voice: number; row: number } | null = null;
    grid.rowSources.forEach((p, pi) => p.forEach((v, voice) => v.forEach((s, row) => {
      if (!pick && s && plays.get(s.offset) === 1) pick = { pi, voice, row };
    })));
    const { pi, voice, row } = pick!;
    const src = grid.rowSources[pi][voice][row]!;
    const cell = song.patterns[pi].channels[voice].rows[row];
    const newByte = src.noteByte + 1;
    const newNote = timFollinShownNote(src.base + newByte);
    expect(newNote).not.toBe(cell.note);
    cell.note = newNote;
    const edited = await exportOf(song);
    expect(edited.warnings).toEqual([]);
    expect(edited.data.length).toBe(raw.length);
    expect(diffCount(raw, edited.data)).toBe(1);
    expect(timFollinShownNote(src.base + edited.data[src.offset])).toBe(newNote);

    const again = await load(edited.data);
    grid.patterns.forEach((p, i) => p.channels.forEach((ch, c) => ch.rows.forEach((was, r) => {
      const now = again.song.patterns[i].channels[c].rows[r];
      const expected = i === pi && c === voice && r === row ? newNote : was.note;
      expect([now.note, now.instrument]).toEqual([expected, was.instrument]);
    })));
  }, 240000);

  it('refuses a note on an empty row, a removed note, an instrument and a volume edit, writing nothing', async () => {
    const { raw, song } = await load();
    const rows = song.patterns[0].channels[0].rows;
    const empty = rows.findIndex((c) => c.note === 0);
    expect(empty).toBeGreaterThanOrEqual(0);
    rows[empty].note = 40;
    const played = rows.findIndex((c) => c.note > 0 && c.note < 97);
    expect(played).toBeGreaterThanOrEqual(0);
    rows[played].note = 0;
    const other = song.patterns[0].channels[1].rows.findIndex((c) => c.note > 0);
    song.patterns[0].channels[1].rows[other].instrument += 1;
    song.patterns[0].channels[2].rows[0].volume = 30;
    const res = await exportOf(song);
    expect(res.warnings.length).toBeGreaterThanOrEqual(4);
    expect(res.warnings.join('\n')).toMatch(/not written/);
    expect(Array.from(res.data)).toEqual(Array.from(raw));
  }, 240000);
});
