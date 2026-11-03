/**
 * Sound Programming Language phase B reachability: boulderdash.spl goes through the import entry point
 * (parseModuleToSong), the grid is edited, and the native export router (exportNativeSong) writes the module back
 * with the edit patched in place. Sentinel: applySplGridEdits must have run for every export.
 *
 * Expected bytes come from the format: a stream note byte (below 0xC0) is looked up through the build's transposition
 * and the instrument record's octave, so a note edit changes that one byte; the file length never changes.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { buildSplGrid, type SplGrid } from '@lib/import/formats/soundProgrammingLanguageGrid';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/soundProgrammingLanguageEdits', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@lib/import/formats/soundProgrammingLanguageEdits')>();
  return { ...orig, applySplGridEdits: (...a: Parameters<typeof orig.applySplGridEdits>) => { sentinel.calls++; return orig.applySplGridEdits(...a); } };
});

const FILE = { path: 'public/data/songs/formats/boulderdash.spl', name: 'boulderdash.spl' };

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

describe('Sound Programming Language native export: boulderdash.spl', () => {
  it('exports byte-exact unedited, writes a note edit in place, re-imports it with nothing else moved', async () => {
    const before = sentinel.calls;
    const { raw, song } = await load();
    expect(song.uadeVariableLayout?.formatId).toBe('soundProgrammingLanguage');
    const same = await exportOf(song);
    expect(sentinel.calls).toBeGreaterThan(before);
    expect(same.warnings).toEqual([]);
    expect(same.data.length).toBe(71584);
    expect(Array.from(same.data)).toEqual(Array.from(raw));

    const grid = buildSplGrid(raw) as SplGrid;
    // a note in voice 3 (stream not shared with the other voices is not required: shared bytes are verified below)
    const voice = 0;
    let row = -1;
    for (let r = 0; r < grid.rows && row < 0; r++) {
      const s = grid.rowSources[Math.floor(r / 64)][voice][r % 64];
      if (s && grid.patterns[Math.floor(r / 64)].channels[voice].rows[r % 64].note > 0) row = r;
    }
    expect(row).toBeGreaterThanOrEqual(0);
    const src = grid.rowSources[Math.floor(row / 64)][voice][row % 64]!;
    const cell = song.patterns[Math.floor(row / 64)].channels[voice].rows[row % 64];
    const newNote = grid.noteForByte(raw[src.offset] + 1, src.octave, src.steps);
    expect(newNote).not.toBe(cell.note);
    cell.note = newNote;
    const edited = await exportOf(song);
    expect(edited.warnings).toEqual([]);
    expect(edited.data.length).toBe(raw.length);
    expect(diffCount(raw, edited.data)).toBe(1);
    expect(edited.data[src.offset]).toBe(raw[src.offset] + 1);

    // reload: the edited cell reads as the edit, every cell not sharing that stream byte is unchanged
    const again = await load(edited.data);
    const after = buildSplGrid(edited.data) as SplGrid;
    let changed = 0;
    grid.patterns.forEach((p, pi) => p.channels.forEach((ch, c) => ch.rows.forEach((was, r) => {
      const now = again.song.patterns[pi].channels[c].rows[r];
      const s = grid.rowSources[pi][c][r];
      if (s && s.offset === src.offset) { if (now.note !== was.note) changed++; return; }
      expect([now.note, now.instrument]).toEqual([was.note, was.instrument]);
    })));
    expect(changed).toBeGreaterThanOrEqual(1);
    expect(again.song.patterns[Math.floor(row / 64)].channels[voice].rows[row % 64].note).toBe(newNote);
    expect(after.rows).toBe(grid.rows);
  }, 240000);

  it('refuses a note on an empty row, a removed note, an instrument change and a volume edit, writing nothing', async () => {
    const { raw, song } = await load();
    const rows = song.patterns[0].channels[0].rows;
    const empty = rows.findIndex((c) => c.note === 0);
    expect(empty).toBeGreaterThanOrEqual(0);
    rows[empty].note = 40;
    const played = rows.findIndex((c) => c.note > 0 && c.note < 97);
    expect(played).toBeGreaterThanOrEqual(0);
    rows[played].note = 0;
    rows[played === 0 ? 1 : 0].instrument = 9;
    song.patterns[0].channels[1].rows[0].volume = 30;
    const res = await exportOf(song);
    expect(res.warnings.length).toBeGreaterThanOrEqual(4);
    expect(res.warnings.join('\n')).toMatch(/not written/);
    expect(Array.from(res.data)).toEqual(Array.from(raw));
  }, 240000);
});
