/**
 * Beathoven Synthesizer phase B reachability: the real .bss corpus file goes through the import entry point
 * (parseModuleToSong), the grid is edited, and the native export router (exportNativeSong) writes the module back with
 * the edit patched in place. Sentinel: applyBeathovenGridEdits must have run for every export.
 *
 * Expected bytes come from the format (third-party/nuade/players/beathoven): a note command's first word is the note
 * number, looked up in the period table at (number + note base - origin), so a note edit changes that one 16-bit word
 * (two bytes at most, one in practice); the file length never changes (22264 B for beathoven_smallest.bss).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { buildBthGrid, bthShownNote, readBthParams, type BthGrid, type BthParams } from '@lib/import/formats/beathovenGrid';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/beathovenEdits', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@lib/import/formats/beathovenEdits')>();
  return { ...orig, applyBeathovenGridEdits: (...a: Parameters<typeof orig.applyBeathovenGridEdits>) => { sentinel.calls++; return orig.applyBeathovenGridEdits(...a); } };
});

const FILE = { path: 'public/data/songs/formats/beathoven_smallest.bss', name: 'beathoven_smallest.bss' };

async function load(bytes?: Uint8Array, file = FILE): Promise<{ raw: Uint8Array; song: TrackerSong }> {
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

const diffAt = (a: Uint8Array, b: Uint8Array): number[] => a.reduce<number[]>((n, x, i) => (x !== b[i] ? [...n, i] : n), []);

describe('Beathoven native export: beathoven_smallest.bss', () => {
  it('exports byte-exact unedited, writes a note edit in place, re-imports it with nothing else moved', async () => {
    const before = sentinel.calls;
    const { raw, song } = await load();
    expect(song.uadeVariableLayout?.formatId).toBe('beathoven');
    const same = await exportOf(song);
    expect(sentinel.calls).toBeGreaterThan(before);
    expect(same.warnings).toEqual([]);
    expect(same.data.length).toBe(22264);
    expect(Array.from(same.data)).toEqual(Array.from(raw));

    const grid = buildBthGrid(raw) as BthGrid;
    const prm = readBthParams(raw) as BthParams;
    // a note word read by exactly one row, so the edit moves one row
    const plays = new Map<number, number>();
    grid.rowSources.forEach((p) => p.forEach((v) => v.forEach((s) => { if (s) plays.set(s.noteOffset, (plays.get(s.noteOffset) ?? 0) + 1); })));
    let pick: { pi: number; voice: number; row: number } | null = null;
    grid.rowSources.forEach((p, pi) => p.forEach((v, voice) => v.forEach((s, row) => {
      if (!pick && s && plays.get(s.noteOffset) === 1) pick = { pi, voice, row };
    })));
    const { pi, voice, row } = pick!;
    const src = grid.rowSources[pi][voice][row]!;
    const cell = song.patterns[pi].channels[voice].rows[row];
    const newNote = bthShownNote(raw, prm, src.noteNum + 1, src.base);
    expect(newNote).toBeGreaterThan(0);
    expect(newNote).not.toBe(cell.note);
    cell.note = newNote;
    const edited = await exportOf(song);
    expect(edited.warnings).toEqual([]);
    expect(edited.data.length).toBe(raw.length);
    const changed = diffAt(raw, edited.data);
    expect(changed.length).toBeGreaterThan(0);
    changed.forEach((i) => expect([src.noteOffset, src.noteOffset + 1]).toContain(i));
    const word = (edited.data[src.noteOffset] << 8) | edited.data[src.noteOffset + 1];
    expect(bthShownNote(raw, prm, word, src.base)).toBe(newNote);

    const again = await load(edited.data);
    grid.patterns.forEach((p, i) => p.channels.forEach((ch, c) => ch.rows.forEach((was, r) => {
      const now = again.song.patterns[i].channels[c].rows[r];
      const expected = i === pi && c === voice && r === row ? newNote : was.note;
      expect([now.note, now.instrument]).toEqual([expected, was.instrument]);
    })));
  }, 240000);

  it('refuses a note on an empty row, a note off, an instrument and a volume edit, writing nothing', async () => {
    const { raw, song } = await load();
    const find = (voice: number, pred: (c: { note: number }) => boolean): { rows: TrackerSong['patterns'][0]['channels'][0]['rows']; at: number } => {
      for (const p of song.patterns) {
        const at = p.channels[voice].rows.findIndex(pred);
        if (at >= 0) return { rows: p.channels[voice].rows, at };
      }
      throw new Error(`no matching row in voice ${voice}`);
    };
    const empty = find(0, (c) => c.note === 0);
    empty.rows[empty.at].note = 40;
    const played = find(1, (c) => c.note > 0 && c.note < 97);
    played.rows[played.at].note = 97;
    const other = find(3, (c) => c.note > 0);
    (other.rows[other.at] as { instrument: number }).instrument += 1;
    song.patterns[0].channels[2].rows[0].volume = 30;
    const res = await exportOf(song);
    expect(res.warnings.length).toBeGreaterThanOrEqual(4);
    expect(res.warnings.join('\n')).toMatch(/not written/);
    expect(Array.from(res.data)).toEqual(Array.from(raw));
  }, 240000);

  it('writes a removed note as the legacy Rest command: same four bytes, the row reads back empty', async () => {
    const { raw, song } = await load();
    // a plain note command (not the legacy arpeggio, whose note word is not the command word)
    const grid = buildBthGrid(raw);
    if (typeof grid === 'string') throw new Error(grid);
    let hit: { rows: TrackerSong['patterns'][0]['channels'][0]['rows']; at: number } | undefined;
    grid.rowSources.forEach((pat, pi) => pat.forEach((voice, c) => voice.forEach((src, r) => {
      if (!hit && src && src.noteOffset === src.offset) hit = { rows: song.patterns[pi].channels[c].rows, at: r };
    })));
    if (!hit) throw new Error('no plain note in the file');
    hit.rows[hit.at].note = 0;
    const res = await exportOf(song);
    const changed = diffAt(raw, res.data);
    expect(res.data.length).toBe(raw.length);
    expect(res.warnings.join('\n')).toBe('');
    expect(changed.length).toBeGreaterThanOrEqual(1);
    expect(changed.length).toBeLessThanOrEqual(2);
    const word = (at: number): number => (res.data[at] << 8) | res.data[at + 1];
    expect(word(changed[0] & ~1)).toBe(0x82);
    const notes = (x: TrackerSong): number => x.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows)).filter((c) => c.note > 0 && c.note < 97).length;
    const before = notes((await load()).song);
    const again = await load(res.data);
    expect(notes(again.song)).toBeLessThan(before); // a stream is shared by every place that plays it
  }, 240000);

  it('extended engine (tristar_cracktro.bss): a removed note is written as the Hold command, same four bytes', async () => {
    const tri = { path: 'public/data/songs/formats/tristar_cracktro.bss', name: 'tristar_cracktro.bss' };
    const { raw, song } = await load(undefined, tri);
    const grid = buildBthGrid(raw);
    if (typeof grid === 'string') throw new Error(grid);
    let hit: { rows: TrackerSong['patterns'][0]['channels'][0]['rows']; at: number; src: number } | undefined;
    grid.rowSources.forEach((pat, pi) => pat.forEach((voice, c) => voice.forEach((src, r) => {
      if (!hit && src && src.noteOffset === src.offset) hit = { rows: song.patterns[pi].channels[c].rows, at: r, src: src.offset };
    })));
    if (!hit) throw new Error('no plain note in the file');
    const before = song.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows)).filter((c) => c.note > 0 && c.note < 97).length;
    hit.rows[hit.at].note = 0;
    const res = await exportOf(song);
    expect(res.warnings.join('\n')).toBe('');
    expect(res.data.length).toBe(raw.length);
    const changed = diffAt(raw, res.data);
    expect(changed.length).toBeGreaterThanOrEqual(1);
    expect(changed.length).toBeLessThanOrEqual(2);
    expect((res.data[hit.src] << 8) | res.data[hit.src + 1]).toBe(0x83);
    const notes = (x: TrackerSong): number => x.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows)).filter((c) => c.note > 0 && c.note < 97).length;
    const again = await load(res.data, tri);
    expect(notes(again.song)).toBeLessThan(before); // the removed note (and every play of its stream) reads empty
  }, 240000);
});
